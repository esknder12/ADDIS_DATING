import { useEffect, useRef, useState } from 'react';
import { impact, notify } from '../../lib/telegram.js';
import { SendIcon, VerifiedBadge } from './icons.jsx';

function errorMessage(error) {
  return error?.response?.data?.error?.message || 'Message failed to send. Try again.';
}

export default function ChatThread({ match, isDemo, onSend, onLoadMessages, onBack }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    onLoadMessages(match.id).then((loaded) => {
      if (!cancelled) setMessages(loaded || []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [match.id, onLoadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    setDraft('');
    try {
      const message = await onSend(match.id, body);
      impact('light');
      if (message) setMessages((current) => [...current, message]);
      // Demo partner reply lands ~1.6s later; re-sync shortly after.
      window.setTimeout(async () => {
        try {
          const synced = await onLoadMessages(match.id);
          if (synced) {
            setMessages((current) => {
              if (isDemo) notify('success');
              return synced.length > current.length ? synced : current;
            });
          }
        } catch { /* best effort sync */ }
      }, 2000);
    } catch (sendError) {
      setError(errorMessage(sendError));
      setDraft(body);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat-thread" role="dialog" aria-modal="true" aria-label={`Chat with ${match.profile.name}`}>
      <header className="chat-thread__header">
        <button type="button" className="icon-button" aria-label="Back to chats" onClick={onBack}>‹</button>
        <img src={match.profile.photo} alt="" className="chat-thread__avatar" />
        <div>
          <strong>{match.profile.name} {match.profile.verified && <VerifiedBadge />}</strong>
          <small>{match.profile.city}</small>
        </div>
      </header>

      <div className="chat-thread__scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="chat-thread__starter">
            You matched with {match.profile.name}. First messages with a question get 2× more replies 💬
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`bubble-wrap bubble-wrap--${message.sender === 'user' ? 'out' : 'in'}`}
          >
            <p className={`bubble bubble--${message.sender === 'user' ? 'out' : 'in'}`}>{message.body}</p>
          </div>
        ))}
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>

      <footer className="chat-composer">
        <input
          type="text"
          placeholder={`Message ${match.profile.name}...`}
          aria-label="Message text"
          value={draft}
          maxLength={2000}
          onChange={(event) => setDraft(event.target.value)}
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
