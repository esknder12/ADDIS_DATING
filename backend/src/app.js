import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { checkDatabase } from './db/index.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { createAiPicksRouter } from './routes/aiPicks.routes.js';
import { createAppRouter } from './routes/app.routes.js';
import { createBoostRouter } from './routes/boost.routes.js';
import { createChatsRouter } from './routes/chats.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createDiscoveryRouter } from './routes/discovery.routes.js';
import { createLikesRouter } from './routes/likes.routes.js';
import { createMatchesRouter } from './routes/matches.routes.js';
import { createOnboardingRouter } from './routes/onboarding.routes.js';
import { createProfileRouter } from './routes/profile.routes.js';
import { createSwipeRouter } from './routes/swipe.routes.js';

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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
    maxAge: 86_400,
  };
}

export function createApp({
  runtimeConfig,
  userRepository,
  onboardingRepository,
  appRepository = { isAvailable: false },
  bot = null,
  notificationService = null,
}) {
  const app = express();

  app.set('bot', bot);
  app.set('notificationService', notificationService);
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

  // The /api/app routes remain available as backwards-compatible aliases.
  app.use('/api/discovery', appLimiter, createDiscoveryRouter({ appRepository, runtimeConfig }));
  app.use('/api/swipe', appLimiter, createSwipeRouter({ appRepository, runtimeConfig }));
  app.use('/api/ai-picks', appLimiter, createAiPicksRouter({ appRepository, runtimeConfig }));
  app.use('/api/likes', appLimiter, createLikesRouter({ appRepository, runtimeConfig }));
  app.use('/api/matches', appLimiter, createMatchesRouter({ appRepository, runtimeConfig }));
  app.use('/api/boost', appLimiter, createBoostRouter({ appRepository, runtimeConfig }));
  const adminLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: { code: 'RATE_LIMITED', message: 'Too many admin requests. Please slow down.' },
    },
  });
  app.use('/api/admin', adminLimiter, createAdminRouter({ appRepository, runtimeConfig }));
  app.use(
    '/api/app',
    appLimiter,
    createAppRouter({ appRepository, onboardingRepository, runtimeConfig }),
  );
  app.use('/api/chats', appLimiter, createChatsRouter({ appRepository, runtimeConfig }));
  app.use('/api/profile', appLimiter, createProfileRouter({ appRepository, runtimeConfig }));
  // Additive aliases for clients that consume all application endpoints below /api/app.
  app.use('/api/app/chats', appLimiter, createChatsRouter({ appRepository, runtimeConfig }));
  app.use('/api/app/profile', appLimiter, createProfileRouter({ appRepository, runtimeConfig }));

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
