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
