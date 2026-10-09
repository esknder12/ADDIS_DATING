import { createApp } from './app.js';
import { initBot, stopBot } from './bot/bot.js';
import { assertProductionConfig, config } from './config/env.js';
import { createAppRepository } from './db/appRepository.js';
import { closeDatabase, initDatabase } from './db/index.js';
import { createOnboardingRepository } from './db/onboardingRepository.js';
import { createUserRepository } from './db/userRepository.js';

let server;
let bot;
let shuttingDown = false;

async function start() {
  assertProductionConfig(config);

  const pool = await initDatabase(config);
  const userRepository = createUserRepository(pool);
  const onboardingRepository = createOnboardingRepository(pool);
  const appRepository = createAppRepository(pool);
  const app = createApp({
    runtimeConfig: config,
    userRepository,
    onboardingRepository,
    appRepository,
  });

  server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`🚀 Dategram API listening on http://0.0.0.0:${config.port}`);
    console.log(`   Environment: ${config.nodeEnv}`);
  });

  bot = initBot(config, { appRepository });
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
