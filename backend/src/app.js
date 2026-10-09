import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { checkDatabase } from './db/index.js';
import { createAppRouter } from './routes/app.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createOnboardingRouter } from './routes/onboarding.routes.js';

function createCorsOptions(runtimeConfig) {
  return {
    origin(origin, callback) {
      // Native clients, health checks, and same-origin requests may omit Origin.
      if (!origin) return callback(null, true);
      if (!runtimeConfig.isProduction) return callback(null, true);
      if (runtimeConfig.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
  };
}

export function createApp({
  runtimeConfig,
  userRepository,
  onboardingRepository,
  appRepository = { isAvailable: false },
}) {
  const app = express();

  app.disable('x-powered-by');
  if (runtimeConfig.isProduction) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors(createCorsOptions(runtimeConfig)));
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', async (_req, res) => {
    const database = await checkDatabase();
    const healthy = !runtimeConfig.isProduction || database.connected;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      service: 'dategram-api',
      database,
      timestamp: new Date().toISOString(),
    });
  });

  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' },
    },
  });

  app.use(
    '/api/auth',
    authLimiter,
    createAuthRouter({ userRepository, runtimeConfig }),
  );

  const onboardingLimiter = rateLimit({
    windowMs: 60_000,
    limit: 180,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
    },
  });

  app.use(
    '/api/onboarding',
    onboardingLimiter,
    createOnboardingRouter({ onboardingRepository, runtimeConfig }),
  );

  const appLimiter = rateLimit({
    windowMs: 60_000,
    limit: 240,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
    },
  });

  app.use(
    '/api/app',
    appLimiter,
    createAppRouter({ appRepository, onboardingRepository, runtimeConfig }),
  );

  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'API route not found.' },
    });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    console.error(error);
    const isCorsError = error.message === 'Origin is not allowed by CORS';
    res.status(isCorsError ? 403 : 500).json({
      error: {
        code: isCorsError ? 'ORIGIN_NOT_ALLOWED' : 'INTERNAL_ERROR',
        message: isCorsError
          ? 'This app origin is not allowed.'
          : 'Something went wrong. Please try again.',
      },
    });
  });

  return app;
}
