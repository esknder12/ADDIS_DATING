import { Bot, InlineKeyboard } from 'grammy';
import { registerVideoNoteHandler } from './handlers/verificationHandler.js';

const welcomeMessage = `Welcome to Dategram 🖤

Answer a few questions about yourself — AI will find those who are perfect for you. ⬇️`;

export function initBot(runtimeConfig, dependencies = {}) {
  if (!runtimeConfig.botToken || !runtimeConfig.webappUrl) {
    console.warn('⚠️  BOT_TOKEN or WEBAPP_URL is missing; Telegram bot polling is disabled.');
    return null;
  }

  const bot = new Bot(runtimeConfig.botToken);

  bot.command('start', async (context) => {
    const keyboard = new InlineKeyboard().webApp('Go to Dategram', runtimeConfig.webappUrl);
    await context.reply(welcomeMessage, { reply_markup: keyboard });
  });

  const { verificationRepository, notifier, onRecorded } = dependencies;
  if (verificationRepository && notifier) {
    registerVideoNoteHandler(bot, { verificationRepository, notifier, onRecorded });
  }

  bot.catch((error) => {
    console.error('Telegram bot error:', error.error?.message || error.message);
  });

  // Long polling runs independently from the HTTP API and is stopped during shutdown.
  // Note: this is single-instance — running two API processes means two pollers competing for
  // the same updates. Switch to webhook delivery before scaling out.
  bot.start({
    onStart: ({ username }) => {
      console.log(`🤖 @${username} bot polling started`);
    },
  }).catch((error) => {
    console.error('Telegram polling stopped unexpectedly:', error.message);
  });

  return bot;
}

export async function stopBot(bot) {
  if (!bot) return;
  await bot.stop();
}
