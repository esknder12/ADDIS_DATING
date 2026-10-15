// Inline keyboards. Same shapes as the main bot: web_app buttons deep-link
// into the Mini App with `?tab=` / `?matchId=` query params.

export function withQuery(baseUrl, query = {}) {
  let url = baseUrl;
  try {
    const Parsed = typeof URL === 'undefined' ? null : URL;
    if (Parsed) {
      const parsed = new Parsed(baseUrl);
      for (const [key, value] of Object.entries(query)) {
        if (value != null) parsed.searchParams.set(key, String(value));
      }
      url = parsed.toString();
    }
  } catch {
    // Keep the configured value when it is not parseable.
  }
  return url;
}

// Single "Open Dategram" web_app button (or undefined when no URL configured).
export function appKeyboard(webappUrl, text = 'Go to Dategram', query = {}) {
  if (!webappUrl) return undefined;
  return {
    inline_keyboard: [[{ text, web_app: { url: withQuery(webappUrl, query) } }]],
  };
}

// Main menu under /start and plain-text replies.
export function mainMenuKeyboard(webappUrl) {
  const rows = [];
  if (webappUrl) {
    rows.push([{ text: 'Go to Dategram 🖤', web_app: { url: withQuery(webappUrl) } }]);
  }
  rows.push([
    { text: '✅ Verify', callback_data: 'verify' },
    { text: '⭐ VIP', callback_data: 'vip' },
  ]);
  rows.push([
    { text: 'ℹ️ Help', callback_data: 'help' },
    { text: '👤 About', callback_data: 'about' },
  ]);
  return { inline_keyboard: rows };
}

export function backKeyboard() {
  return {
    inline_keyboard: [[{ text: '« Back', callback_data: 'menu' }]],
  };
}
