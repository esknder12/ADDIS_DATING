-- Development-only fixture profiles for discovery, swipe, and match testing.
-- Run this manually after the schema is initialized; do not load it in production.
BEGIN;

WITH seed_profiles (
  telegram_id, name, age, gender, city, country, bio, is_verified, photo_url
) AS (
  VALUES
    (990000000001::bigint, 'Rodas', 19::smallint, 'female', 'Addis Ababa', 'Ethiopia', 'Architecture student. Sunday coffee rituals, long walks around Kazanchis, and conversations that skip the small talk.', TRUE,  '/images/profiles/p01.jpg'),
    (990000000002::bigint, 'Hiwot', 24::smallint, 'female', 'Addis Ababa', 'Ethiopia', 'Nurse and amateur photographer. Looking for something real — patience, honesty, and someone who laughs easily.', TRUE,  '/images/profiles/p02.jpg'),
    (990000000003::bigint, 'Meron', 26::smallint, 'female', 'Addis Ababa', 'Ethiopia', 'Product designer by day, injera perfectionist by night. Here for intention, not endless chats.', FALSE, '/images/profiles/p03.jpg'),
    (990000000004::bigint, 'Selam', 23::smallint, 'female', 'Addis Ababa', 'Ethiopia', 'Med student. Quiet bars over loud clubs, deep playlists, and people who keep their word.', TRUE,  '/images/profiles/p04.jpg'),
    (990000000005::bigint, 'Betelhem', 28::smallint, 'female', 'Addis Ababa', 'Ethiopia', 'Lawyer. Direct, warm, and allergic to ghosting. If you can make me laugh, we’re already halfway there.', FALSE, '/images/profiles/p05.jpg'),
    (990000000006::bigint, 'Mahlet', 25::smallint, 'female', 'Addis Ababa', 'Ethiopia', 'DJ on weekends, accountant on weekdays. Looking for my plus-one for concerts and quiet dinners both.', TRUE,  '/images/profiles/p06.jpg'),
    (990000000007::bigint, 'Tsion', 27::smallint, 'female', 'Addis Ababa', 'Ethiopia', 'Teacher and bookshop regular. Believe in slow dating: good conversation first, everything else follows.', TRUE,  '/images/profiles/p07.jpg'),
    (990000000008::bigint, 'Liya', 22::smallint, 'female', 'Addis Ababa', 'Ethiopia', 'Runner, early riser, sunshine collector. Here to meet someone kind who shows up when they say they will.', FALSE, '/images/profiles/p08.jpg')
)
INSERT INTO users (
  telegram_id, name, age, gender, city, country, bio,
  onboarding_completed, is_verified, is_active, photo_url
)
SELECT telegram_id, name, age, gender, city, country, bio,
       TRUE, is_verified, TRUE, photo_url
FROM seed_profiles
ON CONFLICT (telegram_id) DO UPDATE SET
  name = EXCLUDED.name,
  age = EXCLUDED.age,
  gender = EXCLUDED.gender,
  city = EXCLUDED.city,
  country = EXCLUDED.country,
  bio = EXCLUDED.bio,
  onboarding_completed = TRUE,
  is_verified = EXCLUDED.is_verified,
  is_active = TRUE,
  photo_url = EXCLUDED.photo_url;

DELETE FROM photos
WHERE user_id IN (
  SELECT id FROM users WHERE telegram_id BETWEEN 990000000001 AND 990000000008
);

WITH seed_photos (telegram_id, url) AS (
  VALUES
    (990000000001::bigint, '/images/profiles/p01.jpg'),
    (990000000002::bigint, '/images/profiles/p02.jpg'),
    (990000000003::bigint, '/images/profiles/p03.jpg'),
    (990000000004::bigint, '/images/profiles/p04.jpg'),
    (990000000005::bigint, '/images/profiles/p05.jpg'),
    (990000000006::bigint, '/images/profiles/p06.jpg'),
    (990000000007::bigint, '/images/profiles/p07.jpg'),
    (990000000008::bigint, '/images/profiles/p08.jpg')
)
INSERT INTO photos (user_id, url, is_primary)
SELECT u.id, seed_photos.url, TRUE
FROM seed_photos
JOIN users u ON u.telegram_id = seed_photos.telegram_id;

WITH seed_answers (telegram_id, question_key, answer_value) AS (
  VALUES
    (990000000001::bigint, 'looking_for', '["serious_relationship"]'::jsonb),
    (990000000002::bigint, 'looking_for', '["serious_relationship"]'::jsonb),
    (990000000003::bigint, 'looking_for', '["dating_and_seeing"]'::jsonb),
    (990000000004::bigint, 'looking_for', '["serious_relationship"]'::jsonb),
    (990000000005::bigint, 'looking_for', '["dating_and_seeing"]'::jsonb),
    (990000000006::bigint, 'looking_for', '["online_communication"]'::jsonb),
    (990000000007::bigint, 'looking_for', '["serious_relationship"]'::jsonb),
    (990000000008::bigint, 'looking_for', '["dating_and_seeing"]'::jsonb)
)
INSERT INTO onboarding_answers (user_id, question_key, answer_value)
SELECT u.id, seed_answers.question_key, seed_answers.answer_value
FROM seed_answers
JOIN users u ON u.telegram_id = seed_answers.telegram_id
ON CONFLICT (user_id, question_key) DO UPDATE SET
  answer_value = EXCLUDED.answer_value;

COMMIT;
