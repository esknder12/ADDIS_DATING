// endpoints/botStatus — the Mini App asks the Serverless bot for the caller's
// bot-side state. Answers at: POST /api/botStatus (same host as the Mini App).
//
// Mini App call (official telegram-web-app.js — it attaches init data):
//   Telegram.WebApp.Serverless.call('botStatus', {}, (err, status) => { ... })
//
// Local test:
//   npx tgcloud run endpoints/botStatus '{}' --ctx '{ initData: { user: { id: 1 } } }'

import { EndpointError } from 'sdk';
import { getByTelegramId, isVipActiveRow, notificationsEnabled } from '../lib/users.js';

export default async function (input, ctx) {
  const tgId = ctx?.initData?.user?.id;
  if (!tgId) {
    throw new EndpointError('Telegram init data is required', { code: 'INIT_DATA_REQUIRED' });
  }
  const row = await getByTelegramId(tgId);
  if (!row) {
    return {
      found: false,
      verificationStatus: 'none',
      isVerified: false,
      isVip: false,
      notificationsEnabled: true,
    };
  }
  return {
    found: true,
    verificationStatus: row.verificationStatus || 'none',
    isVerified: Boolean(row.isVerified),
    isVip: isVipActiveRow(row),
    notificationsEnabled: notificationsEnabled(row),
  };
}
