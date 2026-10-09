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
  profile_score SMALLINT CHECK (profile_score IS NULL OR profile_score BETWEEN 0 AND 100),
  profile_score_ready BOOLEAN NOT NULL DEFAULT FALSE,
  additional_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings JSONB NOT NULL DEFAULT '{"notificationsEnabled": true}'::jsonb,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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

-- Profile photos are separate from Telegram account avatars. The primary image
-- is used for discovery cards; users.photo_url remains the safe fallback.
CREATE TABLE IF NOT EXISTS photos (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  cloudinary_public_id TEXT,
  order_index INTEGER NOT NULL DEFAULT 0 CHECK (order_index >= 0),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE photos ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS photos_user_idx ON photos (user_id, created_at);
CREATE INDEX IF NOT EXISTS photos_user_order_idx ON photos (user_id, order_index, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS photos_one_primary_per_user_idx
  ON photos (user_id) WHERE is_primary = TRUE;

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
ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_granted_reason VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_score SMALLINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_score_ready BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS additional_info JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{"notificationsEnabled": true}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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

-- Real member-to-member matches are one shared conversation row, visible to
-- both users. Keep user_id/profile_id for compatibility with early demo rows.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS user1_id BIGINT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS user2_id BIGINT REFERENCES users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS matches_user_pair_unique_idx
  ON matches (user1_id, user2_id)
  WHERE user1_id IS NOT NULL AND user2_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS matches_user1_idx ON matches (user1_id) WHERE user1_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS matches_user2_idx ON matches (user2_id) WHERE user2_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender VARCHAR(16) NOT NULL CHECK (sender IN ('user', 'profile')),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- sender_user_id lets both participants share the same real conversation while
-- retaining the sender enum used by the original seeded demo conversations.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS messages_match_idx ON messages (match_id, created_at);
CREATE INDEX IF NOT EXISTS messages_match_latest_idx ON messages (match_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS messages_sender_user_idx ON messages (sender_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_unread_idx ON messages (match_id, read_at)
  WHERE read_at IS NULL;

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

-- Phase 6: a stable daily curated selection with persisted order and scores.
CREATE TABLE IF NOT EXISTS ai_picks_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  picks_shown INTEGER NOT NULL DEFAULT 0 CHECK (picks_shown >= 0),
  picks_limit INTEGER NOT NULL DEFAULT 5 CHECK (picks_limit > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, session_date)
);

CREATE INDEX IF NOT EXISTS ai_picks_user_date_idx
  ON ai_picks_sessions (user_id, session_date);

CREATE TABLE IF NOT EXISTS ai_pick_items (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES ai_picks_sessions(id) ON DELETE CASCADE,
  picked_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  compatibility_score SMALLINT NOT NULL CHECK (compatibility_score BETWEEN 0 AND 100),
  order_index INTEGER NOT NULL DEFAULT 0 CHECK (order_index >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, picked_user_id),
  UNIQUE (session_id, order_index)
);

CREATE INDEX IF NOT EXISTS ai_pick_items_session_idx ON ai_pick_items (session_id);

-- Phase 7: bot re-engagement, active profile boosts, and VIP grants.
CREATE TABLE IF NOT EXISTS notifications_log (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  related_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  telegram_message_id BIGINT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications_log (user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS notifications_type_idx ON notifications_log (notification_type, sent_at DESC);

CREATE TABLE IF NOT EXISTS profile_boosts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS profile_boosts_user_idx ON profile_boosts (user_id);
CREATE INDEX IF NOT EXISTS profile_boosts_active_idx ON profile_boosts (is_active, expires_at);
CREATE INDEX IF NOT EXISTS profile_boosts_user_expiry_idx
  ON profile_boosts (user_id, expires_at DESC) WHERE is_active = TRUE;

-- Phase 8: authenticated real-time presence and message delivery/read receipts.
CREATE TABLE IF NOT EXISTS user_presence (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  socket_id VARCHAR(255),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
