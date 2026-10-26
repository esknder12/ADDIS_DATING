// Notification sender — a 1:1 port of
// `backend/src/bot/handlers/notificationHandler.js` to the tgcloud SDK.
//
// Same four notifications, same wording, same rules:
//   liked_you    — photo with spoiler for non-VIP, pinned
//   new_match    — deep link into ?tab=chat&matchId=
//   chat_message — offline DM with 72-char preview, honors notificationsEnabled
//   vip_granted  — VIP campaign text, pinned
// Same 24h dedup via notifications_log. Profile truth comes from the bridge
// (main API) with local-mirror fallbacks, so standalone mode keeps working.

import { BotApiError, api, db } from 'sdk';
import { and, eq, gt, isNull } from 'sdk/db';
import { notificationsLog } from '../schema.js';
import { CHAT_PREVIEW_LENGTH, DEDUP_WINDOW_HOURS, WEBAPP_URL } from './config.js';
import { fetchLibMatchUser } from './bridge.js';
import { appKeyboard } from './keyboards.js';
import {
  VIP_CAMPAIGN_MESSAGE,
  chatPreviewText,
  likeCaption,
  matchText,
} from './text.js';
import {
  displayName,
  fetchOrCreateByTelegramId,
  isVipActiveRow,
  notificationsEnabled,
  setActive,
} from './users.js';

function absolutePhotoUrl(photoUrl) {
  if (!photoUrl || typeof photoUrl !== 'string') return null;
  if (photoUrl.startsWith('https://')) return photoUrl;
  if (typeof URL !== 'undefined' && photoUrl.startsWith('/') && WEBAPP_URL.startsWith('https://')) {
    try {
      const resolved = new URL(photoUrl, WEBAPP_URL);
      return resolved.protocol === 'https:' ? resolved.toString() : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function alreadySent(userId, type, relatedUserId) {
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3_600_000);
  const related = relatedUserId == null
    ? isNull(notificationsLog.relatedUserId)
    : eq(notificationsLog.relatedUserId, relatedUserId);
  const row = await db
    .select()
    .from(notificationsLog)
    .where(
      and(
        eq(notificationsLog.userId, userId),
        eq(notificationsLog.type, type),
        related,
        gt(notificationsLog.sentAt, cutoff),
      ),
    )
    .get();
  return row != null;
}

async function logNotification(userId, type, relatedUserId, messageId) {
  await db
    .insert(notificationsLog)
    .values({
      userId,
      type,
      relatedUserId: relatedUserId ?? null,
      messageId: messageId ?? null,
    })
    .run();
}

async function pinIfPossible(chatId, messageId) {
  if (!messageId) return;
  try {
    await api.pinChatMessage({ chat_id: chatId, message_id: messageId });
  } catch (error) {
    // Pin permissions vary by chat; delivery still counts as success.
    console.warn('Could not pin LibMatch notification:', error?.message || error);
  }
}

// A 403 means "bot was blocked by the user" — mark inactive, stop retrying.
async function sendSafely(telegramId, send) {
  try {
    return await send();
  } catch (error) {
    if (error instanceof BotApiError && error.code === 403) {
      await setActive(telegramId, false).catch(() => {});
      console.warn(`User ${telegramId} blocked the bot; marked inactive.`);
      return false;
    }
    console.error('Failed to send LibMatch notification:', error?.message || error);
    return false;
  }
}

function bridgeVipActive(bridgeUser) {
  if (!bridgeUser || !bridgeUser.isVip) return null; // unknown -> use mirror
  if (!bridgeUser.vipExpiresAt) return true;
  const expires = new Date(bridgeUser.vipExpiresAt).getTime();
  return Number.isFinite(expires) ? expires > Date.now() : null;
}

// --- liked_you ---------------------------------------------------------------

export async function sendLikedYouNotification(recipientTelegramId, likerTelegramId) {
  const recipient = await fetchOrCreateByTelegramId(recipientTelegramId);
  const liker = await fetchOrCreateByTelegramId(likerTelegramId);
  if (!recipient || !liker || !recipient.isActive) return false;
  if (await alreadySent(recipient.id, 'liked_you', liker.id)) return false;

  const [recipientBridge, likerBridge] = await Promise.all([
    fetchLibMatchUser(recipientTelegramId),
    fetchLibMatchUser(likerTelegramId),
  ]);
  const bridgeVip = bridgeVipActive(recipientBridge);
  const isVip = bridgeVip == null ? isVipActiveRow(recipient) : bridgeVip;
  const likerName = likerBridge?.name || likerBridge?.firstName || displayName(liker);
  const photoUrl = absolutePhotoUrl(likerBridge?.photoUrl || liker.photoUrl);

  const caption = likeCaption({ isVip, likerName });
  const keyboard = appKeyboard(WEBAPP_URL, 'Open LibMatch 🖤', { tab: 'likes' });

  const delivered = await sendSafely(recipientTelegramId, async () => {
    const message = photoUrl
      ? await api.sendPhoto({
        chat_id: recipientTelegramId,
        photo: photoUrl,
        caption,
        has_spoiler: !isVip,
        reply_markup: keyboard,
      })
      : await api.sendMessage({
        chat_id: recipientTelegramId,
        text: caption,
        reply_markup: keyboard,
      });
    await pinIfPossible(recipientTelegramId, message.message_id);
    await logNotification(recipient.id, 'liked_you', liker.id, message.message_id);
    return true;
  });
  return delivered === true;
}

// --- new_match -----------------------------------------------------------------

export async function sendMatchNotification(recipientTelegramId, matchedTelegramId, matchId = null) {
  const recipient = await fetchOrCreateByTelegramId(recipientTelegramId);
  const matched = await fetchOrCreateByTelegramId(matchedTelegramId);
  if (!recipient || !matched || !recipient.isActive) return false;
  if (await alreadySent(recipient.id, 'new_match', matched.id)) return false;

  const matchedBridge = await fetchLibMatchUser(matchedTelegramId);
  const matchedName = matchedBridge?.name || matchedBridge?.firstName || displayName(matched, 'your match');

  const delivered = await sendSafely(recipientTelegramId, async () => {
    const message = await api.sendMessage({
      chat_id: recipientTelegramId,
      text: matchText(matchedName),
      reply_markup: appKeyboard(WEBAPP_URL, 'Go to chat 💬', { tab: 'chat', matchId }),
    });
    await logNotification(recipient.id, 'new_match', matched.id, message.message_id);
    return true;
  });
  return delivered === true;
}

// --- chat_message (offline DM) ---------------------------------------------------

export async function sendMessageNotification(recipientTelegramId, senderTelegramId, matchId, content) {
  const recipient = await fetchOrCreateByTelegramId(recipientTelegramId);
  const sender = await fetchOrCreateByTelegramId(senderTelegramId);
  if (!recipient || !sender || !recipient.isActive) return false;

  const recipientBridge = await fetchLibMatchUser(recipientTelegramId);
  const enabled = recipientBridge?.notificationsEnabled ?? notificationsEnabled(recipient);
  if (!enabled) return false;

  const senderBridge = senderTelegramId === recipientTelegramId
    ? recipientBridge
    : await fetchLibMatchUser(senderTelegramId);
  const senderName = senderBridge?.name || senderBridge?.firstName || displayName(sender);

  const delivered = await sendSafely(recipientTelegramId, async () => {
    const message = await api.sendMessage({
      chat_id: recipientTelegramId,
      text: chatPreviewText(senderName, content, CHAT_PREVIEW_LENGTH),
      reply_markup: appKeyboard(WEBAPP_URL, 'Reply on LibMatch 🖤', { tab: 'chat', matchId }),
    });
    await logNotification(recipient.id, 'chat_message', sender.id, message.message_id);
    return true;
  });
  return delivered === true;
}

// --- vip_granted -------------------------------------------------------------------

export async function sendVipGrantedNotification(recipientTelegramId) {
  const recipient = await fetchOrCreateByTelegramId(recipientTelegramId);
  if (!recipient || !recipient.isActive) return false;
  if (await alreadySent(recipient.id, 'vip_granted', null)) return false;

  const delivered = await sendSafely(recipientTelegramId, async () => {
    const message = await api.sendMessage({
      chat_id: recipientTelegramId,
      text: VIP_CAMPAIGN_MESSAGE,
      reply_markup: appKeyboard(WEBAPP_URL, 'Return to LibMatch 🖤', { tab: 'profile' }),
    });
    await pinIfPossible(recipientTelegramId, message.message_id);
    await logNotification(recipient.id, 'vip_granted', null, message.message_id);
    return true;
  });
  return delivered === true;
}
