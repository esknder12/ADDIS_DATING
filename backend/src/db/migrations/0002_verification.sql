-- Phase 4: bot-based video verification.
BEGIN;

-- is_verified already exists (schema.sql:23) as BOOLEAN NOT NULL DEFAULT FALSE and is
-- deliberately left untouched: re-adding it nullable would make every badge check three-valued.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) NOT NULL DEFAULT 'not_started'
    CHECK (verification_status IN
      ('not_started', 'requested', 'pending_review', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS verification_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_rejection_reason TEXT;

COMMENT ON COLUMN users.verification_status IS
  'not_started -> requested (instructions sent) -> pending_review (video received) -> approved|rejected.';

CREATE TABLE IF NOT EXISTS verification_submissions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_id BIGINT NOT NULL,
  -- Only Telegram's file_id is stored. Dategram never holds the video bytes.
  telegram_file_id TEXT NOT NULL,
  telegram_message_id BIGINT,
  duration_seconds INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by VARCHAR(255),
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS verification_submissions_user_idx
  ON verification_submissions (user_id);

CREATE INDEX IF NOT EXISTS verification_submissions_status_idx
  ON verification_submissions (status) WHERE status = 'pending';

-- One open submission per user, enforced by the database rather than by handler logic, so a
-- second video note can never create a second queue entry.
CREATE UNIQUE INDEX IF NOT EXISTS verification_submissions_one_pending_per_user
  ON verification_submissions (user_id) WHERE status = 'pending';

COMMIT;
