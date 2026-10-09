import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';

const botToken = '987654321:phase-four-route-test-token';

function signedInitData() {
  const values = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'phase-four-query',
    user: JSON.stringify({ id: 135792468, first_name: 'Phase Four' }),
  };
  const check = Object.entries(values)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...values, hash }).toString();
}

const runtimeConfig = {
  isProduction: false,
  corsOrigins: [],
  botToken,
  adminApiKey: 'phase-test-admin-key',
  telegramAuthMaxAgeSeconds: 86_400,
};

const completeAnswers = {
  looking_for: ['serious_relationship'],
  conversation_confidence: 'confident',
  date_readiness: 'ready_right_match',
  four_week_goal: 'one_first_date',
  style_preference: ['natural'],
  age_range_preference: '25_30',
  social_energy: 'small_groups',
  location: { id: 'addis-ababa-et', name: 'Addis Ababa', country: 'Ethiopia' },
};

const calls = [];
const matchStore = [{ id: 7, profile_id: 'rodas' }];

const onboardingRepository = {
  isAvailable: true,
  async getState() {
    return { answers: completeAnswers, completed: true };
  },
};

const appRepository = {
  isAvailable: true,
  async saveConversion(...args) {
    calls.push(['saveConversion', ...args]);
    return { saved: true };
  },
  async applyDiscount(...args) {
    calls.push(['applyDiscount', ...args]);
    return { saved: true };
  },
  async listDiscover(telegramId, options) {
    calls.push(['listDiscover', telegramId, options]);
    return { profiles: [{ id: '23', name: 'Test Profile' }], hasMore: true };
  },
  async listAiPicks(telegramId) {
    calls.push(['listAiPicks', telegramId]);
    return {
      picks: [{ id: '24', name: 'Curated Date', compatibilityScore: 88 }],
      picksRemaining: 1,
      dailyLimit: 5,
      isVip: false,
    };
  },
  async activateBoost(telegramId) {
    calls.push(['activateBoost', telegramId]);
    return { isActive: true, alreadyActive: false, boost: { id: '9', expiresAt: '2026-10-09T10:00:00Z' } };
  },
  async getBoostStatus(telegramId) {
    calls.push(['getBoostStatus', telegramId]);
    return { isActive: false, boost: null };
  },
  async grantVip(userId, months, reason) {
    calls.push(['grantVip', userId, months, reason]);
    return { id: String(userId), telegramId: '135792468', expiresAt: '2027-04-09T00:00:00Z', reason };
  },
  async saveSwipe(telegramId, profileId, action) {
    calls.push(['saveSwipe', telegramId, profileId, action]);
    const matched = ['rodas', '123'].includes(profileId) && action !== 'pass';
    return {
      matched,
      profile: { id: profileId, name: 'Test Profile', photo: '/images/profiles/p01.jpg' },
      match: matched ? {
        id: '8',
        matchedUser: { id: profileId, name: 'Test Profile', photo: '/images/profiles/p01.jpg' },
      } : null,
    };
  },
  async rewindLastSwipe() {
    return { restored: null };
  },
  async listLikes() {
    return {
      likedYou: [
        { id: '34', swipeId: '51', isLocked: false, name: 'One Free Like', age: 26, photo: '/photo.jpg', verified: true },
        { id: 'locked-52', swipeId: '52', isLocked: true, teaserText: 'Someone likes you', blurredPhotoUrl: '/blurred.jpg' },
      ],
      matches: [],
      isVip: false,
      totalLikes: 2,
      lockedCount: 1,
    };
  },
  async listMatches() {
    return [{ id: '7', profile: { id: 'rodas', name: 'Rodas' }, lastMessage: null }];
  },
  async listMessages(telegramId, matchId) {
    return Number(matchId) === 7 ? [] : null;
  },
  async addMessage(telegramId, matchId, body) {
    if (Number(matchId) !== 7) return null;
    calls.push(['addMessage', telegramId, matchId, body]);
    return { id: '42', sender: 'user', body, createdAt: new Date().toISOString() };
  },
  async sendGift(...args) {
    calls.push(['sendGift', ...args]);
    return { id: '3', giftId: 'rose', stars: 31 };
  },
  async activatePremium(...args) {
    calls.push(['activatePremium', ...args]);
    return { activated: true };
  },
  async requestVerification(...args) {
    calls.push(['requestVerification', ...args]);
    return { status: 'pending' };
  },
};

const userRepository = { isAvailable: true };
let server;
let baseUrl;

before(async () => {
  calls.length = 0;
  const app = createApp({ runtimeConfig, userRepository, onboardingRepository, appRepository });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `tma ${signedInitData()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

describe('app routes (phase 3 conversion)', () => {
  it('recomputes match results from stored answers, never the client', async () => {
    const response = await request('/api/app/results');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.results.score >= 35 && body.results.score <= 97);
    assert.equal(typeof body.results.matchPoolLabel, 'string');
  });

  it('persists the conversion with validated name and optional email', async () => {
    const response = await request('/api/app/conversion', {
      method: 'POST',
      body: JSON.stringify({ name: 'Esknder Zinabie', email: 'esknder@example.com' }),
    });
    assert.equal(response.status, 200);
    const saveCall = calls.find((call) => call[0] === 'saveConversion');
    assert.equal(saveCall[1], 135792468);
    assert.equal(saveCall[2].name, 'Esknder Zinabie');
    assert.equal(saveCall[2].email, 'esknder@example.com');
  });

  it('rejects an invalid display name before persistence', async () => {
    const before = calls.filter((call) => call[0] === 'saveConversion').length;
    const response = await request('/api/app/conversion', {
      method: 'POST',
      body: JSON.stringify({ name: 'E' }),
    });
    assert.equal(response.status, 422);
    assert.equal(calls.filter((call) => call[0] === 'saveConversion').length, before);
  });

  it('rejects an unknown promo code', async () => {
    const response = await request('/api/app/discount', {
      method: 'POST',
      body: JSON.stringify({ promoCode: 'not-a-code' }),
    });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.error.code, 'INVALID_PROMO_CODE');
  });

  it('applies the scratch-card discount code', async () => {
    const response = await request('/api/app/discount', {
      method: 'POST',
      body: JSON.stringify({ promoCode: 'dategram_oct26' }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.percent, 50);
  });
});

describe('app routes (phase 4 discovery, matching, chat)', () => {
  it('serves the authenticated, paginated Phase 5 discovery endpoint', async () => {
    const response = await request('/api/discovery?limit=10&offset=4');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.profiles[0].id, '23');
    assert.equal(body.hasMore, true);
    const call = calls.filter((entry) => entry[0] === 'listDiscover').at(-1);
    assert.equal(call[1], 135792468);
    assert.deepEqual(call[2], { limit: 10, offset: 4 });
  });

  it('accepts superlike and returns the Phase 5 match payload', async () => {
    const response = await request('/api/swipe', {
      method: 'POST',
      body: JSON.stringify({ swipedUserId: 123, action: 'superlike' }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.isMatch, true);
    assert.equal(body.match.id, '8');
    assert.equal(body.match.matchedUser.photo_url, '/images/profiles/p01.jpg');
    assert.deepEqual(calls.find((entry) => entry[0] === 'saveSwipe').slice(1), [
      135792468,
      '123',
      'super_like',
    ]);
  });

  it('returns a not-found response when Phase 5 rewind has no swipe', async () => {
    const response = await request('/api/swipe/rewind', { method: 'POST' });
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.error.code, 'NO_SWIPE_TO_REWIND');
  });

  it('records a swipe and reports the match outcome', async () => {
    const response = await request('/api/app/swipes', {
      method: 'POST',
      body: JSON.stringify({ profileId: 'rodas', action: 'like' }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.matched, true);
  });

  it('rejects invalid swipe payloads', async () => {
    const response = await request('/api/app/swipes', {
      method: 'POST',
      body: JSON.stringify({ profileId: 'rodas', action: 'poke' }),
    });
    assert.equal(response.status, 422);
  });

  it('enforces the mutual-match safety invariant for messaging', async () => {
    const forbidden = await request('/api/app/matches/999/messages', {
      method: 'POST',
      body: JSON.stringify({ body: 'hello' }),
    });
    assert.equal(forbidden.status, 403);
    const body = await forbidden.json();
    assert.equal(body.error.code, 'MATCH_REQUIRED');

    const allowed = await request('/api/app/matches/7/messages', {
      method: 'POST',
      body: JSON.stringify({ body: 'Selam!' }),
    });
    assert.equal(allowed.status, 201);
  });

  it('rejects empty messages', async () => {
    const response = await request('/api/app/matches/7/messages', {
      method: 'POST',
      body: JSON.stringify({ body: '   ' }),
    });
    assert.equal(response.status, 422);
  });

  it('validates gifts against the catalog and stays idempotent by client ref', async () => {
    const ok = await request('/api/app/gifts', {
      method: 'POST',
      body: JSON.stringify({ profileId: 'rodas', giftId: 'rose', clientRef: 'gift-001' }),
    });
    assert.equal(ok.status, 201);

    const bad = await request('/api/app/gifts', {
      method: 'POST',
      body: JSON.stringify({ profileId: 'rodas', giftId: 'castle', clientRef: 'gift-002' }),
    });
    assert.equal(bad.status, 422);
  });

  it('activates VIP only with a valid plan and promo', async () => {
    const bad = await request('/api/app/premium/activate', {
      method: 'POST',
      body: JSON.stringify({ planId: 'forever' }),
    });
    assert.equal(bad.status, 422);

    const ok = await request('/api/app/premium/activate', {
      method: 'POST',
      body: JSON.stringify({ planId: 'monthly', promoCode: 'dategram_oct26' }),
    });
    assert.equal(ok.status, 200);
    const call = calls.find((entry) => entry[0] === 'activatePremium');
    assert.equal(call[1].discountPercent ?? call[1].percent, call[1].percent);
  });

  it('moves verification to pending on request', async () => {
    const response = await request('/api/app/verification/request', { method: 'POST' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, 'pending');
  });

  it('rewind reports when there is nothing to undo', async () => {
    const response = await request('/api/app/swipes/last', { method: 'DELETE' });
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error.code, 'NOTHING_TO_REWIND');
  });

  it('returns a stable, authenticated AI Picks session payload', async () => {
    const response = await request('/api/ai-picks');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.picks[0].compatibilityScore, 88);
    assert.equal(body.dailyLimit, 5);
    assert.equal(body.picksRemaining, 1);
  });

  it('locks all but the free preview in the Likes API response', async () => {
    const response = await request('/api/likes/received');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.totalCount, 2);
    assert.equal(body.lockedCount, 1);
    assert.equal(body.likes[0].isLocked, false);
    assert.equal(body.likes[0].userId, '34');
    assert.equal(body.likes[1].isLocked, true);
    assert.equal(body.likes[1].blurredPhotoUrl, '/blurred.jpg');
    assert.equal('userId' in body.likes[1], false);
    assert.equal('photoUrl' in body.likes[1], false);

    const legacy = await request('/api/app/likes');
    assert.equal(legacy.status, 200);
    const legacyBody = await legacy.json();
    assert.equal(legacyBody.likedYou[1].isLocked, true);
    assert.equal('photo' in legacyBody.likedYou[1], false);
    assert.equal('name' in legacyBody.likedYou[1], false);
  });

  it('serves shared match and match-authorized messages through Phase 7 aliases', async () => {
    const matches = await request('/api/matches');
    assert.equal(matches.status, 200);
    assert.equal((await matches.json()).matches[0].id, '7');

    const message = await request('/api/matches/7/messages', {
      method: 'POST',
      body: JSON.stringify({ content: 'Selam from the new route!' }),
    });
    assert.equal(message.status, 201);
    assert.equal((await message.json()).message.body, 'Selam from the new route!');
  });

  it('activates a 30-minute profile boost and reports its status', async () => {
    const activated = await request('/api/boost/activate', { method: 'POST' });
    assert.equal(activated.status, 200);
    assert.equal((await activated.json()).isActive, true);
    const status = await request('/api/boost/status');
    assert.equal(status.status, 200);
    assert.equal((await status.json()).isActive, false);
  });

  it('protects admin VIP grants with the configured admin key', async () => {
    const denied = await request('/api/admin/vip/grant', {
      method: 'POST',
      body: JSON.stringify({ userId: 34, months: 6, reason: 'promo_gift' }),
    });
    assert.equal(denied.status, 401);

    const granted = await request('/api/admin/vip/grant', {
      method: 'POST',
      headers: { 'x-admin-key': 'phase-test-admin-key' },
      body: JSON.stringify({ userId: 34, months: 6, reason: 'promo_gift' }),
    });
    assert.equal(granted.status, 200);
    assert.equal((await granted.json()).grant.reason, 'promo_gift');
  });

  it('still requires Telegram authentication on both legacy and Phase 5 routes', async () => {
    const legacy = await fetch(`${baseUrl}/api/app/discover`);
    const discovery = await fetch(`${baseUrl}/api/discovery`);
    const swipe = await fetch(`${baseUrl}/api/swipe/rewind`, { method: 'POST' });
    const aiPicks = await fetch(`${baseUrl}/api/ai-picks`);
    const likes = await fetch(`${baseUrl}/api/likes/received`);
    const matches = await fetch(`${baseUrl}/api/matches`);
    const boost = await fetch(`${baseUrl}/api/boost/status`);
    assert.equal(legacy.status, 401);
    assert.equal(discovery.status, 401);
    assert.equal(swipe.status, 401);
    assert.equal(aiPicks.status, 401);
    assert.equal(likes.status, 401);
    assert.equal(matches.status, 401);
    assert.equal(boost.status, 401);
  });
});
