'use client';

// ─── ChatPanel — floating button + slide-in panel ─────────────
//
// Floating 💬 button bottom-right with unread badge. Click → opens
// a panel: full-screen overlay on phones, side dock on desktop.
// History is mirrored from room.chatLog (last 50 messages, in-memory
// on the server). Plain text only, 500 char cap, server-side rate
// limit at 5 msgs / 3 s.

import { useEffect, useRef, useState } from 'react';

const TEXT_MAX = 500;

export function ChatPanel({
  messages,
  unread,
  open,
  onOpen,
  onClose,
  onSend,
  myUserId,
}) {
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);

  // Auto-scroll to bottom on new message or first open
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  return (
    <>
      {/* Floating button — always rendered while in a room */}
      {!open && (
        <button
          type="button"
          onClick={onOpen}
          aria-label="Open chat"
          style={{
            position: 'fixed',
            right: 20,
            bottom: 20,
            zIndex: 9000,
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontSize: 22,
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
            transition: 'transform 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'var(--border)'; }}
        >
          💬
          {unread > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 20,
                height: 20,
                padding: '0 6px',
                borderRadius: 10,
                background: 'var(--accent2)',
                color: '#0a0a0b',
                fontSize: 11,
                fontWeight: 700,
                lineHeight: '20px',
                textAlign: 'center',
                boxShadow: '0 0 6px var(--accent2)',
              }}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      )}

      {open && (
        <div
          aria-modal="true"
          role="dialog"
          aria-label="Chat"
          style={{
            position: 'fixed',
            right: 0,
            top: 0,
            bottom: 0,
            zIndex: 9100,
            width: '100%',
            maxWidth: 380,
            background: 'var(--surface)',
            borderLeft: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-12px 0 40px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 18,
              letterSpacing: '0.12em',
              color: 'var(--accent)',
            }}>
              ROOM CHAT
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close chat"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                fontSize: 18,
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >✕</button>
          </div>

          {/* Messages */}
          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {messages.length === 0 && (
              <div style={{
                color: 'var(--text-dim)',
                fontSize: 12,
                textAlign: 'center',
                marginTop: 20,
                lineHeight: 1.6,
              }}>
                No messages yet.<br />Say hi to your room.
              </div>
            )}
            {messages.map((m) => {
              const mine = m.userId === myUserId;
              return (
                <div key={m.id} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: mine ? 'flex-end' : 'flex-start',
                }}>
                  <div style={{
                    fontSize: 10,
                    color: 'var(--text-dim)',
                    letterSpacing: '0.06em',
                    marginBottom: 3,
                  }}>
                    {mine ? 'You' : m.username}
                  </div>
                  <div style={{
                    maxWidth: '85%',
                    padding: '8px 11px',
                    background: mine ? 'rgba(232,255,74,0.08)' : 'var(--surface2)',
                    border: `1px solid ${mine ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 8,
                    fontSize: 13,
                    color: 'var(--text)',
                    wordBreak: 'break-word',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {m.text}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Composer */}
          <form
            onSubmit={handleSubmit}
            style={{
              padding: '10px 12px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-end',
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, TEXT_MAX))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Message your room…"
              rows={1}
              style={{
                flex: 1,
                resize: 'none',
                padding: '9px 11px',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text)',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
                minHeight: 36,
                maxHeight: 120,
              }}
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="primary"
              style={{
                padding: '9px 14px',
                fontSize: 12,
                opacity: draft.trim() ? 1 : 0.4,
              }}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
