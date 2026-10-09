import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { notifyAfterSwipe } from '../src/routes/swipeNotifications.js';

describe('swipe notification dispatch', () => {
  it('notifies both participants once when a new shared match is created', async () => {
    const calls = [];
    const bot = { api: {} };
    const notificationService = {
      async sendMatchNotification(...args) { calls.push(['match', ...args]); },
      async sendLikedYouNotification(...args) { calls.push(['like', ...args]); },
    };
    const req = { app: { get: (key) => (key === 'bot' ? bot : notificationService) } };

    await notifyAfterSwipe(req, {
      createdMatch: true,
      matched: true,
      userId: '41',
      targetUserId: '42',
      match: { id: '99' },
    });

    assert.deepEqual(calls, [
      ['match', bot, '41', '42', '99'],
      ['match', bot, '42', '41', '99'],
    ]);
  });

  it('does not send a redundant like notification for an existing match', async () => {
    const calls = [];
    const bot = { api: {} };
    const notificationService = {
      async sendMatchNotification(...args) { calls.push(['match', ...args]); },
      async sendLikedYouNotification(...args) { calls.push(['like', ...args]); },
    };
    const req = { app: { get: (key) => (key === 'bot' ? bot : notificationService) } };

    await notifyAfterSwipe(req, {
      createdMatch: false,
      matched: true,
      shouldNotifyLikedYou: true,
      userId: '41',
      targetUserId: '42',
    });

    assert.deepEqual(calls, []);
  });
});
