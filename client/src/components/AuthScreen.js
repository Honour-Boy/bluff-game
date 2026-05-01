'use client';

import { useState } from 'react';
import { ShapeIcon } from './ShapeIcon';

// ─── Shared input style helper ────────────────────────────────
const INPUT_STYLE = {
  width: '100%',
  padding: '11px 14px',
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

// ─── Google button ────────────────────────────────────────────
function GoogleButton({ onClick, label = 'Continue with Google' }) {
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
        padding: '11px 16px',
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        color: 'var(--text)',
        fontSize: 13,
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <svg width="18" height="18" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      {label}
    </button>
  );
}

function Divider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>OR</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

// ─── AuthScreen — passwordless, magic-link only ───────────────
// Single email field. signInWithOtp creates the user if new and
// signs in if existing — same flow either way. The email contains
// a magic link; clicking it opens an authenticated session. We don't
// ask for the OTP code separately because the link makes that step
// redundant.
export function AuthScreen({ onSendEmailOtp, onGoogleSignIn, error, setError }) {
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState('email'); // 'email' | 'sent'
  const [submitting, setSubmitting] = useState(false);

  const handleSendLink = async (e) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return setError('Enter your email');
    setSubmitting(true);
    const ok = await onSendEmailOtp({ email: email.trim() });
    setSubmitting(false);
    if (ok) setStage('sent');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        position: 'fixed', inset: 0,
        backgroundImage: `
          linear-gradient(rgba(232,255,74,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(232,255,74,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        pointerEvents: 'none',
      }} />

      <div className="fade-in" style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h1 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 80, color: 'var(--accent)',
            lineHeight: 0.9, letterSpacing: '0.06em',
            margin: 0,
          }}>
            BLUFF
          </h1>
          <div style={{ color: 'var(--text-dim)', fontSize: 11, letterSpacing: '0.2em', marginTop: 6 }}>
            Sign in to play
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16, opacity: 0.4 }}>
            {['circle', 'square', 'triangle', 'cross', 'star'].map(shape => (
              <ShapeIcon key={shape} shape={shape} size={18} />
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: '24px 20px' }}>
          {error && (
            <div style={{
              padding: '10px 14px',
              background: 'rgba(255,74,110,0.08)',
              border: '1px solid var(--accent2)',
              borderRadius: 'var(--radius)',
              color: 'var(--accent2)',
              fontSize: 12, marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <GoogleButton onClick={onGoogleSignIn} />
          <Divider />

          {stage === 'email' && (
            <form onSubmit={handleSendLink} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', display: 'block', marginBottom: 5 }}>
                  EMAIL
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  required
                  style={INPUT_STYLE}
                />
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.5 }}>
                  We'll email a sign-in link. No password required — same flow whether you've played before or not.
                </div>
              </div>
              <button type="submit" className="primary" style={{ padding: '12px', marginTop: 4 }} disabled={submitting}>
                {submitting ? 'Sending…' : 'Continue →'}
              </button>
            </form>
          )}

          {stage === 'sent' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 32, lineHeight: 1, marginTop: 4 }}>📬</div>
              <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
                Sign-in link sent to<br />
                <strong style={{ color: 'var(--accent)' }}>{email}</strong>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                Open the email and click the link to sign in.<br />
                Check spam if it doesn't arrive within a minute — the address might be wrong.
              </div>
              <button
                type="button"
                onClick={() => { setStage('email'); setError(null); }}
                style={{ fontSize: 11, padding: '8px', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', marginTop: 4 }}
              >
                ← Use a different email
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
