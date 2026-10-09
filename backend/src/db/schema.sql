BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  telegram_username VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  photo_url TEXT,
  language_code VARCHAR(16),

  -- Profile fields completed during onboarding.
  name VARCHAR(255),
  age SMALLINT CHECK (age IS NULL OR age >= 18),
  gender VARCHAR(32),
  bio TEXT,
  city VARCHAR(255),
  country VARCHAR(255),
  email VARCHAR(320),

  -- Account state.
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_vip BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Phase 3 conversion results (score is always recomputed server-side).
  results JSONB,
  conversion_completed BOOLEAN NOT NULL DEFAULT FALSE,
  promo_code VARCHAR(64),
  discount_percent SMALLINT,
  verification_status VARCHAR(16) NOT NULL DEFAULT 'none'
    CHECK (verification_status IN ('none', 'pending', 'verified')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_telegram_id_idx ON users (telegram_id);
CREATE INDEX IF NOT EXISTS users_discovery_idx
  ON users (is_active, onboarding_completed, city)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS onboarding_answers (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_key VARCHAR(96) NOT NULL,
  answer_value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, question_key)
);

CREATE INDEX IF NOT EXISTS onboarding_answers_user_idx
  ON onboarding_answers (user_id);

CREATE TABLE IF NOT EXISTS onboarding_progress (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_step_key VARCHAR(96) NOT NULL DEFAULT 'gender',
  current_step_index INTEGER NOT NULL DEFAULT 0 CHECK (current_step_index >= 0),
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS results JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS conversion_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS promo_code VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS discount_percent SMALLINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status VARCHAR(16) NOT NULL DEFAULT 'none';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;

-- Phase 4: discovery, matching, chat, gifts, premium, verification.
CREATE TABLE IF NOT EXISTS swipes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id VARCHAR(64) NOT NULL,
  action VARCHAR(16) NOT NULL CHECK (action IN ('pass', 'like', 'super_like')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, profile_id)
);

CREATE INDEX IF NOT EXISTS swipes_user_idx ON swipes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS matches (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, profile_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender VARCHAR(16) NOT NULL CHECK (sender IN ('user', 'profile')),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_match_idx ON messages (match_id, created_at);

CREATE TABLE IF NOT EXISTS gift_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id VARCHAR(64) NOT NULL,
  gift_id VARCHAR(32) NOT NULL,
  stars INTEGER NOT NULL CHECK (stars > 0),
  client_ref VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, client_ref)
);

CREATE TABLE IF NOT EXISTS premium_orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id VARCHAR(32) NOT NULL,
  promo_code VARCHAR(64),
  discount_percent SMALLINT NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'fulfilled_demo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verification_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_file_id VARCHAR(255),
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, telegram_file_id)
);

CREATE INDEX IF NOT EXISTS verification_requests_user_idx
  ON verification_requests (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS onboarding_answers_set_updated_at ON onboarding_answers;
CREATE TRIGGER onboarding_answers_set_updated_at
BEFORE UPDATE ON onboarding_answers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS onboarding_progress_set_updated_at ON onboarding_progress;
CREATE TRIGGER onboarding_progress_set_updated_at
BEFORE UPDATE ON onboarding_progress
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
