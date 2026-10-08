-- Phase 3: post-onboarding results and the scratch-card discount.
BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_score SMALLINT
    CHECK (profile_score IS NULL OR (profile_score BETWEEN 0 AND 100)),
  ADD COLUMN IF NOT EXISTS score_tier VARCHAR(16),
  ADD COLUMN IF NOT EXISTS answers_hash CHAR(32),
  ADD COLUMN IF NOT EXISTS match_pool_count INTEGER,
  ADD COLUMN IF NOT EXISTS dating_style VARCHAR(50),
  ADD COLUMN IF NOT EXISTS response_rate_multiplier NUMERIC(3, 1),
  ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS promo_discount_percent SMALLINT,
  ADD COLUMN IF NOT EXISTS results_viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS results_completed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.answers_hash IS
  'Fingerprint of the canonical answer set the stored profile_score was computed from.';
COMMENT ON COLUMN users.results_completed IS
  'TRUE once the Phase 3 conversion flow (results, email, name, plan, discount) finished.';

CREATE TABLE IF NOT EXISTS promo_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code CITEXT NOT NULL UNIQUE,
  discount_percent SMALLINT NOT NULL CHECK (discount_percent BETWEEN 1 AND 100),
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promo_codes_user_idx ON promo_codes (user_id);

COMMIT;
