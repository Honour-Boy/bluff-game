'use client';

// ─── ChatPanel — floating button + slide-in panel ─────────────
//
// Mobile-first. iOS safe-area aware. 16px font on inputs to prevent
// iOS auto-zoom on focus. 44×44 minimum touch targets.
//
// Bubbles: left-aligned (theirs) vs right-aligned (mine), subtle
// accent stripe on the sender side instead of a hard border. Name +
// timestamp shown only on the first message of a run from the same
// sender within 60 seconds. Plain backgrounds use the existing
// surface tokens; radius pinned to the design-system 4px.

import { useEffect, useMemo, useRef, useState } from 'react';

const TEXT_MAX = 500;
const GROUP_WINDOW_MS = 60_000;

// "12:34" — small, dim timestamp shown above first message in a run
function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// Group consecutive messages from the same author within 60s.
// Each entry gets `showHeader: boolean` so we don't repeat name+time.
function annotateGrouping(messages) {
  return messages.map((m, i) => {
    const prev = messages[i - 1];
    const sameAuthor = prev && prev.userId === m.userId;
    const closeInTime = prev && (m.ts - prev.ts) < GROUP_WINDOW_MS;
    return { ...m, showHeader: !(sameAuthor && closeInTime) };
  });
}

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

  const grouped = useMemo(() => annotateGrouping(messages), [messages]);

  // Autoscroll on new messages or first open
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [grouped, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={unread > 0 ? `Open chat — ${unread} new` : 'Open chat'}
          style={{
            position: 'fixed',
            right: 'max(16px, env(safe-area-inset-right))',
            bottom: 'max(16px, env(safe-area-inset-bottom))',
            zIndex: 9000,
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontSize: 22,
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            transition: 'transform 0.15s, border-color 0.15s',
            WebkitTapHighlightColor: 'transparent',
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

      {/* Mobile backdrop — taps outside the panel close it. Hidden on
          desktop where the dock layout doesn't need it. */}
      {open && (
        <div
          onClick={onClose}
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 9099,
          }}
        />
      )}

      {/* Panel — full width on mobile, 380px dock on desktop */}
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
          {/* Header — safe-area aware so it sits below iOS notch */}
          <div style={{
            padding: '14px 14px 12px',
            paddingTop: 'calc(14px + env(safe-area-inset-top))',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 18,
              letterSpacing: '0.12em',
              color: 'var(--accent)',
            }}>
              ROOM CHAT
              {messages.length > 0 && (
                <span style={{
                  marginLeft: 8,
                  fontSize: 10,
                  color: 'var(--text-dim)',
                  letterSpacing: '0.1em',
                  fontFamily: "'Space Mono', monospace",
                }}>
                  {messages.length}
                </span>
              )}
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
                width: 44,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: -8,
                WebkitTapHighlightColor: 'transparent',
              }}
            >✕</button>
          </div>

          {/* Messages */}
          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 12px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {grouped.length === 0 && (
              <div style={{
                color: 'var(--text-dim)',
                fontSize: 12,
                textAlign: 'center',
                marginTop: 32,
                lineHeight: 1.7,
                padding: '0 24px',
              }}>
                <div style={{ fontSize: 28, opacity: 0.5, marginBottom: 8 }}>💬</div>
                No messages yet.<br />
                <span style={{ opacity: 0.7 }}>Say hi to your room.</span>
              </div>
            )}

            {grouped.map((m) => {
              const mine = m.userId === myUserId;
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: mine ? 'flex-end' : 'flex-start',
                    marginTop: m.showHeader ? 10 : 1,
                  }}
                >
                  {m.showHeader && (
                    <div style={{
                      fontSize: 10,
                      color: 'var(--text-dim)',
                      letterSpacing: '0.08em',
                      marginBottom: 3,
                      padding: mine ? '0 4px 0 0' : '0 0 0 4px',
                      display: 'flex',
                      gap: 6,
                      alignItems: 'baseline',
                    }}>
                      <span style={{
                        textTransform: 'uppercase',
                        color: mine ? 'var(--accent)' : 'var(--text)',
                        fontWeight: 700,
                      }}>
                        {mine ? 'You' : m.username}
                      </span>
                      <span style={{ opacity: 0.6 }}>{formatTime(m.ts)}</span>
                    </div>
                  )}
                  <div style={{
                    maxWidth: '82%',
                    padding: '8px 12px',
                    background: mine ? 'var(--surface2)' : 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    // Subtle sender stripe: lime accent on mine (right edge),
                    // dim border-token stripe on theirs (left edge). Avoids the
                    // hard "everything's outlined in yellow" look.
                    borderRight: mine ? '3px solid var(--accent)' : '1px solid var(--border)',
                    borderLeft: !mine ? '3px solid var(--text-dim)' : '1px solid var(--border)',
                    fontSize: 14,
                    color: 'var(--text)',
                    wordBreak: 'break-word',
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {m.text}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Composer — sticks to bottom, safe-area padded.
              fontSize 16px on the textarea is non-negotiable: anything
              smaller triggers iOS Safari's auto-zoom on focus. */}
          <form
            onSubmit={handleSubmit}
            style={{
              padding: '10px 10px',
              paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
              borderTop: '1px solid var(--border)',
              background: 'var(--surface)',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-end',
              flexShrink: 0,
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
                padding: '11px 12px',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text)',
                fontSize: 16,
                fontFamily: 'inherit',
                outline: 'none',
                minHeight: 44,
                maxHeight: 140,
                lineHeight: 1.4,
              }}
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="primary"
              aria-label="Send message"
              style={{
                padding: '0 16px',
                fontSize: 13,
                minHeight: 44,
                minWidth: 64,
                opacity: draft.trim() ? 1 : 0.4,
                WebkitTapHighlightColor: 'transparent',
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
