import {
  getRequiredKeysForGender,
  isOnboardingComplete,
  onboardingFlow,
  validateOnboardingAnswer,
} from '@dategram/shared/onboarding';

function answersFromRows(rows) {
  return Object.fromEntries(rows.map((row) => [row.question_key, row.answer_value]));
}

function unavailable() {
  throw new Error('Database is not configured');
}

export function createOnboardingRepository(pool) {
  if (!pool) {
    return {
      isAvailable: false,
      getState: unavailable,
      saveAnswer: unavailable,
      saveProgress: unavailable,
      complete: unavailable,
    };
  }

  async function getState(telegramId) {
    const userResult = await pool.query(
      `SELECT
        users.id,
        users.onboarding_completed,
        onboarding_progress.current_step_key,
        onboarding_progress.current_step_index,
        onboarding_progress.completed,
        onboarding_progress.updated_at
      FROM users
      LEFT JOIN onboarding_progress ON onboarding_progress.user_id = users.id
      WHERE users.telegram_id = $1 AND users.is_active = TRUE
      LIMIT 1`,
      [telegramId],
    );

    if (userResult.rows.length === 0) return null;
    const user = userResult.rows[0];
    const answerResult = await pool.query(
      `SELECT question_key, answer_value
       FROM onboarding_answers
       WHERE user_id = $1
       ORDER BY id`,
      [user.id],
    );

    return {
      answers: answersFromRows(answerResult.rows),
      currentStepKey: user.current_step_key || onboardingFlow[0].key,
      currentStepIndex: user.current_step_index || 0,
      completed: Boolean(user.onboarding_completed || user.completed),
      updatedAt: user.updated_at || null,
    };
  }

  async function saveAnswer(telegramId, questionKey, value, progress) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        `SELECT id FROM users
         WHERE telegram_id = $1 AND is_active = TRUE
         FOR UPDATE`,
        [telegramId],
      );
      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const userId = userResult.rows[0].id;
      await client.query(
        `INSERT INTO onboarding_answers (user_id, question_key, answer_value)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (user_id, question_key) DO UPDATE SET
           answer_value = EXCLUDED.answer_value`,
        [userId, questionKey, JSON.stringify(value)],
      );

      if (questionKey === 'gender') {
        await client.query('UPDATE users SET gender = $1 WHERE id = $2', [value, userId]);
      } else if (questionKey === 'age') {
        await client.query('UPDATE users SET age = $1 WHERE id = $2', [value, userId]);
      } else if (questionKey === 'location') {
        await client.query(
          'UPDATE users SET city = $1, country = $2 WHERE id = $3',
          [value.name, value.country, userId],
        );
      }

      await client.query(
        `INSERT INTO onboarding_progress (
           user_id, current_step_key, current_step_index, completed, completed_at
         ) VALUES ($1, $2, $3, FALSE, NULL)
         ON CONFLICT (user_id) DO UPDATE SET
           current_step_key = EXCLUDED.current_step_key,
           current_step_index = EXCLUDED.current_step_index,
           completed = FALSE,
           completed_at = NULL`,
        [userId, progress.currentStepKey, progress.currentStepIndex],
      );

      await client.query('COMMIT');
      return { saved: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function saveProgress(telegramId, progress) {
    const result = await pool.query(
      `INSERT INTO onboarding_progress (user_id, current_step_key, current_step_index)
       SELECT id, $2, $3 FROM users
       WHERE telegram_id = $1 AND is_active = TRUE
       ON CONFLICT (user_id) DO UPDATE SET
         current_step_key = EXCLUDED.current_step_key,
         current_step_index = EXCLUDED.current_step_index
       RETURNING user_id`,
      [telegramId, progress.currentStepKey, progress.currentStepIndex],
    );

    return result.rows.length > 0 ? { saved: true } : null;
  }

  async function complete(telegramId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        `SELECT id FROM users
         WHERE telegram_id = $1 AND is_active = TRUE
         FOR UPDATE`,
        [telegramId],
      );
      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const userId = userResult.rows[0].id;
      const answerResult = await client.query(
        `SELECT question_key, answer_value
         FROM onboarding_answers
         WHERE user_id = $1`,
        [userId],
      );
      const answers = answersFromRows(answerResult.rows);

      if (!isOnboardingComplete(answers)) {
        const missingKeys = getRequiredKeysForGender(answers.gender).filter(
          (key) => !validateOnboardingAnswer(key, answers[key]).valid,
        );
        await client.query('ROLLBACK');
        return { completed: false, missingKeys };
      }

      const finalStep = onboardingFlow[onboardingFlow.length - 1];
      await client.query(
        `UPDATE users
         SET onboarding_completed = TRUE
         WHERE id = $1`,
        [userId],
      );
      await client.query(
        `INSERT INTO onboarding_progress (
           user_id, current_step_key, current_step_index, completed, completed_at
         ) VALUES ($1, $2, $3, TRUE, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           current_step_key = EXCLUDED.current_step_key,
           current_step_index = EXCLUDED.current_step_index,
           completed = TRUE,
           completed_at = NOW()`,
        [userId, finalStep.key, finalStep.stepIndex],
      );

      await client.query('COMMIT');
      return { completed: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    isAvailable: true,
    getState,
    saveAnswer,
    saveProgress,
    complete,
  };
}
