const TELEGRAM_FILE_BASE = 'https://api.telegram.org/file/bot';

/**
 * Thin seam over the grammY bot so routes and handlers never touch the bot instance directly.
 * `initBot` returns null when BOT_TOKEN/WEBAPP_URL are missing, so every caller must be able to
 * ask `isAvailable` first instead of dereferencing null.
 */
export function createVerificationNotifier(bot, runtimeConfig) {
  const isAvailable = Boolean(bot);

  async function sendMessage(chatId, text, other) {
    if (!isAvailable) throw new Error('Telegram bot is not configured');
    return bot.sendMessage(chatId, text, other);
  }

  async function pinChatMessage(chatId, messageId) {
    if (!isAvailable) throw new Error('Telegram bot is not configured');
    return bot.pinChatMessage(chatId, messageId);
  }

  async function sendVideoNote(chatId, fileId) {
    if (!isAvailable) throw new Error('Telegram bot is not configured');
    return bot.sendVideoNote(chatId, fileId);
  }

  async function getFile(fileId) {
    if (!isAvailable) throw new Error('Telegram bot is not configured');
    return bot.api.getFile(fileId);
  }

  function fileUrl(filePath) {
    return `${TELEGRAM_FILE_BASE}${runtimeConfig.botToken}/${filePath}`;
  }

  return {
    isAvailable,
    sendMessage,
    pinChatMessage,
    sendVideoNote,
    getFile,
    fileUrl,
  };
}
