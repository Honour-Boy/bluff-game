'use client';

import { useState } from 'react';
import { CloseIcon } from '../shared/CloseIcon';
import {
  ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
  submitIssueReport,
} from './issueLog';

// ─── IssueReportModal — the tester feedback form (UAT only) ───────────────────
// Category + severity + message → one RLS-scoped insert via the player's own
// Supabase session. Guests get a sign-in nudge (reporting is sign-in-required).
// Styling follows the app convention: inline styles over CSS custom properties.

export function IssueReportModal({ user, isGuest, context, onClose }) {
  const [category, setCategory] = useState('bug');
  const [severity, setSeverity] = useState('normal');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { ok, error }

  const handleSend = async () => {
    setSending(true);
    setResult(null);
    const res = await submitIssueReport({ user, category, severity, message, context });
    setResult(res);
    setSending(false);
    if (res.ok) {
      setMessage('');
      // Let the success line read for a beat, then close.
      setTimeout(() => onClose?.(), 1100);
    }
  };

  const Chip = ({ active, onClick, children }) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 999,
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'rgba(200,146,46,0.1)' : 'var(--surface2)',
        color: active ? 'var(--accent)' : 'var(--text-mid)',
        fontFamily: "'Cinzel', serif",
        fontSize: 11,
        letterSpacing: '0.06em',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {children}
    </button>
  );

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9600, padding: 24,
    }}>
      <div
        className="fade-in"
        style={{
          maxWidth: 420, width: '100%', maxHeight: '86dvh', overflowY: 'auto',
          position: 'relative',
          background: 'linear-gradient(160deg, var(--surface2) 0%, var(--surface) 100%)',
          border: '1px solid var(--border-lit)',
          borderRadius: 'var(--radius-lg)',
          padding: '26px 22px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 12, right: 14,
            background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <CloseIcon size={18} />
        </button>

        <div style={{
          fontFamily: "'Cinzel', serif", fontSize: 18, fontWeight: 700,
          letterSpacing: '0.1em', color: 'var(--accent)', marginBottom: 4,
          textShadow: '0 0 12px rgba(200,146,46,0.25)',
        }}>
          Report an Issue
        </div>
        <div style={{
          fontFamily: "'Crimson Text', serif", fontSize: 13, fontStyle: 'italic',
          color: 'var(--text-dim)', marginBottom: 18, lineHeight: 1.5,
        }}>
          Found a bug or something confusing? Tell us — your current screen and
          game state are attached automatically.
        </div>

        {isGuest || !user?.id ? (
          <div style={{
            fontFamily: "'Crimson Text', serif", fontSize: 14, fontStyle: 'italic',
            color: 'var(--text-mid)', lineHeight: 1.6,
            padding: '12px 14px', borderRadius: 'var(--radius)',
            border: '1px solid var(--border)', background: 'var(--surface2)',
          }}>
            Sign in to send a report — feedback is tied to your account so we can
            follow up.
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>Type</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ISSUE_CATEGORIES.map((c) => (
                  <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
                    {c.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>Severity</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ISSUE_SEVERITIES.map((s) => (
                  <Chip key={s.id} active={severity === s.id} onClick={() => setSeverity(s.id)}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>What happened?</div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={4000}
                rows={5}
                placeholder="Describe the issue, and what you were doing when it happened…"
                style={{
                  width: '100%', resize: 'vertical',
                  background: 'var(--surface)', color: 'var(--text)',
                  border: '1px solid var(--border-lit)', borderRadius: 'var(--radius)',
                  padding: '10px 12px', fontFamily: "'Crimson Text', serif", fontSize: 14,
                  lineHeight: 1.5, outline: 'none',
                }}
              />
              <div style={{
                textAlign: 'right', fontFamily: "'Space Mono', monospace",
                fontSize: 9, color: 'var(--text-dim)', marginTop: 4,
              }}>
                {message.length}/4000
              </div>
            </div>

            {result && !result.ok && (
              <div style={{ ...noticeStyle, color: '#c85050', borderColor: 'var(--accent2)' }}>
                {result.error}
              </div>
            )}
            {result && result.ok && (
              <div style={{ ...noticeStyle, color: 'var(--alive)', borderColor: 'var(--alive)' }}>
                Sent — thank you. Closing…
              </div>
            )}

            <button
              type="button"
              className="primary"
              onClick={handleSend}
              disabled={sending || !message.trim()}
              style={{
                width: '100%', marginTop: 6, padding: '12px',
                letterSpacing: '0.14em',
                opacity: sending || !message.trim() ? 0.5 : 1,
                cursor: sending || !message.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {sending ? 'Sending…' : 'Send Report'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const labelStyle = {
  fontFamily: "'Cinzel', serif", fontSize: 10, color: 'var(--text-dim)',
  letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 8,
};

const noticeStyle = {
  padding: '9px 12px', marginBottom: 10,
  borderRadius: 'var(--radius)', border: '1px solid',
  fontFamily: "'Crimson Text', serif", fontSize: 13, fontStyle: 'italic',
};
