import { Bot, InlineKeyboard } from 'grammy';

const welcomeMessage = `Welcome to Dategram 🖤

Answer a few questions about yourself — AI will find those who are perfect for you. ⬇️`;

export function initBot(runtimeConfig) {
  if (!runtimeConfig.botToken || !runtimeConfig.webappUrl) {
    console.warn('⚠️  BOT_TOKEN or WEBAPP_URL is missing; Telegram bot polling is disabled.');
    return null;
  }

  const bot = new Bot(runtimeConfig.botToken);

  bot.command('start', async (context) => {
    const keyboard = new InlineKeyboard().webApp('Go to Dategram', runtimeConfig.webappUrl);
    await context.reply(welcomeMessage, { reply_markup: keyboard });
  });

  bot.catch((error) => {
    console.error('Telegram bot error:', error.error?.message || error.message);
  });

  // Long polling runs independently from the HTTP API and is stopped during shutdown.
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
