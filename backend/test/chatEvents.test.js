import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dispatchChatMessage, matchRoom, userRoom } from '../src/socket/chatEvents.js';

function createdMessage() {
  return {
    message: { id: '34', matchId: '7', sender: 'user', body: 'Hello', senderUserId: '10' },
    matchId: '7',
    senderUserId: '10',
    recipientUserId: '20',
    content: 'Hello',
  };
}

describe('real-time chat dispatch', () => {
  it('marks messages delivered and emits chat updates for connected match members', async () => {
    const emitted = [];
    const io = {
      in(room) {
        assert.equal(room, userRoom('20'));
        return { async fetchSockets() { return [{ id: 'recipient-socket' }]; } };
      },
      to(room) {
        return { emit(event, payload) { emitted.push({ room, event, payload }); } };
      },
    };
    const appRepository = {
      async markMessageDeliveredForUser(messageId, userId) {
        assert.equal(messageId, '34');
        assert.equal(userId, '20');
        return { ...createdMessage().message, deliveredAt: '2026-10-09T12:00:00.000Z' };
      },
    };
    let notified = false;
    const notificationService = { async sendMessageNotification() { notified = true; } };

    const message = await dispatchChatMessage({ io, appRepository, notificationService }, createdMessage());
    assert.equal(message.deliveredAt, '2026-10-09T12:00:00.000Z');
    assert.equal(notified, false);
    assert.deepEqual(emitted.map(({ room, event }) => [room, event]), [
      [matchRoom('7'), 'new_message'],
      [userRoom('10'), 'chat_list_updated'],
      [userRoom('20'), 'chat_list_updated'],
    ]);
  });

  it('sends a Telegram notification when the matched recipient is offline', async () => {
    let push;
    const io = {
      in() { return { async fetchSockets() { return []; } }; },
      to() { return { emit() {} }; },
    };
    const notificationService = {
      async sendMessageNotification(...args) { push = args; return true; },
    };
    await dispatchChatMessage({
      io,
      appRepository: {},
      bot: { api: {} },
      notificationService,
    }, createdMessage());

    assert.deepEqual(push.slice(1), ['20', '10', '7', 'Hello']);
  });
});
