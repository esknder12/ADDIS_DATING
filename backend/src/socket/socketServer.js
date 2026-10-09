import { Server } from 'socket.io';
import { validateTelegramInitData } from '../middleware/telegramAuth.js';
import { dispatchChatMessage, matchRoom, userRoom } from './chatEvents.js';

let activeIo = null;
let presenceSweepTimer = null;

function validMatchId(value) {
  const text = String(value ?? '');
  if (!/^[1-9]\d{0,18}$/.test(text)) return null;
  try {
    const number = BigInt(text);
    return number <= 9_223_372_036_854_775_807n ? number.toString() : null;
  } catch {
    return null;
  }
}

function readHandshakeInitData(socket) {
  const authValue = socket.handshake.auth?.initData;
  if (typeof authValue === 'string' && authValue) return authValue;
  const header = socket.handshake.headers?.authorization || '';
  const match = /^tma\s+(.+)$/i.exec(header);
  return match?.[1] || null;
}

export function createSocketAuthMiddleware({ pool, runtimeConfig }) {
  return async function authenticateSocket(socket, next) {
    try {
      if (!pool) {
        const error = new Error('Database is not configured');
        error.data = { code: 'DATABASE_UNAVAILABLE' };
        return next(error);
      }
      const initData = readHandshakeInitData(socket);
      if (!initData) {
        const error = new Error('Open Dategram from Telegram to continue.');
        error.data = { code: 'MISSING_INIT_DATA' };
        return next(error);
      }

      const auth = validateTelegramInitData(initData, runtimeConfig.botToken, {
        maxAgeSeconds: runtimeConfig.telegramAuthMaxAgeSeconds,
      });
      const result = await pool.query(
        `SELECT id::text AS id, telegram_id::text AS telegram_id
         FROM users
         WHERE telegram_id = $1 AND is_active = TRUE AND onboarding_completed = TRUE
         LIMIT 1`,
        [auth.user.id],
      );
      const user = result.rows[0];
      if (!user) {
        const error = new Error('Complete your Dategram profile before chatting.');
        error.data = { code: 'USER_NOT_FOUND' };
        return next(error);
      }

      socket.data.userId = String(user.id);
      socket.data.telegramId = String(user.telegram_id);
      socket.data.authDate = auth.authDate;
      return next();
    } catch (cause) {
      const error = new Error(cause?.message || 'Telegram authentication failed.');
      error.data = { code: cause?.code || 'INVALID_TELEGRAM_AUTH' };
      return next(error);
    }
  };
}

export function initSocketServer(httpServer, {
  pool,
  appRepository,
  runtimeConfig,
  bot = null,
  notificationService = null,
}) {
  if (!pool || !appRepository?.isAvailable) return null;

  const allowedOrigins = runtimeConfig.isProduction
    ? runtimeConfig.corsOrigins
    : true;
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
    allowRequest(request, callback) {
      const origin = request.headers.origin;
      const allowed = !origin || !runtimeConfig.isProduction || runtimeConfig.corsOrigins.includes(origin);
      callback(allowed ? null : 'Origin is not allowed by CORS', allowed);
    },
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false,
    },
  });

  io.use(createSocketAuthMiddleware({ pool, runtimeConfig }));
  io.on('connection', (socket) => {
    void handleConnection(io, socket, {
      pool,
      appRepository,
      bot,
      notificationService,
    }).catch((error) => {
      console.error('Socket connection setup failed:', error.message);
      socket.disconnect(true);
    });
  });

  presenceSweepTimer = setInterval(() => {
    void (async () => {
      try {
        const stale = await pool.query(
          `UPDATE user_presence SET is_online = FALSE, socket_id = NULL
           WHERE is_online = TRUE AND last_seen_at < NOW() - INTERVAL '90 seconds'
           RETURNING user_id::text AS user_id, last_seen_at`,
        );
        for (const row of stale.rows) {
          const matchIds = await appRepository.listMatchIdsForUserId(row.user_id);
          for (const id of matchIds) {
            io.to(matchRoom(id)).emit('presence_update', {
              userId: String(row.user_id),
              isOnline: false,
              lastSeenAt: row.last_seen_at,
            });
          }
        }
      } catch (error) {
        console.warn('Presence cleanup failed:', error.message);
      }
    })();
  }, 30_000);
  presenceSweepTimer.unref?.();
  activeIo = io;
  return io;
}

function emitDeliveredReceipt(socket, room, deliveredBy, result) {
  if (!result?.updatedCount) return;
  socket.to(room).emit('messages_delivered', {
    matchId: result.matchId,
    deliveredBy: String(deliveredBy),
    messageIds: result.updatedMessageIds || [],
    deliveredAt: result.deliveredAt,
  });
}

async function handleConnection(io, socket, { pool, appRepository, bot, notificationService }) {
  const currentUserId = socket.data.userId;
  const ownRoom = userRoom(currentUserId);
  let matchIds = [];
  let disconnected = false;

  // Register all client events synchronously: the client may emit as soon as
  // the Socket.IO connect event fires, while presence/match setup is awaiting DB.
  socket.on('join_match', async (payload = {}, callback) => {
    const id = validMatchId(payload.matchId);
    try {
      if (!id || !await appRepository.hasMatchAccess(currentUserId, id)) {
        callback?.({ success: false, error: 'Conversation is not available.' });
        return;
      }
      const room = matchRoom(id);
      await socket.join(room);
      const delivery = await appRepository.markMessagesDeliveredForUser(currentUserId, id);
      emitDeliveredReceipt(socket, room, currentUserId, delivery);
      callback?.({ success: true, matchId: id });
    } catch (error) {
      console.error('join_match error:', error.message);
      callback?.({ success: false, error: 'Conversation is not available.' });
    }
  });

  socket.on('send_message', async (payload = {}, callback) => {
    const id = validMatchId(payload.matchId);
    const content = typeof payload.content === 'string' ? payload.content.trim() : '';
    if (!id || content.length < 1 || content.length > 2000) {
      callback?.({ success: false, error: 'Messages must be 1–2000 characters.' });
      return;
    }
    const now = Date.now();
    const recentMessages = (socket.data.messageTimes || []).filter((sentAt) => now - sentAt < 60_000);
    if (recentMessages.length >= 60) {
      socket.data.messageTimes = recentMessages;
      callback?.({ success: false, error: 'You are sending messages too quickly. Please wait a moment.' });
      return;
    }
    recentMessages.push(now);
    socket.data.messageTimes = recentMessages;
    try {
      const created = await appRepository.createMessageForUserId(currentUserId, id, content);
      if (!created) {
        callback?.({ success: false, error: 'You can only message people you matched with.' });
        return;
      }
      await socket.join(matchRoom(id));
      const message = await dispatchChatMessage({
        io,
        appRepository,
        bot,
        notificationService,
      }, created);
      callback?.({ success: true, message });
    } catch (error) {
      console.error('send_message error:', error.message);
      callback?.({ success: false, error: 'Failed to send message.' });
    }
  });

  socket.on('typing', (payload = {}) => {
    const id = validMatchId(payload.matchId);
    const now = Date.now();
    if (id && now - (socket.data.lastTypingAt || 0) >= 500 && socket.rooms.has(matchRoom(id))) {
      socket.data.lastTypingAt = now;
      socket.to(matchRoom(id)).emit('user_typing', { userId: currentUserId, matchId: id });
    }
  });

  socket.on('stop_typing', (payload = {}) => {
    const id = validMatchId(payload.matchId);
    if (id && socket.rooms.has(matchRoom(id))) {
      socket.to(matchRoom(id)).emit('user_stop_typing', { userId: currentUserId, matchId: id });
    }
  });

  socket.on('mark_read', async (payload = {}, callback) => {
    const id = validMatchId(payload.matchId);
    if (!id) {
      callback?.({ success: false, error: 'Conversation is not available.' });
      return;
    }
    try {
      const result = await appRepository.markMessagesReadForUser(currentUserId, id);
      if (!result) {
        callback?.({ success: false, error: 'Conversation is not available.' });
        return;
      }
      io.to(matchRoom(id)).emit('messages_read', {
        matchId: id,
        readBy: currentUserId,
        messageIds: result.updatedMessageIds || [],
        readAt: result.readAt,
      });
      io.to(ownRoom).emit('chat_list_updated', { matchId: id });
      callback?.({ success: true, ...result });
    } catch (error) {
      console.error('mark_read error:', error.message);
      callback?.({ success: false, error: 'Could not mark messages as read.' });
    }
  });

  socket.on('presence_ping', () => {
    pool.query(
      `UPDATE user_presence SET is_online = TRUE, last_seen_at = NOW()
       WHERE user_id = $1`,
      [currentUserId],
    ).catch((error) => console.warn('Presence heartbeat failed:', error.message));
  });

  socket.on('disconnect', (reason) => {
    disconnected = true;
    void (async () => {
      try {
        const remaining = await io.in(ownRoom).fetchSockets();
        const otherSocket = remaining.find((connected) => connected.id !== socket.id);
        if (otherSocket) {
          await pool.query(
            `UPDATE user_presence SET is_online = TRUE, socket_id = $2, last_seen_at = NOW()
             WHERE user_id = $1 AND socket_id = $3`,
            [currentUserId, otherSocket.id, socket.id],
          );
          return;
        }
        const offline = await pool.query(
          `UPDATE user_presence SET is_online = FALSE, socket_id = NULL, last_seen_at = NOW()
           WHERE user_id = $1 AND socket_id = $2 RETURNING last_seen_at`,
          [currentUserId, socket.id],
        );
        if (offline.rows.length > 0) {
          await pool.query('UPDATE users SET last_active_at = NOW() WHERE id = $1', [currentUserId]);
          const lastSeenAt = offline.rows[0].last_seen_at || new Date().toISOString();
          for (const id of matchIds) {
            socket.to(matchRoom(id)).emit('presence_update', {
              userId: currentUserId,
              isOnline: false,
              lastSeenAt,
            });
          }
        }
      } catch (error) {
        console.warn(`Presence disconnect update failed (${reason}):`, error.message);
      }
    })();
  });

  await socket.join(ownRoom);
  if (!socket.connected || disconnected) return;
  await pool.query(
    `INSERT INTO user_presence (user_id, is_online, socket_id, last_seen_at)
     VALUES ($1, TRUE, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       is_online = TRUE, socket_id = EXCLUDED.socket_id, last_seen_at = NOW()`,
    [currentUserId, socket.id],
  );
  if (!socket.connected || disconnected) {
    await pool.query(
      `UPDATE user_presence SET is_online = FALSE, socket_id = NULL, last_seen_at = NOW()
       WHERE user_id = $1 AND socket_id = $2`,
      [currentUserId, socket.id],
    );
    return;
  }
  await pool.query('UPDATE users SET last_active_at = NOW() WHERE id = $1', [currentUserId]);

  matchIds = await appRepository.listMatchIdsForUserId(currentUserId);
  for (const id of matchIds) {
    if (!socket.connected || disconnected) return;
    const room = matchRoom(id);
    await socket.join(room);
    const delivery = await appRepository.markMessagesDeliveredForUser(currentUserId, id);
    emitDeliveredReceipt(socket, room, currentUserId, delivery);
    socket.to(room).emit('presence_update', {
      userId: currentUserId,
      isOnline: true,
      lastSeenAt: new Date().toISOString(),
    });
  }
}

export function getIo() {
  return activeIo;
}

export function stopSocketServer(io = activeIo) {
  if (presenceSweepTimer) clearInterval(presenceSweepTimer);
  presenceSweepTimer = null;
  if (io === activeIo) activeIo = null;
  if (!io) return Promise.resolve();
  return new Promise((resolve) => io.close(() => resolve()));
}
