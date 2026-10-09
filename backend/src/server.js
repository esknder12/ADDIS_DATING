import { createServer } from 'node:http';
import { createApp } from './app.js';
import { initSocketServer, stopSocketServer } from './socket/socketServer.js';
import { initBot, stopBot } from './bot/bot.js';
import { createNotificationHandler } from './bot/handlers/notificationHandler.js';
import { assertProductionConfig, config } from './config/env.js';
import { createAppRepository } from './db/appRepository.js';
import { closeDatabase, initDatabase } from './db/index.js';
import { createOnboardingRepository } from './db/onboardingRepository.js';
import { createUserRepository } from './db/userRepository.js';

let httpServer;
let socketServer;
let bot;
let shuttingDown = false;

async function start() {
  assertProductionConfig(config);

  const pool = await initDatabase(config);
  const userRepository = createUserRepository(pool);
  const onboardingRepository = createOnboardingRepository(pool);
  const appRepository = createAppRepository(pool);
  const notificationService = createNotificationHandler(pool, config);
  bot = initBot(config, { appRepository });
  const app = createApp({
    runtimeConfig: config,
    userRepository,
    onboardingRepository,
    appRepository,
    bot,
    notificationService,
  });
  httpServer = createServer(app);
  socketServer = initSocketServer(httpServer, {
    pool,
    appRepository,
    runtimeConfig: config,
    bot,
    notificationService,
  });
  app.set('io', socketServer);

  httpServer.listen(config.port, '0.0.0.0', () => {
    console.log(`🚀 Dategram API + Socket.io listening on http://0.0.0.0:${config.port}`);
    console.log(`   Environment: ${config.nodeEnv}`);
  });
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received; shutting down gracefully...`);

  const closeServer = socketServer
    ? stopSocketServer(socketServer)
    : new Promise((resolve) => {
      if (!httpServer?.listening) return resolve();
      return httpServer.close(resolve);
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
