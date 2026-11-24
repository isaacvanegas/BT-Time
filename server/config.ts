import crypto from 'node:crypto';
import path from 'node:path';

export interface ServerConfig {
  port: number;
  isProduction: boolean;
  neoApiBaseUrl: string | null;
  tlsReady: boolean;
  tlsBlockReason: string | null;
  sessionSecret: string;
  sessionStorePath: string | null;
  sessionTtlMs: number;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const ephemeralFallbackSecret = crypto.randomBytes(32).toString('hex');

export function loadServerConfig(): ServerConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const port = Number(process.env.PORT || 3000) || 3000;
  const rawBaseUrl = (process.env.NEO_API_BASE_URL || '').trim();
  const allowPrivateHttp = process.env.ALLOW_PRIVATE_HTTP_UPSTREAM === 'true';

  let neoApiBaseUrl: string | null = null;
  let tlsReady = true;
  let tlsBlockReason: string | null = null;

  if (rawBaseUrl) {
    try {
      const parsed = new URL(rawBaseUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        tlsReady = false;
        tlsBlockReason = 'NEO_API_BASE_URL debe usar protocolo http: o https:.';
      } else {
        neoApiBaseUrl = rawBaseUrl.replace(/\/+$/, '');
        if (
          isProduction &&
          parsed.protocol === 'http:' &&
          !LOOPBACK_HOSTS.has(parsed.hostname) &&
          !allowPrivateHttp
        ) {
          tlsReady = false;
          tlsBlockReason =
            'Despliegue productivo bloqueado: NEO_API_BASE_URL usa HTTP sin cifrado. Configura un gateway HTTPS autorizado antes de enviar credenciales en producción.';
        }
      }
    } catch {
      tlsReady = false;
      tlsBlockReason = 'NEO_API_BASE_URL no es una URL válida.';
    }
  } else {
    tlsReady = false;
    tlsBlockReason = 'NEO_API_BASE_URL no está configurada en el servidor.';
  }

  const sessionSecret = (process.env.SESSION_SECRET || '').trim() || ephemeralFallbackSecret;
  const configuredStorePath = (process.env.SESSION_STORE_PATH || '').trim();
  const sessionStorePath = configuredStorePath
    ? path.resolve(configuredStorePath)
    : path.resolve(process.cwd(), '.data', 'sessions.enc.json');

  return {
    port,
    isProduction,
    neoApiBaseUrl,
    tlsReady,
    tlsBlockReason,
    sessionSecret,
    sessionStorePath,
    sessionTtlMs: 12 * 60 * 60 * 1000,
  };
}
