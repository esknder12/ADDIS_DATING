import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createResultsRepository } from '../src/db/resultsRepository.js';

const TELEGRAM_ID = 5150;

/**
 * No PostgreSQL is available in this sandbox, so this suite pins the SQL the repository emits:
 * parameter counts and ordering, transaction boundaries, and row-to-API mapping. It is the
 * closest available substitute for a live database and complements the manual checks listed in
 * docs/PHASE_3_IMPLEMENTATION_PLAN.md §7.
 */
function createFakePool({ userRow = null, answerRows = [], promoRow = null } = {}) {
  const queries = [];
  let released = 0;

  const client = {
    async query(text, params) {
      queries.push({ text: normalise(text), params, via: 'client' });
      const sql = normalise(text);
      if (sql.startsWith('SELECT * FROM users')) return { rows: userRow ? [userRow] : [] };
      if (sql.startsWith('UPDATE users SET results_completed')) {
        return { rows: [{ ...userRow, results_completed: true, results_viewed_at: new Date('2026-10-08T09:30:00Z') }] };
      }
      if (sql.startsWith('INSERT INTO promo_codes')) {
        return { rows: [{ id: 9, user_id: 1, code: params[1], discount_percent: params[2], is_used: false, expires_at: params[3], created_at: new Date() }] };
      }
      return { rows: [] };
    },
    release() {
      released += 1;
    },
  };

  const pool = {
    queries,
    get released() {
      return released;
    },
    async query(text, params) {
      queries.push({ text: normalise(text), params, via: 'pool' });
      const sql = normalise(text);

      if (sql.startsWith('SELECT * FROM users')) return { rows: userRow ? [userRow] : [] };
      if (sql.startsWith('SELECT question_key, answer_value FROM onboarding_answers')) return { rows: answerRows };
      if (sql.startsWith('SELECT * FROM promo_codes')) return { rows: promoRow ? [promoRow] : [] };
      if (sql.startsWith('UPDATE users SET email')) return { rows: [{ ...userRow, email: params[1] }] };
      if (sql.startsWith('UPDATE users SET name')) return { rows: [{ ...userRow, name: params[1] }] };
      if (sql.startsWith('UPDATE users SET profile_score')) {
        return {
          rows: [{
            ...userRow,
            profile_score: params[1],
            score_tier: params[2],
            answers_hash: params[3],
            match_pool_count: params[4],
            dating_style: params[5],
            response_rate_multiplier: params[6],
          }],
        };
      }
      return { rows: [] };
    },
    async connect() {
      return client;
    },
  };

  return pool;
}

function normalise(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function baseUserRow(overrides = {}) {
  return {
    id: 1,
    telegram_id: TELEGRAM_ID,
    first_name: 'Abel',
    name: 'Abel Tesfaye',
    email: 'abel@example.com',
    gender: 'male',
    city: 'Addis Ababa',
    country: 'Ethiopia',
    onboarding_completed: true,
    results_completed: false,
    results_viewed_at: null,
    profile_score: 87,
    score_tier: 'VERY_HIGH',
    answers_hash: 'a'.repeat(32),
    match_pool_count: 57,
    dating_style: 'Connector',
    response_rate_multiplier: '2.3',
    promo_code: 'DATEGRAM-7QK2MX',
    promo_discount_percent: 50,
    created_at: new Date('2026-10-08T09:00:00Z'),
    ...overrides,
  };
}

describe('results repository SQL', () => {
  it('returns null when no active user row exists', async () => {
    const pool = createFakePool({ userRow: null });
    const repository = createResultsRepository(pool);
    assert.equal(await repository.getResults(TELEGRAM_ID), null);
  });

  it('loads the user, the answers and the live promo in one call', async () => {
    const pool = createFakePool({
      userRow: baseUserRow(),
      answerRows: [
        { question_key: 'conversation_confidence', answer_value: 'confident' },
        { question_key: 'style_preference', answer_value: ['natural'] },
      ],
      promoRow: { code: 'DATEGRAM-7QK2MX', discount_percent: 50, is_used: false, expires_at: new Date('2026-10-15T09:00:00Z'), created_at: new Date() },
    });
    const repository = createResultsRepository(pool);

    const record = await repository.getResults(TELEGRAM_ID);

    assert.deepEqual(Object.keys(record.answers), ['conversation_confidence', 'style_preference']);
    assert.equal(record.answersHash, 'a'.repeat(32));
    assert.equal(record.onboardingCompleted, true);
    assert.equal(record.promo.code, 'DATEGRAM-7QK2MX');
    assert.equal(record.promo.discountPercent, 50);

    // The user row must be scoped to the validated Telegram identity and to active accounts.
    const userQuery = pool.queries.find((query) => query.text.startsWith('SELECT * FROM users'));
    assert.match(userQuery.text, /WHERE telegram_id = \$1 AND is_active = TRUE/);
    assert.deepEqual(userQuery.params, [TELEGRAM_ID]);

    // The promo lookup must exclude used and expired codes.
    const promoQuery = pool.queries.find((query) => query.text.startsWith('SELECT * FROM promo_codes'));
    assert.match(promoQuery.text, /is_used = FALSE/);
    assert.match(promoQuery.text, /expires_at IS NULL OR expires_at > NOW\(\)/);
  });

  it('maps every Phase 3 column onto the public user shape', async () => {
    const pool = createFakePool({ userRow: baseUserRow() });
    const repository = createResultsRepository(pool);
    const record = await repository.getResults(TELEGRAM_ID);

    assert.equal(record.user.email, 'abel@example.com');
    assert.equal(record.user.gender, 'male');
    assert.equal(record.user.profileScore, 87);
    assert.equal(record.user.scoreTier, 'VERY_HIGH');
    assert.equal(record.user.datingStyle, 'Connector');
    assert.equal(record.user.matchPoolCount, 57);
    assert.equal(record.user.responseRateMultiplier, 2.3, 'NUMERIC must arrive as a number');
    assert.equal(record.user.promoCode, 'DATEGRAM-7QK2MX');
    assert.equal(record.user.promoDiscountPercent, 50);
    assert.equal(record.user.resultsCompleted, false);
    assert.equal(record.user.resultsViewedAt, null);
  });

  it('persists all six scoring columns in a single UPDATE', async () => {
    const pool = createFakePool({ userRow: baseUserRow({ profile_score: null }) });
    const repository = createResultsRepository(pool);

    await repository.saveResults(TELEGRAM_ID, {
      score: 91,
      scoreTier: 'VERY_HIGH',
      answersHash: 'b'.repeat(32),
      matchPoolCount: 44,
      datingStyle: 'Selective',
      responseRateMultiplier: 2.1,
    });

    const update = pool.queries.find((query) => query.text.startsWith('UPDATE users SET profile_score'));
    assert.equal(update.params.length, 7);
    assert.deepEqual(update.params.slice(1), [91, 'VERY_HIGH', 'b'.repeat(32), 44, 'Selective', 2.1]);
    assert.match(update.text, /RETURNING \*/);
  });

  it('lowercases and trims the email before writing it', async () => {
    const pool = createFakePool({ userRow: baseUserRow() });
    const repository = createResultsRepository(pool);

    await repository.setEmail(TELEGRAM_ID, '  Abel@Example.COM ');
    assert.equal(pool.queries.at(-1).params[1], 'abel@example.com');

    await repository.setEmail(TELEGRAM_ID, null);
    assert.equal(pool.queries.at(-1).params[1], null, 'a skipped email must clear the column, not fail');
  });

  it('collapses whitespace in the name before writing it', async () => {
    const pool = createFakePool({ userRow: baseUserRow() });
    const repository = createResultsRepository(pool);

    await repository.setName(TELEGRAM_ID, '  Abel    Tesfaye ');
    assert.equal(pool.queries.at(-1).params[1], 'Abel Tesfaye');
  });

  it('inserts the promo and mirrors it onto the user inside one transaction', async () => {
    const pool = createFakePool({ userRow: baseUserRow() });
    const repository = createResultsRepository(pool);

    const expiry = new Date('2026-10-15T09:00:00.000Z');
    const created = await repository.createPromo(TELEGRAM_ID, {
      code: 'dategram-7qk2mx',
      discountPercent: 50,
      expiresAt: expiry,
    });

    assert.equal(created.promo.code, 'DATEGRAM-7QK2MX', 'codes are stored uppercase');
    assert.equal(created.promo.discountPercent, 50);

    const clientQueries = pool.queries.filter((query) => query.via === 'client').map((query) => query.text);
    assert.deepEqual(clientQueries, [
      'BEGIN',
      'SELECT * FROM users WHERE telegram_id = $1 AND is_active = TRUE FOR UPDATE LIMIT 1',
      'INSERT INTO promo_codes (user_id, code, discount_percent, expires_at) VALUES ($1, $2, $3, $4) RETURNING *',
      'UPDATE users SET promo_code = $2, promo_discount_percent = $3 WHERE id = $1',
      'COMMIT',
    ]);
    assert.equal(pool.released, 1, 'the client must be released');

    const insert = pool.queries.find((query) => query.text.startsWith('INSERT INTO promo_codes'));
    assert.deepEqual(insert.params[1], 'DATEGRAM-7QK2MX');
    assert.deepEqual(insert.params[3], expiry);
  });

  it('returns null from createPromo when the user disappeared', async () => {
    const pool = createFakePool({ userRow: null });
    const repository = createResultsRepository(pool);

    const created = await repository.createPromo(TELEGRAM_ID, {
      code: 'DATEGRAM-ABC234',
      discountPercent: 50,
      expiresAt: new Date(),
    });

    assert.equal(created, null);
    assert.ok(pool.queries.some((query) => query.text === 'ROLLBACK'));
  });

  it('refuses to complete when the quiz is unfinished or the name is missing', async () => {
    for (const [overrides, expected] of [
      [{ onboarding_completed: false }, 'quiz-incomplete'],
      [{ name: null }, 'name-required'],
      [{ name: '   ' }, 'name-required'],
    ]) {
      const pool = createFakePool({ userRow: baseUserRow(overrides) });
      const repository = createResultsRepository(pool);
      const outcome = await repository.completeResults(TELEGRAM_ID);
      assert.equal(outcome.status, expected, JSON.stringify(overrides));
      assert.ok(pool.queries.some((query) => query.text === 'ROLLBACK'));
    }
  });

  it('completes atomically and never overwrites an existing results_viewed_at', async () => {
    const pool = createFakePool({ userRow: baseUserRow() });
    const repository = createResultsRepository(pool);

    const outcome = await repository.completeResults(TELEGRAM_ID);
    assert.equal(outcome.status, 'ok');
    assert.equal(outcome.user.resultsCompleted, true);

    const clientQueries = pool.queries.filter((query) => query.via === 'client').map((query) => query.text);
    assert.deepEqual(clientQueries, [
      'BEGIN',
      'SELECT * FROM users WHERE telegram_id = $1 AND is_active = TRUE FOR UPDATE LIMIT 1',
      'UPDATE users SET results_completed = TRUE, results_viewed_at = COALESCE(results_viewed_at, NOW()) WHERE id = $1 RETURNING *',
      'COMMIT',
    ]);
    assert.equal(pool.released, 1);
  });

  it('exposes a predictable unavailable repository without a pool', async () => {
    const repository = createResultsRepository(null);
    assert.equal(repository.isAvailable, false);
    await assert.rejects(() => repository.getResults(TELEGRAM_ID), /Database is not configured/);
  });
});
