import { useCallback, useEffect, useRef, useState } from 'react';
import { impact, notify } from '../../lib/telegram.js';
import { SendIcon, VerifiedBadge } from './icons.jsx';

function errorMessage(error) {
  return error?.response?.data?.error?.message || error?.message || 'Message failed to send. Try again.';
}

function withSenderSide(message, userId) {
  if (message?.senderUserId == null || userId == null) return message;
  return {
    ...message,
    sender: String(message.senderUserId) === String(userId) ? 'user' : 'profile',
  };
}

function mergeMessages(current, incoming, userId) {
  const byId = new Map();
  for (const message of [...current, ...incoming]) {
    const normalized = withSenderSide(message, userId);
    byId.set(String(normalized.id), { ...byId.get(String(normalized.id)), ...normalized });
  }
  return [...byId.values()].sort((left, right) => {
    const time = new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
    if (time !== 0) return time;
    return String(left.id).localeCompare(String(right.id), undefined, { numeric: true });
  });
}

function relativeLastSeen(value) {
  if (!value) return 'Offline';
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `Last seen ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  return `Last seen ${Math.floor(hours / 24)}d ago`;
}

export default function ChatThread({
  match,
  userId,
  isDemo,
  socket,
  isConnected,
  onSend,
  onLoadMessages,
  onBack,
}) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(Boolean(match.profile.isOnline));
  const [partnerLastSeen, setPartnerLastSeen] = useState(match.profile.lastSeenAt || null);
  const scrollRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const syncHistory = useCallback(async () => {
    try {
      const loaded = await onLoadMessages(match.id);
      if (loaded) setMessages((current) => mergeMessages(current, loaded, userId));
    } catch { /* REST history remains a best-effort fallback when temporarily offline. */ }
  }, [match.id, onLoadMessages, userId]);

  useEffect(() => {
    setPartnerOnline(Boolean(match.profile.isOnline));
    setPartnerLastSeen(match.profile.lastSeenAt || null);
  }, [match.id, match.profile.isOnline, match.profile.lastSeenAt]);

  useEffect(() => {
    syncHistory();
    return () => {
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    };
  }, [syncHistory]);

  useEffect(() => {
    if (!socket || isDemo || !isConnected) {
      setPartnerTyping(false);
      return undefined;
    }

    const matchId = String(match.id);
    const updateIncoming = (message) => {
      if (String(message.matchId) !== matchId) return;
      setMessages((current) => mergeMessages(current, [message], userId));
    };
    const updateDelivered = (receipt) => {
      if (String(receipt.matchId) !== matchId) return;
      const ids = new Set((receipt.messageIds || []).map(String));
      setMessages((current) => current.map((message) => (
        (ids.has(String(message.id)) || (!ids.size && message.sender === 'user'))
          ? { ...message, deliveredAt: message.deliveredAt || receipt.deliveredAt }
          : message
      )));
    };
    const updateRead = (receipt) => {
      if (String(receipt.matchId) !== matchId || String(receipt.readBy) === String(userId)) return;
      const ids = new Set((receipt.messageIds || []).map(String));
      setMessages((current) => current.map((message) => (
        (ids.has(String(message.id)) || (!ids.size && message.sender === 'user'))
          ? { ...message, deliveredAt: message.deliveredAt || receipt.readAt, readAt: receipt.readAt }
          : message
      )));
    };
    const updateTyping = (payload) => {
      if (String(payload.matchId) === matchId && String(payload.userId) !== String(userId)) {
        setPartnerTyping(true);
        if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = window.setTimeout(() => setPartnerTyping(false), 3_000);
      }
    };
    const stopTyping = (payload) => {
      if (String(payload.matchId) === matchId && String(payload.userId) !== String(userId)) {
        setPartnerTyping(false);
      }
    };
    const updatePresence = (payload) => {
      if (String(payload.userId) !== String(match.profile.id)) return;
      setPartnerOnline(Boolean(payload.isOnline));
      setPartnerLastSeen(payload.lastSeenAt || null);
    };

    socket.on('new_message', updateIncoming);
    socket.on('messages_delivered', updateDelivered);
    socket.on('messages_read', updateRead);
    socket.on('user_typing', updateTyping);
    socket.on('user_stop_typing', stopTyping);
    socket.on('presence_update', updatePresence);
    socket.emit('join_match', { matchId });
    socket.emit('mark_read', { matchId });
    syncHistory();

    return () => {
      socket.off('new_message', updateIncoming);
      socket.off('messages_delivered', updateDelivered);
      socket.off('messages_read', updateRead);
      socket.off('user_typing', updateTyping);
      socket.off('user_stop_typing', stopTyping);
      socket.off('presence_update', updatePresence);
      socket.emit('stop_typing', { matchId });
    };
  }, [socket, isConnected, isDemo, match.id, match.profile.id, userId, syncHistory]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, partnerTyping]);

  const stopTyping = () => {
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    if (socket?.connected && !isDemo) socket.emit('stop_typing', { matchId: String(match.id) });
  };

  const handleDraftChange = (value) => {
    setDraft(value);
    if (!socket?.connected || isDemo) return;
    socket.emit('typing', { matchId: String(match.id) });
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(stopTyping, 1_500);
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    setDraft('');
    stopTyping();
    try {
      const message = await onSend(match.id, body, socket);
      impact('light');
      if (message) setMessages((current) => mergeMessages(current, [message], userId));
      // Demo partner reply lands ~1.6s later; re-sync shortly after.
      if (isDemo) {
        window.setTimeout(async () => {
          try {
            const synced = await onLoadMessages(match.id);
            if (synced) {
              setMessages((current) => {
                if (isDemo) notify('success');
                return mergeMessages(current, synced, userId);
              });
            }
          } catch { /* best effort sync */ }
        }, 2000);
      }
    } catch (sendError) {
      setError(errorMessage(sendError));
      setDraft(body);
    } finally {
      setSending(false);
    }
  };

  const partnerStatus = isDemo
    ? match.profile.city
    : partnerOnline ? 'Online' : relativeLastSeen(partnerLastSeen);

  return (
    <div className="chat-thread" role="dialog" aria-modal="true" aria-label={`Chat with ${match.profile.name}`}>
      <header className="chat-thread__header">
        <button type="button" className="icon-button" aria-label="Back to chats" onClick={onBack}>‹</button>
        <img src={match.profile.photo} alt="" className="chat-thread__avatar" />
        <div>
          <strong>{match.profile.name} {match.profile.verified && <VerifiedBadge />}</strong>
          <small className={partnerOnline && !isDemo ? 'chat-presence chat-presence--online' : 'chat-presence'}>
            {partnerStatus}{!isDemo && !isConnected ? ' · reconnecting…' : ''}
          </small>
        </div>
      </header>

      <div className="chat-thread__scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="chat-thread__starter">
            You matched with {match.profile.name}. First messages with a question get 2× more replies 💬
          </p>
        )}
        {messages.map((message) => {
          const own = withSenderSide(message, userId).sender === 'user';
          const receipt = own && !isDemo
            ? message.readAt ? 'Read ✓✓' : message.deliveredAt ? 'Delivered ✓✓' : 'Sent ✓'
            : '';
          return (
            <div
              key={message.id}
              className={`bubble-wrap bubble-wrap--${own ? 'out' : 'in'}`}
            >
              <p className={`bubble bubble--${own ? 'out' : 'in'}`}>{message.body}</p>
              {receipt && <small className="message-receipt">{receipt}</small>}
            </div>
          );
        })}
        {partnerTyping && <p className="chat-typing-indicator">{match.profile.name} is typing…</p>}
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>

      <footer className="chat-composer">
        <input
          type="text"
          placeholder={`Message ${match.profile.name}...`}
          aria-label="Message text"
          value={draft}
          maxLength={2000}
          onChange={(event) => handleDraftChange(event.target.value)}
          onBlur={stopTyping}
          onKeyDown={(event) => { if (event.key === 'Enter') send(); }}
        />
        <button
          type="button"
          className="chat-composer__send"
          aria-label="Send message"
          disabled={!draft.trim() || sending}
          onClick={send}
        >
          <SendIcon />
        </button>
      </footer>
    </div>
  );
}
