import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import { createSocketAuthMiddleware } from '../src/socket/socketServer.js';

const botToken = 'socket-auth-test-token';
const telegramId = 27182818;
const runtimeConfig = {
  botToken,
  telegramAuthMaxAgeSeconds: 86_400,
  isProduction: false,
  corsOrigins: [],
};

function signedInitData() {
  const values = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'socket-auth-test',
    user: JSON.stringify({ id: telegramId, first_name: 'Socket' }),
  };
  const check = Object.entries(values)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...values, hash }).toString();
}

function invoke(middleware, socket) {
  return new Promise((resolve) => middleware(socket, (error) => resolve(error || null)));
}

describe('Socket.IO Telegram authentication', () => {
  it('rejects a handshake without Telegram initData', async () => {
    const middleware = createSocketAuthMiddleware({ pool: { query() {} }, runtimeConfig });
    const socket = { handshake: { auth: {}, headers: {} }, data: {} };
    const error = await invoke(middleware, socket);
    assert.equal(error.data.code, 'MISSING_INIT_DATA');
  });

  it('rejects altered Telegram initData signatures', async () => {
    const middleware = createSocketAuthMiddleware({ pool: { query() {} }, runtimeConfig });
    const socket = {
      handshake: { auth: { initData: `${signedInitData()}x` }, headers: {} },
      data: {},
    };
    const error = await invoke(middleware, socket);
    assert.equal(error.data.code, 'INVALID_SIGNATURE');
  });

  it('validates initData and attaches an active, onboarded database identity', async () => {
    let query;
    const middleware = createSocketAuthMiddleware({
      runtimeConfig,
      pool: {
        async query(sql, values) {
          query = { sql, values };
          return { rows: [{ id: '90', telegram_id: String(telegramId) }] };
        },
      },
    });
    const socket = {
      handshake: { auth: { initData: signedInitData() }, headers: {} },
      data: {},
    };
    const error = await invoke(middleware, socket);
    assert.equal(error, null);
    assert.deepEqual(socket.data.userId, '90');
    assert.equal(socket.data.telegramId, String(telegramId));
    assert.match(query.sql, /is_active = TRUE AND onboarding_completed = TRUE/);
    assert.deepEqual(query.values, [telegramId]);
  });
});
