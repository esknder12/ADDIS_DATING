const VIP_CAMPAIGN_MESSAGE = `🎁 Congratulations! Your VIP access is activated!
We're giving you VIP in Dategram! Now you have access to:
👀 See who liked you
❤️ More likes and skips
💬 More messages to people you liked
⭐ More super-likes
↩️ Undo your last swipe
✨ Smart AI tools to find your match
🚀 Your profile gets seen and liked more often
Open the app and enjoy your gift!`;

function appKeyboard(webappUrl, text = 'Open Dategram 🖤', query = {}) {
  if (!webappUrl) return undefined;
  let url = webappUrl;
  try {
    const parsed = new URL(webappUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value != null) parsed.searchParams.set(key, String(value));
    }
    url = parsed.toString();
  } catch {
    // Runtime validation covers production HTTPS URLs; retain the configured
    // value for local development if it is not parseable as an absolute URL.
  }
  return {
    inline_keyboard: [[{ text, web_app: { url } }]],
  };
}

function absolutePhotoUrl(photoUrl, webappUrl) {
  if (!photoUrl || !webappUrl) return null;
  try {
    const parsed = new URL(photoUrl, webappUrl);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function createNotificationHandler(pool, runtimeConfig) {
  async function alreadySent(userId, type, relatedUserId) {
    const result = await pool.query(
      `SELECT 1 FROM notifications_log
       WHERE user_id = $1 AND notification_type = $2
         AND related_user_id IS NOT DISTINCT FROM $3
         AND sent_at > NOW() - INTERVAL '24 hours'
       LIMIT 1`,
      [userId, type, relatedUserId ?? null],
    );
    return result.rows.length > 0;
  }

  async function logNotification(userId, type, relatedUserId, messageId) {
    await pool.query(
      `INSERT INTO notifications_log
        (user_id, notification_type, related_user_id, telegram_message_id)
       VALUES ($1, $2, $3, $4)`,
      [userId, type, relatedUserId ?? null, messageId ?? null],
    );
  }

  async function pinIfPossible(bot, chatId, messageId) {
    if (!messageId) return;
    try {
      await bot.api.pinChatMessage(chatId, messageId);
    } catch (error) {
      // Pin permissions vary by private-chat settings; notification delivery
      // should still succeed when Telegram does not allow pinning.
      console.warn('Could not pin Dategram notification:', error.message);
    }
  }

  async function sendLikedYouNotification(bot, recipientId, likerId) {
    if (!pool || !bot?.api) return false;
    try {
      if (await alreadySent(recipientId, 'liked_you', likerId)) return false;
      const result = await pool.query(
        `SELECT recipient.telegram_id, recipient.is_vip, recipient.vip_expires_at,
                COALESCE(liker.name, liker.first_name, 'Someone') AS liker_name,
                COALESCE(photo.url, liker.photo_url) AS photo_url
         FROM users recipient
         JOIN users liker ON liker.id = $2 AND liker.is_active = TRUE
         LEFT JOIN photos photo ON photo.user_id = liker.id AND photo.is_primary = TRUE
         WHERE recipient.id = $1 AND recipient.is_active = TRUE
         LIMIT 1`,
        [recipientId, likerId],
      );
      const recipient = result.rows[0];
      if (!recipient) return false;

      const isVipActive = Boolean(recipient.is_vip)
        && (!recipient.vip_expires_at || new Date(recipient.vip_expires_at).getTime() > Date.now());
      const caption = isVipActive
        ? `${recipient.liker_name} just liked you! Open Dategram to respond.`
        : 'Someone just liked you! Open Dategram to see your free preview or unlock the rest with VIP.';
      const options = {
        caption,
        has_spoiler: !isVipActive,
        reply_markup: appKeyboard(runtimeConfig.webappUrl, 'Open Dategram 🖤', { tab: 'likes' }),
      };
      const photoUrl = absolutePhotoUrl(recipient.photo_url, runtimeConfig.webappUrl);
      const message = photoUrl
        ? await bot.api.sendPhoto(recipient.telegram_id, photoUrl, options)
        : await bot.api.sendMessage(recipient.telegram_id, caption, {
          reply_markup: appKeyboard(runtimeConfig.webappUrl, 'Open Dategram 🖤', { tab: 'likes' }),
        });
      await pinIfPossible(bot, recipient.telegram_id, message.message_id);
      await logNotification(recipientId, 'liked_you', likerId, message.message_id);
      return true;
    } catch (error) {
      console.error('Failed to send liked-you notification:', error.message);
      return false;
    }
  }

  async function sendMatchNotification(bot, recipientId, matchedUserId, matchId = null) {
    if (!pool || !bot?.api) return false;
    try {
      if (await alreadySent(recipientId, 'new_match', matchedUserId)) return false;
      const result = await pool.query(
        `SELECT recipient.telegram_id,
                COALESCE(matched.name, matched.first_name, 'your match') AS matched_name
         FROM users recipient
         JOIN users matched ON matched.id = $2
         WHERE recipient.id = $1 AND recipient.is_active = TRUE
         LIMIT 1`,
        [recipientId, matchedUserId],
      );
      const recipient = result.rows[0];
      if (!recipient) return false;
      const message = await bot.api.sendMessage(
        recipient.telegram_id,
        `🎉 It's a match! You and ${recipient.matched_name} liked each other. Open Dategram to start chatting!`,
        {
          reply_markup: appKeyboard(runtimeConfig.webappUrl, 'Go to chat 💬', {
            tab: 'chat',
            matchId,
          }),
        },
      );
      await logNotification(recipientId, 'new_match', matchedUserId, message.message_id);
      return true;
    } catch (error) {
      console.error('Failed to send match notification:', error.message);
      return false;
    }
  }

  async function sendMessageNotification(bot, recipientId, senderId, matchId, content) {
    if (!pool || !bot?.api) return false;
    try {
      const result = await pool.query(
        `SELECT recipient.telegram_id,
                COALESCE(sender.name, sender.first_name, 'Someone') AS sender_name
         FROM users recipient
         JOIN users sender ON sender.id = $2 AND sender.is_active = TRUE
         WHERE recipient.id = $1 AND recipient.is_active = TRUE
           AND (recipient.settings->'notificationsEnabled' IS NULL
             OR recipient.settings->'notificationsEnabled' = 'true'::jsonb)
         LIMIT 1`,
        [recipientId, senderId],
      );
      const recipient = result.rows[0];
      if (!recipient) return false;
      const preview = Array.from(String(content || '').trim()).slice(0, 72).join('');
      const suffix = Array.from(String(content || '').trim()).length > 72 ? '…' : '';
      const message = await bot.api.sendMessage(
        recipient.telegram_id,
        `💬 ${recipient.sender_name}: “${preview}${suffix}”`,
        {
          reply_markup: appKeyboard(runtimeConfig.webappUrl, 'Reply on Dategram 🖤', {
            tab: 'chat',
            matchId,
          }),
        },
      );
      await logNotification(recipientId, 'chat_message', senderId, message.message_id);
      return true;
    } catch (error) {
      console.error('Failed to send chat message notification:', error.message);
      return false;
    }
  }

  async function sendVipGrantedNotification(bot, userId) {
    if (!pool || !bot?.api) return false;
    try {
      if (await alreadySent(userId, 'vip_granted', null)) return false;
      const result = await pool.query(
        `SELECT telegram_id FROM users WHERE id = $1 AND is_active = TRUE LIMIT 1`,
        [userId],
      );
      const user = result.rows[0];
      if (!user) return false;
      const message = await bot.api.sendMessage(user.telegram_id, VIP_CAMPAIGN_MESSAGE, {
        reply_markup: appKeyboard(runtimeConfig.webappUrl, 'Return to Dategram 🖤', { tab: 'profile' }),
      });
      await pinIfPossible(bot, user.telegram_id, message.message_id);
      await logNotification(userId, 'vip_granted', null, message.message_id);
      return true;
    } catch (error) {
      console.error('Failed to send VIP grant notification:', error.message);
      return false;
    }
  }

  return {
    sendLikedYouNotification,
    sendMatchNotification,
    sendMessageNotification,
    sendVipGrantedNotification,
  };
}
