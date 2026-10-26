// handlers/callback_query.js — runs on every inline-button press.
// Navigates the bot menu by editing the message in place.

import { api } from 'sdk';
import { WEBAPP_URL } from '../lib/config.js';
import { appKeyboard, backKeyboard, mainMenuKeyboard } from '../lib/keyboards.js';
import {
  ABOUT_MESSAGE,
  HELP_MESSAGE,
  VERIFICATION_INSTRUCTIONS,
  VERIFICATION_NUDGE,
  VIP_INFO_MESSAGE,
  WELCOME_MESSAGE,
} from '../lib/text.js';

const SCREENS = {
  menu: () => ({ text: WELCOME_MESSAGE, keyboard: mainMenuKeyboard(WEBAPP_URL) }),
  help: () => ({ text: HELP_MESSAGE, keyboard: backKeyboard() }),
  about: () => ({ text: ABOUT_MESSAGE, keyboard: backKeyboard() }),
  vip: () => ({ text: VIP_INFO_MESSAGE, keyboard: backKeyboard() }),
  verify: () => ({
    text: `${VERIFICATION_NUDGE}\n\n${VERIFICATION_INSTRUCTIONS}`,
    keyboard: appKeyboard(WEBAPP_URL, 'Return to LibMatch 🖤'),
  }),
};

export default async function (callbackQuery, ctx) {
  const data = callbackQuery?.data ?? '';
  const chatId = callbackQuery?.message?.chat?.id;
  const messageId = callbackQuery?.message?.message_id;

  try {
    const screen = SCREENS[data];
    if (screen && chatId && messageId) {
      const { text, keyboard } = screen();
      await api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text,
        reply_markup: keyboard,
      });
    }
  } catch (error) {
    // 400 = "message is not modified" or too old to edit — not a real error.
    if (error?.code !== 400) {
      console.error('Callback query handling failed:', error?.message || error);
    }
  } finally {
    // Always answer, or the client keeps showing a spinner on the button.
    try {
      await api.answerCallbackQuery({ callback_query_id: callbackQuery.id });
    } catch {
      // Best effort only.
    }
  }
}
