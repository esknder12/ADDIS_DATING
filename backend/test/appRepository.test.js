import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ageRangeForPreference, createAppRepository, publicMember } from '../src/db/appRepository.js';

const currentProfileId = '101';
const targetProfileId = '202';
const currentTelegramId = '700000001';

function profileRow(id = targetProfileId) {
  return {
    id,
    name: 'Test Date',
    first_name: 'Test',
    age: 27,
    city: 'Addis Ababa',
    country: 'Ethiopia',
    bio: 'A profile used by repository tests.',
    is_verified: true,
    photo_url: null,
    profile_photo_url: '/images/profiles/p01.jpg',
    looking_for: ['serious_relationship'],
  };
}

describe('discovery profile repository', () => {
  it('maps onboarding age ranges and uses a broad adult default', () => {
    assert.deepEqual(ageRangeForPreference('25_30'), [25, 30]);
    assert.deepEqual(ageRangeForPreference('18_24'), [18, 24]);
    assert.deepEqual(ageRangeForPreference('unknown'), [18, 120]);
  });

  it('returns eligible profile pages with the saved age, gender, and city preferences', async () => {
    const calls = [];
    const pool = {
      async query(sql, values) {
        calls.push({ sql, values });
        if (sql.includes('preferred_city')) {
          return {
            rows: [{
              id: currentProfileId,
              gender: 'male',
              preferred_city: 'Addis Ababa',
              preferred_country: 'Ethiopia',
              age_range_preference: '25_30',
              interested_in_gender: null,
            }],
          };
        }
        return { rows: [profileRow('202'), profileRow('203')] };
      },
    };

    const repository = createAppRepository(pool);
    const result = await repository.listDiscover(currentTelegramId, { limit: 1, offset: 3 });

    assert.equal(result.profiles.length, 1);
    assert.equal(result.profiles[0].id, '202');
    assert.equal(result.profiles[0].intention, 'Serious relationship');
    assert.equal(result.profiles[0].photo, '/images/profiles/p01.jpg');
    assert.equal(result.profiles[0].verified, true);
    assert.equal(result.hasMore, true);

    const query = calls[1];
    assert.match(query.sql, /NOT EXISTS \([\s\S]*FROM swipes/);
    assert.match(query.sql, /u\.is_verified DESC/);
    assert.deepEqual(query.values, [currentProfileId, 'female', 25, 30, 'Addis Ababa', 'Ethiopia', 2, 3]);
  });

  it('does not expose hidden admirer or canned-match flags in public profiles', () => {
    const profile = publicMember({
      id: '1',
      name: 'A Person',
      photo: '/photo.jpg',
      likesYou: true,
      likesYouBack: true,
      replies: ['Private canned text'],
    });
    assert.equal(profile.id, '1');
    assert.equal('likesYou' in profile, false);
    assert.equal('likesYouBack' in profile, false);
    assert.equal('replies' in profile, false);
  });
});

describe('daily AI Picks repository', () => {
  it('persists an ordered daily session, falls back to broader candidates, and reuses it', async () => {
    const state = { session: null, items: [], candidateQueries: 0 };
    const fallbackIds = ['203', '204', '205', '206'];
    const client = {
      async query(rawSql, values = []) {
        const sql = rawSql.replace(/\s+/g, ' ').trim();
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
        if (sql.includes('preferred_city')) {
          return { rows: [{
            id: currentProfileId,
            gender: 'male',
            preferred_city: 'Addis Ababa',
            preferred_country: 'Ethiopia',
            age_range_preference: '25_30',
            interested_in_gender: null,
            is_vip: false,
            vip_expires_at: null,
          }] };
        }
        if (sql.startsWith('SELECT id FROM users WHERE id = $1 FOR UPDATE')) {
          return { rows: [{ id: currentProfileId }] };
        }
        if (sql.includes('FROM ai_picks_sessions') && sql.startsWith('SELECT id, session_date')) {
          return { rows: state.session ? [{ ...state.session }] : [] };
        }
        if (sql.startsWith('INSERT INTO ai_picks_sessions')) {
          state.session = {
            id: '77', session_date: '2026-10-09', picks_shown: 0,
            picks_limit: values[1], created_at: new Date().toISOString(),
          };
          return { rows: [{ ...state.session }] };
        }
        if (sql.startsWith('SELECT COUNT(*)::int AS item_count')) {
          return { rows: [{ item_count: state.items.length }] };
        }
        if (sql.startsWith('SELECT u.id FROM users u')) {
          state.candidateQueries += 1;
          if (values[4] === 'Addis Ababa' && values[6] === true) {
            return { rows: [{ id: '202' }] };
          }
          const excluded = new Set(values[9] || []);
          return { rows: ['202', ...fallbackIds]
            .filter((id) => !excluded.has(id))
            .slice(0, values[8])
            .map((id) => ({ id })) };
        }
        if (sql.startsWith('INSERT INTO ai_pick_items')) {
          const [sessionId, pickedUserId, compatibilityScore, orderIndex] = values;
          state.items.push({ session_id: sessionId, id: String(pickedUserId), compatibility_score: compatibilityScore, order_index: orderIndex });
          return { rows: [] };
        }
        if (sql.startsWith('SELECT u.id::text AS id')) {
          assert.doesNotMatch(sql, /LOWER\(u\.city\)/);
          return {
            rows: state.items.map((item) => ({
              ...profileRow(item.id),
              city: item.id === '202' ? 'Addis Ababa' : 'Bahir Dar',
              compatibility_score: item.compatibility_score,
              order_index: item.order_index,
            })),
          };
        }
        if (sql.startsWith('SELECT COUNT(*)::int AS shown_count')) {
          return { rows: [{ shown_count: 0 }] };
        }
        if (sql.startsWith('UPDATE ai_picks_sessions SET picks_shown')) return { rows: [] };
        throw new Error(`Unexpected AI Picks test SQL: ${sql}`);
      },
      release() {},
    };
    const repository = createAppRepository({ async connect() { return client; } });

    const first = await repository.listAiPicks(currentTelegramId);
    const second = await repository.listAiPicks(currentTelegramId);
    assert.equal(first.picks.length, 5);
    assert.equal(first.picksRemaining, 5);
    assert.equal(first.dailyLimit, 5);
    assert.equal(first.isVip, false);
    assert.deepEqual(second.picks.map((profile) => profile.id), first.picks.map((profile) => profile.id));
    assert.equal(state.candidateQueries, 2);
    assert.equal(state.items[0].id, '202');
    assert.equal(new Set(state.items.map((item) => item.id)).size, 5);
    assert.ok(first.picks.every((profile) => profile.compatibilityScore >= 76 && profile.compatibilityScore <= 96));
    assert.ok(first.picks.some((profile) => profile.city === 'Bahir Dar'), 'different-city fallback candidates stay visible');
  });
});

describe('VIP-gated incoming likes', () => {
  function likesPool(isVip, vipExpiresAt = null) {
    const rows = ['301', '302'].map((id, index) => ({
      swipe_id: String(index + 1),
      action: 'like',
      id,
      name: `Like ${id}`,
      first_name: `Member ${id}`,
      age: 26 + index,
      city: 'Addis Ababa',
      country: 'Ethiopia',
      bio: 'Profile bio',
      is_verified: false,
      photo_url: null,
      profile_photo_url: `/images/profiles/p0${index + 1}.jpg`,
      looking_for: ['serious_relationship'],
    }));
    const client = {
      async query(rawSql) {
        const sql = rawSql.replace(/\s+/g, ' ').trim();
        if (sql.includes('FROM users WHERE telegram_id')) {
          return { rows: [{ id: currentProfileId, is_vip: isVip, vip_expires_at: vipExpiresAt }] };
        }
        if (sql.includes('FROM swipes s')) return { rows };
        if (sql.includes('FROM matches m')) return { rows: [] };
        throw new Error(`Unexpected likes test SQL: ${sql}`);
      },
      release() {},
    };
    return { pool: { async connect() { return client; } } };
  }

  it('redacts identities after the one free preview for non-VIP users', async () => {
    const repository = createAppRepository(likesPool(false).pool);
    const result = await repository.listLikes(currentTelegramId);
    assert.equal(result.isVip, false);
    assert.equal(result.likedYou[0].isLocked, false);
    assert.equal(result.likedYou[0].name, 'Like 301');
    assert.equal(result.likedYou[1].isLocked, true);
    assert.equal(result.likedYou[1].blurredPhotoUrl, '/images/locked-admirer.svg');
    assert.equal('photo' in result.likedYou[1], false);
    assert.equal('name' in result.likedYou[1], false);
    assert.equal('profileId' in result.likedYou[1], false);
    assert.equal(result.lockedCount, 1);
  });

  it('unlocks all incoming likes for active VIP users', async () => {
    const repository = createAppRepository(likesPool(true, new Date(Date.now() + 60_000)).pool);
    const result = await repository.listLikes(currentTelegramId);
    assert.equal(result.isVip, true);
    assert.ok(result.likedYou.every((like) => !like.isLocked && like.name));
  });
});

describe('database-backed mutual swipe and rewind', () => {
  function createMemoryPool({ reciprocalLike = true } = {}) {
    const swipes = reciprocalLike
      ? [{ id: '9', user_id: targetProfileId, profile_id: currentProfileId, action: 'super_like' }]
      : [];
    const matches = [];
    let nextSwipeId = 10;
    let nextMatchId = 40;

    const client = {
      async query(rawSql, values = []) {
        const sql = rawSql.replace(/\s+/g, ' ').trim();
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };

        if (sql.includes('preferred_city')) {
          return {
            rows: [{
              id: currentProfileId,
              gender: 'male',
              preferred_city: 'Addis Ababa',
              preferred_country: 'Ethiopia',
              age_range_preference: '25_30',
              interested_in_gender: null,
            }],
          };
        }
        if (sql.startsWith('SELECT id FROM users WHERE telegram_id = $1')) {
          return { rows: [{ id: currentProfileId }] };
        }
        if (sql.startsWith('SELECT id FROM users WHERE id::text = $1')) {
          return values[0] === targetProfileId ? { rows: [{ id: targetProfileId }] } : { rows: [] };
        }
        if (sql.startsWith('SELECT id FROM users WHERE id IN ($1, $2)')) {
          return { rows: [{ id: currentProfileId }, { id: targetProfileId }] };
        }
        if (sql.startsWith('SELECT u.id::text AS id')) {
          return { rows: [profileRow(values[0])] };
        }
        if (sql.startsWith('SELECT action FROM swipes WHERE user_id = $1')) {
          const [userId, profileId] = values;
          const existing = swipes.find((swipe) => swipe.user_id === userId && swipe.profile_id === profileId);
          return { rows: existing ? [{ action: existing.action }] : [] };
        }
        if (sql.startsWith('UPDATE ai_picks_sessions')) return { rows: [] };
        if (sql.startsWith('INSERT INTO swipes')) {
          const [userId, profileId, action] = values;
          const existing = swipes.find((swipe) => swipe.user_id === userId && swipe.profile_id === profileId);
          if (existing) Object.assign(existing, { action, created_at: new Date().toISOString() });
          else swipes.push({ id: String(nextSwipeId++), user_id: userId, profile_id: profileId, action });
          return { rows: [] };
        }
        if (sql.startsWith('SELECT id FROM swipes')) {
          const [userId, profileId] = values;
          return {
            rows: swipes.some((swipe) => swipe.user_id === userId
              && swipe.profile_id === profileId
              && ['like', 'super_like'].includes(swipe.action)) ? [{ id: '9' }] : [],
          };
        }
        if (sql.startsWith('INSERT INTO matches')) {
          const [, , user1Id, user2Id] = values;
          let match = matches.find((entry) => entry.user1_id === user1Id && entry.user2_id === user2Id);
          if (!match) {
            match = { id: String(nextMatchId++), user1_id: user1Id, user2_id: user2Id };
            matches.push(match);
          }
          return { rows: [{ id: match.id }] };
        }
        if (sql.startsWith('SELECT id, profile_id, action FROM swipes')) {
          const latest = swipes
            .filter((swipe) => swipe.user_id === values[0])
            .at(-1);
          return { rows: latest ? [latest] : [] };
        }
        if (sql.startsWith('DELETE FROM swipes WHERE id = $1')) {
          const index = swipes.findIndex((swipe) => swipe.id === values[0]);
          if (index >= 0) swipes.splice(index, 1);
          return { rows: [] };
        }
        if (sql.startsWith('DELETE FROM matches')) {
          const [user1Id, user2Id] = values;
          for (let index = matches.length - 1; index >= 0; index -= 1) {
            if (matches[index].user1_id === user1Id && matches[index].user2_id === user2Id) {
              matches.splice(index, 1);
            }
          }
          return { rows: [] };
        }

        throw new Error(`Unexpected test SQL: ${sql}`);
      },
      release() {},
    };

    return {
      swipes,
      matches,
      pool: { async connect() { return client; } },
    };
  }

  it('creates one shared match only after a reciprocal like or superlike', async () => {
    const memory = createMemoryPool();
    const repository = createAppRepository(memory.pool);

    const result = await repository.saveSwipe(currentTelegramId, targetProfileId, 'like');
    assert.equal(result.matched, true);
    assert.equal(result.match.id, '40');
    assert.equal(result.match.matchedUser.id, targetProfileId);
    assert.equal(memory.matches.length, 1);
    assert.deepEqual([memory.matches[0].user1_id, memory.matches[0].user2_id], [currentProfileId, targetProfileId]);
  });

  it('does not create a match for a one-sided like', async () => {
    const memory = createMemoryPool({ reciprocalLike: false });
    const repository = createAppRepository(memory.pool);

    const result = await repository.saveSwipe(currentTelegramId, targetProfileId, 'super_like');
    assert.equal(result.matched, false);
    assert.equal(result.match, null);
    assert.equal(memory.matches.length, 0);
  });

  it('rewinds the last swipe and removes the shared match row', async () => {
    const memory = createMemoryPool();
    const repository = createAppRepository(memory.pool);
    const liked = await repository.saveSwipe(currentTelegramId, targetProfileId, 'like');
    assert.equal(liked.matched, true);

    const result = await repository.rewindLastSwipe(currentTelegramId);
    assert.equal(result.restored, targetProfileId);
    assert.equal(result.restoredProfile.name, 'Test Date');
    assert.equal(memory.matches.length, 0);
    assert.equal(memory.swipes.some((swipe) => swipe.user_id === currentProfileId), false);
  });
});
