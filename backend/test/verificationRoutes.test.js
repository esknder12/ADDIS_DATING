import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import {
  VERIFICATION_INSTRUCTIONS,
  VERIFICATION_PINNED_MESSAGE,
} from '../src/bot/messages/verificationMessages.js';

const botToken = '987654321:phase-four-route-test-token';
const TELEGRAM_ID = 424242;

function signedInitData(telegramId = TELEGRAM_ID) {
  const values = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'phase-four-query',
    user: JSON.stringify({ id: telegramId, first_name: 'Phase Four' }),
  };
  const check = Object.entries(values)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...values, hash }).toString();
}

function createRuntimeConfig(overrides = {}) {
  return {
    isProduction: false,
    corsOrigins: [],
    botToken,
    webappUrl: 'https://mini.example.com',
    telegramAuthMaxAgeSeconds: 86_400,
    adminApiToken: '',
    verificationExampleVideoId: 'AgACExample',
    ...overrides,
  };
}

function createFakeVerificationRepository(state = {}) {
  const store = {
    isVerified: false,
    status: 'not_started',
    rejectionReason: null,
    requestedAt: null,
    reviewedAt: null,
    ...state,
  };

  return {
    isAvailable: true,
    store,
    calls: [],
    async getStatus() {
      return {
        user: { telegramId: String(TELEGRAM_ID) },
        isVerified: store.isVerified,
        status: store.status,
        rejectionReason: store.rejectionReason,
        requestedAt: store.requestedAt,
        reviewedAt: store.reviewedAt,
      };
    },
    async markRequested(telegramId) {
      this.calls.push(['markRequested', telegramId]);
      store.status = 'requested';
      store.requestedAt = new Date();
      return { telegramId: String(telegramId) };
    },
    async listPending() {
      return [];
    },
    async getSubmission() {
      return null;
    },
    async approve() {
      return { status: 'not-found' };
    },
    async reject() {
      return { status: 'not-found' };
    },
  };
}

function createRecordingNotifier({ available = true, failOn = null } = {}) {
  const sent = [];
  return {
    sent,
    isAvailable: available,
    async sendMessage(chatId, text, other) {
      sent.push({ method: 'sendMessage', chatId, text, other });
      if (failOn === 'sendMessage') throw new Error('telegram down');
      return { message_id: 101 };
    },
    async pinChatMessage(chatId, messageId) {
      sent.push({ method: 'pinChatMessage', chatId, messageId });
      if (failOn === 'pin') throw new Error('cannot pin');
      return true;
    },
    async sendVideoNote(chatId, fileId) {
      sent.push({ method: 'sendVideoNote', chatId, fileId });
      if (failOn === 'videoNote') throw new Error('bad file_id');
      return { message_id: 102 };
    },
    async getFile() {
      return { file_path: 'video_notes/x.mp4' };
    },
    fileUrl: (path) => `https://api.telegram.org/file/bot${botToken}/${path}`,
  };
}

function buildApp({ repository, notifier, runtimeConfig }) {
  return createApp({
    runtimeConfig,
    userRepository: { isAvailable: true },
    onboardingRepository: {
      isAvailable: true,
      async getState() {
        return { answers: {}, currentStepKey: 'gender', currentStepIndex: 0, completed: false };
      },
    },
    resultsRepository: { isAvailable: true },
    resultsService: { async getResults() { return null; } },
    verificationRepository: repository,
    notifier,
  });
}

describe('verification routes', () => {
  let repository;
  let notifier;
  let server;
  let baseUrl;

  before(async () => {
    repository = createFakeVerificationRepository();
    notifier = createRecordingNotifier();
    const app = buildApp({ repository, notifier, runtimeConfig: createRuntimeConfig() });
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

  it('requires Telegram authentication', async () => {
    assert.equal((await fetch(`${baseUrl}/api/verification/status`)).status, 401);
  });

  it('sends the pinned message, the example video note and the instructions', async () => {
    const response = await request('/api/verification/request', { method: 'POST' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, status: 'requested' });

    const methods = notifier.sent.map((entry) => entry.method);
    assert.deepEqual(methods, ['sendMessage', 'pinChatMessage', 'sendVideoNote', 'sendMessage']);

    assert.equal(notifier.sent[0].text, VERIFICATION_PINNED_MESSAGE);
    assert.equal(notifier.sent[0].chatId, TELEGRAM_ID);
    assert.equal(
      notifier.sent[0].other.reply_markup.inline_keyboard[0][0].text,
      'Return to Dategram 🖤',
    );
    assert.equal(
      notifier.sent[0].other.reply_markup.inline_keyboard[0][0].web_app.url,
      'https://mini.example.com',
    );
    assert.equal(notifier.sent[1].messageId, 101);
    assert.equal(notifier.sent[2].fileId, 'AgACExample');
    assert.equal(notifier.sent[3].text, VERIFICATION_INSTRUCTIONS);
  });

  it('advances the user to requested after the sequence is delivered', async () => {
    assert.deepEqual(repository.calls, [['markRequested', TELEGRAM_ID]]);
    assert.equal(repository.store.status, 'requested');
  });

  it('still delivers instructions when pinning fails', async () => {
    const pinned = createRecordingNotifier({ failOn: 'pin' });
    const repo = createFakeVerificationRepository();
    const app = buildApp({ repository: repo, notifier: pinned, runtimeConfig: createRuntimeConfig() });
    const temporary = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const response = await fetch(`http://127.0.0.1:${temporary.address().port}/api/verification/request`, {
        method: 'POST',
        headers: { Authorization: `tma ${signedInitData()}` },
      });
      assert.equal(response.status, 200);
      assert.equal(pinned.sent.filter((entry) => entry.method === 'sendMessage').length, 2);
    } finally {
      await new Promise((resolve) => temporary.close(resolve));
    }
  });

  it('still delivers instructions when the example video file_id is invalid', async () => {
    const broken = createRecordingNotifier({ failOn: 'videoNote' });
    const app = buildApp({
      repository: createFakeVerificationRepository(),
      notifier: broken,
      runtimeConfig: createRuntimeConfig(),
    });
    const temporary = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const response = await fetch(`http://127.0.0.1:${temporary.address().port}/api/verification/request`, {
        method: 'POST',
        headers: { Authorization: `tma ${signedInitData()}` },
      });
      assert.equal(response.status, 200);
      assert.equal(broken.sent.at(-1).text, VERIFICATION_INSTRUCTIONS);
    } finally {
      await new Promise((resolve) => temporary.close(resolve));
    }
  });

  it('returns 502 when Telegram cannot be reached at all', async () => {
    const down = createRecordingNotifier({ failOn: 'sendMessage' });
    const app = buildApp({
      repository: createFakeVerificationRepository(),
      notifier: down,
      runtimeConfig: createRuntimeConfig(),
    });
    const temporary = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const response = await fetch(`http://127.0.0.1:${temporary.address().port}/api/verification/request`, {
        method: 'POST',
        headers: { Authorization: `tma ${signedInitData()}` },
      });
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error.code, 'TELEGRAM_SEND_FAILED');
    } finally {
      await new Promise((resolve) => temporary.close(resolve));
    }
  });

  it('returns 503 when the bot is not configured', async () => {
    const app = buildApp({
      repository: createFakeVerificationRepository(),
      notifier: createRecordingNotifier({ available: false }),
      runtimeConfig: createRuntimeConfig(),
    });
    const temporary = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const response = await fetch(`http://127.0.0.1:${temporary.address().port}/api/verification/request`, {
        method: 'POST',
        headers: { Authorization: `tma ${signedInitData()}` },
      });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, 'BOT_UNAVAILABLE');
    } finally {
      await new Promise((resolve) => temporary.close(resolve));
    }
  });

  it('refuses to restart verification for an already verified user', async () => {
    const app = buildApp({
      repository: createFakeVerificationRepository({ isVerified: true, status: 'approved' }),
      notifier: createRecordingNotifier(),
      runtimeConfig: createRuntimeConfig(),
    });
    const temporary = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const response = await fetch(`http://127.0.0.1:${temporary.address().port}/api/verification/request`, {
        method: 'POST',
        headers: { Authorization: `tma ${signedInitData()}` },
      });
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, 'ALREADY_VERIFIED');
    } finally {
      await new Promise((resolve) => temporary.close(resolve));
    }
  });

  it('reports status for polling', async () => {
    const response = await request('/api/verification/status');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.status, 'requested');
    assert.equal(body.isVerified, false);
    assert.equal(body.rejectionReason, null);
  });

  it('does not register admin routes when no admin token is configured', async () => {
    const response = await fetch(`${baseUrl}/api/admin/verification/pending`, {
      headers: { Authorization: 'Bearer anything' },
    });
    assert.equal(response.status, 404, 'unconfigured admin must fail closed, not open');
    assert.equal((await response.json()).error.code, 'NOT_FOUND');
  });
});
