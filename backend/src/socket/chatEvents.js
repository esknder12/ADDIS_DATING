export const userRoom = (userId) => `user:${String(userId)}`;
export const matchRoom = (matchId) => `match:${String(matchId)}`;

/** Broadcast a persisted message, mark it delivered for online recipients, or queue a Telegram push. */
export async function dispatchChatMessage({ io, appRepository, bot, notificationService }, created) {
  if (!created) return null;

  let message = created.message;
  const { matchId, senderUserId, recipientUserId, content } = created;
  let recipientOnline = false;

  if (recipientUserId && io) {
    try {
      const sockets = await io.in(userRoom(recipientUserId)).fetchSockets();
      recipientOnline = sockets.length > 0;
      if (recipientOnline) {
        message = await appRepository.markMessageDeliveredForUser(message.id, recipientUserId) || message;
      }
    } catch (error) {
      console.warn('Could not check chat recipient presence:', error.message);
    }
  }

  if (io) {
    io.to(matchRoom(matchId)).emit('new_message', message);
    io.to(userRoom(senderUserId)).emit('chat_list_updated', { matchId });
    if (recipientUserId) {
      io.to(userRoom(recipientUserId)).emit('chat_list_updated', { matchId });
    }
  }

  if (recipientUserId && !recipientOnline && notificationService?.sendMessageNotification) {
    Promise.resolve(notificationService.sendMessageNotification(
      bot,
      recipientUserId,
      senderUserId,
      matchId,
      content,
    )).catch((error) => {
      console.warn('Could not send chat push notification:', error.message);
    });
  }

  return message;
}
