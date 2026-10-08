import { InlineKeyboard } from 'grammy';
import {
  VERIFICATION_DUPLICATE_MESSAGE,
  VERIFICATION_INSTRUCTIONS,
  VERIFICATION_PINNED_MESSAGE,
  VERIFICATION_RECEIVED_CONFIRMATION,
  VERIFICATION_RETURN_BUTTON_LABEL,
} from '../messages/verificationMessages.js';

/**
 * Sends the V2 sequence into the user's chat with the bot.
 *
 * Each Telegram call is isolated: a pin failure (or a bad example-video file_id, which is
 * bot-scoped and easy to get wrong) must not stop the user from receiving the instructions.
 */
export async function sendVerificationInstructions(notifier, { chatId, telegramId, exampleVideoFileId, webappUrl }) {
  if (!notifier.isAvailable) {
    return { sent: false, code: 'BOT_UNAVAILABLE' };
  }

  const failures = [];

  try {
    const keyboard = new InlineKeyboard().webApp(VERIFICATION_RETURN_BUTTON_LABEL, webappUrl);
    const pinned = await notifier.sendMessage(chatId, VERIFICATION_PINNED_MESSAGE, {
      reply_markup: keyboard,
    });

    try {
      await notifier.pinChatMessage(chatId, pinned.message_id);
    } catch (error) {
      failures.push(`pin: ${error.message}`);
    }
  } catch (error) {
    return { sent: false, code: 'SEND_FAILED', detail: error.message };
  }

  if (exampleVideoFileId) {
    try {
      await notifier.sendVideoNote(chatId, exampleVideoFileId);
    } catch (error) {
      // A stale or foreign file_id is recoverable — the text instructions still stand alone.
      failures.push(`example video: ${error.message}`);
    }
  }

  try {
    await notifier.sendMessage(chatId, VERIFICATION_INSTRUCTIONS);
  } catch (error) {
    return { sent: false, code: 'SEND_FAILED', detail: error.message, failures };
  }

  return { sent: true, failures };
}

/**
 * Captures the user's round video note (V3).
 *
 * grammY passes a Context, not a Message: the video note is `ctx.msg.video_note` and the id is
 * `ctx.msg.message_id`. Reading `ctx.video_note` yields undefined, and the filter itself must be
 * 'message:video_note' — `bot.on('video_note')` throws "Invalid L1 filter" at registration.
 */
export function registerVideoNoteHandler(bot, { verificationRepository, notifier, onRecorded }) {
  bot.on('message:video_note', async (ctx) => {
    const telegramId = ctx.from?.id;
    const videoNote = ctx.msg?.video_note;
    const chatId = ctx.chat?.id ?? ctx.msg?.chat?.id;

    if (!telegramId || !videoNote?.file_id) return;

    let outcome;
    try {
      outcome = await verificationRepository.recordSubmission(telegramId, {
        fileId: videoNote.file_id,
        messageId: ctx.msg.message_id,
        durationSeconds: videoNote.duration ?? null,
      });
    } catch (error) {
      console.error('Failed to record verification submission:', error.message);
      return;
    }

    // Unknown Telegram user, or already verified: ignore without messaging.
    if (outcome.status === 'not-found' || outcome.status === 'already-verified') return;

    if (onRecorded) onRecorded(outcome);

    if (!notifier?.isAvailable || !chatId) return;

    try {
      await notifier.sendMessage(
        chatId,
        outcome.status === 'duplicate'
          ? VERIFICATION_DUPLICATE_MESSAGE
          : VERIFICATION_RECEIVED_CONFIRMATION,
      );
    } catch (error) {
      console.error('Failed to confirm verification receipt:', error.message);
    }
  });
}
