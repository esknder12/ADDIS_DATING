import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { checkDatabase } from './db/index.js';
import { sendVerificationInstructions } from './bot/handlers/verificationHandler.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createOnboardingRouter } from './routes/onboarding.routes.js';
import { createResultsRouter } from './routes/results.routes.js';
import { createVerificationRouter } from './routes/verification.routes.js';

function createCorsOptions(runtimeConfig) {
  return {
    origin(origin, callback) {
      // Native clients, health checks, and same-origin requests may omit Origin.
      if (!origin) return callback(null, true);
      if (!runtimeConfig.isProduction) return callback(null, true);
      if (runtimeConfig.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
  };
}

export function createApp({
  runtimeConfig,
  userRepository,
  onboardingRepository,
  resultsRepository,
  resultsService,
  verificationRepository,
  notifier,
  fetchImpl,
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

  const resultsLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
    },
  });

  // Mounted before '/api/onboarding' so the more specific prefix wins.
  app.use(
    '/api/onboarding/results',
    resultsLimiter,
    createResultsRouter({ resultsRepository, resultsService, runtimeConfig }),
  );

  app.use(
    '/api/onboarding',
    onboardingLimiter,
    createOnboardingRouter({ onboardingRepository, runtimeConfig }),
  );

  const verificationLimiter = rateLimit({
    windowMs: 60_000,
    // Each request fans out to three outbound Telegram calls including a pin.
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
    },
  });

  app.use(
    '/api/verification',
    verificationLimiter,
    createVerificationRouter({
      verificationRepository,
      notifier,
      runtimeConfig,
      sendInstructions: (telegramId) => sendVerificationInstructions(notifier, {
        chatId: telegramId,
        telegramId,
        exampleVideoFileId: runtimeConfig.verificationExampleVideoId,
        webappUrl: runtimeConfig.webappUrl,
      }),
    }),
  );

  // Admin review approves face videos, so the router is only mounted when a token exists.
  // Unconfigured admin access 404s rather than opening up.
  if (runtimeConfig.adminApiToken) {
    const adminLimiter = rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: {
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
      },
    });

    app.use(
      '/api/admin',
      adminLimiter,
      createAdminRouter({ verificationRepository, notifier, runtimeConfig, fetchImpl }),
    );
  }

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
