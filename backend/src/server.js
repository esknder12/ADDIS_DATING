import { createApp } from './app.js';
import { initBot, stopBot } from './bot/bot.js';
import { assertProductionConfig, config } from './config/env.js';
import { closeDatabase, initDatabase } from './db/index.js';
import { createOnboardingRepository } from './db/onboardingRepository.js';
import { createResultsRepository } from './db/resultsRepository.js';
import { createUserRepository } from './db/userRepository.js';
import { createVerificationRepository } from './db/verificationRepository.js';
import {
  DEFAULT_DISCOUNT_PERCENT,
  MAX_GENERATION_ATTEMPTS,
  generatePromoCode,
  promoExpiry,
} from './services/promoService.js';
import { createResultsService } from './services/resultsService.js';
import { createVerificationNotifier } from './bot/verificationNotifier.js';

let server;
let bot;
let shuttingDown = false;

// Routes are constructed before the bot exists, so they hold a stable object whose
// `isAvailable` and methods are bound once initBot returns.
const notifierRef = { isAvailable: false };

async function start() {
  assertProductionConfig(config);

  const pool = await initDatabase(config);
  const userRepository = createUserRepository(pool);
  const onboardingRepository = createOnboardingRepository(pool);
  const resultsRepository = createResultsRepository(pool);
  const resultsService = createResultsService({
    resultsRepository,
    secret: config.scoringSecret,
    promoService: {
      generatePromoCode,
      promoExpiry: (now = new Date()) => promoExpiry(now, config.promoTtlDays),
      discountPercent: config.promoDiscountPercent ?? DEFAULT_DISCOUNT_PERCENT,
      MAX_GENERATION_ATTEMPTS,
    },
  });

  const verificationRepository = createVerificationRepository(pool);

  const app = createApp({
    runtimeConfig: config,
    userRepository,
    onboardingRepository,
    resultsRepository,
    resultsService,
    verificationRepository,
    // The notifier is built first with a null bot, then bound once polling starts.
    notifier: notifierRef,
  });

  server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`🚀 Dategram API listening on http://0.0.0.0:${config.port}`);
    console.log(`   Environment: ${config.nodeEnv}`);
  });

  bot = initBot(config, {
    verificationRepository,
    notifier: notifierRef,
    onRecorded: (outcome) => {
      console.log(`📹 Verification video ${outcome.status} for telegram user ${outcome.submission?.telegramId ?? '-'}`);
    },
  });

  bindNotifier(notifierRef, bot, config);
}

function bindNotifier(target, botInstance, runtimeConfig) {
  const bound = createVerificationNotifier(botInstance, runtimeConfig);
  target.isAvailable = bound.isAvailable;
  target.sendMessage = bound.sendMessage;
  target.pinChatMessage = bound.pinChatMessage;
  target.sendVideoNote = bound.sendVideoNote;
  target.getFile = bound.getFile;
  target.fileUrl = bound.fileUrl;
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received; shutting down gracefully...`);

  const closeServer = new Promise((resolve) => {
    if (!server) return resolve();
    return server.close(resolve);
  });

  await Promise.allSettled([closeServer, stopBot(bot), closeDatabase()]);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((error) => {
  console.error('❌ Failed to start Dategram:', error);
  process.exit(1);
});
