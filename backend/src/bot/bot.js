import { Bot, InlineKeyboard } from 'grammy';

const welcomeMessage = `Welcome to Dategram 🖤

Answer a few questions about yourself — AI will find those who are perfect for you. ⬇️`;

const verificationNudge = `You’re almost there! 🚀 Complete your registration to start meeting amazing people!`;

const verificationInstructions = `One step away from the checkmark ✅

1️⃣ Press and hold the camera button in the bottom right corner.
2️⃣ Smile at the camera and slowly turn your head to the side.

💡 If you see a microphone icon, tap it once to switch to the camera.

I'm waiting for your video right here! 🤳`;

const verificationReceived = `Got your video! ✅ Our team will review it shortly — you’ll see the badge on your profile as soon as you’re verified.`;

export function initBot(runtimeConfig, { appRepository } = {}) {
  if (!runtimeConfig.botToken || !runtimeConfig.webappUrl) {
    console.warn('⚠️  BOT_TOKEN or WEBAPP_URL is missing; Telegram bot polling is disabled.');
    return null;
  }

  const bot = new Bot(runtimeConfig.botToken);

  bot.api.setChatMenuButton({
    menu_button: {
      type: 'web_app',
      text: 'Open Dategram',
      web_app: { url: runtimeConfig.webappUrl },
    },
  }).catch((error) => {
    console.warn('Could not set the persistent Dategram chat button:', error.message);
  });

  const dategramKeyboard = () => new InlineKeyboard().webApp('Go to Dategram', runtimeConfig.webappUrl);

  bot.command('start', async (context) => {
    await context.reply(welcomeMessage, { reply_markup: dategramKeyboard() });
  });

  // V2 — verification: the in-app modal deep-links here; the pinned-style
  // nudge plus instructions are sent on demand.
  bot.command('verify', async (context) => {
    await context.reply(verificationNudge, {
      reply_markup: new InlineKeyboard().webApp('Return to Dategram 🖤', runtimeConfig.webappUrl),
    });
    await context.reply(verificationInstructions);
  });

  // V3 — user replies with a native circular Telegram video note. We store the
  // file reference and flip verification to pending (spec section 5.3).
  bot.on('message:video_note', async (context) => {
    const senderId = context.from?.id;
    const fileId = context.message?.video_note?.file_id;
    if (senderId && fileId && appRepository?.isAvailable) {
      try {
        await appRepository.submitVerificationVideo(senderId, fileId);
      } catch (error) {
        console.error('Failed to record verification video note:', error.message);
      }
    }
    await context.reply(verificationReceived, { reply_markup: dategramKeyboard() });
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
