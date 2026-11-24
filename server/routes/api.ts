import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import type { CustomField } from '../../shared/types.ts';
import type { ServerConfig } from '../config.ts';
import { SessionStore, type SessionRecord } from '../lib/sessionStore.ts';
import { UpstreamClient, UpstreamHttpError } from '../services/upstreamClient.ts';

export const SESSION_COOKIE_NAME = 'bttime_sid';
const SAFE_TYPE_REGEX = /^[A-Za-z0-9_-]{1,40}$/;
const SAFE_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

interface AuthenticatedRequest extends Request {
  sessionRecord?: SessionRecord;
}

function parseRequestCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k) {
        try {
          cookies[k] = decodeURIComponent(v);
        } catch {
          cookies[k] = v;
        }
      }
    }
  }
  return cookies;
}

function isHttpsRequest(req: Request, config: ServerConfig): boolean {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return req.secure || forwardedProto === 'https' || config.isProduction;
}

function setSessionCookie(req: Request, res: Response, sessionId: string, config: ServerConfig): void {
  const maxAgeSec = Math.floor(config.sessionTtlMs / 1000);
  if (isHttpsRequest(req, config)) {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=${maxAgeSec}`
    );
  } else {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`
    );
  }
}

function clearSessionCookie(req: Request, res: Response, config: ServerConfig): void {
  if (isHttpsRequest(req, config)) {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=0`
    );
  } else {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
    );
  }
}

function verifySameOrigin(req: Request): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const expectedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    if (!expectedHost) return false;
    return originHost === expectedHost;
  } catch {
    return false;
  }
}

function timingSafeMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function normalizeCustomFieldsForEnd(rawFields: unknown): CustomField[] {
  if (rawFields === undefined || rawFields === null) {
    return [];
  }
  if (!Array.isArray(rawFields)) {
    throw new UpstreamHttpError('customFields debe ser una lista válida.', {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  return rawFields.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new UpstreamHttpError('Elemento inválido en customFields.', {
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    }
    const field = { ...(item as CustomField) };
    const nameLower = String(field.name || field.label || '').trim().toLowerCase();
    const isRequired = Boolean(field.required || field.isRequired);

    if (nameLower.includes('activity') && nameLower.includes('type')) {
      const val = String(field.value ?? '').trim();
      if (!val) {
        throw new UpstreamHttpError('El campo Activity Type es obligatorio.', {
          status: 400,
          code: 'VALIDATION_ERROR',
        });
      }
    } else if (isRequired) {
      const val = field.value;
      if (val === undefined || val === null || String(val).trim() === '') {
        throw new UpstreamHttpError(
          `El campo obligatorio "${String(field.label || field.name || 'Campo')}" no puede estar vacío.`,
          { status: 400, code: 'VALIDATION_ERROR' }
        );
      }
    }

    return field;
  });
}

function normalizeEndBody(body: unknown): {
  note: string;
  percentComplete: number;
  customFields: CustomField[];
} {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const note = typeof record.note === 'string' ? record.note.trim() : '';
  if (!note) {
    throw new UpstreamHttpError('El comentario (Nota) es obligatorio para finalizar la tarea.', {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  const customFields = normalizeCustomFieldsForEnd(record.customFields);

  // Rule: percentComplete MUST always be sent as 0.
  return {
    note,
    percentComplete: 0,
    customFields,
  };
}

export function createApiRouter(
  config: ServerConfig,
  sessionStore: SessionStore,
  upstream: UpstreamClient
): express.Router {
  const router = express.Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Demasiados intentos de inicio de sesión. Espera unos minutos e intenta nuevamente.',
      code: 'RATE_LIMITED',
    },
  });

  const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Límite de solicitudes alcanzado. Intenta nuevamente en breve.',
      code: 'RATE_LIMITED',
    },
  });

  router.use(apiLimiter);

  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      upstreamConfigured: Boolean(config.neoApiBaseUrl),
      tlsReady: config.tlsReady,
      tlsWarning: config.tlsReady ? undefined : config.tlsBlockReason || undefined,
    });
  });

  function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const cookies = parseRequestCookies(req.headers.cookie);
    const sid = cookies[SESSION_COOKIE_NAME];
    const session = sessionStore.get(sid);
    if (!session) {
      clearSessionCookie(req, res, config);
      res.status(401).json({
        error: 'No hay una sesión activa o ha expirado. Inicia sesión nuevamente.',
        code: 'SESSION_EXPIRED',
      });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      if (!verifySameOrigin(req)) {
        res.status(403).json({
          error: 'Origen de solicitud no permitido.',
          code: 'CSRF_ORIGIN_MISMATCH',
        });
        return;
      }
      const xRequestedWith = String(req.headers['x-requested-with'] || '');
      const csrfHeader = String(req.headers['x-csrf-token'] || '');
      if (
        xRequestedWith !== 'XMLHttpRequest' ||
        !csrfHeader ||
        !timingSafeMatch(csrfHeader, session.csrfToken)
      ) {
        res.status(403).json({
          error: 'Token CSRF inválido o faltante. Recarga la aplicación.',
          code: 'CSRF_INVALID',
        });
        return;
      }
    }

    req.sessionRecord = session;
    next();
  }

  function handleUpstreamError(
    err: unknown,
    req: AuthenticatedRequest,
    res: Response
  ): void {
    if (err instanceof UpstreamHttpError) {
      if (err.status === 401 && req.sessionRecord) {
        sessionStore.delete(req.sessionRecord.sessionId);
        clearSessionCookie(req, res, config);
      }
      res.status(err.status).json({
        error: err.message,
        code: err.code,
        uncertainOutcome: err.uncertainOutcome,
        businessCode: err.businessCode,
      });
      return;
    }

    res.status(500).json({
      error: 'Error interno al procesar la solicitud.',
      code: 'INTERNAL_ERROR',
    });
  }

  router.post('/auth/signin', loginLimiter, async (req: Request, res: Response) => {
    if (!verifySameOrigin(req)) {
      res.status(403).json({ error: 'Origen no autorizado.', code: 'ORIGIN_MISMATCH' });
      return;
    }

    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const timeZone = typeof body.timeZone === 'string' ? body.timeZone.trim() : '';

    if (!username || !password) {
      res.status(400).json({
        error: 'Ingresa tu usuario y contraseña.',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    if (!timeZone || timeZone.length > 80) {
      res.status(400).json({
        error: 'Zona horaria IANA inválida.',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    try {
      const upstreamRes = await upstream.request<Record<string, unknown>>({
        method: 'POST',
        path: '/auth/signin',
        body: { username, password, timeZone },
      });

      const data = upstreamRes.data || {};
      const userObj =
        (data.user as Record<string, unknown> | undefined) ||
        (data.profile as Record<string, unknown> | undefined) ||
        data;

      const session = sessionStore.create({
        username,
        timeZone,
        userInfo: userObj,
        upstreamCookies: upstreamRes.capturedCookies,
        integerKeys: upstreamRes.integerKeys,
      });

      setSessionCookie(req, res, session.sessionId, config);
      res.json({
        authenticated: true,
        user: userObj,
        csrfToken: session.csrfToken,
        raw: data,
      });
    } catch (err) {
      handleUpstreamError(err, req, res);
    }
  });

  router.get('/auth/session', async (req: Request, res: Response) => {
    const cookies = parseRequestCookies(req.headers.cookie);
    const sid = cookies[SESSION_COOKIE_NAME];
    const session = sessionStore.get(sid);

    if (!session) {
      res.json({ authenticated: false, user: null, csrfToken: null });
      return;
    }

    try {
      const infoRes = await upstream.request<Record<string, unknown>>({
        method: 'GET',
        path: '/user/info',
        cookies: session.upstreamCookies,
      });

      const updated = sessionStore.update(session.sessionId, {
        userInfo: infoRes.data,
        upstreamCookies: infoRes.capturedCookies,
        integerKeys: infoRes.integerKeys,
      });

      res.json({
        authenticated: true,
        user: infoRes.data,
        csrfToken: updated?.csrfToken ?? session.csrfToken,
      });
    } catch (err) {
      if (err instanceof UpstreamHttpError && err.status === 401) {
        sessionStore.delete(session.sessionId);
        clearSessionCookie(req, res, config);
        res.status(401).json({
          authenticated: false,
          user: null,
          csrfToken: null,
          error: err.message,
          code: 'SESSION_EXPIRED',
        });
        return;
      }
      // If upstream is temporarily unreachable, preserve existing session metadata
      if (err instanceof UpstreamHttpError && (err.status === 502 || err.status === 503 || err.status === 504)) {
        res.json({
          authenticated: true,
          user: session.userInfo,
          csrfToken: session.csrfToken,
          upstreamWarning: err.message,
        });
        return;
      }
      handleUpstreamError(err, req, res);
    }
  });

  router.post('/auth/signout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const session = req.sessionRecord!;
    try {
      await upstream.request({
        method: 'POST',
        path: '/auth/signout',
        cookies: session.upstreamCookies,
      });
    } catch {
      // Always terminate local session even if upstream signout fails
    } finally {
      sessionStore.delete(session.sessionId);
      clearSessionCookie(req, res, config);
    }
    res.json({ ok: true });
  });

  router.get('/user/info', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const session = req.sessionRecord!;
    try {
      const upstreamRes = await upstream.request<Record<string, unknown>>({
        method: 'GET',
        path: '/user/info',
        cookies: session.upstreamCookies,
      });
      sessionStore.update(session.sessionId, {
        userInfo: upstreamRes.data,
        upstreamCookies: upstreamRes.capturedCookies,
        integerKeys: upstreamRes.integerKeys,
      });
      res.json(upstreamRes.data);
    } catch (err) {
      handleUpstreamError(err, req, res);
    }
  });

  for (const statusAction of ['online', 'pause', 'offline'] as const) {
    router.post(`/user/${statusAction}`, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
      const session = req.sessionRecord!;
      try {
        const upstreamRes = await upstream.request({
          method: 'POST',
          path: `/user/${statusAction}`,
          cookies: session.upstreamCookies,
        });
        sessionStore.update(session.sessionId, {
          upstreamCookies: upstreamRes.capturedCookies,
          integerKeys: upstreamRes.integerKeys,
        });
        res.json(upstreamRes.data ?? { ok: true });
      } catch (err) {
        handleUpstreamError(err, req, res);
      }
    });
  }

  router.get('/tasks/open', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const session = req.sessionRecord!;
    try {
      const upstreamRes = await upstream.request({
        method: 'GET',
        path: '/tasks/open',
        cookies: session.upstreamCookies,
      });
      sessionStore.update(session.sessionId, {
        upstreamCookies: upstreamRes.capturedCookies,
        integerKeys: upstreamRes.integerKeys,
      });
      res.json(upstreamRes.data);
    } catch (err) {
      handleUpstreamError(err, req, res);
    }
  });

  router.get('/tasks/active', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const session = req.sessionRecord!;
    try {
      const upstreamRes = await upstream.request({
        method: 'GET',
        path: '/tasks/active',
        cookies: session.upstreamCookies,
      });
      sessionStore.update(session.sessionId, {
        upstreamCookies: upstreamRes.capturedCookies,
        integerKeys: upstreamRes.integerKeys,
      });
      res.json(upstreamRes.data);
    } catch (err) {
      handleUpstreamError(err, req, res);
    }
  });

  router.get('/tasks/timesheet', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const session = req.sessionRecord!;
    try {
      const upstreamRes = await upstream.request({
        method: 'GET',
        path: '/tasks/timesheet',
        cookies: session.upstreamCookies,
      });
      sessionStore.update(session.sessionId, {
        upstreamCookies: upstreamRes.capturedCookies,
        integerKeys: upstreamRes.integerKeys,
      });
      res.json(upstreamRes.data);
    } catch (err) {
      handleUpstreamError(err, req, res);
    }
  });

  router.post('/tasks/timesheet', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const session = req.sessionRecord!;
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    if (!Array.isArray(body.timesheet) || body.timesheet.length === 0) {
      res.status(400).json({
        error: 'La lista timesheet es obligatoria y no puede estar vacía.',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    for (const entry of body.timesheet) {
      if (!entry || typeof entry !== 'object') {
        res.status(400).json({ error: 'Entrada de hoja de horas inválida.', code: 'VALIDATION_ERROR' });
        return;
      }
      const rec = entry as Record<string, unknown>;
      if (rec.timeRealInSeconds !== undefined && rec.timeRealInSeconds !== null) {
        const secs = Number(rec.timeRealInSeconds);
        if (!Number.isFinite(secs) || secs < 0 || !Number.isInteger(secs)) {
          res.status(400).json({
            error: 'timeRealInSeconds debe ser un entero positivo válido.',
            code: 'VALIDATION_ERROR',
          });
          return;
        }
      }
    }

    try {
      const upstreamRes = await upstream.request({
        method: 'POST',
        path: '/tasks/timesheet',
        body: { timesheet: body.timesheet },
        cookies: session.upstreamCookies,
        extraIntegerKeys: session.integerKeys,
        isWriteCritical: true,
      });
      sessionStore.update(session.sessionId, {
        upstreamCookies: upstreamRes.capturedCookies,
        integerKeys: upstreamRes.integerKeys,
      });
      res.json(upstreamRes.data ?? { codeResponse: '000' });
    } catch (err) {
      handleUpstreamError(err, req, res);
    }
  });

  router.get('/tasks/timesheetExpired', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const session = req.sessionRecord!;
    try {
      const upstreamRes = await upstream.request({
        method: 'GET',
        path: '/tasks/timesheetExpired',
        cookies: session.upstreamCookies,
      });
      sessionStore.update(session.sessionId, {
        upstreamCookies: upstreamRes.capturedCookies,
        integerKeys: upstreamRes.integerKeys,
      });
      res.json(upstreamRes.data);
    } catch (err) {
      handleUpstreamError(err, req, res);
    }
  });

  router.get('/tasks/timesheet/:timesheetId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const session = req.sessionRecord!;
    const timesheetId = String(req.params.timesheetId || '');
    if (!SAFE_ID_REGEX.test(timesheetId)) {
      res.status(400).json({ error: 'timesheetId inválido.', code: 'VALIDATION_ERROR' });
      return;
    }

    try {
      const upstreamRes = await upstream.request({
        method: 'GET',
        path: `/tasks/timesheet/${encodeURIComponent(timesheetId)}/`,
        cookies: session.upstreamCookies,
      });
      sessionStore.update(session.sessionId, {
        upstreamCookies: upstreamRes.capturedCookies,
        integerKeys: upstreamRes.integerKeys,
      });
      res.json(upstreamRes.data);
    } catch (err) {
      handleUpstreamError(err, req, res);
    }
  });

  router.get('/tasks/timesheet/:timesheetId/time', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const session = req.sessionRecord!;
    const timesheetId = String(req.params.timesheetId || '');
    if (!SAFE_ID_REGEX.test(timesheetId)) {
      res.status(400).json({ error: 'timesheetId inválido.', code: 'VALIDATION_ERROR' });
      return;
    }

    try {
      const upstreamRes = await upstream.request({
        method: 'GET',
        path: `/tasks/timesheet/${encodeURIComponent(timesheetId)}/time`,
        cookies: session.upstreamCookies,
      });
      sessionStore.update(session.sessionId, {
        upstreamCookies: upstreamRes.capturedCookies,
        integerKeys: upstreamRes.integerKeys,
      });
      res.json(upstreamRes.data);
    } catch (err) {
      handleUpstreamError(err, req, res);
    }
  });

  router.post('/tasks/timesheet/:timesheetId/end', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const session = req.sessionRecord!;
    const timesheetId = String(req.params.timesheetId || '');
    if (!SAFE_ID_REGEX.test(timesheetId)) {
      res.status(400).json({ error: 'timesheetId inválido.', code: 'VALIDATION_ERROR' });
      return;
    }

    try {
      const payload = normalizeEndBody(req.body);
      const upstreamRes = await upstream.request({
        method: 'POST',
        path: `/tasks/timesheet/${encodeURIComponent(timesheetId)}/end`,
        body: payload,
        cookies: session.upstreamCookies,
        extraIntegerKeys: session.integerKeys,
        isWriteCritical: true,
      });
      sessionStore.update(session.sessionId, {
        upstreamCookies: upstreamRes.capturedCookies,
        integerKeys: upstreamRes.integerKeys,
      });
      res.json(upstreamRes.data ?? { codeResponse: '000' });
    } catch (err) {
      handleUpstreamError(err, req, res);
    }
  });

  router.post('/tasks/:type/:taskId/start', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const session = req.sessionRecord!;
    const type = String(req.params.type || '');
    const taskId = String(req.params.taskId || '');
    if (!SAFE_TYPE_REGEX.test(type) || !SAFE_ID_REGEX.test(taskId)) {
      res.status(400).json({ error: 'Parámetros de tarea inválidos.', code: 'VALIDATION_ERROR' });
      return;
    }

    try {
      const upstreamRes = await upstream.request({
        method: 'POST',
        path: `/tasks/${encodeURIComponent(type)}/${encodeURIComponent(taskId)}/start`,
        cookies: session.upstreamCookies,
      });
      sessionStore.update(session.sessionId, {
        upstreamCookies: upstreamRes.capturedCookies,
        integerKeys: upstreamRes.integerKeys,
      });
      res.json(upstreamRes.data ?? { ok: true });
    } catch (err) {
      handleUpstreamError(err, req, res);
    }
  });

  router.post('/tasks/:type/:taskId/pause', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const session = req.sessionRecord!;
    const type = String(req.params.type || '');
    const taskId = String(req.params.taskId || '');
    if (!SAFE_TYPE_REGEX.test(type) || !SAFE_ID_REGEX.test(taskId)) {
      res.status(400).json({ error: 'Parámetros de tarea inválidos.', code: 'VALIDATION_ERROR' });
      return;
    }

    try {
      const upstreamRes = await upstream.request({
        method: 'POST',
        path: `/tasks/${encodeURIComponent(type)}/${encodeURIComponent(taskId)}/pause`,
        cookies: session.upstreamCookies,
      });
      sessionStore.update(session.sessionId, {
        upstreamCookies: upstreamRes.capturedCookies,
        integerKeys: upstreamRes.integerKeys,
      });
      res.json(upstreamRes.data ?? { ok: true });
    } catch (err) {
      handleUpstreamError(err, req, res);
    }
  });

  router.get('/tasks/:type/:taskId/time', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const session = req.sessionRecord!;
    const type = String(req.params.type || '');
    const taskId = String(req.params.taskId || '');
    if (!SAFE_TYPE_REGEX.test(type) || !SAFE_ID_REGEX.test(taskId)) {
      res.status(400).json({ error: 'Parámetros de tarea inválidos.', code: 'VALIDATION_ERROR' });
      return;
    }

    try {
      const upstreamRes = await upstream.request({
        method: 'GET',
        path: `/tasks/${encodeURIComponent(type)}/${encodeURIComponent(taskId)}/time`,
        cookies: session.upstreamCookies,
      });
      sessionStore.update(session.sessionId, {
        upstreamCookies: upstreamRes.capturedCookies,
        integerKeys: upstreamRes.integerKeys,
      });
      res.json(upstreamRes.data);
    } catch (err) {
      handleUpstreamError(err, req, res);
    }
  });

  router.post('/tasks/:type/:taskId/end', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const session = req.sessionRecord!;
    const type = String(req.params.type || '');
    const taskId = String(req.params.taskId || '');
    if (!SAFE_TYPE_REGEX.test(type) || !SAFE_ID_REGEX.test(taskId)) {
      res.status(400).json({ error: 'Parámetros de tarea inválidos.', code: 'VALIDATION_ERROR' });
      return;
    }

    try {
      const payload = normalizeEndBody(req.body);
      const upstreamRes = await upstream.request({
        method: 'POST',
        path: `/tasks/${encodeURIComponent(type)}/${encodeURIComponent(taskId)}/end`,
        body: payload,
        cookies: session.upstreamCookies,
        extraIntegerKeys: session.integerKeys,
        isWriteCritical: true,
      });
      sessionStore.update(session.sessionId, {
        upstreamCookies: upstreamRes.capturedCookies,
        integerKeys: upstreamRes.integerKeys,
      });
      res.json(upstreamRes.data ?? { codeResponse: '000' });
    } catch (err) {
      handleUpstreamError(err, req, res);
    }
  });

  router.get('/timesheet-month/:year/:month', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const session = req.sessionRecord!;
    const year = Number(req.params.year);
    const month = Number(req.params.month);
    if (
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      res.status(400).json({ error: 'Año o mes inválido.', code: 'VALIDATION_ERROR' });
      return;
    }

    try {
      const upstreamRes = await upstream.request({
        method: 'GET',
        path: `/timesheet_month/${year}/${month}`,
        cookies: session.upstreamCookies,
      });
      sessionStore.update(session.sessionId, {
        upstreamCookies: upstreamRes.capturedCookies,
        integerKeys: upstreamRes.integerKeys,
      });
      res.json(upstreamRes.data);
    } catch (err) {
      handleUpstreamError(err, req, res);
    }
  });

  return router;
}
