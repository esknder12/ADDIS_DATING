import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, it } from 'node:test';
import { io as connectSocket } from 'socket.io-client';
import { initSocketServer, stopSocketServer } from '../src/socket/socketServer.js';

const botToken = 'socket-server-integration-test-token';

function signedInitData(telegramId) {
  const values = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `socket-${telegramId}`,
    user: JSON.stringify({ id: telegramId, first_name: 'Member' }),
  };
  const check = Object.entries(values)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...values, hash }).toString();
}

function once(socket, event, timeoutMs = 2_500) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const handler = (...args) => {
      clearTimeout(timeout);
      socket.off(event, handler);
      resolve(args);
    };
    socket.on(event, handler);
  });
}

function socketAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event} acknowledgement timed out`)), 2_500);
    socket.emit(event, payload, (response) => {
      clearTimeout(timeout);
      resolve(response);
    });
  });
}

describe('Socket.IO chat events', () => {
  it('authenticates two members, gates rooms, broadcasts chat, typing, and read receipts', async () => {
    const httpServer = createServer();
    const pool = {
      async query(sql, values = []) {
        if (sql.includes('SELECT id::text AS id, telegram_id::text AS telegram_id')) {
          const telegramId = String(values[0]);
          if (telegramId === '100' || telegramId === '200') {
            return { rows: [{ id: telegramId === '100' ? '1' : '2', telegram_id: telegramId }] };
          }
          return { rows: [] };
        }
        return { rows: [] };
      },
    };
    const appRepository = {
      isAvailable: true,
      async listMatchIdsForUserId() { return ['7']; },
      async markMessagesDeliveredForUser() { return { updatedCount: 0, updatedMessageIds: [] }; },
      async hasMatchAccess(userId, matchId) { return ['1', '2'].includes(userId) && matchId === '7'; },
      async createMessageForUserId(userId, matchId, body) {
        if (matchId !== '7' || !['1', '2'].includes(userId)) return null;
        const message = {
          id: '91',
          matchId,
          sender: 'user',
          senderUserId: userId,
          body,
          createdAt: new Date().toISOString(),
          deliveredAt: null,
          readAt: null,
        };
        return {
          message,
          matchId,
          senderUserId: userId,
          recipientUserId: userId === '1' ? '2' : '1',
          content: body,
        };
      },
      async markMessageDeliveredForUser(messageId) {
        return {
          id: messageId,
          matchId: '7',
          sender: 'profile',
          senderUserId: '1',
          body: 'Hello in real time',
          createdAt: new Date().toISOString(),
          deliveredAt: new Date().toISOString(),
          readAt: null,
        };
      },
      async markMessagesReadForUser(userId, matchId) {
        return {
          matchId,
          readByUserId: userId,
          updatedCount: 1,
          updatedMessageIds: ['91'],
          readAt: new Date().toISOString(),
        };
      },
    };
    const runtimeConfig = {
      isProduction: false,
      corsOrigins: [],
      botToken,
      telegramAuthMaxAgeSeconds: 86_400,
    };
    const ioServer = initSocketServer(httpServer, { pool, appRepository, runtimeConfig });
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${httpServer.address().port}`;
    const recipient = connectSocket(url, {
      transports: ['websocket'],
      auth: { initData: signedInitData(200) },
    });
    const sender = connectSocket(url, {
      transports: ['websocket'],
      auth: { initData: signedInitData(100) },
    });

    try {
      await Promise.all([once(recipient, 'connect'), once(sender, 'connect')]);
      // Let the server finish joining each authenticated user's match rooms.
      await delay(40);

      const typing = once(recipient, 'user_typing');
      sender.emit('typing', { matchId: '7' });
      const [typingPayload] = await typing;
      assert.equal(typingPayload.userId, '1');

      const incomingMessage = once(recipient, 'new_message');
      const sendAck = await socketAck(sender, 'send_message', {
        matchId: '7',
        content: 'Hello in real time',
      });
      assert.equal(sendAck.success, true);
      const [message] = await incomingMessage;
      assert.equal(message.body, 'Hello in real time');
      assert.equal(message.matchId, '7');

      const invalidJoin = await socketAck(sender, 'join_match', { matchId: '8' });
      assert.equal(invalidJoin.success, false);

      const readReceipt = once(sender, 'messages_read');
      const readAck = await socketAck(recipient, 'mark_read', { matchId: '7' });
      assert.equal(readAck.success, true);
      const [receipt] = await readReceipt;
      assert.equal(receipt.readBy, '2');
      assert.deepEqual(receipt.messageIds, ['91']);
    } finally {
      sender.disconnect();
      recipient.disconnect();
      await stopSocketServer(ioServer);
    }
  });
});
