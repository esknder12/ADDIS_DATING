function mapUser(row) {
  if (!row) return null;

  return {
    id: String(row.id),
    telegramId: String(row.telegram_id),
    username: row.telegram_username,
    firstName: row.first_name,
    lastName: row.last_name,
    photoUrl: row.photo_url,
    languageCode: row.language_code,
    name: row.name,
    age: row.age,
    gender: row.gender,
    email: row.email || null,
    city: row.city,
    country: row.country,
    onboardingCompleted: row.onboarding_completed,
    isVerified: row.is_verified,
    isVip: row.is_vip,
    resultsCompleted: Boolean(row.results_completed),
    resultsViewedAt: row.results_viewed_at || null,
    profileScore: row.profile_score ?? null,
    scoreTier: row.score_tier || null,
    datingStyle: row.dating_style || null,
    matchPoolCount: row.match_pool_count ?? null,
    responseRateMultiplier: row.response_rate_multiplier === null || row.response_rate_multiplier === undefined
      ? null
      : Number(row.response_rate_multiplier),
    promoCode: row.promo_code || null,
    promoDiscountPercent: row.promo_discount_percent ?? null,
    createdAt: row.created_at,
  };
}

export function createUserRepository(pool) {
  if (!pool) {
    return {
      isAvailable: false,
      async upsertTelegramUser() {
        throw new Error('Database is not configured');
      },
      async findByTelegramId() {
        throw new Error('Database is not configured');
      },
    };
  }

  return {
    isAvailable: true,

    async upsertTelegramUser(telegramUser) {
      const result = await pool.query(
        `INSERT INTO users (
          telegram_id,
          telegram_username,
          first_name,
          last_name,
          photo_url,
          language_code
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (telegram_id) DO UPDATE SET
          telegram_username = EXCLUDED.telegram_username,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          photo_url = EXCLUDED.photo_url,
          language_code = EXCLUDED.language_code
        RETURNING *`,
        [
          telegramUser.id,
          telegramUser.username || null,
          telegramUser.first_name || null,
          telegramUser.last_name || null,
          telegramUser.photo_url || null,
          telegramUser.language_code || null,
        ],
      );

      return mapUser(result.rows[0]);
    },

    async findByTelegramId(telegramId) {
      const result = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1 AND is_active = TRUE LIMIT 1',
        [telegramId],
      );
      return mapUser(result.rows[0]);
    },
  };
}

export { mapUser };
