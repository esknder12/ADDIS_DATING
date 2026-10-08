import { mapUser } from './userRepository.js';

export const VERIFICATION_STATES = [
  'not_started',
  'requested',
  'pending_review',
  'approved',
  'rejected',
];

// Mirrors the other repositories: callers always await, so this must reject rather than throw.
async function unavailable() {
  throw new Error('Database is not configured');
}

function mapSubmission(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    telegramId: String(row.telegram_id),
    fileId: row.telegram_file_id,
    messageId: row.telegram_message_id ?? null,
    durationSeconds: row.duration_seconds ?? null,
    status: row.status,
    reviewedBy: row.reviewed_by || null,
    rejectionReason: row.rejection_reason || null,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at || null,
    username: row.telegram_username || null,
    name: row.name || null,
  };
}

export function createVerificationRepository(pool) {
  if (!pool) {
    return {
      isAvailable: false,
      getStatus: unavailable,
      markRequested: unavailable,
      recordSubmission: unavailable,
      listPending: unavailable,
      getSubmission: unavailable,
      approve: unavailable,
      reject: unavailable,
    };
  }

  async function findUser(telegramId, { forUpdate = false, client = pool } = {}) {
    const result = await client.query(
      `SELECT * FROM users
       WHERE telegram_id = $1 AND is_active = TRUE
       ${forUpdate ? 'FOR UPDATE' : ''}
       LIMIT 1`,
      [telegramId],
    );
    return result.rows[0] || null;
  }

  async function getStatus(telegramId) {
    const user = await findUser(telegramId);
    if (!user) return null;

    return {
      user: mapUser(user),
      status: user.verification_status || 'not_started',
      isVerified: Boolean(user.is_verified),
      rejectionReason: user.verification_rejection_reason || null,
      requestedAt: user.verification_requested_at || null,
      reviewedAt: user.verification_reviewed_at || null,
    };
  }

  /** Set by the bot right after the instruction sequence is delivered. */
  async function markRequested(telegramId) {
    const updated = await pool.query(
      `UPDATE users
       SET verification_status = 'requested',
           verification_requested_at = NOW()
       WHERE telegram_id = $1 AND is_active = TRUE
         AND verification_status IN ('not_started', 'rejected')
       RETURNING *`,
      [telegramId],
    );
    return updated.rows.length > 0 ? mapUser(updated.rows[0]) : null;
  }

  /**
   * Records a video note. The one-open-submission rule lives in a partial unique index, so a
   * duplicate send resolves to 'duplicate' through ON CONFLICT rather than through a race in
   * application logic.
   */
  async function recordSubmission(telegramId, { fileId, messageId, durationSeconds }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await findUser(telegramId, { forUpdate: true, client });
      if (!user) {
        await client.query('ROLLBACK');
        return { status: 'not-found' };
      }
      if (user.is_verified || user.verification_status === 'approved') {
        await client.query('ROLLBACK');
        return { status: 'already-verified' };
      }

      const inserted = await client.query(
        `INSERT INTO verification_submissions
           (user_id, telegram_id, telegram_file_id, telegram_message_id, duration_seconds)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) WHERE status = 'pending' DO NOTHING
         RETURNING *`,
        [user.id, telegramId, fileId, messageId ?? null, durationSeconds ?? null],
      );

      if (inserted.rows.length === 0) {
        await client.query('ROLLBACK');
        return { status: 'duplicate' };
      }

      // A retry after a rejection starts clean, so a stale reason never survives to approval.
      const updated = await client.query(
        `UPDATE users
         SET verification_status = 'pending_review',
             verification_rejection_reason = NULL
         WHERE id = $1
         RETURNING *`,
        [user.id],
      );

      await client.query('COMMIT');
      return { status: 'recorded', user: mapUser(updated.rows[0]), submission: mapSubmission(inserted.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function listPending(limit = 50) {
    const result = await pool.query(
      `SELECT vs.*, u.telegram_username, u.name
       FROM verification_submissions vs
       JOIN users u ON u.id = vs.user_id
       WHERE vs.status = 'pending'
       ORDER BY vs.submitted_at ASC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map(mapSubmission);
  }

  async function getSubmission(submissionId) {
    const result = await pool.query(
      `SELECT vs.*, u.telegram_username, u.name
       FROM verification_submissions vs
       JOIN users u ON u.id = vs.user_id
       WHERE vs.id = $1
       LIMIT 1`,
      [submissionId],
    );
    return mapSubmission(result.rows[0]);
  }

  /**
   * Approve and reject both lock the submission row, so two reviewers acting at once cannot
   * each notify the user, and a repeated call reports 'already-reviewed' instead of
   * re-sending the bot message.
   */
  async function review(submissionId, { decision, reason = null, reviewedBy }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const submissionResult = await client.query(
        'SELECT * FROM verification_submissions WHERE id = $1 FOR UPDATE',
        [submissionId],
      );
      if (submissionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { status: 'not-found' };
      }

      const submission = submissionResult.rows[0];
      if (submission.status !== 'pending') {
        await client.query('ROLLBACK');
        return { status: 'already-reviewed', submission: mapSubmission(submission) };
      }

      await client.query(
        `UPDATE verification_submissions
         SET status = $2, reviewed_by = $3, reviewed_at = NOW(), rejection_reason = $4
         WHERE id = $1`,
        [submissionId, decision, reviewedBy, reason],
      );

      const userUpdate = await client.query(
        decision === 'approved'
          ? `UPDATE users
             SET is_verified = TRUE,
                 verification_status = 'approved',
                 verification_reviewed_at = NOW(),
                 verification_rejection_reason = NULL
             WHERE id = $1
             RETURNING *`
          : `UPDATE users
             SET is_verified = FALSE,
                 verification_status = 'rejected',
                 verification_reviewed_at = NOW(),
                 verification_rejection_reason = $2
             WHERE id = $1
             RETURNING *`,
        decision === 'approved' ? [submission.user_id] : [submission.user_id, reason],
      );

      await client.query('COMMIT');
      return {
        status: 'ok',
        decision,
        telegramId: String(submission.telegram_id),
        user: mapUser(userUpdate.rows[0]),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    isAvailable: true,
    getStatus,
    markRequested,
    recordSubmission,
    listPending,
    getSubmission,
    approve: (submissionId, reviewedBy) => review(submissionId, { decision: 'approved', reviewedBy }),
    reject: (submissionId, reason, reviewedBy) => review(submissionId, { decision: 'rejected', reason, reviewedBy }),
  };
}
