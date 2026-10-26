// Bot-side user mirror. Every person who talks to the bot gets a row keyed
// by Telegram id; the MAIN LibMatch profile stays in PostgreSQL (see bridge.js).

import { db } from 'sdk';
import { eq } from 'sdk/db';
import { users } from '../schema.js';

function asTelegramId(value) {
  const id = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return Number.isFinite(id) ? id : null;
}

export async function getByTelegramId(tgId) {
  const id = asTelegramId(tgId);
  if (id == null) return null;
  return db.select().from(users).where(eq(users.tgId, id)).get();
}

// Insert-or-update from a Telegram `User` object (message.from). Never throws
// for missing optional fields; returns the fresh row (or null on bad input).
export async function upsertFromTelegram(tgUser) {
  const id = asTelegramId(tgUser?.id);
  if (id == null) return null;
  const patch = {
    username: tgUser.username ?? null,
    firstName: tgUser.first_name ?? null,
    lastName: tgUser.last_name ?? null,
    languageCode: tgUser.language_code ?? null,
    isActive: true,
    lastActiveAt: new Date(),
    updatedAt: new Date(),
  };
  await db
    .insert(users)
    .values({ tgId: id, ...patch })
    .onConflictDoUpdate({ target: users.tgId, set: patch })
    .run();
  return getByTelegramId(id);
}

// Minimal row for notification dedup when only a Telegram id is known
// (e.g. liker/recipient ids coming from the main backend).
export async function fetchOrCreateByTelegramId(tgId) {
  const existing = await getByTelegramId(tgId);
  if (existing) return existing;
  const id = asTelegramId(tgId);
  if (id == null) return null;
  await db
    .insert(users)
    .values({ tgId: id, lastActiveAt: new Date(), updatedAt: new Date() })
    .onConflictDoNothing({ target: users.tgId })
    .run();
  return getByTelegramId(id);
}

export async function setVerificationStatus(tgId, status) {
  const id = asTelegramId(tgId);
  if (id == null || !['none', 'pending', 'verified'].includes(status)) return null;
  const row = await fetchOrCreateByTelegramId(id);
  if (!row) return null;
  await db
    .update(users)
    .set({
      verificationStatus: status,
      isVerified: status === 'verified' ? true : row.isVerified,
      updatedAt: new Date(),
    })
    .where(eq(users.tgId, id))
    .run();
  return getByTelegramId(id);
}

// 403 from Bot API means the user blocked the bot — stop messaging them.
export async function setActive(tgId, isActive) {
  const id = asTelegramId(tgId);
  if (id == null) return;
  await db
    .update(users)
    .set({ isActive: Boolean(isActive), updatedAt: new Date() })
    .where(eq(users.tgId, id))
    .run();
}

// --- Pure helpers (same rules as the Express backend) ---

export function isVipActiveRow(row) {
  if (!row || !row.isVip) return false;
  if (!row.vipExpiresAt) return true;
  const expires = row.vipExpiresAt instanceof Date ? row.vipExpiresAt.getTime() : NaN;
  return Number.isFinite(expires) ? expires > Date.now() : false;
}

export function notificationsEnabled(row) {
  if (!row) return false;
  const settings = row.settings;
  if (settings == null) return true;
  if (typeof settings === 'object' && 'notificationsEnabled' in settings) {
    return settings.notificationsEnabled !== false;
  }
  return true;
}

export function displayName(row, fallback = 'Someone') {
  return row?.name || row?.firstName || fallback;
}
