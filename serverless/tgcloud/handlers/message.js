// handlers/message.js — runs on every `message` update.
// Ports `backend/src/bot/bot.js`: /start, /verify, native video_note intake,
// plus /help, /about, /vip, /app and a friendly fallback for plain text.

import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { users, verificationRequests } from '../schema.js';
import { submitVerificationVideo } from '../lib/bridge.js';
import { WEBAPP_URL } from '../lib/config.js';
import { appKeyboard, mainMenuKeyboard } from '../lib/keyboards.js';
import { ensureMenuButton } from '../lib/setup.js';
import {
  ABOUT_MESSAGE,
  HELP_MESSAGE,
  PLAIN_TEXT_REPLY,
  UNKNOWN_COMMAND_MESSAGE,
  VERIFICATION_INSTRUCTIONS,
  VERIFICATION_NUDGE,
  VERIFICATION_RECEIVED,
  VIP_INFO_MESSAGE,
  WELCOME_MESSAGE,
} from '../lib/text.js';
import { fetchOrCreateByTelegramId, upsertFromTelegram } from '../lib/users.js';

async function reply(chatId, text, replyMarkup) {
  return api.sendMessage({
    chat_id: chatId,
    text,
    reply_markup: replyMarkup,
  });
}

async function sendVerifyFlow(chatId) {
  await reply(
    chatId,
    VERIFICATION_NUDGE,
    appKeyboard(WEBAPP_URL, 'Return to Dategram 🖤'),
  );
  await reply(chatId, VERIFICATION_INSTRUCTIONS);
}

async function handleVideoNote(message, from) {
  const chatId = message.chat.id;
  const fileId = message.video_note.file_id;
  const row = await fetchOrCreateByTelegramId(from.id);
  if (row) {
    // Same rule as appRepository.submitVerificationVideo: one pending request
    // per (user, file), user status -> pending. Idempotent on re-sends.
    const existing = await db
      .select()
      .from(verificationRequests)
      .where(eq(verificationRequests.userId, row.id))
      .get();
    const sameFile = existing && existing.fileId === fileId;
    if (!sameFile) {
      await db
        .insert(verificationRequests)
        .values({ userId: row.id, fileId, status: 'pending' })
        .run()
        .catch(() => {});
    }
    await db
      .update(users)
      .set({ verificationStatus: 'pending', updatedAt: new Date() })
      .where(eq(users.id, row.id))
      .run();
  }
  // Best-effort forward to the main backend (no-op in standalone mode).
  await submitVerificationVideo(from.id, fileId).catch(() => ({ ok: false }));
  await reply(chatId, VERIFICATION_RECEIVED, appKeyboard(WEBAPP_URL, 'Go to Dategram'));
}

function parseCommand(text) {
  const [raw, ...args] = text.trim().split(/\s+/);
  return { command: raw.split('@')[0].toLowerCase(), args };
}

async function handleCommand(message, text) {
  const chatId = message.chat.id;
  const { command, args } = parseCommand(text);

  switch (command) {
    case '/start': {
      // Lazily ensure the persistent "Open Dategram" menu button (once).
      await ensureMenuButton().catch(() => ({ ok: false }));
      await reply(chatId, WELCOME_MESSAGE, mainMenuKeyboard(WEBAPP_URL));
      // Deep link support: t.me/<bot>?start=verify jumps into verification.
      if (args[0] && args[0].toLowerCase() === 'verify') {
        await sendVerifyFlow(chatId);
      }
      return;
    }
    case '/verify': {
      await sendVerifyFlow(chatId);
      return;
    }
    case '/help': {
      await reply(chatId, HELP_MESSAGE, appKeyboard(WEBAPP_URL, 'Open Dategram 🖤'));
      return;
    }
    case '/about': {
      await reply(chatId, ABOUT_MESSAGE, appKeyboard(WEBAPP_URL, 'Open Dategram 🖤'));
      return;
    }
    case '/vip': {
      await reply(
        chatId,
        VIP_INFO_MESSAGE,
        appKeyboard(WEBAPP_URL, 'Open Dategram 🖤', { tab: 'profile' }),
      );
      return;
    }
    case '/app': {
      await reply(chatId, WELCOME_MESSAGE, appKeyboard(WEBAPP_URL, 'Go to Dategram'));
      return;
    }
    default: {
      await reply(
        chatId,
        UNKNOWN_COMMAND_MESSAGE,
        appKeyboard(WEBAPP_URL, 'Open Dategram 🖤'),
      );
    }
  }
}

export default async function (message, ctx) {
  const from = message?.from;
  if (from && !from.is_bot) {
    try {
      await upsertFromTelegram(from);
    } catch (error) {
      console.warn('Failed to mirror Telegram user:', error?.message || error);
    }
  }

  // Native circular video note = verification submission (spec section 5.3).
  if (message?.video_note?.file_id && from && !from.is_bot) {
    await handleVideoNote(message, from);
    return;
  }

  const text = typeof message?.text === 'string' ? message.text : '';
  if (!text) return; // stickers, photos, etc. — stay quiet.
  if (text.startsWith('/')) {
    await handleCommand(message, text);
    return;
  }
  await reply(message.chat.id, PLAIN_TEXT_REPLY, mainMenuKeyboard(WEBAPP_URL));
}
