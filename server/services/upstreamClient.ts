import type { ServerConfig } from '../config.ts';
import {
  collectIntegerKeys,
  parseLosslessJson,
  stringifyLosslessJson,
  toClientDto,
} from '../lib/losslessJson.ts';

export class UpstreamHttpError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly uncertainOutcome: boolean;
  public readonly businessCode?: string;

  constructor(
    message: string,
    options: {
      status: number;
      code: string;
      uncertainOutcome?: boolean;
      businessCode?: string;
    }
  ) {
    super(message);
    this.name = 'UpstreamHttpError';
    this.status = options.status;
    this.code = options.code;
    this.uncertainOutcome = Boolean(options.uncertainOutcome);
    this.businessCode = options.businessCode;
  }
}

export interface UpstreamResponse<T = unknown> {
  status: number;
  data: T;
  capturedCookies: Record<string, string>;
  integerKeys: string[];
}

function parseSetCookieHeaders(headers: Headers): Record<string, string> {
  const jar: Record<string, string> = {};
  const setCookies =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie') as string]
        : [];

  for (const raw of setCookies) {
    if (!raw) continue;
    const firstPart = raw.split(';')[0];
    const eqIdx = firstPart.indexOf('=');
    if (eqIdx > 0) {
      const name = firstPart.slice(0, eqIdx).trim();
      const val = firstPart.slice(eqIdx + 1).trim();
      if (name) {
        jar[name] = val;
      }
    }
  }
  return jar;
}

function formatCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

export function extractBusinessCode(payload: unknown): {
  codeResponse?: string;
  descriptionResponse?: string;
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }
  const rec = payload as Record<string, unknown>;
  const codeResponse =
    typeof rec.codeResponse === 'string'
      ? rec.codeResponse
      : typeof rec.codeResponse === 'number'
        ? String(rec.codeResponse)
        : undefined;
  const descriptionResponse =
    typeof rec.descriptionResponse === 'string'
      ? rec.descriptionResponse
      : typeof rec.message === 'string'
        ? rec.message
        : undefined;
  return { codeResponse, descriptionResponse };
}

export class UpstreamClient {
  private readonly config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  public ensureReady(): string {
    if (!this.config.neoApiBaseUrl) {
      throw new UpstreamHttpError(
        'El servidor no tiene configurada la variable NEO_API_BASE_URL.',
        { status: 503, code: 'UPSTREAM_NOT_CONFIGURED' }
      );
    }
    if (!this.config.tlsReady) {
      throw new UpstreamHttpError(
        this.config.tlsBlockReason ||
          'El servidor upstream requiere HTTPS en producción.',
        { status: 503, code: 'UPSTREAM_TLS_REQUIRED' }
      );
    }
    return this.config.neoApiBaseUrl;
  }

  public async request<T = unknown>(options: {
    method: 'GET' | 'POST';
    path: string;
    body?: unknown;
    cookies?: Record<string, string>;
    extraIntegerKeys?: string[];
    timeoutMs?: number;
    isWriteCritical?: boolean;
  }): Promise<UpstreamResponse<T>> {
    const baseUrl = this.ensureReady();
    const targetUrl = `${baseUrl}${options.path.startsWith('/') ? options.path : `/${options.path}`}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (options.cookies && Object.keys(options.cookies).length > 0) {
      headers.Cookie = formatCookieHeader(options.cookies);
    }

    let serializedBody: string | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      const intKeySet = new Set(options.extraIntegerKeys ?? []);
      serializedBody = stringifyLosslessJson(options.body, intKeySet);
    }

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? (options.method === 'POST' ? 25000 : 20000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(targetUrl, {
        method: options.method,
        headers,
        body: serializedBody,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      if (isAbort && options.isWriteCritical) {
        throw new UpstreamHttpError(
          'La operación tardó demasiado y el resultado en el servidor es incierto. Verifica el estado actual antes de reintentar.',
          { status: 504, code: 'TIMEOUT_UNCERTAIN', uncertainOutcome: true }
        );
      }
      if (isAbort) {
        throw new UpstreamHttpError(
          'Tiempo de espera agotado al contactar el servidor BT-Time.',
          { status: 504, code: 'UPSTREAM_TIMEOUT' }
        );
      }
      throw new UpstreamHttpError(
        'No se pudo establecer conexión con el servidor BT-Time.',
        { status: 502, code: 'UPSTREAM_UNREACHABLE' }
      );
    } finally {
      clearTimeout(timer);
    }

    const capturedCookies = parseSetCookieHeaders(res.headers);
    const rawText = await res.text();

    let parsedRaw: unknown = null;
    let integerKeys: string[] = [];
    if (rawText.trim().length > 0) {
      try {
        parsedRaw = parseLosslessJson(rawText);
        integerKeys = Array.from(collectIntegerKeys(parsedRaw));
      } catch {
        parsedRaw = { rawText };
      }
    }

    const dto = toClientDto(parsedRaw) as T;

    if (res.status === 401) {
      throw new UpstreamHttpError(
        'Tu sesión en BT-Time ha expirado. Inicia sesión nuevamente.',
        { status: 401, code: 'SESSION_EXPIRED' }
      );
    }

    if (!res.ok) {
      const { codeResponse, descriptionResponse } = extractBusinessCode(dto);
      throw new UpstreamHttpError(
        descriptionResponse || `Error del servidor BT-Time (HTTP ${res.status}).`,
        {
          status: res.status >= 400 && res.status < 500 ? res.status : 502,
          code: 'UPSTREAM_ERROR',
          businessCode: codeResponse,
        }
      );
    }

    const { codeResponse, descriptionResponse } = extractBusinessCode(dto);
    if (codeResponse !== undefined && codeResponse !== '000') {
      throw new UpstreamHttpError(
        descriptionResponse || `Operación rechazada por BT-Time (código ${codeResponse}).`,
        {
          status: 400,
          code: 'BUSINESS_ERROR',
          businessCode: codeResponse,
        }
      );
    }

    return {
      status: res.status,
      data: dto,
      capturedCookies,
      integerKeys,
    };
  }
}
