import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerConfig, type ServerConfig } from './server/config.ts';
import { SessionStore } from './server/lib/sessionStore.ts';
import { createApiRouter } from './server/routes/api.ts';
import { UpstreamClient } from './server/services/upstreamClient.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(overrideConfig?: Partial<ServerConfig>): {
  app: express.Express;
  config: ServerConfig;
  sessionStore: SessionStore;
} {
  const config: ServerConfig = {
    ...loadServerConfig(),
    ...overrideConfig,
  };

  const sessionStore = new SessionStore(
    config.sessionSecret,
    config.sessionStorePath,
    config.sessionTtlMs
  );
  const upstreamClient = new UpstreamClient(config);

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      frameguard: false,
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'", "'unsafe-inline'"],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
          'img-src': ["'self'", 'data:', 'blob:'],
          'connect-src': ["'self'"],
          'worker-src': ["'self'", 'blob:'],
          'manifest-src': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': [
            "'self'",
            'https://aistudio.google.com',
            'https://*.google.com',
          ],
        },
      },
    })
  );

  app.use(express.json({ limit: '1mb' }));

  // Same-origin CORS only (never wildcard on authenticated routes)
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost === host) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Allow-Credentials', 'true');
          res.setHeader('Vary', 'Origin');
        }
      } catch {
        // Ignore malformed origin header; write routes reject mismatched origins
      }
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use('/api', createApiRouter(config, sessionStore, upstreamClient));

  return { app, config, sessionStore };
}

async function startServer(): Promise<void> {
  const { app, config } = createApp();

  if (!config.isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distPath, {
        index: false,
        maxAge: '1d',
      })
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.info(`[bt-time-neo] Servidor escuchando en puerto ${config.port}`);
  });
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isEntrypoint) {
  startServer().catch((err) => {
    console.error('[bt-time-neo] Error fatal al iniciar el servidor:', err instanceof Error ? err.message : 'Unknown error');
    process.exit(1);
  });
}
