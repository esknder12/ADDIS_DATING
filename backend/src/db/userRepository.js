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
    bio: row.bio,
    city: row.city,
    country: row.country,
    email: row.email,
    results: row.results || null,
    conversionCompleted: Boolean(row.conversion_completed),
    promoCode: row.promo_code || null,
    discountPercent: row.discount_percent ?? null,
    verificationStatus: row.verification_status || 'none',
    onboardingCompleted: row.onboarding_completed,
    isVerified: row.is_verified,
    isVip: Boolean(row.is_vip)
      && (!row.vip_expires_at || new Date(row.vip_expires_at).getTime() > Date.now()),
    vipExpiresAt: row.vip_expires_at || null,
    vipGrantedReason: row.vip_granted_reason || null,
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
