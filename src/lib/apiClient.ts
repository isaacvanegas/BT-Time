import type {
  ActiveTaskResponse,
  HealthResponse,
  OpenTasksResponse,
  SessionInfoResponse,
  TaskTimeResponse,
  TimesheetDetailResponse,
  TimesheetEntry,
  TimesheetMonthResponse,
  UserInfo,
} from '../../shared/types';

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly uncertainOutcome: boolean;

  constructor(
    message: string,
    options: { status: number; code: string; uncertainOutcome?: boolean }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.uncertainOutcome = Boolean(options.uncertainOutcome);
  }
}

let inMemoryCsrfToken: string | null = null;
let onUnauthorizedHandler: ((message: string) => void) | null = null;

export function setCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token;
}

export function setUnauthorizedHandler(handler: ((message: string) => void) | null): void {
  onUnauthorizedHandler = handler;
}

async function requestJson<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; skipAuthCallback?: boolean } = {}
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (method !== 'GET') {
    headers['X-Requested-With'] = 'XMLHttpRequest';
    if (inMemoryCsrfToken) {
      headers['X-CSRF-Token'] = inMemoryCsrfToken;
    }
  }

  let bodyStr: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyStr = JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: bodyStr,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('Sin conexión con el servidor. Verifica tu red e intenta nuevamente.', {
      status: 0,
      code: 'NETWORK_ERROR',
    });
  }

  let data: Record<string, unknown> = {};
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }

  if (res.status === 401) {
    const msg =
      typeof data.error === 'string'
        ? data.error
        : 'Tu sesión ha expirado. Inicia sesión nuevamente.';
    if (!options.skipAuthCallback && onUnauthorizedHandler) {
      inMemoryCsrfToken = null;
      onUnauthorizedHandler(msg);
    }
    throw new ApiError(msg, {
      status: 401,
      code: typeof data.code === 'string' ? data.code : 'SESSION_EXPIRED',
    });
  }

  if (!res.ok) {
    const msg =
      typeof data.error === 'string'
        ? data.error
        : `Error inesperado (${res.status}).`;
    throw new ApiError(msg, {
      status: res.status,
      code: typeof data.code === 'string' ? data.code : 'API_ERROR',
      uncertainOutcome: Boolean(data.uncertainOutcome),
    });
  }

  return data as unknown as T;
}

export const api = {
  health: () => requestJson<HealthResponse>('/health', { skipAuthCallback: true }),

  getSession: () =>
    requestJson<SessionInfoResponse>('/auth/session', { skipAuthCallback: true }),

  signIn: async (payload: { username: string; password: string; timeZone: string }) => {
    const res = await requestJson<{
      authenticated: boolean;
      user: UserInfo;
      csrfToken: string;
    }>('/auth/signin', {
      method: 'POST',
      body: payload,
      skipAuthCallback: true,
    });
    setCsrfToken(res.csrfToken);
    return res;
  },

  signOut: async () => {
    try {
      await requestJson<{ ok: boolean }>('/auth/signout', {
        method: 'POST',
        skipAuthCallback: true,
      });
    } finally {
      setCsrfToken(null);
    }
  },

  getUserInfo: () => requestJson<UserInfo>('/user/info'),
  setUserOnline: () => requestJson<Record<string, unknown>>('/user/online', { method: 'POST' }),
  setUserPause: () => requestJson<Record<string, unknown>>('/user/pause', { method: 'POST' }),
  setUserOffline: () => requestJson<Record<string, unknown>>('/user/offline', { method: 'POST' }),

  getOpenTasks: () => requestJson<OpenTasksResponse>('/tasks/open'),
  getActiveTask: () => requestJson<ActiveTaskResponse>('/tasks/active'),

  startTask: (type: string, taskId: string) =>
    requestJson<Record<string, unknown>>(
      `/tasks/${encodeURIComponent(type)}/${encodeURIComponent(taskId)}/start`,
      { method: 'POST' }
    ),

  pauseTask: (type: string, taskId: string) =>
    requestJson<Record<string, unknown>>(
      `/tasks/${encodeURIComponent(type)}/${encodeURIComponent(taskId)}/pause`,
      { method: 'POST' }
    ),

  getTaskTime: (type: string, taskId: string) =>
    requestJson<TaskTimeResponse>(
      `/tasks/${encodeURIComponent(type)}/${encodeURIComponent(taskId)}/time`
    ),

  endTask: (
    type: string,
    taskId: string,
    payload: { note: string; percentComplete: number; customFields: unknown[] }
  ) =>
    requestJson<Record<string, unknown>>(
      `/tasks/${encodeURIComponent(type)}/${encodeURIComponent(taskId)}/end`,
      { method: 'POST', body: payload }
    ),

  getTimesheet: async (): Promise<TimesheetEntry[]> => {
    const res = await requestJson<TimesheetEntry[] | { timesheet?: TimesheetEntry[] }>('/tasks/timesheet');
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.timesheet)) return res.timesheet;
    return [];
  },

  submitTimesheet: (timesheet: TimesheetEntry[]) =>
    requestJson<Record<string, unknown>>('/tasks/timesheet', {
      method: 'POST',
      body: { timesheet },
    }),

  getTimesheetDetail: (timesheetId: string) =>
    requestJson<TimesheetDetailResponse>(
      `/tasks/timesheet/${encodeURIComponent(timesheetId)}`
    ),

  getTimesheetTime: (timesheetId: string) =>
    requestJson<TaskTimeResponse>(
      `/tasks/timesheet/${encodeURIComponent(timesheetId)}/time`
    ),

  endTimesheetEntry: (
    timesheetId: string,
    payload: { note: string; percentComplete: number; customFields: unknown[] }
  ) =>
    requestJson<Record<string, unknown>>(
      `/tasks/timesheet/${encodeURIComponent(timesheetId)}/end`,
      { method: 'POST', body: payload }
    ),

  getExpiredTimesheets: async (): Promise<TimesheetEntry[]> => {
    const res = await requestJson<
      TimesheetEntry[] | { timesheet?: TimesheetEntry[]; timesheets?: TimesheetEntry[] }
    >('/tasks/timesheetExpired');
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.timesheet)) return res.timesheet;
    if (res && Array.isArray(res.timesheets)) return res.timesheets;
    return [];
  },

  getTimesheetMonth: (year: number, month: number) =>
    requestJson<TimesheetMonthResponse>(`/timesheet-month/${year}/${month}`),
};
