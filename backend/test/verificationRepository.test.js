import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createVerificationRepository } from '../src/db/verificationRepository.js';

const TELEGRAM_ID = 8080;

/**
 * No PostgreSQL is available in this sandbox, so this suite pins the SQL the repository emits:
 * transaction boundaries, the one-open-submission conflict path, and idempotent review.
 */
function createFakePool({ userRow = null, submissionRow = null, conflict = false } = {}) {
  const queries = [];
  let released = 0;

  const client = {
    async query(text, params) {
      const sql = normalise(text);
      queries.push({ text: sql, params, via: 'client' });

      if (sql.startsWith('SELECT * FROM users')) return { rows: userRow ? [userRow] : [] };
      if (sql.startsWith('SELECT * FROM verification_submissions')) {
        return { rows: submissionRow ? [submissionRow] : [] };
      }
      if (sql.startsWith('INSERT INTO verification_submissions')) {
        if (conflict) return { rows: [] };
        return {
          rows: [{
            id: 11,
            user_id: userRow?.id ?? 1,
            telegram_id: params[1],
            telegram_file_id: params[2],
            telegram_message_id: params[3],
            duration_seconds: params[4],
            status: 'pending',
            submitted_at: new Date(),
          }],
        };
      }
      if (sql.startsWith('UPDATE users SET verification_status')) {
        return { rows: [{ ...userRow, verification_status: 'pending_review' }] };
      }
      if (sql.startsWith('UPDATE verification_submissions')) return { rows: [] };
      if (sql.startsWith('UPDATE users')) {
        return { rows: [{ ...userRow, is_verified: params.length === 1, verification_status: params.length === 1 ? 'approved' : 'rejected' }] };
      }
      return { rows: [] };
    },
    release() {
      released += 1;
    },
  };

  return {
    queries,
    get released() {
      return released;
    },
    clientQueries: () => queries.filter((q) => q.via === 'client').map((q) => q.text),
    async query(text, params) {
      const sql = normalise(text);
      queries.push({ text: sql, params, via: 'pool' });
      if (sql.startsWith('SELECT * FROM users')) return { rows: userRow ? [userRow] : [] };
      if (sql.startsWith('SELECT vs.*, u.telegram_username')) {
        return { rows: submissionRow ? [{ ...submissionRow, telegram_username: 'abel', name: 'Abel' }] : [] };
      }
      if (sql.startsWith('UPDATE users SET verification_status')) {
        return { rows: [{ ...userRow, verification_status: 'requested' }] };
      }
      return { rows: [] };
    },
    async connect() {
      return client;
    },
  };
}

function normalise(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function baseUser(overrides = {}) {
  return {
    id: 1,
    telegram_id: TELEGRAM_ID,
    name: 'Abel',
    is_active: true,
    is_verified: false,
    verification_status: 'requested',
    verification_requested_at: new Date('2026-10-08T09:00:00Z'),
    verification_reviewed_at: null,
    verification_rejection_reason: null,
    onboarding_completed: true,
    results_completed: true,
    created_at: new Date(),
    ...overrides,
  };
}

describe('verification repository SQL', () => {
  it('returns null when the user does not exist', async () => {
    const repository = createVerificationRepository(createFakePool({ userRow: null }));
    assert.equal(await repository.getStatus(TELEGRAM_ID), null);
  });

  it('exposes the verification fields on the status payload', async () => {
    const pool = createFakePool({
      userRow: baseUser({
        is_verified: true,
        verification_status: 'approved',
        verification_reviewed_at: new Date('2026-10-09T10:00:00Z'),
      }),
    });
    const repository = createVerificationRepository(pool);

    const status = await repository.getStatus(TELEGRAM_ID);
    assert.equal(status.isVerified, true);
    assert.equal(status.status, 'approved');
    assert.equal(status.rejectionReason, null);
    assert.ok(status.reviewedAt);

    const query = pool.queries.find((q) => q.text.startsWith('SELECT * FROM users'));
    assert.match(query.text, /WHERE telegram_id = \$1 AND is_active = TRUE/);
    assert.deepEqual(query.params, [TELEGRAM_ID]);
  });

  it('only advances to requested from a retryable state', async () => {
    const pool = createFakePool({ userRow: baseUser() });
    const repository = createVerificationRepository(pool);

    await repository.markRequested(TELEGRAM_ID);
    const update = pool.queries.find((q) => q.text.startsWith('UPDATE users SET verification_status'));
    assert.match(update.text, /verification_status IN \('not_started', 'rejected'\)/);
    assert.match(update.text, /verification_requested_at = NOW\(\)/);
  });

  it('records a submission inside a transaction and moves the user to pending_review', async () => {
    const pool = createFakePool({ userRow: baseUser() });
    const repository = createVerificationRepository(pool);

    const outcome = await repository.recordSubmission(TELEGRAM_ID, {
      fileId: 'DQACAgUAAx',
      messageId: 42,
      durationSeconds: 7,
    });

    assert.equal(outcome.status, 'recorded');
    assert.equal(outcome.submission.fileId, 'DQACAgUAAx');
    assert.equal(pool.released, 1);

    const clientQueries = pool.clientQueries();
    assert.deepEqual(clientQueries, [
      'BEGIN',
      'SELECT * FROM users WHERE telegram_id = $1 AND is_active = TRUE FOR UPDATE LIMIT 1',
      "INSERT INTO verification_submissions (user_id, telegram_id, telegram_file_id, telegram_message_id, duration_seconds) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) WHERE status = 'pending' DO NOTHING RETURNING *",
      'UPDATE users SET verification_status = \'pending_review\', verification_rejection_reason = NULL WHERE id = $1 RETURNING *',
      'COMMIT',
    ]);
  });

  it('reports a duplicate instead of inserting a second queue entry', async () => {
    const pool = createFakePool({ userRow: baseUser(), conflict: true });
    const repository = createVerificationRepository(pool);

    const outcome = await repository.recordSubmission(TELEGRAM_ID, { fileId: 'X' });
    assert.equal(outcome.status, 'duplicate');
    assert.ok(pool.clientQueries().includes('ROLLBACK'));
    assert.ok(!pool.clientQueries().includes('COMMIT'));
  });

  it('refuses a submission from an already-verified user', async () => {
    for (const overrides of [{ is_verified: true }, { verification_status: 'approved' }]) {
      const pool = createFakePool({ userRow: baseUser(overrides) });
      const repository = createVerificationRepository(pool);
      const outcome = await repository.recordSubmission(TELEGRAM_ID, { fileId: 'X' });
      assert.equal(outcome.status, 'already-verified', JSON.stringify(overrides));
      assert.ok(pool.clientQueries().includes('ROLLBACK'));
    }
  });

  it('lists the pending queue oldest first with a bounded limit', async () => {
    const pool = createFakePool({
      submissionRow: { id: 3, user_id: 1, telegram_id: TELEGRAM_ID, telegram_file_id: 'X', status: 'pending', submitted_at: new Date() },
    });
    const repository = createVerificationRepository(pool);

    const rows = await repository.listPending(500);
    const query = pool.queries.find((q) => q.text.startsWith('SELECT vs.*, u.telegram_username'));
    assert.match(query.text, /WHERE vs.status = 'pending'/);
    assert.match(query.text, /ORDER BY vs.submitted_at ASC/);
    assert.deepEqual(query.params, [500]);
    assert.equal(rows[0].telegramId, String(TELEGRAM_ID));
    assert.equal(rows[0].username, 'abel');
  });

  it('approves in one transaction and flips is_verified', async () => {
    const pool = createFakePool({
      submissionRow: { id: 5, user_id: 1, telegram_id: TELEGRAM_ID, telegram_file_id: 'X', status: 'pending' },
    });
    const repository = createVerificationRepository(pool);

    const outcome = await repository.approve(5, 'admin-token');
    assert.equal(outcome.status, 'ok');
    assert.equal(outcome.decision, 'approved');
    assert.equal(outcome.telegramId, String(TELEGRAM_ID));
    assert.equal(outcome.user.isVerified, true);

    const clientQueries = pool.clientQueries();
    assert.deepEqual(clientQueries, [
      'BEGIN',
      'SELECT * FROM verification_submissions WHERE id = $1 FOR UPDATE',
      'UPDATE verification_submissions SET status = $2, reviewed_by = $3, reviewed_at = NOW(), rejection_reason = $4 WHERE id = $1',
      "UPDATE users SET is_verified = TRUE, verification_status = 'approved', verification_reviewed_at = NOW(), verification_rejection_reason = NULL WHERE id = $1 RETURNING *",
      'COMMIT',
    ]);
    assert.equal(pool.released, 1);
  });

  it('rejects with the reason stored on both the submission and the user', async () => {
    const pool = createFakePool({
      submissionRow: { id: 6, user_id: 1, telegram_id: TELEGRAM_ID, telegram_file_id: 'X', status: 'pending' },
    });
    const repository = createVerificationRepository(pool);

    const outcome = await repository.reject(6, 'blurry', 'admin-token');
    assert.equal(outcome.status, 'ok');
    assert.equal(outcome.user.isVerified, false);

    const submissionUpdate = pool.clientQueries().find((q) => q.startsWith('UPDATE verification_submissions'));
    const params = pool.queries.find((q) => q.text === submissionUpdate).params;
    assert.deepEqual(params, [6, 'rejected', 'admin-token', 'blurry']);

    const userUpdate = pool.queries.find((q) => q.text.includes("verification_status = 'rejected'"));
    assert.deepEqual(userUpdate.params, [1, 'blurry']);
  });

  it('treats a reviewed submission as already handled rather than re-reviewing', async () => {
    const pool = createFakePool({
      submissionRow: { id: 7, user_id: 1, telegram_id: TELEGRAM_ID, telegram_file_id: 'X', status: 'approved' },
    });
    const repository = createVerificationRepository(pool);

    const outcome = await repository.approve(7, 'admin-token');
    assert.equal(outcome.status, 'already-reviewed');
    assert.equal(outcome.submission.status, 'approved');
    assert.ok(pool.clientQueries().includes('ROLLBACK'));
    assert.ok(!pool.clientQueries().includes('COMMIT'));
  });

  it('reports not-found for an unknown submission', async () => {
    const pool = createFakePool({ submissionRow: null, userRow: baseUser() });
    const repository = createVerificationRepository(pool);
    assert.equal((await repository.approve(999, 'admin-token')).status, 'not-found');
  });

  it('exposes a predictable unavailable repository without a pool', async () => {
    const repository = createVerificationRepository(null);
    assert.equal(repository.isAvailable, false);
    await assert.rejects(() => repository.getStatus(TELEGRAM_ID), /Database is not configured/);
  });
});
