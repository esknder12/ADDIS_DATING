// Bridge to the MAIN Dategram backend (Express + PostgreSQL).
//
// Hybrid design: the Serverless bot owns inbound chat (commands, video notes,
// buttons) and its own SQLite mirror, while the main API remains the source
// of truth for profiles, photos and VIP state. Every function here degrades
// gracefully — when DATEGRAM_API_URL is '' (standalone mode) they resolve to
// null/{ skipped: true } and callers use local fallbacks.
//
// To enable the bridge, add these two tiny endpoints to the Express backend
// (spec + example in serverless/README.md "Bridge endpoints"):
//   GET  /api/internal/bridge/users/by-telegram/:telegramId
//   POST /api/internal/bridge/verification-intake   { telegramId, fileId }

import { fetch } from 'sdk';
import { DATEGRAM_API_URL, DATEGRAM_BRIDGE_KEY, isBridgeEnabled } from './config.js';

async function bridgeFetch(path, { method = 'GET', body } = {}) {
  if (!isBridgeEnabled()) return { ok: false, skipped: true };
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (DATEGRAM_BRIDGE_KEY) headers['x-bridge-key'] = DATEGRAM_BRIDGE_KEY;
    const res = await fetch(`${DATEGRAM_API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: await res.json() };
  } catch (error) {
    console.warn('Dategram bridge request failed:', error?.message || error);
    return { ok: false, error: error?.message || 'fetch failed' };
  }
}

// Reduced Dategram profile or null:
// { id, name, firstName, photoUrl, isVip, vipExpiresAt, verificationStatus,
//   notificationsEnabled }
export async function fetchDategramUser(telegramId) {
  const result = await bridgeFetch(`/api/internal/bridge/users/by-telegram/${telegramId}`);
  if (!result.ok) return null;
  const user = result.data?.user;
  return user && typeof user === 'object' ? user : null;
}

// Forward a verification video_note file_id to the main backend so the
// existing review flow (verification_requests + status) stays in sync.
// Always returns { ok } — callers must not fail when the bridge is down.
export async function submitVerificationVideo(telegramId, fileId) {
  const result = await bridgeFetch('/api/internal/bridge/verification-intake', {
    method: 'POST',
    body: { telegramId, fileId },
  });
  return { ok: result.ok === true, skipped: result.skipped === true };
}
