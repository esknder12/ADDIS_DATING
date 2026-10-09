export async function notifyAfterSwipe(req, outcome) {
  const notifications = req.app.get('notificationService');
  const bot = req.app.get('bot');
  if (!notifications || !bot || !outcome) return;

  if (outcome.createdMatch) {
    await Promise.all([
      notifications.sendMatchNotification(bot, outcome.userId, outcome.targetUserId, outcome.match?.id),
      notifications.sendMatchNotification(bot, outcome.targetUserId, outcome.userId, outcome.match?.id),
    ]);
  } else if (!outcome.matched && outcome.shouldNotifyLikedYou) {
    await notifications.sendLikedYouNotification(bot, outcome.targetUserId, outcome.userId);
  }
}
