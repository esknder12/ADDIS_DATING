import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';

const botToken = '987654321:phase-two-route-test-token';

function signedInitData() {
  const values = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'phase-two-query',
    user: JSON.stringify({ id: 24681012, first_name: 'Phase Two' }),
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
  telegramAuthMaxAgeSeconds: 86_400,
};

const calls = [];
const onboardingRepository = {
  isAvailable: true,
  async getState() {
    return { answers: {}, currentStepKey: 'gender', currentStepIndex: 0, completed: false };
  },
  async saveAnswer(...args) {
    calls.push(args);
    return { saved: true };
  },
  async saveProgress() {
    return { saved: true };
  },
  async complete() {
    return { completed: true };
  },
};

const userRepository = { isAvailable: true };
let server;
let baseUrl;

before(async () => {
  const app = createApp({ runtimeConfig, userRepository, onboardingRepository });
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

describe('onboarding routes', () => {
  it('returns resumable onboarding state', async () => {
    const response = await request('/api/onboarding');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.onboarding.currentStepKey, 'gender');
  });

  it('validates and persists a configured answer with matching progress', async () => {
    const response = await request('/api/onboarding/answers/gender', {
      method: 'PUT',
      body: JSON.stringify({
        answer: 'male',
        currentStepIndex: 1,
        currentStepKey: 'social-proof',
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 24681012);
    assert.equal(calls[0][1], 'gender');
    assert.equal(calls[0][2], 'male');
  });

  it('rejects an invalid answer before it reaches persistence', async () => {
    const response = await request('/api/onboarding/answers/age', {
      method: 'PUT',
      body: JSON.stringify({
        answer: 16,
        currentStepIndex: 41,
        currentStepKey: 'location',
      }),
    });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.error.code, 'INVALID_ANSWER');
    assert.equal(calls.length, 1);
  });

  it('rejects progress whose index and key do not match', async () => {
    const response = await request('/api/onboarding/progress', {
      method: 'PUT',
      body: JSON.stringify({ currentStepIndex: 0, currentStepKey: 'location' }),
    });
    assert.equal(response.status, 422);
  });

  it('still requires Telegram authentication', async () => {
    const response = await fetch(`${baseUrl}/api/onboarding`);
    assert.equal(response.status, 401);
  });
});
