import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server.ts';

describe('Express BT-Time proxy integration (anonymized fixtures)', () => {
  let upstreamServer: http.Server;
  let proxyServer: http.Server;
  let upstreamBaseUrl = '';
  let proxyBaseUrl = '';
  let upstreamShould401 = false;
  let lastUpstreamRawBody = '';
  let lastUpstreamPath = '';

  beforeAll(async () => {
    upstreamServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        lastUpstreamRawBody = rawBody;
        lastUpstreamPath = req.url || '';

        if (upstreamShould401) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Unauthorized' }));
          return;
        }

        if (req.url === '/api/auth/signin' && req.method === 'POST') {
          res.setHeader('Set-Cookie', 'JSESSIONID=anon-upstream-cookie-xyz; HttpOnly; Path=/');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            '{"codeResponse":"000","descriptionResponse":"OK","user":{"id":9007199254740993,"fullName":"Usuario Demo","email":"demo@example.com","userStatus":"OFFLINE"}}'
          );
          return;
        }

        const cookieHeader = req.headers.cookie || '';
        if (!cookieHeader.includes('JSESSIONID=anon-upstream-cookie-xyz')) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Missing upstream cookie' }));
          return;
        }

        if (req.url === '/api/user/info' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            '{"id":9007199254740993,"fullName":"Usuario Demo","email":"demo@example.com","userStatus":"ONLINE","currentTimeSeconds":120}'
          );
          return;
        }

        if (req.url === '/api/tasks/timesheet' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            '[{"id":9223372036854775801,"taskId":9007199254740993,"type":"BUG","key":"BUG-101","name":"Fix Demo","timeSheetStatus":"END","durationTimeTaskSeconds":1800,"timeRealInSeconds":1800,"percentComplete":0}]'
          );
          return;
        }

        if (req.url === '/api/tasks/timesheet' && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"codeResponse":"000","descriptionResponse":"OK"}');
          return;
        }

        if (req.url === '/api/tasks/BUG/9007199254740993/end' && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"codeResponse":"000","descriptionResponse":"Finalizada"}');
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end('{"message":"Not found"}');
      });
    });

    await new Promise<void>((resolve) => {
      upstreamServer.listen(0, '127.0.0.1', () => resolve());
    });
    const upAddr = upstreamServer.address() as AddressInfo;
    upstreamBaseUrl = `http://127.0.0.1:${upAddr.port}/api`;

    const { app } = createApp({
      isProduction: false,
      neoApiBaseUrl: upstreamBaseUrl,
      tlsReady: true,
      tlsBlockReason: null,
      sessionStorePath: null,
    });

    proxyServer = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => {
      proxyServer.once('listening', () => resolve());
    });
    const proxyAddr = proxyServer.address() as AddressInfo;
    proxyBaseUrl = `http://127.0.0.1:${proxyAddr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
    await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
  });

  it('authenticates, isolates upstream cookie, preserves 64-bit IDs, enforces CSRF and percentComplete=0, and cleans up on 401', async () => {
    // 1. Login
    const loginRes = await fetch(`${proxyBaseUrl}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'demo@example.com',
        password: 'demo-password-only-test',
        timeZone: 'America/Guatemala',
      }),
    });
    expect(loginRes.status).toBe(200);
    const setCookies = loginRes.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith('bttime_sid='))).toBe(true);
    expect(setCookies.some((c) => c.includes('JSESSIONID'))).toBe(false);

    const sessionCookie = setCookies[0].split(';')[0];
    const loginJson = (await loginRes.json()) as {
      authenticated: boolean;
      csrfToken: string;
      user: { id: string };
    };
    expect(loginJson.authenticated).toBe(true);
    expect(loginJson.user.id).toBe('9007199254740993');

    // 2. Rejects write without CSRF token
    const noCsrfRes = await fetch(`${proxyBaseUrl}/api/tasks/BUG/9007199254740993/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ note: 'Trabajo realizado', percentComplete: 90, customFields: [] }),
    });
    expect(noCsrfRes.status).toBe(403);

    // 3. Rejects empty note even with CSRF
    const emptyNoteRes = await fetch(`${proxyBaseUrl}/api/tasks/BUG/9007199254740993/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-Token': loginJson.csrfToken,
      },
      body: JSON.stringify({ note: '   ', percentComplete: 80, customFields: [] }),
    });
    expect(emptyNoteRes.status).toBe(400);

    // 4. Forces percentComplete: 0 and preserves dynamic type (BUG)
    const endOkRes = await fetch(`${proxyBaseUrl}/api/tasks/BUG/9007199254740993/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-Token': loginJson.csrfToken,
      },
      body: JSON.stringify({
        note: 'Validación completada',
        percentComplete: 85,
        customFields: [{ id: '9007199254740999', name: 'Activity Type', value: 'Gestión' }],
      }),
    });
    expect(endOkRes.status).toBe(200);
    expect(lastUpstreamPath).toBe('/api/tasks/BUG/9007199254740993/end');
    expect(lastUpstreamRawBody).toContain('"percentComplete":0');
    expect(lastUpstreamRawBody).toContain('"id":9007199254740999');

    // 5. Timesheet GET -> POST preserves 64-bit integer IDs exactly
    const tsGetRes = await fetch(`${proxyBaseUrl}/api/tasks/timesheet`, {
      headers: { Cookie: sessionCookie },
    });
    expect(tsGetRes.status).toBe(200);
    const entries = (await tsGetRes.json()) as Array<Record<string, unknown>>;
    expect(entries[0].id).toBe('9223372036854775801');

    entries[0].timeRealInSeconds = 3600;
    const tsPostRes = await fetch(`${proxyBaseUrl}/api/tasks/timesheet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-Token': loginJson.csrfToken,
      },
      body: JSON.stringify({ timesheet: entries }),
    });
    expect(tsPostRes.status).toBe(200);
    expect(lastUpstreamRawBody).toContain('"id":9223372036854775801');
    expect(lastUpstreamRawBody).toContain('"taskId":9007199254740993');

    // 6. Upstream 401 clears local session
    upstreamShould401 = true;
    const expiredRes = await fetch(`${proxyBaseUrl}/api/user/info`, {
      headers: { Cookie: sessionCookie },
    });
    expect(expiredRes.status).toBe(401);

    upstreamShould401 = false;
    const afterClearRes = await fetch(`${proxyBaseUrl}/api/user/info`, {
      headers: { Cookie: sessionCookie },
    });
    expect(afterClearRes.status).toBe(401);
  });

  it('blocks insecure HTTP upstream in production unless explicitly on private VPC/HTTPS', async () => {
    const { app } = createApp({
      isProduction: true,
      neoApiBaseUrl: 'http://public-example-upstream.example.com:8081/api',
      tlsReady: false,
      tlsBlockReason: 'TLS requerido en producción.',
      sessionStorePath: null,
    });
    const blockedServer = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => blockedServer.once('listening', () => resolve()));
    const addr = blockedServer.address() as AddressInfo;

    try {
      const res = await fetch(`http://127.0.0.1:${addr.port}/api/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'demo@example.com',
          password: 'demo-password',
          timeZone: 'UTC',
        }),
      });
      expect(res.status).toBe(503);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('UPSTREAM_TLS_REQUIRED');
    } finally {
      await new Promise<void>((resolve) => blockedServer.close(() => resolve()));
    }
  });
});
