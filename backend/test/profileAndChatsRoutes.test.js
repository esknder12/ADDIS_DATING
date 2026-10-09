import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';

const botToken = 'phase-eight-nine-route-test-token';
const telegramId = 135792468;

function signedInitData() {
  const values = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'phase-eight-nine-test',
    user: JSON.stringify({ id: telegramId, first_name: 'Dategram' }),
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
  adminApiKey: '',
  telegramAuthMaxAgeSeconds: 86_400,
};

const calls = [];
const ownProfile = {
  id: '12',
  telegramId: String(telegramId),
  name: 'Aster',
  age: 28,
  city: 'Addis Ababa',
  country: 'Ethiopia',
  bio: 'A profile bio',
  photos: [],
  additionalInfo: {},
  settings: { notificationsEnabled: true },
  isVip: false,
  isVerified: false,
  verificationStatus: 'none',
};
const chats = [{
  id: '44',
  profile: { id: '27', name: 'Mimi', isOnline: true },
  lastMessage: { body: 'Hello there', sender: 'profile', createdAt: '2026-10-09T10:00:00.000Z' },
  unreadCount: 3,
}];

const appRepository = {
  isAvailable: true,
  async listChats(id) { calls.push(['listChats', id]); return chats; },
  async getOwnProfile(id) { calls.push(['getOwnProfile', id]); return ownProfile; },
  async updateOwnProfile(id, patch) {
    calls.push(['updateOwnProfile', id, patch]);
    return { ...ownProfile, ...patch };
  },
  async getProfileScore(id) { calls.push(['getProfileScore', id]); return { isReady: false, score: null }; },
  async requestProfileScore(id) { calls.push(['requestProfileScore', id]); return { isReady: true, score: 87 }; },
};

let server;
let baseUrl;

before(async () => {
  const app = createApp({
    runtimeConfig,
    userRepository: { isAvailable: true },
    // These new routers intentionally depend on appRepository only.
    onboardingRepository: { isAvailable: false },
    appRepository,
  });
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

describe('Phase 8 chat list routes', () => {
  it('serves authenticated chat previews and unread counts at both route aliases', async () => {
    for (const path of ['/api/chats', '/api/app/chats']) {
      const response = await request(path);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.chats[0].lastMessage.body, 'Hello there');
      assert.equal(body.chats[0].unreadCount, 3);
    }
    assert.equal(calls.filter(([name]) => name === 'listChats').length, 2);
  });

  it('retains the standard Telegram auth error on the new chat route', async () => {
    const response = await fetch(`${baseUrl}/api/chats`);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error.code, 'MISSING_INIT_DATA');
  });
});

describe('Phase 9 own-profile routes', () => {
  it('serves the own profile through the requested endpoint and /api/app alias', async () => {
    for (const path of ['/api/profile', '/api/app/profile']) {
      const response = await request(path);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.profile.telegramId, String(telegramId));
      assert.equal(body.profile.name, 'Aster');
    }
  });

  it('validates and saves only safe, supported profile fields', async () => {
    const response = await request('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Aster New',
        bio: 'A new bio',
        city: 'Bahir Dar',
        country: 'Ethiopia',
        additionalInfo: { occupation: 'Designer', languages: 'Amharic, English' },
        settings: { notificationsEnabled: false },
      }),
    });
    assert.equal(response.status, 200);
    const update = calls.filter(([name]) => name === 'updateOwnProfile').at(-1);
    assert.equal(update[1], telegramId);
    assert.equal(update[2].name, 'Aster New');
    assert.deepEqual(update[2].settings, { notificationsEnabled: false });

    const unsafe = await request('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ isVip: true }),
    });
    assert.equal(unsafe.status, 422);
  });

  it('exposes profile score status and request actions', async () => {
    const status = await request('/api/profile/score');
    assert.equal(status.status, 200);
    assert.equal((await status.json()).isReady, false);

    const requested = await request('/api/profile/score/request', { method: 'POST' });
    assert.equal(requested.status, 200);
    const body = await requested.json();
    assert.equal(body.isReady, true);
    assert.equal(body.score, 87);
  });
});
