'use client';

import { useState } from 'react';
import { ShapeIcon } from '../shared/ShapeIcon';

// ─── Tavern divider ───────────────────────────────────────────────────────────
function TavernDivider({ label = 'or' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border-lit)', opacity: 0.6 }} />
      <span style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 9,
        color: 'var(--text-dim)',
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-lit)', opacity: 0.6 }} />
    </div>
  );
}

// ─── Google button — polished brass seal ─────────────────────────────────────
function GoogleButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}

      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '12px 16px',
        background: 'linear-gradient(160deg, var(--surface3) 0%, var(--surface2) 100%)',
        border: '1px solid var(--border-lit)',
        borderRadius: 'var(--radius)',
        color: 'var(--text-mid)',
        fontFamily: "'Cinzel', serif",
        fontSize: 11,
        letterSpacing: '0.12em',
        cursor: 'pointer',
        transition: 'all var(--transition)',
      }}
    >
      <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      Continue with Google
    </button>
  );
}

// ─── AuthScreen — the tavern gate ────────────────────────────────────────────
// Redesigned as a moody inn-registry: sign your name in the ledger or produce
// your seal (Google) to enter. Guests may enter under a pseudonym, but their
// place at the table vanishes when they leave.
// Single-device sessions: copy for the reason this device landed back at login.
const SIGNED_OUT_COPY = {
  signed_in_elsewhere: 'You signed in on another device, so this one was signed out.',
  account_in_room: 'This account is currently at a table on another device. Finish that game, or use a different account here.',
};

export function AuthScreen({ onSendEmailOtp, onGoogleSignIn, onGuestSignIn, error, setError, signedOutReason }) {
  const signedOutCopy = signedOutReason
    ? (SIGNED_OUT_COPY[signedOutReason] || SIGNED_OUT_COPY.signed_in_elsewhere)
    : null;
  const [email, setEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  // 'email' | 'guest' | 'sent'
  const [stage, setStage] = useState('email');
  const [submitting, setSubmitting] = useState(false);

  const handleSendLink = async (e) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return setError('Enter your email address');
    setSubmitting(true);
    const ok = await onSendEmailOtp({ email: email.trim() });
    setSubmitting(false);
    if (ok) setStage('sent');
  };

  const handleGuest = (e) => {
    e.preventDefault();
    setError(null);
    if (!onGuestSignIn) return;
    const res = onGuestSignIn({ username: guestName });
    if (!res?.ok) setError(res?.error || 'Could not start guest session');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        position: 'relative',
      }}
    >
      {/* Tavern floor - diagonal planks */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: `
          repeating-linear-gradient(
            -45deg,
            transparent 0px,
            transparent 28px,
            rgba(255,255,255,0.012) 28px,
            rgba(255,255,255,0.012) 29px
          )
        `,
      }} />

      {/* Ambient candlelight from top */}
      <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '70%', height: '35vh',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(200,146,46,0.1) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div
        className="fade-in"
        style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}
      >
        {/* Title: inn signboard */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h1
            className="candle-title title-emerge"
            style={{
              fontFamily: "'Cinzel Decorative', 'Cinzel', serif",
              fontSize: 72,
              color: 'var(--accent)',
              lineHeight: 0.95,
              letterSpacing: '0.1em',
              textShadow: '0 0 40px rgba(200,146,46,0.5), 0 2px 0 rgba(0,0,0,0.8)',
            }}
          >
            BLUFF
          </h1>
          <div style={{
            fontFamily: "'Cinzel', serif",
            color: 'var(--text-dim)',
            fontSize: 10,
            letterSpacing: '0.28em',
            marginTop: 8,
            textTransform: 'uppercase',
          }}>
            {stage === 'guest' ? 'Enter under a false name' : 'Sign the inn ledger'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 18, opacity: 0.35 }}>
            {['circle', 'square', 'triangle', 'cross', 'star'].map(shape => (
              <ShapeIcon key={shape} shape={shape} size={17} />
            ))}
          </div>
        </div>

        {/* Main card - the inn registry */}
        <div
          className="card tilt-panel"
          style={{
            padding: '26px 22px',
            boxShadow: '0 12px 48px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03)',
          }}
        >
          {signedOutCopy && !error && (
            <div style={{
              padding: '10px 14px',
              background: 'rgba(240,181,74,0.10)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius)',
              color: 'var(--accent)',
              fontFamily: "'Crimson Text', serif",
              fontSize: 14,
              marginBottom: 16,
              lineHeight: 1.5,
            }}>
              {signedOutCopy}
            </div>
          )}

          {error && (
            <div style={{
              padding: '10px 14px',
              background: 'rgba(155,28,28,0.12)',
              border: '1px solid var(--accent2)',
              borderRadius: 'var(--radius)',
              color: '#c85050',
              fontFamily: "'Crimson Text', serif",
              fontSize: 14,
              marginBottom: 16,
              lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          {/* Google + divider only on non-guest stages */}
          {stage !== 'guest' && (
            <>
              <GoogleButton onClick={onGoogleSignIn} />
              <TavernDivider />
            </>
          )}

          {/* ── Email stage ── */}
          {stage === 'email' && (
            <form onSubmit={handleSendLink} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: 6,
                  fontFamily: "'Cinzel', serif",
                  fontSize: 9,
                  color: 'var(--text-dim)',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                }}>
                  Your Post Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  required

                  style={{ letterSpacing: '0.04em' }}
                />
                <div style={{
                  fontFamily: "'Crimson Text', serif",
                  fontSize: 13,
                  color: 'var(--text-dim)',
                  marginTop: 7,
                  lineHeight: 1.6,
                  fontStyle: 'italic',
                }}>
                  A sign-in scroll will be dispatched to your address - no passphrase required.
                </div>
              </div>
              <button
                type="submit"
                className="primary"
          
                style={{ padding: '13px', marginTop: 4 }}
                disabled={submitting}
              >
                {submitting ? 'Dispatching scroll…' : 'Send Sign-In Link →'}
              </button>

              {onGuestSignIn && (
                <>
                  <TavernDivider />
                  <button
                    type="button"
  
                    onClick={() => { setStage('guest'); setError(null); }}
                    style={{ width: '100%', padding: '12px 16px', color: 'var(--text-dim)', letterSpacing: '0.1em' }}
                  >
                    Enter as a Stranger
                  </button>
                </>
              )}
            </form>
          )}

          {/* ── Guest stage ── */}
          {stage === 'guest' && (
            <form onSubmit={handleGuest} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: 6,
                  fontFamily: "'Cinzel', serif",
                  fontSize: 9,
                  color: 'var(--text-dim)',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                }}>
                  Alias at This Table
                </label>
                <input
                  type="text"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="e.g. Joker"
                  autoComplete="off"
                  autoFocus
                  required
                  minLength={4}
                  maxLength={20}

                />
                <div style={{
                  fontFamily: "'Crimson Text', serif",
                  fontSize: 13,
                  color: 'var(--text-dim)',
                  marginTop: 7,
                  lineHeight: 1.6,
                  fontStyle: 'italic',
                }}>
                  4–20 characters. Your name and deeds survive only this session - sign in to preserve your legacy.
                </div>
              </div>
              <button
                type="submit"
                className="primary"
          
                style={{ padding: '13px', marginTop: 4 }}
              >
                Take a Seat →
              </button>
              <button
                type="button"
          
                onClick={() => { setStage('email'); setError(null); }}
                style={{ fontSize: 11, padding: '8px', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
              >
                ← Sign in with a real identity
              </button>
            </form>
          )}

          {/* ── Sent stage ── */}
          {stage === 'sent' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
              {/* Envelope icon - SVG, no emoji */}
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ margin: '4px auto 0' }}>
                <rect x="2" y="4" width="20" height="16" rx="2" stroke="var(--accent)" strokeWidth="1.5"/>
                <path d="M2 7l10 7 10-7" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <div style={{ fontFamily: "'Crimson Text', serif", fontSize: 16, color: 'var(--text)', lineHeight: 1.65 }}>
                A scroll has been sent to<br />
                <strong style={{ color: 'var(--accent)', fontStyle: 'italic' }}>{email}</strong>
              </div>
              <div style={{ fontFamily: "'Crimson Text', serif", fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.65, fontStyle: 'italic' }}>
                Open the scroll and follow the seal to gain entry. Check your refuse pile if it does not arrive shortly.
              </div>
              <button
                type="button"
          
                onClick={() => { setStage('email'); setError(null); }}
                style={{ fontSize: 11, padding: '8px', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
              >
                ← Use a different address
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
