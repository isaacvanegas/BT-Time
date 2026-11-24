export type UserStatusCode = 'ONLINE' | 'PAUSE' | 'OFFLINE' | string;

export interface UserInfo {
  id?: string;
  username?: string;
  email?: string;
  fullName?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  userStatus?: UserStatusCode;
  status?: UserStatusCode;
  currentTimeSeconds?: number;
  logTimeSeconds?: number;
  totalTimeSeconds?: number;
  timeZone?: string;
  [key: string]: unknown;
}

export interface TaskItem {
  id: string;
  type: string;
  key?: string;
  name?: string;
  title?: string;
  description?: string;
  projectName?: string;
  projectKey?: string;
  project?: {
    id?: string;
    name?: string;
    key?: string;
    [key: string]: unknown;
  };
  taskStatus?: string;
  status?: string;
  percentComplete?: number;
  currentTimeTaskSeconds?: number;
  logTimeTaskSeconds?: number;
  durationTimeTaskSeconds?: number;
  estimatedTimeSeconds?: number;
  dueDate?: string;
  [key: string]: unknown;
}

export interface OpenTasksResponse {
  dueTasks: TaskItem[];
  currentTasks: TaskItem[];
  weekTasks: TaskItem[];
  bugs: TaskItem[];
  [key: string]: unknown;
}

export interface TaskTimeResponse {
  taskId?: string;
  timesheetId?: string;
  type?: string;
  taskStatus?: string;
  status?: string;
  currentTimeTaskSeconds?: number;
  logTimeTaskSeconds?: number;
  durationTimeTaskSeconds?: number;
  percentComplete?: number;
  [key: string]: unknown;
}

export interface ActiveTaskResponse {
  active?: boolean;
  hasActiveTask?: boolean;
  task?: TaskItem | null;
  id?: string;
  taskId?: string;
  timesheetId?: string;
  type?: string;
  key?: string;
  name?: string;
  description?: string;
  projectName?: string;
  taskStatus?: string;
  percentComplete?: number;
  currentTimeTaskSeconds?: number;
  logTimeTaskSeconds?: number;
  durationTimeTaskSeconds?: number;
  [key: string]: unknown;
}

export interface CustomFieldOption {
  id?: string;
  value?: string;
  label?: string;
  name?: string;
  [key: string]: unknown;
}

export interface CustomField {
  id?: string;
  fieldId?: string;
  name?: string;
  label?: string;
  type?: string;
  fieldType?: string;
  required?: boolean;
  isRequired?: boolean;
  value?: string | number | boolean | null;
  defaultValue?: string | number | boolean | null;
  options?: Array<string | CustomFieldOption>;
  values?: Array<string | CustomFieldOption>;
  [key: string]: unknown;
}

export interface TimesheetEntry {
  id: string;
  timesheetId?: string;
  taskId?: string;
  type?: string;
  key?: string;
  taskKey?: string;
  name?: string;
  taskName?: string;
  projectName?: string;
  timeSheetStatus?: string;
  taskStatus?: string;
  synchronizeStatus?: string;
  syncStatus?: string;
  synchronized?: boolean;
  createdDate?: string;
  date?: string;
  startDate?: string;
  durationTimeTaskSeconds?: number;
  logTimeTaskSeconds?: number;
  currentTimeTaskSeconds?: number;
  timeRealInSeconds?: number;
  realTimeSeconds?: number;
  percentComplete?: number;
  note?: string;
  customFields?: CustomField[];
  [key: string]: unknown;
}

export interface TimesheetDetailResponse {
  timesheet?: TimesheetEntry;
  customFields?: CustomField[];
  [key: string]: unknown;
}

export interface MonthTimesheetItem {
  id?: string;
  timesheetId?: string;
  taskId?: string;
  key?: string;
  name?: string;
  taskName?: string;
  projectName?: string;
  synchronizeStatus?: string;
  timesheetType?: string;
  totalMinutes?: number;
  timeRealInSeconds?: number;
  durationTimeTaskSeconds?: number;
  note?: string;
  [key: string]: unknown;
}

export interface TimesheetMonthDay {
  date: string;
  totalMinutesDay: number;
  timesheets: MonthTimesheetItem[];
  [key: string]: unknown;
}

export interface TimesheetMonthResponse {
  year?: number;
  month?: number;
  totalMinutesMonth?: number;
  timesheetDays: TimesheetMonthDay[];
  [key: string]: unknown;
}

export interface SessionInfoResponse {
  authenticated: boolean;
  user: UserInfo | null;
  csrfToken: string | null;
}

export interface HealthResponse {
  ok: boolean;
  upstreamConfigured: boolean;
  tlsReady: boolean;
  tlsWarning?: string;
}

export interface ReminderRule {
  enabled: boolean;
  time: string; // HH:mm
  days: number[]; // 1=Mon .. 7=Sun (ISO weekday)
}

export interface ReminderSettings {
  checkInReminder: ReminderRule;
  submitReminder: ReminderRule;
  browserNotificationsEnabled: boolean;
}
