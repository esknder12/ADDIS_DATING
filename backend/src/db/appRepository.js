import { getMember, memberCatalog, seededOrder } from '@dategram/shared/catalog';

function unavailable() {
  throw new Error('Database is not configured');
}

/** Never leak match outcome or canned copy ahead of a swipe. */
export function publicMember(member) {
  return {
    id: member.id,
    name: member.name,
    emoji: member.emoji,
    age: member.age,
    city: member.city,
    country: member.country,
    distanceKm: member.distanceKm,
    bio: member.bio,
    intention: member.intention,
    interests: member.interests,
    photo: member.photo,
    verified: member.verified,
    likesYou: member.likesYou,
  };
}

function mapMessage(row) {
  return {
    id: String(row.id),
    sender: row.sender,
    body: row.body,
    createdAt: row.created_at,
  };
}

async function userIdFor(client, telegramId) {
  const result = await client.query(
    'SELECT id FROM users WHERE telegram_id = $1 AND is_active = TRUE',
    [telegramId],
  );
  return result.rows[0]?.id ?? null;
}

export function createAppRepository(pool) {
  if (!pool) {
    return {
      isAvailable: false,
      saveConversion: unavailable,
      applyDiscount: unavailable,
      listDiscover: unavailable,
      saveSwipe: unavailable,
      rewindLastSwipe: unavailable,
      listLikes: unavailable,
      listMatches: unavailable,
      listMessages: unavailable,
      addMessage: unavailable,
      sendGift: unavailable,
      activatePremium: unavailable,
      requestVerification: unavailable,
      submitVerificationVideo: unavailable,
    };
  }

  async function saveConversion(telegramId, { results, email, name }) {
    const result = await pool.query(
      `UPDATE users SET
        results = $2::jsonb,
        email = COALESCE($3, email),
        name = $4,
        conversion_completed = TRUE
      WHERE telegram_id = $1 AND is_active = TRUE
      RETURNING id`,
      [telegramId, JSON.stringify(results), email, name],
    );
    return result.rows.length > 0 ? { saved: true } : null;
  }

  async function applyDiscount(telegramId, { promoCode, percent }) {
    const result = await pool.query(
      `UPDATE users SET promo_code = $2, discount_percent = $3
       WHERE telegram_id = $1 AND is_active = TRUE
       RETURNING id`,
      [telegramId, promoCode, percent],
    );
    return result.rows.length > 0 ? { saved: true } : null;
  }

  async function listSwipedIds(telegramId) {
    const result = await pool.query(
      `SELECT s.profile_id FROM swipes s
       JOIN users u ON u.id = s.user_id
       WHERE u.telegram_id = $1 AND u.is_active = TRUE`,
      [telegramId],
    );
    return new Set(result.rows.map((row) => row.profile_id));
  }

  async function listDiscover(telegramId) {
    const swiped = await listSwipedIds(telegramId);
    return seededOrder(memberCatalog, `${telegramId}:discover`)
      .filter((member) => !swiped.has(member.id))
      .map(publicMember);
  }

  async function saveSwipe(telegramId, profileId, action) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userId = await userIdFor(client, telegramId);
      if (!userId) {
        await client.query('ROLLBACK');
        return null;
      }

      await client.query(
        `INSERT INTO swipes (user_id, profile_id, action)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, profile_id) DO UPDATE SET
           action = EXCLUDED.action,
           created_at = NOW()`,
        [userId, profileId, action],
      );

      // Mutual-like safety invariant: a match exists only when both sides agree.
      const member = getMember(profileId);
      let matched = false;
      if ((action === 'like' || action === 'super_like') && member?.likesYouBack) {
        await client.query(
          `INSERT INTO matches (user_id, profile_id)
           VALUES ($1, $2)
           ON CONFLICT (user_id, profile_id) DO NOTHING`,
          [userId, profileId],
        );
        matched = true;
      }

      await client.query('COMMIT');
      return { matched, profile: publicMember(member) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function rewindLastSwipe(telegramId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userId = await userIdFor(client, telegramId);
      if (!userId) {
        await client.query('ROLLBACK');
        return null;
      }

      const lastSwipe = await client.query(
        `SELECT id, profile_id, action FROM swipes
         WHERE user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 1
         FOR UPDATE`,
        [userId],
      );
      if (lastSwipe.rows.length === 0) {
        await client.query('ROLLBACK');
        return { restored: null };
      }

      const swipe = lastSwipe.rows[0];
      await client.query('DELETE FROM swipes WHERE id = $1', [swipe.id]);
      // Rewinding the like also rewinds the match it created.
      if (swipe.action !== 'pass') {
        await client.query(
          'DELETE FROM matches WHERE user_id = $1 AND profile_id = $2',
          [userId, swipe.profile_id],
        );
      }

      await client.query('COMMIT');
      return { restored: swipe.profile_id };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function listMatchesFor(client, userId) {
    const result = await client.query(
      `SELECT m.id AS match_id, m.profile_id, m.created_at,
              (SELECT body FROM messages WHERE match_id = m.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM messages WHERE match_id = m.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message_at
       FROM matches m
       WHERE m.user_id = $1
       ORDER BY m.created_at DESC`,
      [userId],
    );
    return result.rows;
  }

  function mapMatchRow(row) {
    const member = getMember(row.profile_id);
    return {
      id: String(row.match_id),
      profile: member ? publicMember(member) : { id: row.profile_id, name: 'Unknown', age: null, photo: null, verified: false },
      createdAt: row.created_at,
      lastMessage: row.last_message
        ? { body: row.last_message, createdAt: row.last_message_at }
        : null,
    };
  }

  async function listLikes(telegramId) {
    const swiped = await listSwipedIds(telegramId);
    const client = await pool.connect();
    try {
      const userId = await userIdFor(client, telegramId);
      if (!userId) return null;
      const matchRows = await listMatchesFor(client, userId);
      const matchProfileIds = new Set(matchRows.map((row) => row.profile_id));

      return {
        likedYou: memberCatalog
          .filter((member) => member.likesYou && !swiped.has(member.id) && !matchProfileIds.has(member.id))
          .map(publicMember),
        matches: matchRows.map(mapMatchRow),
      };
    } finally {
      client.release();
    }
  }

  async function listMatches(telegramId) {
    const client = await pool.connect();
    try {
      const userId = await userIdFor(client, telegramId);
      if (!userId) return null;
      const rows = await listMatchesFor(client, userId);
      return rows.map(mapMatchRow);
    } finally {
      client.release();
    }
  }

  async function ownedMatchId(client, telegramId, matchId) {
    const numericId = Number(matchId);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) return null;
    const result = await client.query(
      `SELECT m.id FROM matches m
       JOIN users u ON u.id = m.user_id
       WHERE m.id = $1 AND u.telegram_id = $2 AND u.is_active = TRUE
       LIMIT 1`,
      [numericId, telegramId],
    );
    return result.rows[0]?.id ?? null;
  }

  async function listMessages(telegramId, matchId) {
    const client = await pool.connect();
    try {
      const owned = await ownedMatchId(client, telegramId, matchId);
      if (!owned) return null;
      const result = await client.query(
        `SELECT id, sender, body, created_at FROM messages
         WHERE match_id = $1
         ORDER BY created_at ASC, id ASC
         LIMIT 500`,
        [owned],
      );
      return result.rows.map(mapMessage);
    } finally {
      client.release();
    }
  }

  async function addMessage(telegramId, matchId, body) {
    const client = await pool.connect();
    try {
      // Safety invariant enforced server-side: no match row owned by this
      // user, no message (implementation rule 11).
      const owned = await ownedMatchId(client, telegramId, matchId);
      if (!owned) return null;
      const result = await client.query(
        `INSERT INTO messages (match_id, sender, body)
         VALUES ($1, 'user', $2)
         RETURNING id, sender, body, created_at`,
        [owned, body],
      );
      return mapMessage(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async function sendGift(telegramId, profileId, gift, clientRef) {
    // Idempotent on (user_id, client_ref): optimistic retries/network replays
    // can never double-charge (implementation rule 14). Production fulfillment
    // must be confirmed via the Telegram Stars invoice flow before granting.
    const result = await pool.query(
      `INSERT INTO gift_transactions (user_id, profile_id, gift_id, stars, client_ref)
       SELECT u.id, $2, $3, $4, $5
       FROM users u
       WHERE u.telegram_id = $1 AND u.is_active = TRUE
       ON CONFLICT (user_id, client_ref) DO UPDATE SET stars = gift_transactions.stars
       RETURNING id, profile_id, gift_id, stars, created_at`,
      [telegramId, profileId, gift.id, gift.stars, clientRef],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: String(row.id),
      profileId: row.profile_id,
      giftId: row.gift_id,
      stars: row.stars,
      createdAt: row.created_at,
    };
  }

  async function activatePremium(telegramId, { plan, promoCode, percent }) {
    const result = await pool.query(
      `UPDATE users SET
        is_vip = TRUE,
        promo_code = COALESCE($2, promo_code),
        discount_percent = COALESCE($3, discount_percent)
       WHERE telegram_id = $1 AND is_active = TRUE
       RETURNING id`,
      [telegramId, promoCode, percent],
    );
    if (result.rows.length === 0) return null;

    await pool.query(
      `INSERT INTO premium_orders (user_id, plan_id, promo_code, discount_percent, status)
       VALUES ($1, $2, $3, $4, 'fulfilled_demo')`,
      [result.rows[0].id, plan.id, promoCode, percent ?? 0],
    );
    return { activated: true, planId: plan.id, promoCode, discountPercent: percent ?? 0 };
  }

  async function requestVerification(telegramId) {
    const result = await pool.query(
      `UPDATE users SET verification_status = 'pending'
       WHERE telegram_id = $1 AND is_active = TRUE AND verification_status = 'none'
       RETURNING id`,
      [telegramId],
    );
    return { status: result.rows.length > 0 ? 'pending' : 'unchanged' };
  }

  async function submitVerificationVideo(telegramId, telegramFileId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userId = await userIdFor(client, telegramId);
      if (!userId) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query(
        `INSERT INTO verification_requests (user_id, telegram_file_id, status)
         VALUES ($1, $2, 'pending')
         ON CONFLICT (user_id, telegram_file_id) DO NOTHING`,
        [userId, telegramFileId],
      );
      await client.query(
        `UPDATE users SET verification_status = 'pending'
         WHERE id = $1 AND verification_status != 'verified'`,
        [userId],
      );
      await client.query('COMMIT');
      return { recorded: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    isAvailable: true,
    saveConversion,
    applyDiscount,
    listDiscover,
    saveSwipe,
    rewindLastSwipe,
    listLikes,
    listMatches,
    listMessages,
    addMessage,
    sendGift,
    activatePremium,
    requestVerification,
    submitVerificationVideo,
  };
}
