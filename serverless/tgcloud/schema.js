import {
  boolean,
  check,
  index,
  integer,
  json,
  sql,
  table,
  text,
  unique,
  uniqueIndex,
} from 'sdk/db';

// LibMatch SQLite schema for Telegram Serverless.
//
// Mirrors `backend/src/db/schema.sql` (PostgreSQL) in two groups:
//   1. BOT TABLES (used right now) — everything the handlers/lib in this
//      project read and write: users mirror, photos, verification requests,
//      notifications log, flags.
//   2. APP MIRROR TABLES (reserved) — same names/shapes as Postgres so future
//      `endpoints/` can take over Mini App features step by step. Nothing
//      writes them yet except through the bridge to the main LibMatch API.
//
// Notes:
// - No foreign keys: the platform throws on `.references()`/`foreignKey()`.
//   `userId`-style columns are LOGICAL links; integrity is enforced in code.
// - Timestamps are INTEGER unix seconds (`mode: 'timestamp'`) -> JS `Date`.
// - `updatedAt` has no trigger here; lib code sets it explicitly on updates.

const nowDefault = () => sql`(unixepoch())`;

function timestamps() {
  return {
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(nowDefault()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(nowDefault()),
  };
}

// ---------------------------------------------------------------------------
// 1. BOT TABLES
// ---------------------------------------------------------------------------

export const users = table(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tgId: integer('tg_id').notNull().unique(),
    username: text('telegram_username'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    photoUrl: text('photo_url'),
    languageCode: text('language_code'),

    name: text('name'),
    age: integer('age'),
    gender: text('gender'),
    bio: text('bio'),
    city: text('city'),
    country: text('country'),
    email: text('email'),

    onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
    isVerified: boolean('is_verified').notNull().default(false),
    isVip: boolean('is_vip').notNull().default(false),
    vipExpiresAt: integer('vip_expires_at', { mode: 'timestamp' }),
    vipGrantedReason: text('vip_granted_reason'),
    isActive: boolean('is_active').notNull().default(true),

    results: json('results'),
    profileScore: integer('profile_score'),
    profileScoreReady: boolean('profile_score_ready').notNull().default(false),
    additionalInfo: json('additional_info').notNull().default({}),
    settings: json('settings').notNull().default({ notificationsEnabled: true }),
    lastActiveAt: integer('last_active_at', { mode: 'timestamp' })
      .notNull()
      .default(nowDefault()),
    conversionCompleted: boolean('conversion_completed').notNull().default(false),
    promoCode: text('promo_code'),
    discountPercent: integer('discount_percent'),
    verificationStatus: text('verification_status').notNull().default('none'),

    ...timestamps(),
  },
  (t) => ({
    ageCheck: check('users_age_check', sql`age IS NULL OR age >= 18`),
    scoreCheck: check(
      'users_profile_score_check',
      sql`profile_score IS NULL OR (profile_score BETWEEN 0 AND 100)`,
    ),
    verificationCheck: check(
      'users_verification_check',
      sql`verification_status IN ('none', 'pending', 'verified')`,
    ),
    discoveryIdx: index('users_discovery_idx').on(t.isActive, t.onboardingCompleted, t.city),
  }),
);

export const photos = table(
  'photos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    url: text('url').notNull(),
    publicId: text('cloudinary_public_id'),
    orderIndex: integer('order_index').notNull().default(0),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(nowDefault()),
  },
  (t) => ({
    userIdx: index('photos_user_idx').on(t.userId, t.createdAt),
    userOrderIdx: index('photos_user_order_idx').on(t.userId, t.orderIndex, t.createdAt),
    // One primary photo per user is enforced in code (keeps the schema portable).
  }),
);

export const verificationRequests = table(
  'verification_requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    fileId: text('telegram_file_id'),
    status: text('status').notNull().default('pending'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(nowDefault()),
  },
  (t) => ({
    userFileUq: unique('verification_requests_user_file_uq').on(t.userId, t.fileId),
    statusCheck: check(
      'verification_requests_status_check',
      sql`status IN ('pending', 'verified', 'rejected')`,
    ),
    userIdx: index('verification_requests_user_idx').on(t.userId, t.createdAt),
  }),
);

export const notificationsLog = table(
  'notifications_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    type: text('notification_type').notNull(),
    relatedUserId: integer('related_user_id'),
    messageId: integer('telegram_message_id'),
    sentAt: integer('sent_at', { mode: 'timestamp' }).notNull().default(nowDefault()),
  },
  (t) => ({
    userIdx: index('notifications_user_idx').on(t.userId, t.sentAt),
    typeIdx: index('notifications_type_idx').on(t.type, t.sentAt),
  }),
);

// Tiny key/value store for one-time bot setup (menu button, future flags).
export const flags = table('flags', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(nowDefault()),
});

// ---------------------------------------------------------------------------
// 2. APP MIRROR TABLES (reserved for future endpoint migration)
// ---------------------------------------------------------------------------

export const onboardingAnswers = table(
  'onboarding_answers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    questionKey: text('question_key').notNull(),
    answerValue: json('answer_value').notNull(),
    ...timestamps(),
  },
  (t) => ({
    userQuestionUq: unique('onboarding_answers_user_question_uq').on(t.userId, t.questionKey),
    userIdx: index('onboarding_answers_user_idx').on(t.userId),
  }),
);

export const onboardingProgress = table('onboarding_progress', {
  userId: integer('user_id').primaryKey(),
  currentStepKey: text('current_step_key').notNull().default('gender'),
  currentStepIndex: integer('current_step_index').notNull().default(0),
  completed: boolean('completed').notNull().default(false),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(nowDefault()),
});

export const swipes = table(
  'swipes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    profileId: text('profile_id').notNull(),
    action: text('action').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(nowDefault()),
  },
  (t) => ({
    userProfileUq: unique('swipes_user_profile_uq').on(t.userId, t.profileId),
    actionCheck: check('swipes_action_check', sql`action IN ('pass', 'like', 'super_like')`),
    userIdx: index('swipes_user_idx').on(t.userId, t.createdAt),
  }),
);

export const matches = table(
  'matches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    profileId: text('profile_id').notNull(),
    user1Id: integer('user1_id'),
    user2Id: integer('user2_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(nowDefault()),
  },
  (t) => ({
    // SQLite treats NULLs as distinct in unique indexes, matching the
    // Postgres partial unique index on (user1_id, user2_id).
    userPairUq: uniqueIndex('matches_user_pair_unique_idx').on(t.user1Id, t.user2Id),
    user1Idx: index('matches_user1_idx').on(t.user1Id),
    user2Idx: index('matches_user2_idx').on(t.user2Id),
  }),
);

export const messages = table(
  'messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    matchId: integer('match_id').notNull(),
    sender: text('sender').notNull(),
    body: text('body').notNull(),
    senderUserId: integer('sender_user_id'),
    deliveredAt: integer('delivered_at', { mode: 'timestamp' }),
    readAt: integer('read_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(nowDefault()),
  },
  (t) => ({
    senderCheck: check('messages_sender_check', sql`sender IN ('user', 'profile')`),
    matchIdx: index('messages_match_idx').on(t.matchId, t.createdAt),
    matchLatestIdx: index('messages_match_latest_idx').on(t.matchId, t.createdAt),
    senderUserIdx: index('messages_sender_user_idx').on(t.senderUserId, t.createdAt),
    unreadIdx: index('messages_unread_idx').on(t.matchId, t.readAt).where(sql`read_at IS NULL`),
  }),
);

export const giftTransactions = table(
  'gift_transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    profileId: text('profile_id').notNull(),
    giftId: text('gift_id').notNull(),
    stars: integer('stars').notNull(),
    clientRef: text('client_ref').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(nowDefault()),
  },
  (t) => ({
    userRefUq: unique('gift_transactions_user_ref_uq').on(t.userId, t.clientRef),
    starsCheck: check('gift_transactions_stars_check', sql`stars > 0`),
  }),
);

export const premiumOrders = table('premium_orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  planId: text('plan_id').notNull(),
  promoCode: text('promo_code'),
  discountPercent: integer('discount_percent').notNull().default(0),
  status: text('status').notNull().default('fulfilled_demo'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(nowDefault()),
});

export const aiPicksSessions = table(
  'ai_picks_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    sessionDate: text('session_date').notNull().default(sql`(date('now'))`),
    picksShown: integer('picks_shown').notNull().default(0),
    picksLimit: integer('picks_limit').notNull().default(5),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(nowDefault()),
  },
  (t) => ({
    userDateUq: unique('ai_picks_sessions_user_date_uq').on(t.userId, t.sessionDate),
    shownCheck: check('ai_picks_sessions_shown_check', sql`picks_shown >= 0`),
    limitCheck: check('ai_picks_sessions_limit_check', sql`picks_limit > 0`),
    userDateIdx: index('ai_picks_user_date_idx').on(t.userId, t.sessionDate),
  }),
);

export const aiPickItems = table(
  'ai_pick_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id').notNull(),
    pickedUserId: integer('picked_user_id').notNull(),
    compatibilityScore: integer('compatibility_score').notNull(),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(nowDefault()),
  },
  (t) => ({
    sessionPickUq: unique('ai_pick_items_session_pick_uq').on(t.sessionId, t.pickedUserId),
    sessionOrderUq: unique('ai_pick_items_session_order_uq').on(t.sessionId, t.orderIndex),
    scoreCheck: check(
      'ai_pick_items_score_check',
      sql`compatibility_score BETWEEN 0 AND 100`,
    ),
    orderCheck: check('ai_pick_items_order_check', sql`order_index >= 0`),
    sessionIdx: index('ai_pick_items_session_idx').on(t.sessionId),
  }),
);

export const profileBoosts = table(
  'profile_boosts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull(),
    startedAt: integer('started_at', { mode: 'timestamp' }).notNull().default(nowDefault()),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => ({
    userIdx: index('profile_boosts_user_idx').on(t.userId),
    activeIdx: index('profile_boosts_active_idx').on(t.isActive, t.expiresAt),
    userExpiryIdx: index('profile_boosts_user_expiry_idx').on(t.userId, t.expiresAt),
  }),
);

export const userPresence = table('user_presence', {
  userId: integer('user_id').primaryKey(),
  isOnline: boolean('is_online').notNull().default(false),
  socketId: text('socket_id'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }).notNull().default(nowDefault()),
});
