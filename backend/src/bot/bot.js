import { Bot, InlineKeyboard } from 'grammy';

const welcomeMessage = `Welcome to LibMatch 🖤

Answer a few questions about yourself — AI will find those who are perfect for you. ⬇️`;

export const verificationNudge = `You’re almost there! 🚀 Complete your registration to start meeting amazing people!`;

export const verificationInstructions = `One step away from the checkmark ✅

1️⃣ Press and hold the camera button in the bottom right corner.
2️⃣ Smile at the camera and slowly turn your head to the side — 10 seconds max.

💡 If you see a microphone icon, tap it once to switch to the camera.

I'm waiting for your video right here! 🤳`;

const verificationReceived = `Got your video! ✅ Our team will review it shortly — you’ll see the badge on your profile as soon as you’re verified.`;

// The live bot username (test vs prod). Module state on purpose: runtimeConfig
// is Object.freeze()d, so the bot cannot write it back there.
let liveBotUsername = '';

export function getBotUsername() {
  return liveBotUsername;
}

export const VERIFICATION_VIDEO_MAX_SECONDS = 10;

export function verificationVideoTooLong(duration) {
  return Number.isFinite(Number(duration)) && Number(duration) > VERIFICATION_VIDEO_MAX_SECONDS;
}

export function parseVerificationCallback(data) {
  const match = /^verify:(approve|reject):([1-9]\d{0,18})$/.exec(String(data ?? ''));
  if (!match) return null;
  return { requestId: match[2], decision: match[1] === 'approve' ? 'verified' : 'rejected' };
}

export function parsePhotoModerationCallback(data) {
  const match = /^photo:(approve|reject):([1-9]\d{0,18})$/.exec(String(data ?? ''));
  if (!match) return null;
  return { photoId: match[2], decision: match[1] === 'approve' ? 'approved' : 'rejected' };
}

export function initBot(runtimeConfig, { appRepository, notificationService } = {}) {
  if (!runtimeConfig.botToken || !runtimeConfig.webappUrl) {
    console.warn('⚠️  BOT_TOKEN or WEBAPP_URL is missing; Telegram bot polling is disabled.');
    return null;
  }

  const bot = new Bot(runtimeConfig.botToken);

  // The CI pipeline owns the menu button (?v=<run> freshness per deploy), so the
  // backend never resets it — it ADOPTS the menu URL for in-chat buttons instead.
  // Falls back to WEBAPP_URL when the menu has no web-app URL (yet).
  let liveWebappUrl = runtimeConfig.webappUrl;
  bot.api.getChatMenuButton().then((button) => {
    const url = button?.web_app?.url;
    if (typeof url === 'string' && url.startsWith('https://')) {
      liveWebappUrl = url;
      console.log(`🔗 Adopted menu webapp URL for in-chat buttons: ${url}`);
    }
  }).catch((error) => {
    console.warn('Could not read the LibMatch menu button; using WEBAPP_URL:', error.message);
  });

  // The username tells the Mini App which bot chat to deep-link into
  // (test bot vs production bot); the modal reads it via /health.
  // Retried: a boot-time Telegram hiccup must not blank it forever.
  async function learnBotUsername(attempts = 5) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const me = await bot.api.getMe();
        if (me?.username) {
          liveBotUsername = me.username;
          return;
        }
      } catch {
        // Fall through to the delayed retry below.
      }
      await new Promise((resolve) => { setTimeout(resolve, attempt * 2000); });
    }
  }
  learnBotUsername();

  const libmatchKeyboard = () => new InlineKeyboard().webApp('Go to LibMatch', liveWebappUrl);

  const adminTelegramId = String(runtimeConfig.adminTelegramId || '');

  async function sendVerifyInstructions(context) {
    await context.reply(verificationNudge, {
      reply_markup: new InlineKeyboard().webApp('Return to LibMatch \uD83D\uDDA4', liveWebappUrl),
    });
    await context.reply(verificationInstructions);
  }

  bot.command('start', async (context) => {
    // Deep link from the verification modal: land WITH instructions sent.
    if (String(context.match || '').trim().toLowerCase() === 'verify') {
      await sendVerifyInstructions(context);
      return;
    }
    await context.reply(welcomeMessage, { reply_markup: libmatchKeyboard() });
  });

  // V2 — verification: the in-app modal deep-links here; the pinned-style
  // nudge plus instructions are sent on demand.
  bot.command('verify', async (context) => {
    await sendVerifyInstructions(context);
  });

  // V3 — user replies with a native circular Telegram video note. We store the
  // file reference and flip verification to pending (spec section 5.3).
  bot.on('message:video_note', async (context) => {
    const senderId = context.from?.id;
    const fileId = context.message?.video_note?.file_id;
    const duration = context.message?.video_note?.duration;
    if (senderId && fileId && verificationVideoTooLong(duration)) {
      await context.reply(
        `That video is ${duration} seconds — please keep it to ${VERIFICATION_VIDEO_MAX_SECONDS} seconds or less. Hold the button, smile, turn your head, release. \uD83C\uDFAC`,
        { reply_markup: libmatchKeyboard() },
      );
      return;
    }
    if (senderId && fileId && appRepository?.isAvailable) {
      try {
        const recorded = await appRepository.submitVerificationVideo(senderId, fileId);
        if (recorded?.requestId && adminTelegramId
            && notificationService?.sendVerificationReviewRequest
            && typeof appRepository.getVerificationRequest === 'function') {
          const full = await appRepository.getVerificationRequest(recorded.requestId).catch(() => null);
          if (full) {
            await notificationService.sendVerificationReviewRequest(bot, adminTelegramId, full).catch(() => false);
          }
        }
      } catch (error) {
        console.error('Failed to record verification video note:', error.message);
      }
    }
    await context.reply(verificationReceived, { reply_markup: libmatchKeyboard() });
  });

  // Photo review: the owner taps Approve/Reject on the review DM. The sender
  // check is the authorization — callback buttons alone prove nothing.
  if (adminTelegramId && appRepository?.isAvailable && typeof appRepository.updatePhotoStatus === 'function') {
    bot.on('callback_query:data', async (context, next) => {
      const parsed = parsePhotoModerationCallback(context.callbackQuery?.data);
      // Not a photo tap: MUST call next() — returning here would silently
      // swallow taps meant for handlers registered below (e.g. verify:*).
      if (!parsed) return next();
      if (String(context.from?.id || '') !== adminTelegramId) {
        await context.answerCallbackQuery({ text: 'Only the LibMatch owner can review photos.' });
        return;
      }
      try {
        const outcome = await appRepository.updatePhotoStatus(parsed.photoId, parsed.decision);
        if (!outcome || outcome.invalid) {
          await context.answerCallbackQuery({ text: 'Already handled.' });
          return;
        }
        const approved = outcome.status === 'approved';
        await context.answerCallbackQuery({ text: approved ? 'Approved \u2705' : 'Rejected \u274C' });
        const original = context.callbackQuery.message?.caption || context.callbackQuery.message?.text || '';
        await context.editMessageCaption(`${original}\n\n${approved ? '\u2705 Approved' : '\u274C Rejected'}`).catch(() => {});
        await context.editMessageReplyMarkup().catch(() => {});
        if (notificationService?.sendPhotoDecisionNotification
            && typeof appRepository.getPhotoForModeration === 'function') {
          const full = await appRepository.getPhotoForModeration(parsed.photoId).catch(() => null);
          if (full?.telegramId) {
            await notificationService.sendPhotoDecisionNotification(
              { api: context.api }, Number(full.userId), full.telegramId, approved,
            );
          }
        }
      } catch (error) {
        console.error('Photo review callback failed:', error.message);
        await context.answerCallbackQuery({ text: 'Something went wrong — try again.' }).catch(() => {});
      }
    });
  }

  // Verification review: same owner-only shape as photos. The DM is a text
  // message (video notes carry no caption), so we edit its text on decision.
  if (adminTelegramId && appRepository?.isAvailable && typeof appRepository.updateVerificationStatus === 'function') {
    bot.on('callback_query:data', async (context, next) => {
      const parsed = parseVerificationCallback(context.callbackQuery?.data);
      if (!parsed) return next();
      if (String(context.from?.id || '') !== adminTelegramId) {
        await context.answerCallbackQuery({ text: 'Only the LibMatch owner can verify people.' });
        return;
      }
      try {
        const outcome = await appRepository.updateVerificationStatus(parsed.requestId, parsed.decision);
        if (!outcome || outcome.invalid) {
          await context.answerCallbackQuery({ text: 'Already handled.' });
          return;
        }
        const verified = outcome.status === 'verified';
        await context.answerCallbackQuery({ text: verified ? 'Verified \u2705' : 'Rejected \u274C' });
        const original = context.callbackQuery.message?.text || '';
        await context.editMessageText(`${original}\n\n${verified ? '\u2705 Verified' : '\u274C Rejected'}`).catch(() => {});
        await context.editMessageReplyMarkup().catch(() => {});
        if (notificationService?.sendVerificationDecisionNotification
            && typeof appRepository.getVerificationRequest === 'function') {
          const full = await appRepository.getVerificationRequest(parsed.requestId).catch(() => null);
          if (full?.telegramId) {
            await notificationService.sendVerificationDecisionNotification(
              { api: context.api }, Number(full.userId), full.telegramId, verified,
            );
          }
        }
      } catch (error) {
        console.error('Verification callback failed:', error.message);
        await context.answerCallbackQuery({ text: 'Something went wrong — try again.' }).catch(() => {});
      }
    });
  }

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
