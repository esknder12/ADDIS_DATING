import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAppRepository } from '../src/db/appRepository.js';

describe('chat repository receipts and previews', () => {
  it('returns the latest message, sender presence, and unread count in each chat preview', async () => {
    const queries = [];
    const client = {
      async query(sql, values = []) {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        queries.push({ sql: normalized, values });
        if (normalized.startsWith('SELECT id FROM users WHERE telegram_id')) {
          return { rows: [{ id: '20' }] };
        }
        if (normalized.startsWith('SELECT m.id AS match_id')) {
          return { rows: [{
            match_id: '44',
            profile_id: '31',
            real_profile_id: '31',
            profile_name: 'Mimi',
            profile_first_name: 'Mimi',
            profile_age: 28,
            profile_city: 'Addis Ababa',
            profile_country: 'Ethiopia',
            profile_is_verified: true,
            profile_is_online: true,
            profile_last_seen_at: new Date('2026-10-09T12:00:00.000Z'),
            profile_photo_url: 'https://cdn.example.test/mimi.jpg',
            profile_photo_url_fallback: null,
            created_at: new Date('2026-10-08T12:00:00.000Z'),
            last_message: 'Hello',
            last_message_at: new Date('2026-10-09T12:00:00.000Z'),
            last_message_sender_user_id: '31',
            last_message_sender: 'user',
            last_message_delivered_at: null,
            last_message_read_at: null,
          }] };
        }
        if (normalized.includes('COUNT(*)::int AS unread_count')) {
          return { rows: [{ match_id: '44', unread_count: 2 }] };
        }
        throw new Error(`Unexpected chat list SQL: ${normalized}`);
      },
      release() {},
    };
    const repository = createAppRepository({ async connect() { return client; } });

    const chats = await repository.listChats('135792468');
    assert.equal(chats.length, 1);
    assert.equal(chats[0].lastMessage.body, 'Hello');
    assert.equal(chats[0].lastMessage.sender, 'profile');
    assert.equal(chats[0].unreadCount, 2);
    assert.equal(chats[0].profile.isOnline, true);
    assert.ok(queries[1].sql.includes('LEFT JOIN user_presence'));
    assert.ok(queries[2].sql.includes("sender = 'profile'"));
  });

  it('creates a shared-match message with only the other member as its recipient', async () => {
    const queries = [];
    const client = {
      async query(sql, values = []) {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        queries.push({ sql: normalized, values });
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized)) return { rows: [] };
        if (normalized.startsWith('SELECT m.id, m.user_id')) {
          return { rows: [{ id: '44', user_id: '20', profile_id: '31', user1_id: '20', user2_id: '31' }] };
        }
        if (normalized.startsWith('INSERT INTO messages')) {
          return { rows: [{
            id: '81',
            match_id: '44',
            sender: 'user',
            sender_user_id: '20',
            body: values[2],
            created_at: new Date('2026-10-09T12:00:00.000Z'),
            delivered_at: null,
            read_at: null,
          }] };
        }
        throw new Error(`Unexpected create message SQL: ${normalized}`);
      },
      release() {},
    };
    const repository = createAppRepository({ async connect() { return client; } });

    const created = await repository.createMessageForUserId('20', '44', 'Hello Mimi');
    assert.equal(created.message.id, '81');
    assert.equal(created.message.sender, 'user');
    assert.equal(created.matchId, '44');
    assert.equal(created.senderUserId, '20');
    assert.equal(created.recipientUserId, '31');
    assert.equal(created.content, 'Hello Mimi');
    assert.ok(queries[1].sql.includes('FOR SHARE'));
  });
});
