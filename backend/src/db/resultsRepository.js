import { mapUser } from './userRepository.js';

function answersFromRows(rows) {
  return Object.fromEntries(rows.map((row) => [row.question_key, row.answer_value]));
}

function mapPromo(row) {
  if (!row) return null;
  return {
    code: row.code,
    discountPercent: row.discount_percent,
    isUsed: row.is_used,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function normaliseEmail(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function normaliseName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

// Mirrors userRepository/onboardingRepository: callers always await, so this must reject
// rather than throw synchronously.
async function unavailable() {
  throw new Error('Database is not configured');
}

const RESULT_COLUMNS = `
  users.profile_score,
  users.score_tier,
  users.answers_hash,
  users.match_pool_count,
  users.dating_style,
  users.response_rate_multiplier,
  users.promo_code,
  users.promo_discount_percent,
  users.results_viewed_at,
  users.results_completed
`;

export function createResultsRepository(pool) {
  if (!pool) {
    return {
      isAvailable: false,
      getResults: unavailable,
      saveResults: unavailable,
      setEmail: unavailable,
      setName: unavailable,
      getPromo: unavailable,
      createPromo: unavailable,
      completeResults: unavailable,
    };
  }

  async function loadUser(telegramId, { forUpdate = false, client = pool } = {}) {
    const result = await client.query(
      `SELECT * FROM users
       WHERE telegram_id = $1 AND is_active = TRUE
       ${forUpdate ? 'FOR UPDATE' : ''}
       LIMIT 1`,
      [telegramId],
    );
    return result.rows[0] || null;
  }

  async function getResults(telegramId) {
    const user = await loadUser(telegramId);
    if (!user) return null;

    const [answerResult, promoResult] = await Promise.all([
      pool.query(
        'SELECT question_key, answer_value FROM onboarding_answers WHERE user_id = $1 ORDER BY id',
        [user.id],
      ),
      pool.query(
        `SELECT * FROM promo_codes
         WHERE user_id = $1 AND is_used = FALSE AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at DESC
         LIMIT 1`,
        [user.id],
      ),
    ]);

    return {
      user: mapUser(user),
      onboardingCompleted: user.onboarding_completed,
      answers: answersFromRows(answerResult.rows),
      answersHash: user.answers_hash || null,
      promo: mapPromo(promoResult.rows[0]),
    };
  }

  async function saveResults(telegramId, results) {
    const updated = await pool.query(
      `UPDATE users SET
         profile_score = $2,
         score_tier = $3,
         answers_hash = $4,
         match_pool_count = $5,
         dating_style = $6,
         response_rate_multiplier = $7
       WHERE telegram_id = $1 AND is_active = TRUE
       RETURNING *`,
      [
        telegramId,
        results.score,
        results.scoreTier,
        results.answersHash,
        results.matchPoolCount,
        results.datingStyle,
        results.responseRateMultiplier,
      ],
    );
    return updated.rows.length > 0 ? mapUser(updated.rows[0]) : null;
  }

  async function setEmail(telegramId, email) {
    const updated = await pool.query(
      `UPDATE users SET email = $2
       WHERE telegram_id = $1 AND is_active = TRUE
       RETURNING *`,
      [telegramId, normaliseEmail(email)],
    );
    return updated.rows.length > 0 ? mapUser(updated.rows[0]) : null;
  }

  async function setName(telegramId, name) {
    const updated = await pool.query(
      `UPDATE users SET name = $2
       WHERE telegram_id = $1 AND is_active = TRUE
       RETURNING *`,
      [telegramId, normaliseName(name)],
    );
    return updated.rows.length > 0 ? mapUser(updated.rows[0]) : null;
  }

  async function getPromo(telegramId) {
    const user = await loadUser(telegramId);
    if (!user) return null;

    const result = await pool.query(
      `SELECT * FROM promo_codes
       WHERE user_id = $1 AND is_used = FALSE AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id],
    );
    return { user: mapUser(user), promo: mapPromo(result.rows[0]) };
  }

  async function createPromo(telegramId, { code, discountPercent, expiresAt }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await loadUser(telegramId, { forUpdate: true, client });
      if (!user) {
        await client.query('ROLLBACK');
        return null;
      }

      const inserted = await client.query(
        `INSERT INTO promo_codes (user_id, code, discount_percent, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [user.id, code.toUpperCase(), discountPercent, expiresAt],
      );

      await client.query(
        'UPDATE users SET promo_code = $2, promo_discount_percent = $3 WHERE id = $1',
        [user.id, code.toUpperCase(), discountPercent],
      );

      await client.query('COMMIT');
      return { user: mapUser(user), promo: mapPromo(inserted.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function completeResults(telegramId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await loadUser(telegramId, { forUpdate: true, client });
      if (!user) {
        await client.query('ROLLBACK');
        return { status: 'not-found' };
      }
      if (!user.onboarding_completed) {
        await client.query('ROLLBACK');
        return { status: 'quiz-incomplete' };
      }
      if (!normaliseName(user.name)) {
        await client.query('ROLLBACK');
        return { status: 'name-required' };
      }

      const updated = await client.query(
        `UPDATE users
         SET results_completed = TRUE,
             results_viewed_at = COALESCE(results_viewed_at, NOW())
         WHERE id = $1
         RETURNING *`,
        [user.id],
      );

      await client.query('COMMIT');
      return { status: 'ok', user: mapUser(updated.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    isAvailable: true,
    getResults,
    saveResults,
    setEmail,
    setName,
    getPromo,
    createPromo,
    completeResults,
  };
}

export { normaliseEmail, normaliseName };
