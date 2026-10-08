import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import {
  REJECTION_REASONS,
  VERIFICATION_APPROVED_MESSAGE,
} from '../src/bot/messages/verificationMessages.js';

const ADMIN_TOKEN = 'super-secret-admin-token';
const botToken = '987654321:phase-four-admin-test-token';
const TELEGRAM_ID = 313131;

function createRuntimeConfig(overrides = {}) {
  return {
    isProduction: false,
    corsOrigins: [],
    botToken,
    webappUrl: 'https://mini.example.com',
    telegramAuthMaxAgeSeconds: 86_400,
    adminApiToken: ADMIN_TOKEN,
    verificationExampleVideoId: '',
    ...overrides,
  };
}

function createFakeRepository(initial = {}) {
  const state = {
    submission: {
      id: '55',
      userId: '1',
      telegramId: String(TELEGRAM_ID),
      fileId: 'DQACAgUAAx',
      messageId: 12,
      durationSeconds: 6,
      status: 'pending',
      reviewedBy: null,
      rejectionReason: null,
      submittedAt: new Date('2026-10-08T09:00:00Z'),
      reviewedAt: null,
    },
    ...initial,
  };

  return {
    isAvailable: true,
    state,
    reviews: [],
    async listPending(limit) {
      return [{ ...state.submission, name: 'Abel', username: 'abel', limit }];
    },
    async getSubmission(id) {
      return String(id) === state.submission.id ? { ...state.submission } : null;
    },
    async approve(id, reviewedBy) {
      this.reviews.push(['approve', id, reviewedBy]);
      if (String(id) !== state.submission.id) return { status: 'not-found' };
      if (state.submission.status !== 'pending') {
        return { status: 'already-reviewed', submission: { ...state.submission } };
      }
      state.submission.status = 'approved';
      return { status: 'ok', decision: 'approved', telegramId: state.submission.telegramId, user: { isVerified: true } };
    },
    async reject(id, reason, reviewedBy) {
      this.reviews.push(['reject', id, reason, reviewedBy]);
      if (String(id) !== state.submission.id) return { status: 'not-found' };
      if (state.submission.status !== 'pending') {
        return { status: 'already-reviewed', submission: { ...state.submission } };
      }
      state.submission.status = 'rejected';
      state.submission.rejectionReason = reason;
      return { status: 'ok', decision: 'rejected', telegramId: state.submission.telegramId, user: { isVerified: false } };
    },
  };
}

function createRecordingNotifier() {
  const sent = [];
  return {
    sent,
    isAvailable: true,
    async sendMessage(chatId, text) {
      sent.push({ chatId, text });
      return { message_id: 1 };
    },
    async pinChatMessage() {
      return true;
    },
    async sendVideoNote() {
      return { message_id: 2 };
    },
    async getFile(fileId) {
      return { file_id: fileId, file_path: `video_notes/${fileId}.mp4` };
    },
    fileUrl: (path) => `https://api.telegram.org/file/bot${botToken}/${path}`,
  };
}

function buildApp({ repository, notifier, runtimeConfig, fetchImpl }) {
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
    fetchImpl,
  });
}

describe('admin verification routes', () => {
  let repository;
  let notifier;
  let server;
  let baseUrl;

  before(async () => {
    repository = createFakeRepository();
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

  function request(path, options = {}, token = ADMIN_TOKEN) {
    return fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  }

  it('rejects an anonymous reviewer — the endpoints must never be open', async () => {
    const response = await fetch(`${baseUrl}/api/admin/verification/pending`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'ADMIN_UNAUTHORIZED');
  });

  it('rejects a wrong token, a wrong scheme, and a near-miss token', async () => {
    for (const header of [
      'Bearer not-the-token',
      `Basic ${ADMIN_TOKEN}`,
      ADMIN_TOKEN,
      `Bearer ${ADMIN_TOKEN.slice(0, -1)}X`,
    ]) {
      const response = await fetch(`${baseUrl}/api/admin/verification/pending`, {
        headers: { Authorization: header },
      });
      assert.equal(response.status, 401, header);
    }
  });

  it('lists the pending queue for an authenticated reviewer', async () => {
    const response = await request('/api/admin/verification/pending');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.submissions.length, 1);
    assert.equal(body.submissions[0].fileId, 'DQACAgUAAx');
  });

  it('streams the video so a reviewer can actually watch it', async () => {
    let requestedUrl;
    // TextEncoder gives a Uint8Array backed by an ArrayBuffer of exactly this length.
    // `Buffer.from('bytes').buffer` would hand back Node's whole 8 KB slab instead.
    const payload = new TextEncoder().encode('bytes');
    const fetchImpl = async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'video/mp4', 'content-length': '5' }),
        async arrayBuffer() {
          return payload.buffer;
        },
      };
    };

    const app = buildApp({
      repository: createFakeRepository(),
      notifier: createRecordingNotifier(),
      runtimeConfig: createRuntimeConfig(),
      fetchImpl,
    });
    const temporary = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const response = await fetch(`http://127.0.0.1:${temporary.address().port}/api/admin/verification/55/file`, {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'video/mp4');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(await response.text(), 'bytes');
      assert.match(requestedUrl, /^https:\/\/api\.telegram\.org\/file\/bot/);
      assert.ok(requestedUrl.includes('video_notes/DQACAgUAAx.mp4'));
    } finally {
      await new Promise((resolve) => temporary.close(resolve));
    }
  });

  it('refuses to stream a video without admin credentials', async () => {
    const response = await fetch(`${baseUrl}/api/admin/verification/55/file`);
    assert.equal(response.status, 401);
  });

  it('404s for an unknown submission', async () => {
    const response = await request('/api/admin/verification/999/file');
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, 'SUBMISSION_NOT_FOUND');
  });

  it('requires a reason from the catalogue before rejecting', async () => {
    for (const body of [{}, { reason: '' }, { reason: '   ' }, { reason: 'made_up_reason' }, { reason: 42 }]) {
      const response = await request('/api/admin/verification/55/reject', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 422, JSON.stringify(body));
      const payload = await response.json();
      assert.equal(payload.error.code, 'INVALID_REASON');
      assert.deepEqual(payload.error.allowed, Object.keys(REJECTION_REASONS));
    }
    assert.equal(notifier.sent.length, 0, 'no notification for a rejected request');
  });

  it('rejects with a catalogue reason and tells the user why in plain language', async () => {
    const response = await request('/api/admin/verification/55/reject', {
      method: 'PATCH',
      body: JSON.stringify({ reason: 'blurry' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, notified: true });

    assert.deepEqual(repository.reviews.at(-1), ['reject', '55', 'blurry', 'admin-token']);
    assert.equal(notifier.sent.length, 1);
    assert.equal(notifier.sent[0].chatId, String(TELEGRAM_ID));
    assert.ok(
      notifier.sent[0].text.includes(REJECTION_REASONS.blurry),
      'the user must see a real reason, never "undefined"',
    );
    assert.ok(!notifier.sent[0].text.includes('{reason}'), 'placeholder must be substituted');
    assert.ok(!notifier.sent[0].text.includes('undefined'));
  });

  it('reports a second review as already handled instead of notifying twice', async () => {
    const response = await request('/api/admin/verification/55/reject', {
      method: 'PATCH',
      body: JSON.stringify({ reason: 'blurry' }),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'ALREADY_REVIEWED');
    assert.equal(notifier.sent.length, 1, 'must not re-notify');
  });

  it('approves and sends the verified notification exactly once', async () => {
    const repo = createFakeRepository();
    const note = createRecordingNotifier();
    const app = buildApp({ repository: repo, notifier: note, runtimeConfig: createRuntimeConfig() });
    const temporary = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const url = `http://127.0.0.1:${temporary.address().port}`;
      const first = await fetch(`${url}/api/admin/verification/55/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      assert.equal(first.status, 200);
      assert.deepEqual(await first.json(), { success: true, notified: true });
      assert.equal(note.sent.length, 1);
      assert.equal(note.sent[0].text, VERIFICATION_APPROVED_MESSAGE);

      const second = await fetch(`${url}/api/admin/verification/55/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      assert.equal(second.status, 409);
      assert.equal(note.sent.length, 1, 'approval must not notify twice');
    } finally {
      await new Promise((resolve) => temporary.close(resolve));
    }
  });

  it('still succeeds when the bot notification fails after the review committed', async () => {
    const repo = createFakeRepository();
    const brokenNotifier = { ...createRecordingNotifier(), async sendMessage() { throw new Error('telegram down'); } };
    const app = buildApp({ repository: repo, notifier: brokenNotifier, runtimeConfig: createRuntimeConfig() });
    const temporary = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const response = await fetch(`http://127.0.0.1:${temporary.address().port}/api/admin/verification/55/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.notified, false);
      assert.match(body.warning, /telegram down/);
      assert.equal(repo.reviews.length, 1, 'the review itself must have been recorded');
    } finally {
      await new Promise((resolve) => temporary.close(resolve));
    }
  });
});
