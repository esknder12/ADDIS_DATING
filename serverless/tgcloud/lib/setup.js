// One-time bot setup. Mirror of the `setChatMenuButton` call in
// `backend/src/bot/bot.js`, made idempotent via the `flags` table so it can
// safely run from the /start handler (there are no one-off scripts on Serverless).

import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { flags } from '../schema.js';
import { MENU_BUTTON_TEXT, WEBAPP_URL, isWebappConfigured } from './config.js';

const MENU_BUTTON_FLAG = 'menu_button_set_v1';

export async function ensureMenuButton() {
  if (!isWebappConfigured()) {
    return { ok: false, reason: 'WEBAPP_URL is not configured in tgcloud/lib/config.js' };
  }
  try {
    const existing = await db.select().from(flags).where(eq(flags.key, MENU_BUTTON_FLAG)).get();
    if (existing?.value === WEBAPP_URL) return { ok: true, cached: true };

    await api.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: MENU_BUTTON_TEXT,
        web_app: { url: WEBAPP_URL },
      },
    });

    const patch = { value: WEBAPP_URL, updatedAt: new Date() };
    await db
      .insert(flags)
      .values({ key: MENU_BUTTON_FLAG, ...patch })
      .onConflictDoUpdate({ target: flags.key, set: patch })
      .run();
    return { ok: true };
  } catch (error) {
    console.warn('Could not set the persistent LibMatch chat button:', error?.message || error);
    return { ok: false, reason: error?.message || 'setChatMenuButton failed' };
  }
}
