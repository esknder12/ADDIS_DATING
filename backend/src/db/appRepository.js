import { getMember } from '@dategram/shared/catalog';

const DEFAULT_PROFILE_PHOTO = '/images/onboarding-professional.jpg';
export const FREE_DAILY_AI_PICKS_LIMIT = 5;
export const VIP_DAILY_AI_PICKS_LIMIT = 15;
const AGE_RANGES = Object.freeze({
  '18_24': [18, 24],
  '25_30': [25, 30],
  '30_38': [30, 38],
  '38_plus': [38, 120],
});
const INTENTION_LABELS = Object.freeze({
  serious_relationship: 'Serious relationship',
  dating_and_seeing: 'Dating & seeing where it goes',
  online_communication: 'Online communication',
  not_sure: 'Not sure yet',
});

function unavailable() {
  throw new Error('Database is not configured');
}

export function ageRangeForPreference(preference) {
  return AGE_RANGES[preference] || [18, 120];
}

function intentionFor(value) {
  const selected = Array.isArray(value) ? value[0] : value;
  return INTENTION_LABELS[selected] || (typeof selected === 'string' ? selected : '');
}

/** Public profile shape shared by real database users and the browser demo. */
export function publicMember(member) {
  return {
    id: String(member.id),
    name: member.name || 'Dategram member',
    emoji: member.emoji || '',
    age: member.age ?? null,
    city: member.city || '',
    country: member.country || '',
    distanceKm: member.distanceKm ?? null,
    bio: member.bio || '',
    intention: member.intention || '',
    interests: Array.isArray(member.interests) ? member.interests : [],
    photo: member.photo || DEFAULT_PROFILE_PHOTO,
    verified: Boolean(member.verified),
  };
}

function mapDatabaseProfile(row) {
  return publicMember({
    id: row.id ?? row.profile_id,
    name: row.name || row.first_name,
    age: row.age,
    city: row.city,
    country: row.country,
    bio: row.bio,
    intention: intentionFor(row.looking_for),
    interests: row.interests,
    photo: row.profile_photo_url || row.photo_url || row.photo,
    verified: row.is_verified,
  });
}

function mapMessage(row, currentUserId = null) {
  const sender = row.sender_user_id == null
    ? row.sender
    : String(row.sender_user_id) === String(currentUserId) ? 'user' : 'profile';
  return {
    id: String(row.id),
    ...(row.match_id == null ? {} : { matchId: String(row.match_id) }),
    sender,
    ...(row.sender_user_id == null ? {} : { senderUserId: String(row.sender_user_id) }),
    body: row.body,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at || null,
    readAt: row.read_at || null,
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
      listAiPicks: unavailable,
      saveSwipe: unavailable,
      rewindLastSwipe: unavailable,
      listLikes: unavailable,
      listMatches: unavailable,
      listMessages: unavailable,
      listChats: unavailable,
      addMessage: unavailable,
      createMessageForUserId: unavailable,
      createMessageForTelegramId: unavailable,
      hasMatchAccess: unavailable,
      listMatchIdsForUserId: unavailable,
      markMessagesReadForUser: unavailable,
      markMessagesDeliveredForUser: unavailable,
      markMessageDeliveredForUser: unavailable,
      getOwnProfile: unavailable,
      updateOwnProfile: unavailable,
      addProfilePhoto: unavailable,
      deleteProfilePhoto: unavailable,
      reorderProfilePhotos: unavailable,
      getProfileScore: unavailable,
      requestProfileScore: unavailable,
      sendGift: unavailable,
      activatePremium: unavailable,
      activateBoost: unavailable,
      getBoostStatus: unavailable,
      grantVip: unavailable,
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

  async function discoveryContext(telegramId, executor = pool) {
    const result = await executor.query(
      `SELECT u.id, u.gender, u.is_vip, u.vip_expires_at,
              COALESCE(u.city, location.answer_value ->> 'name') AS preferred_city,
              COALESCE(u.country, location.answer_value ->> 'country') AS preferred_country,
              age_range.answer_value #>> '{}' AS age_range_preference,
              interested.answer_value #>> '{}' AS interested_in_gender
       FROM users u
       LEFT JOIN onboarding_answers location
         ON location.user_id = u.id AND location.question_key = 'location'
       LEFT JOIN onboarding_answers age_range
         ON age_range.user_id = u.id AND age_range.question_key = 'age_range_preference'
       LEFT JOIN onboarding_answers interested
         ON interested.user_id = u.id AND interested.question_key = 'interested_in_gender'
       WHERE u.telegram_id = $1 AND u.is_active = TRUE AND u.onboarding_completed = TRUE
       LIMIT 1`,
      [telegramId],
    );
    const user = result.rows[0];
    if (!user) return null;

    const ownGender = String(user.gender || '').toLowerCase();
    const requestedGender = String(user.interested_in_gender || '').toLowerCase();
    const interestedInGender = ['male', 'female'].includes(requestedGender)
      ? requestedGender
      : ownGender === 'male' ? 'female' : ownGender === 'female' ? 'male' : null;
    const [minAge, maxAge] = ageRangeForPreference(user.age_range_preference);

    return {
      userId: user.id,
      interestedInGender,
      minAge,
      maxAge,
      city: user.preferred_city || null,
      country: user.preferred_country || null,
      isVipActive: Boolean(user.is_vip)
        && (!user.vip_expires_at || new Date(user.vip_expires_at).getTime() > Date.now()),
      vipExpiresAt: user.vip_expires_at || null,
    };
  }

  async function listDiscover(telegramId, { limit = 10, offset = 0 } = {}) {
    const context = await discoveryContext(telegramId);
    if (!context) return null;
    if (!context.interestedInGender) return { profiles: [], hasMore: false };

    const pageSize = Number.isSafeInteger(Number(limit))
      ? Math.max(1, Math.min(30, Number(limit)))
      : 10;
    const pageOffset = Number.isSafeInteger(Number(offset))
      ? Math.max(0, Math.min(100_000, Number(offset)))
      : 0;
    const result = await pool.query(
      `SELECT u.id::text AS id, u.name, u.first_name, u.age, u.city, u.country,
              u.bio, u.is_verified, u.photo_url,
              COALESCE(p.url, u.photo_url) AS profile_photo_url,
              looking_for.answer_value AS looking_for
       FROM users u
       LEFT JOIN photos p ON p.user_id = u.id AND p.is_primary = TRUE
       LEFT JOIN onboarding_answers looking_for
         ON looking_for.user_id = u.id AND looking_for.question_key = 'looking_for'
       WHERE u.id <> $1
         AND u.gender = $2
         AND u.age BETWEEN $3 AND $4
         AND u.is_active = TRUE
         AND u.onboarding_completed = TRUE
         AND ($5::text IS NULL OR LOWER(u.city) = LOWER($5))
         AND ($6::text IS NULL OR LOWER(u.country) = LOWER($6))
         AND NOT EXISTS (
           SELECT 1 FROM swipes s
           WHERE s.user_id = $1 AND s.profile_id = u.id::text
         )
       ORDER BY EXISTS (
                  SELECT 1 FROM profile_boosts boost
                  WHERE boost.user_id = u.id AND boost.is_active = TRUE AND boost.expires_at > NOW()
                ) DESC,
                u.is_verified DESC, u.created_at DESC, u.id DESC
       LIMIT $7 OFFSET $8`,
      [
        context.userId,
        context.interestedInGender,
        context.minAge,
        context.maxAge,
        context.city,
        context.country,
        pageSize + 1,
        pageOffset,
      ],
    );
    const hasMore = result.rows.length > pageSize;
    return {
      profiles: result.rows.slice(0, pageSize).map(mapDatabaseProfile),
      hasMore,
    };
  }

  async function generateAiPickItems(client, session, context, targetCount) {
    const currentCountResult = await client.query(
      'SELECT COUNT(*)::int AS item_count FROM ai_pick_items WHERE session_id = $1',
      [session.id],
    );
    const currentCount = Number(currentCountResult.rows[0]?.item_count || 0);
    const needed = Math.max(0, targetCount - currentCount);
    if (needed === 0 || !context.interestedInGender) return currentCount;

    const candidateQuery = `SELECT u.id
       FROM users u
       WHERE u.id <> $1
         AND u.gender = $2
         AND u.age BETWEEN $3 AND $4
         AND u.is_active = TRUE
         AND u.onboarding_completed = TRUE
         AND ($5::text IS NULL OR LOWER(u.city) = LOWER($5))
         AND ($6::text IS NULL OR LOWER(u.country) = LOWER($6))
         AND ($7::boolean = FALSE OR u.is_verified = TRUE)
         AND NOT EXISTS (
           SELECT 1 FROM swipes s
           WHERE s.user_id = $1 AND s.profile_id = u.id::text
         )
         AND NOT EXISTS (
           SELECT 1 FROM ai_pick_items existing
           WHERE existing.session_id = $8 AND existing.picked_user_id = u.id
         )
         AND NOT (u.id = ANY($10::bigint[]))
       ORDER BY RANDOM()
       LIMIT $9`;
    const candidateValues = (city, verifiedOnly, limit, excludedIds = []) => [
      context.userId,
      context.interestedInGender,
      context.minAge,
      context.maxAge,
      city,
      context.country,
      verifiedOnly,
      session.id,
      limit,
      excludedIds,
    ];

    const preferred = await client.query(
      candidateQuery,
      candidateValues(context.city, true, needed),
    );
    const candidates = [...preferred.rows];

    if (candidates.length < needed) {
      const fallback = await client.query(
        candidateQuery,
        candidateValues(
          null,
          false,
          needed - candidates.length,
          preferred.rows.map((row) => row.id),
        ),
      );
      candidates.push(...fallback.rows);
    }

    for (let index = 0; index < candidates.length; index += 1) {
      const score = Math.floor(Math.random() * 21) + 76;
      await client.query(
        `INSERT INTO ai_pick_items (session_id, picked_user_id, compatibility_score, order_index)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (session_id, picked_user_id) DO NOTHING`,
        [session.id, candidates[index].id, score, currentCount + index],
      );
    }
    return currentCount + candidates.length;
  }

  async function listAiPicks(telegramId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const context = await discoveryContext(telegramId, client);
      if (!context) {
        await client.query('ROLLBACK');
        return null;
      }

      // Serialize first-time creation and VIP upgrades for this user/day.
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [context.userId]);
      let sessionResult = await client.query(
        `SELECT id, session_date, picks_shown, picks_limit, created_at
         FROM ai_picks_sessions
         WHERE user_id = $1 AND session_date = CURRENT_DATE
         LIMIT 1
         FOR UPDATE`,
        [context.userId],
      );
      const desiredLimit = context.isVipActive
        ? VIP_DAILY_AI_PICKS_LIMIT
        : FREE_DAILY_AI_PICKS_LIMIT;
      let session = sessionResult.rows[0] || null;
      let isNewSession = false;

      if (!session) {
        sessionResult = await client.query(
          `INSERT INTO ai_picks_sessions (user_id, picks_limit)
           VALUES ($1, $2)
           ON CONFLICT (user_id, session_date) DO UPDATE SET
             picks_limit = GREATEST(ai_picks_sessions.picks_limit, EXCLUDED.picks_limit)
           RETURNING id, session_date, picks_shown, picks_limit, created_at`,
          [context.userId, desiredLimit],
        );
        session = sessionResult.rows[0];
        isNewSession = true;
      }

      const previousLimit = Number(session.picks_limit);
      if (!isNewSession && desiredLimit !== previousLimit) {
        sessionResult = await client.query(
          `UPDATE ai_picks_sessions SET picks_limit = $2
           WHERE id = $1
           RETURNING id, session_date, picks_shown, picks_limit, created_at`,
          [session.id, desiredLimit],
        );
        session = sessionResult.rows[0];
      }

      if (isNewSession || Number(session.picks_limit) > previousLimit) {
        await generateAiPickItems(client, session, context, Number(session.picks_limit));
      }

      const picksResult = await client.query(
        `SELECT u.id::text AS id, u.name, u.first_name, u.age, u.city, u.country,
                u.bio, u.is_verified, u.photo_url,
                COALESCE(photo.url, u.photo_url) AS profile_photo_url,
                intention.answer_value AS looking_for,
                item.compatibility_score, item.order_index
         FROM ai_pick_items item
         JOIN users u ON u.id = item.picked_user_id
         LEFT JOIN photos photo ON photo.user_id = u.id AND photo.is_primary = TRUE
         LEFT JOIN onboarding_answers intention
           ON intention.user_id = u.id AND intention.question_key = 'looking_for'
         WHERE item.session_id = $1
           AND u.id <> $2 AND u.gender = $3 AND u.age BETWEEN $4 AND $5
           AND item.order_index < $6
           AND u.is_active = TRUE AND u.onboarding_completed = TRUE
           AND ($7::text IS NULL OR LOWER(u.country) = LOWER($7))
           AND NOT EXISTS (
             SELECT 1 FROM swipes s
             WHERE s.user_id = $2 AND s.profile_id = u.id::text
           )
           ORDER BY item.order_index ASC`,
        [
          session.id,
          context.userId,
          context.interestedInGender,
          context.minAge,
          context.maxAge,
          Number(session.picks_limit),
          context.country,
        ],
      );

      const swipedCountResult = await client.query(
        `SELECT COUNT(*)::int AS shown_count
         FROM ai_pick_items item
         JOIN swipes swipe
           ON swipe.user_id = $2 AND swipe.profile_id = item.picked_user_id::text
         WHERE item.session_id = $1`,
        [session.id, context.userId],
      );
      session.picks_shown = Number(swipedCountResult.rows[0]?.shown_count || 0);
      await client.query(
        'UPDATE ai_picks_sessions SET picks_shown = $2 WHERE id = $1',
        [session.id, session.picks_shown],
      );

      await client.query('COMMIT');
      return {
        picks: picksResult.rows.map((row) => ({
          ...mapDatabaseProfile(row),
          compatibilityScore: Number(row.compatibility_score),
          orderIndex: Number(row.order_index),
        })),
        picksRemaining: picksResult.rows.length,
        dailyLimit: Number(session.picks_limit),
        picksShown: session.picks_shown,
        isVip: context.isVipActive,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function selectDatabaseProfile(client, profileId, { activeOnly = true } = {}) {
    const activeClause = activeOnly
      ? 'AND u.is_active = TRUE AND u.onboarding_completed = TRUE AND u.age >= 18'
      : '';
    const result = await client.query(
      `SELECT u.id::text AS id, u.name, u.first_name, u.age, u.city, u.country,
              u.bio, u.is_verified, u.photo_url,
              COALESCE(p.url, u.photo_url) AS profile_photo_url,
              looking_for.answer_value AS looking_for
       FROM users u
       LEFT JOIN photos p ON p.user_id = u.id AND p.is_primary = TRUE
       LEFT JOIN onboarding_answers looking_for
         ON looking_for.user_id = u.id AND looking_for.question_key = 'looking_for'
       WHERE u.id::text = $1 ${activeClause}
       LIMIT 1`,
      [String(profileId)],
    );
    return result.rows[0] || null;
  }

  function sortUserIds(left, right) {
    return BigInt(left) < BigInt(right) ? [left, right] : [right, left];
  }

  async function saveSwipe(telegramId, profileId, action) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const context = await discoveryContext(telegramId, client);
      const userId = context?.userId;
      if (!userId) {
        await client.query('ROLLBACK');
        return null;
      }
      if (!context.interestedInGender) {
        await client.query('ROLLBACK');
        return { matched: false, profile: null, match: null };
      }

      const targetLookup = await client.query(
        `SELECT id FROM users
         WHERE id::text = $1 AND id <> $2 AND is_active = TRUE
           AND onboarding_completed = TRUE AND age BETWEEN $3 AND $4
           AND gender = $5
           AND ($6::text IS NULL OR LOWER(city) = LOWER($6))
           AND ($7::text IS NULL OR LOWER(country) = LOWER($7))
         LIMIT 1`,
        [
          String(profileId),
          userId,
          context.minAge,
          context.maxAge,
          context.interestedInGender,
          context.city,
          context.country,
        ],
      );
      if (!targetLookup.rows[0]) {
        await client.query('ROLLBACK');
        return { matched: false, profile: null, match: null };
      }
      const targetId = targetLookup.rows[0].id;

      // Lock both accounts in deterministic order so simultaneous mutual likes
      // cannot both miss each other's uncommitted swipe.
      const lockedUsers = await client.query(
        `SELECT id FROM users
         WHERE id IN ($1, $2) AND is_active = TRUE
         ORDER BY id
         FOR UPDATE`,
        [userId, targetId],
      );
      if (lockedUsers.rows.length !== 2) {
        await client.query('ROLLBACK');
        return { matched: false, profile: null, match: null };
      }

      const profileRow = await selectDatabaseProfile(client, profileId);
      if (!profileRow) {
        await client.query('ROLLBACK');
        return { matched: false, profile: null, match: null };
      }
      const profile = mapDatabaseProfile(profileRow);

      const previousSwipe = await client.query(
        `SELECT action FROM swipes
         WHERE user_id = $1 AND profile_id = $2
         LIMIT 1
         FOR UPDATE`,
        [userId, String(profileId)],
      );
      const previousAction = previousSwipe.rows[0]?.action || null;
      const shouldNotifyLikedYou = (action === 'like' || action === 'super_like')
        && !['like', 'super_like'].includes(previousAction);

      await client.query(
        `INSERT INTO swipes (user_id, profile_id, action)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, profile_id) DO UPDATE SET
           action = EXCLUDED.action,
           created_at = NOW()`,
        [userId, String(profileId), action],
      );

      if (previousSwipe.rows.length === 0) {
        await client.query(
          `UPDATE ai_picks_sessions AS aps
           SET picks_shown = LEAST(aps.picks_limit, aps.picks_shown + 1)
           WHERE aps.user_id = $1 AND aps.session_date = CURRENT_DATE
             AND EXISTS (
               SELECT 1 FROM ai_pick_items item
               WHERE item.session_id = aps.id AND item.picked_user_id = $2
             )`,
          [userId, targetId],
        );
      }

      let matched = false;
      let createdMatch = false;
      let match = null;
      if (action === 'like' || action === 'super_like') {
        const mutual = await client.query(
          `SELECT id FROM swipes
           WHERE user_id = $1 AND profile_id = $2
             AND action IN ('like', 'super_like')
           LIMIT 1`,
          [targetId, String(userId)],
        );
        if (mutual.rows.length > 0) {
          const [user1Id, user2Id] = sortUserIds(userId, targetId);
          const insertedMatch = await client.query(
            `INSERT INTO matches (user_id, profile_id, user1_id, user2_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [userId, String(profileId), user1Id, user2Id],
          );
          const matchId = insertedMatch.rows[0]?.id ?? (await client.query(
            `SELECT id FROM matches WHERE user1_id = $1 AND user2_id = $2 LIMIT 1`,
            [user1Id, user2Id],
          )).rows[0]?.id;
          createdMatch = Boolean(insertedMatch.rows[0]?.id);
          matched = Boolean(matchId);
          if (matched) {
            match = { id: String(matchId), matchedUser: profile };
          }
        }
      }

      await client.query('COMMIT');
      return {
        matched,
        createdMatch,
        shouldNotifyLikedYou,
        userId: String(userId),
        targetUserId: String(targetId),
        profile,
        match,
      };
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
      const currentUser = await client.query(
        `SELECT id FROM users
         WHERE telegram_id = $1 AND is_active = TRUE
         FOR UPDATE`,
        [telegramId],
      );
      const userId = currentUser.rows[0]?.id ?? null;
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
        return { restored: null, restoredProfile: null };
      }

      const swipe = lastSwipe.rows[0];
      const profileRow = await selectDatabaseProfile(client, swipe.profile_id);
      const restoredProfile = profileRow
        ? mapDatabaseProfile(profileRow)
        : getMember(swipe.profile_id) ? publicMember(getMember(swipe.profile_id)) : null;
      await client.query('DELETE FROM swipes WHERE id = $1', [swipe.id]);

      // Rewind the shared match row too; its cascading messages are discarded.
      if (swipe.action !== 'pass') {
        if (/^\d+$/.test(String(swipe.profile_id))) {
          const [user1Id, user2Id] = sortUserIds(userId, swipe.profile_id);
          await client.query(
            `DELETE FROM matches
             WHERE (user1_id = $1 AND user2_id = $2)
                OR (user1_id IS NULL AND user_id = $3 AND profile_id = $4)`,
            [user1Id, user2Id, userId, String(swipe.profile_id)],
          );
        } else {
          await client.query(
            'DELETE FROM matches WHERE user_id = $1 AND profile_id = $2',
            [userId, swipe.profile_id],
          );
        }
      }

      await client.query('COMMIT');
      return {
        restored: restoredProfile?.id || String(swipe.profile_id),
        restoredProfile,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function listMatchesFor(client, userId) {
    const result = await client.query(
      `SELECT m.id AS match_id,
              COALESCE(other.id::text, m.profile_id) AS profile_id,
              other.id::text AS real_profile_id,
              other.name AS profile_name,
              other.first_name AS profile_first_name,
              other.age AS profile_age,
              other.city AS profile_city,
              other.country AS profile_country,
              other.bio AS profile_bio,
              other.is_verified AS profile_is_verified,
              presence.is_online AS profile_is_online,
              presence.last_seen_at AS profile_last_seen_at,
              other.photo_url AS profile_photo_url_fallback,
              COALESCE(photo.url, other.photo_url) AS profile_photo_url,
              intention.answer_value AS profile_looking_for,
              m.created_at,
              last_message.body AS last_message,
              last_message.created_at AS last_message_at,
              last_message.sender_user_id AS last_message_sender_user_id,
              last_message.sender AS last_message_sender,
              last_message.delivered_at AS last_message_delivered_at,
              last_message.read_at AS last_message_read_at
       FROM matches m
       LEFT JOIN LATERAL (
         SELECT body, created_at, sender_user_id, sender, delivered_at, read_at
         FROM messages
         WHERE match_id = m.id
         ORDER BY created_at DESC, id DESC
         LIMIT 1
       ) last_message ON TRUE
       LEFT JOIN users other
         ON other.id = CASE
           WHEN m.user1_id = $1 THEN m.user2_id
           WHEN m.user2_id = $1 THEN m.user1_id
           ELSE NULL
         END
       LEFT JOIN photos photo ON photo.user_id = other.id AND photo.is_primary = TRUE
       LEFT JOIN user_presence presence ON presence.user_id = other.id
       LEFT JOIN onboarding_answers intention
         ON intention.user_id = other.id AND intention.question_key = 'looking_for'
       WHERE (m.user1_id = $1 OR m.user2_id = $1)
          OR (m.user1_id IS NULL AND m.user_id = $1)
       ORDER BY COALESCE(last_message.created_at, m.created_at) DESC, m.id DESC`,
      [userId],
    );
    return result.rows;
  }

  function mapMatchRow(row, currentUserId = null) {
    let profile;
    if (row.real_profile_id) {
      profile = mapDatabaseProfile({
        id: row.real_profile_id,
        name: row.profile_name,
        first_name: row.profile_first_name,
        age: row.profile_age,
        city: row.profile_city,
        country: row.profile_country,
        bio: row.profile_bio,
        is_verified: row.profile_is_verified,
        photo_url: row.profile_photo_url_fallback,
        profile_photo_url: row.profile_photo_url,
        looking_for: row.profile_looking_for,
      });
    } else {
      const member = getMember(row.profile_id);
      profile = member
        ? publicMember(member)
        : publicMember({ id: row.profile_id, name: 'Unknown' });
    }
    profile = {
      ...profile,
      isOnline: Boolean(row.profile_is_online),
      lastSeenAt: row.profile_last_seen_at || null,
    };

    return {
      id: String(row.match_id),
      profile,
      createdAt: row.created_at,
      lastMessage: row.last_message
        ? {
          body: row.last_message,
          createdAt: row.last_message_at,
          sender: row.last_message_sender_user_id == null
            ? row.last_message_sender
            : String(row.last_message_sender_user_id) === String(currentUserId) ? 'user' : 'profile',
          senderUserId: row.last_message_sender_user_id == null
            ? null
            : String(row.last_message_sender_user_id),
          deliveredAt: row.last_message_delivered_at || null,
          readAt: row.last_message_read_at || null,
        }
        : null,
    };
  }

  async function listLikes(telegramId) {
    const client = await pool.connect();
    try {
      const userResult = await client.query(
        `SELECT id, is_vip, vip_expires_at
         FROM users WHERE telegram_id = $1 AND is_active = TRUE
         LIMIT 1`,
        [telegramId],
      );
      const currentUser = userResult.rows[0];
      if (!currentUser) return null;
      const userId = currentUser.id;
      const isVipActive = Boolean(currentUser.is_vip)
        && (!currentUser.vip_expires_at || new Date(currentUser.vip_expires_at).getTime() > Date.now());

      const [likedRows, matchRows] = await Promise.all([
        client.query(
          `SELECT s.id::text AS swipe_id, s.action,
                  u.id::text AS id, u.name, u.first_name, u.age, u.city, u.country,
                  u.bio, u.is_verified, u.photo_url,
                  COALESCE(photo.url, u.photo_url) AS profile_photo_url,
                  intention.answer_value AS looking_for
           FROM swipes s
           JOIN users u ON u.id = s.user_id
           LEFT JOIN photos photo ON photo.user_id = u.id AND photo.is_primary = TRUE
           LEFT JOIN onboarding_answers intention
             ON intention.user_id = u.id AND intention.question_key = 'looking_for'
           WHERE s.profile_id = $1::text
             AND s.action IN ('like', 'super_like')
             AND s.user_id <> $2
             AND u.is_active = TRUE AND u.onboarding_completed = TRUE
             AND NOT EXISTS (
               SELECT 1 FROM swipes own_swipe
               WHERE own_swipe.user_id = $2 AND own_swipe.profile_id = u.id::text
             )
             AND NOT EXISTS (
               SELECT 1 FROM matches m
               WHERE (m.user1_id = LEAST($2::bigint, u.id) AND m.user2_id = GREATEST($2::bigint, u.id))
                  OR (m.user1_id IS NULL AND m.user_id = $2 AND m.profile_id = u.id::text)
             )
           ORDER BY s.created_at DESC, s.id DESC
           LIMIT 100`,
          [String(userId), userId],
        ),
        listMatchesFor(client, userId),
      ]);

      const likedYou = likedRows.rows.map((row, index) => {
        const profile = mapDatabaseProfile(row);
        if (!isVipActive && index >= 1) {
          return {
            id: `locked-${row.swipe_id}`,
            swipeId: String(row.swipe_id),
            isLocked: true,
            teaserText: 'Someone has fallen in love with you',
            // Never return an admirer photo on the locked path; CSS blur alone
            // is reversible from the network response.
            blurredPhotoUrl: '/images/locked-admirer.svg',
          };
        }
        return {
          ...profile,
          swipeId: String(row.swipe_id),
          isLocked: false,
          action: row.action,
        };
      });

      return {
        likedYou,
        matches: matchRows.map((row) => mapMatchRow(row, userId)),
        isVip: isVipActive,
        totalLikes: likedRows.rows.length,
        lockedCount: likedYou.filter((like) => like.isLocked).length,
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
      return rows.map((row) => mapMatchRow(row, userId));
    } finally {
      client.release();
    }
  }

  async function ownedMatchRow(client, userId, matchId, { lock = false } = {}) {
    let numericId;
    try {
      numericId = BigInt(matchId);
    } catch {
      return null;
    }
    if (numericId <= 0n || numericId > 9_223_372_036_854_775_807n) return null;

    const result = await client.query(
      `SELECT m.id, m.user_id, m.profile_id, m.user1_id, m.user2_id
       FROM matches m
       WHERE m.id = $1 AND (
         m.user1_id = $2 OR m.user2_id = $2
         OR (m.user1_id IS NULL AND m.user_id = $2)
       )
       LIMIT 1${lock ? ' FOR SHARE' : ''}`,
      [numericId.toString(), userId],
    );
    return result.rows[0] || null;
  }

  async function hasMatchAccess(userId, matchId) {
    const client = await pool.connect();
    try {
      return Boolean(await ownedMatchRow(client, userId, matchId));
    } finally {
      client.release();
    }
  }

  async function listMatchIdsForUserId(userId) {
    const result = await pool.query(
      `SELECT id::text AS id FROM matches
       WHERE user1_id = $1 OR user2_id = $1
          OR (user1_id IS NULL AND user_id = $1)`,
      [userId],
    );
    return result.rows.map((row) => String(row.id));
  }

  async function listMessages(telegramId, matchId) {
    const client = await pool.connect();
    try {
      const userId = await userIdFor(client, telegramId);
      if (!userId) return null;
      const match = await ownedMatchRow(client, userId, matchId);
      if (!match) return null;
      await client.query(
        `UPDATE messages SET
           delivered_at = COALESCE(delivered_at, NOW()),
           read_at = COALESCE(read_at, NOW())
         WHERE match_id = $1
           AND ((sender_user_id IS NOT NULL AND sender_user_id <> $2)
             OR (sender_user_id IS NULL AND sender = 'profile'))
           AND read_at IS NULL`,
        [match.id, userId],
      );
      const result = await client.query(
        `SELECT id, match_id, sender, sender_user_id, body, created_at, delivered_at, read_at
         FROM messages
         WHERE match_id = $1
         ORDER BY created_at ASC, id ASC
         LIMIT 500`,
        [match.id],
      );
      return result.rows.map((row) => mapMessage(row, userId));
    } finally {
      client.release();
    }
  }

  async function createMessageForUserId(userId, matchId, body) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const match = await ownedMatchRow(client, userId, matchId, { lock: true });
      if (!match) {
        await client.query('ROLLBACK');
        return null;
      }
      const inserted = await client.query(
        `INSERT INTO messages (match_id, sender, sender_user_id, body)
         VALUES ($1, 'user', $2, $3)
         RETURNING id, match_id, sender, sender_user_id, body, created_at, delivered_at, read_at`,
        [match.id, userId, body],
      );
      await client.query('COMMIT');

      const recipientUserId = match.user1_id != null && match.user2_id != null
        ? String(match.user1_id) === String(userId) ? String(match.user2_id) : String(match.user1_id)
        : null;
      return {
        message: mapMessage(inserted.rows[0], userId),
        matchId: String(match.id),
        senderUserId: String(userId),
        recipientUserId,
        content: body,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function createMessageForTelegramId(telegramId, matchId, body) {
    const userId = await userIdFor(pool, telegramId);
    if (!userId) return null;
    return createMessageForUserId(userId, matchId, body);
  }

  async function addMessage(telegramId, matchId, body) {
    const created = await createMessageForTelegramId(telegramId, matchId, body);
    return created?.message || null;
  }

  async function markMessagesReadForUser(userId, matchId) {
    const client = await pool.connect();
    try {
      const match = await ownedMatchRow(client, userId, matchId);
      if (!match) return null;
      const result = await client.query(
        `UPDATE messages SET
           delivered_at = COALESCE(delivered_at, NOW()),
           read_at = COALESCE(read_at, NOW())
         WHERE match_id = $1
           AND ((sender_user_id IS NOT NULL AND sender_user_id <> $2)
             OR (sender_user_id IS NULL AND sender = 'profile'))
           AND read_at IS NULL
         RETURNING id::text AS id`,
        [match.id, userId],
      );
      return {
        matchId: String(match.id),
        readByUserId: String(userId),
        updatedCount: result.rows.length,
        updatedMessageIds: result.rows.map((row) => String(row.id)),
        readAt: new Date().toISOString(),
      };
    } finally {
      client.release();
    }
  }

  async function markMessagesDeliveredForUser(userId, matchId) {
    const client = await pool.connect();
    try {
      const match = await ownedMatchRow(client, userId, matchId);
      if (!match) return null;
      const result = await client.query(
        `UPDATE messages SET delivered_at = COALESCE(delivered_at, NOW())
         WHERE match_id = $1
           AND ((sender_user_id IS NOT NULL AND sender_user_id <> $2)
             OR (sender_user_id IS NULL AND sender = 'profile'))
           AND delivered_at IS NULL
         RETURNING id::text AS id`,
        [match.id, userId],
      );
      return {
        matchId: String(match.id),
        updatedCount: result.rows.length,
        updatedMessageIds: result.rows.map((row) => String(row.id)),
        deliveredAt: new Date().toISOString(),
      };
    } finally {
      client.release();
    }
  }

  async function markMessageDeliveredForUser(messageId, userId) {
    const result = await pool.query(
      `UPDATE messages message SET delivered_at = COALESCE(message.delivered_at, NOW())
       WHERE message.id = $1 AND message.sender_user_id IS DISTINCT FROM $2
         AND EXISTS (
           SELECT 1 FROM matches match_row
           WHERE match_row.id = message.match_id
             AND (match_row.user1_id = $2 OR match_row.user2_id = $2)
         )
       RETURNING message.id, message.match_id, message.sender, message.sender_user_id,
                 message.body, message.created_at, message.delivered_at, message.read_at`,
      [messageId, userId],
    );
    return result.rows[0] ? mapMessage(result.rows[0], userId) : null;
  }

  async function listChats(telegramId) {
    const client = await pool.connect();
    try {
      const userId = await userIdFor(client, telegramId);
      if (!userId) return null;
      const rows = await listMatchesFor(client, userId);
      const unreadByMatch = new Map();
      if (rows.length > 0) {
        const unread = await client.query(
          `SELECT match_id::text AS match_id, COUNT(*)::int AS unread_count
           FROM messages
           WHERE match_id = ANY($1::bigint[])
             AND ((sender_user_id IS NOT NULL AND sender_user_id <> $2)
               OR (sender_user_id IS NULL AND sender = 'profile'))
             AND read_at IS NULL
           GROUP BY match_id`,
          [rows.map((row) => String(row.match_id)), userId],
        );
        for (const row of unread.rows) unreadByMatch.set(String(row.match_id), Number(row.unread_count));
      }
      return rows.map((row) => ({
        ...mapMatchRow(row, userId),
        unreadCount: unreadByMatch.get(String(row.match_id)) || 0,
      }));
    } finally {
      client.release();
    }
  }

  function mapOwnProfile(row, photoRows = []) {
    const photos = photoRows.map((photo) => ({
      id: String(photo.id),
      url: photo.url,
      orderIndex: Number(photo.order_index),
      isPrimary: Boolean(photo.is_primary),
      createdAt: photo.created_at,
    }));
    const primaryPhoto = photos.find((photo) => photo.isPrimary) || photos[0] || null;
    const resultScore = Number(row.profile_score ?? row.results?.score);
    const profileScore = Number.isInteger(resultScore) && resultScore >= 0 && resultScore <= 100
      ? resultScore
      : null;
    const vipExpiresAt = row.vip_expires_at || null;
    const isVip = Boolean(row.is_vip)
      && (!vipExpiresAt || new Date(vipExpiresAt).getTime() > Date.now());
    return {
      id: String(row.id),
      telegramId: String(row.telegram_id),
      name: row.name || '',
      age: row.age == null ? null : Number(row.age),
      gender: row.gender || null,
      bio: row.bio || '',
      city: row.city || '',
      country: row.country || '',
      location: [row.city, row.country].filter(Boolean).join(', '),
      email: row.email || '',
      isVerified: Boolean(row.is_verified),
      verificationStatus: row.verification_status || 'none',
      isVip,
      vipExpiresAt,
      profileScore,
      profileScoreReady: Boolean(row.profile_score_ready),
      additionalInfo: row.additional_info && typeof row.additional_info === 'object'
        ? row.additional_info
        : {},
      settings: row.settings && typeof row.settings === 'object'
        ? row.settings
        : { notificationsEnabled: true },
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
      photoUrl: primaryPhoto?.url || row.photo_url || null,
      photos,
    };
  }

  async function getOwnProfile(telegramId) {
    await pool.query(
      `UPDATE users SET last_active_at = NOW()
       WHERE telegram_id = $1 AND is_active = TRUE
         AND last_active_at < NOW() - INTERVAL '5 minutes'`,
      [telegramId],
    );
    const userResult = await pool.query(
      `SELECT id::text AS id, telegram_id::text AS telegram_id, name, age, gender,
              bio, city, country, email, is_verified, is_vip, vip_expires_at,
              verification_status, profile_score, profile_score_ready, additional_info, settings,
              results, photo_url, created_at, last_active_at
       FROM users WHERE telegram_id = $1 AND is_active = TRUE LIMIT 1`,
      [telegramId],
    );
    const user = userResult.rows[0];
    if (!user) return null;
    const photoResult = await pool.query(
      `SELECT id, url, order_index, is_primary, created_at
       FROM photos WHERE user_id = $1
       ORDER BY order_index ASC, created_at ASC, id ASC`,
      [user.id],
    );
    return mapOwnProfile(user, photoResult.rows);
  }

  async function updateOwnProfile(telegramId, patch) {
    const additionalInfo = patch.additionalInfo === undefined
      ? null
      : JSON.stringify(patch.additionalInfo);
    const settings = patch.settings === undefined ? null : JSON.stringify(patch.settings);
    const result = await pool.query(
      `UPDATE users SET
         name = COALESCE($2, name),
         bio = COALESCE($3, bio),
         city = COALESCE($4, city),
         country = COALESCE($5, country),
         additional_info = COALESCE($6::jsonb, additional_info),
         settings = COALESCE($7::jsonb, settings),
         last_active_at = NOW()
       WHERE telegram_id = $1 AND is_active = TRUE
       RETURNING id`,
      [telegramId, patch.name ?? null, patch.bio ?? null, patch.city ?? null, patch.country ?? null, additionalInfo, settings],
    );
    return result.rows.length > 0 ? getOwnProfile(telegramId) : null;
  }

  async function addProfilePhoto(telegramId, { url, publicId }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1 AND is_active = TRUE FOR UPDATE`,
        [telegramId],
      );
      const userId = userResult.rows[0]?.id;
      if (!userId) {
        await client.query('ROLLBACK');
        return { error: 'USER_NOT_FOUND' };
      }
      const countResult = await client.query(
        'SELECT COUNT(*)::int AS photo_count FROM photos WHERE user_id = $1',
        [userId],
      );
      const photoCount = Number(countResult.rows[0]?.photo_count || 0);
      if (photoCount >= 6) {
        await client.query('ROLLBACK');
        return { error: 'PHOTO_LIMIT' };
      }
      const inserted = await client.query(
        `INSERT INTO photos (user_id, url, cloudinary_public_id, order_index, is_primary)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, url, cloudinary_public_id, order_index, is_primary, created_at`,
        [userId, url, publicId || null, photoCount, photoCount === 0],
      );
      await client.query('COMMIT');
      const photo = inserted.rows[0];
      return {
        photo: {
          id: String(photo.id),
          url: photo.url,
          publicId: photo.cloudinary_public_id,
          orderIndex: Number(photo.order_index),
          isPrimary: Boolean(photo.is_primary),
          createdAt: photo.created_at,
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function deleteProfilePhoto(telegramId, photoId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1 AND is_active = TRUE FOR UPDATE`,
        [telegramId],
      );
      const userId = userResult.rows[0]?.id;
      if (!userId) {
        await client.query('ROLLBACK');
        return null;
      }
      const photoResult = await client.query(
        `SELECT id, cloudinary_public_id, is_primary FROM photos
         WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [photoId, userId],
      );
      const photo = photoResult.rows[0];
      if (!photo) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query('DELETE FROM photos WHERE id = $1 AND user_id = $2', [photoId, userId]);
      if (photo.is_primary) {
        const nextPrimary = await client.query(
          `SELECT id FROM photos WHERE user_id = $1
           ORDER BY order_index ASC, created_at ASC, id ASC LIMIT 1`,
          [userId],
        );
        if (nextPrimary.rows[0]) {
          await client.query('UPDATE photos SET is_primary = TRUE WHERE id = $1', [nextPrimary.rows[0].id]);
        }
      }
      await client.query(
        `WITH ranked AS (
           SELECT id, ROW_NUMBER() OVER (ORDER BY order_index ASC, created_at ASC, id ASC) - 1 AS next_order
           FROM photos WHERE user_id = $1
         )
         UPDATE photos photo SET order_index = ranked.next_order
         FROM ranked WHERE photo.id = ranked.id`,
        [userId],
      );
      await client.query('COMMIT');
      return { deleted: true, publicId: photo.cloudinary_public_id || null };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function reorderProfilePhotos(telegramId, photoIds) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1 AND is_active = TRUE FOR UPDATE`,
        [telegramId],
      );
      const userId = userResult.rows[0]?.id;
      if (!userId) {
        await client.query('ROLLBACK');
        return null;
      }
      const ownedPhotos = await client.query(
        `SELECT id FROM photos WHERE user_id = $1 ORDER BY order_index ASC FOR UPDATE`,
        [userId],
      );
      const existingIds = ownedPhotos.rows.map((row) => String(row.id));
      const requestedIds = photoIds.map(String);
      if (requestedIds.length !== existingIds.length
          || new Set(requestedIds).size !== requestedIds.length
          || requestedIds.some((id) => !existingIds.includes(id))) {
        await client.query('ROLLBACK');
        return { error: 'INVALID_PHOTO_ORDER' };
      }
      await client.query('UPDATE photos SET is_primary = FALSE WHERE user_id = $1', [userId]);
      for (const [index, photoId] of requestedIds.entries()) {
        await client.query(
          `UPDATE photos SET order_index = $1, is_primary = $2
           WHERE id = $3 AND user_id = $4`,
          [index, index === 0, photoId, userId],
        );
      }
      await client.query('COMMIT');
      return { photos: requestedIds.map((id, orderIndex) => ({ id, orderIndex, isPrimary: orderIndex === 0 })) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function getProfileScore(telegramId) {
    const result = await pool.query(
      `SELECT profile_score, profile_score_ready, results
       FROM users WHERE telegram_id = $1 AND is_active = TRUE LIMIT 1`,
      [telegramId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const value = Number(row.profile_score ?? row.results?.score);
    const score = Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
    return { isReady: Boolean(row.profile_score_ready), score: row.profile_score_ready ? score : null };
  }

  async function requestProfileScore(telegramId) {
    const result = await pool.query(
      `UPDATE users SET profile_score_ready = TRUE,
         profile_score = COALESCE(profile_score, NULLIF(results->>'score', '')::smallint)
       WHERE telegram_id = $1 AND is_active = TRUE
       RETURNING profile_score, results`,
      [telegramId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const value = Number(row.profile_score ?? row.results?.score);
    return { isReady: true, score: Number.isInteger(value) && value >= 0 && value <= 100 ? value : null };
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
        vip_expires_at = GREATEST(COALESCE(vip_expires_at, NOW()), NOW())
          + ($4::int * INTERVAL '1 week'),
        vip_granted_reason = 'purchase',
        promo_code = COALESCE($2, promo_code),
        discount_percent = COALESCE($3, discount_percent)
       WHERE telegram_id = $1 AND is_active = TRUE
       RETURNING id, vip_expires_at`,
      [telegramId, promoCode, percent, plan.weeks],
    );
    if (result.rows.length === 0) return null;

    await pool.query(
      `INSERT INTO premium_orders (user_id, plan_id, promo_code, discount_percent, status)
       VALUES ($1, $2, $3, $4, 'fulfilled_demo')`,
      [result.rows[0].id, plan.id, promoCode, percent ?? 0],
    );
    return {
      activated: true,
      planId: plan.id,
      promoCode,
      discountPercent: percent ?? 0,
      vipExpiresAt: result.rows[0].vip_expires_at,
    };
  }

  async function activateBoost(telegramId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1 AND is_active = TRUE FOR UPDATE`,
        [telegramId],
      );
      const userId = userResult.rows[0]?.id;
      if (!userId) {
        await client.query('ROLLBACK');
        return null;
      }

      const activeResult = await client.query(
        `SELECT id, started_at, expires_at FROM profile_boosts
         WHERE user_id = $1 AND is_active = TRUE AND expires_at > NOW()
         ORDER BY expires_at DESC LIMIT 1`,
        [userId],
      );
      if (activeResult.rows[0]) {
        await client.query('COMMIT');
        const boost = activeResult.rows[0];
        return {
          alreadyActive: true,
          isActive: true,
          boost: {
            id: String(boost.id),
            startedAt: boost.started_at,
            expiresAt: boost.expires_at,
          },
        };
      }

      await client.query(
        `UPDATE profile_boosts SET is_active = FALSE
         WHERE user_id = $1 AND is_active = TRUE AND expires_at <= NOW()`,
        [userId],
      );
      const inserted = await client.query(
        `INSERT INTO profile_boosts (user_id, expires_at)
         VALUES ($1, NOW() + INTERVAL '30 minutes')
         RETURNING id, started_at, expires_at`,
        [userId],
      );
      await client.query('COMMIT');
      const boost = inserted.rows[0];
      return {
        alreadyActive: false,
        isActive: true,
        boost: {
          id: String(boost.id),
          startedAt: boost.started_at,
          expiresAt: boost.expires_at,
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function getBoostStatus(telegramId) {
    const userId = await userIdFor(pool, telegramId);
    if (!userId) return null;
    const result = await pool.query(
      `SELECT id, started_at, expires_at FROM profile_boosts
       WHERE user_id = $1 AND is_active = TRUE AND expires_at > NOW()
       ORDER BY expires_at DESC LIMIT 1`,
      [userId],
    );
    const row = result.rows[0];
    return {
      isActive: Boolean(row),
      boost: row ? {
        id: String(row.id),
        startedAt: row.started_at,
        expiresAt: row.expires_at,
      } : null,
    };
  }

  async function grantVip(userId, months, reason) {
    const result = await pool.query(
      `UPDATE users SET
         is_vip = TRUE,
         vip_expires_at = GREATEST(COALESCE(vip_expires_at, NOW()), NOW())
           + ($2::int * INTERVAL '1 month'),
         vip_granted_reason = $3
       WHERE id = $1 AND is_active = TRUE
       RETURNING id, telegram_id, vip_expires_at`,
      [userId, months, reason],
    );
    const row = result.rows[0];
    return row ? {
      id: String(row.id),
      telegramId: String(row.telegram_id),
      expiresAt: row.vip_expires_at,
      reason,
    } : null;
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
    listAiPicks,
    saveSwipe,
    rewindLastSwipe,
    listLikes,
    listMatches,
    listMessages,
    listChats,
    addMessage,
    createMessageForUserId,
    createMessageForTelegramId,
    hasMatchAccess,
    listMatchIdsForUserId,
    markMessagesReadForUser,
    markMessagesDeliveredForUser,
    markMessageDeliveredForUser,
    getOwnProfile,
    updateOwnProfile,
    addProfilePhoto,
    deleteProfilePhoto,
    reorderProfilePhotos,
    getProfileScore,
    requestProfileScore,
    sendGift,
    activatePremium,
    activateBoost,
    getBoostStatus,
    grantVip,
    requestVerification,
    submitVerificationVideo,
  };
}
