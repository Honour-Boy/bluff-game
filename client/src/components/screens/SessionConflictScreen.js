'use client';

import { useState } from 'react';

// ============================================================
// SessionConflictScreen — "your account is active on another device"
// ============================================================
//
// Single-active-session: when a login is contested by another LIVE device,
// the server refuses (instead of silently kicking either side) and reports
// which device holds the account. We show it here so the user can SEE that
// device by name and choose to log it out and continue — guaranteeing only
// one active session at a time, but on the user's terms.
//
// Props:
//   activeDevice : { name, since } — the device currently holding the account
//   onTakeOver   : () => Promise<boolean> — end that session, continue here
//   onUseAnother : () => void — sign out locally (back to the auth screen)

function sinceText(ts) {
  if (!ts || typeof ts !== 'number') return null;
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs} hr ago` : `${Math.round(hrs / 24)} d ago`;
}

export function SessionConflictScreen({ activeDevice, onTakeOver, onUseAnother }) {
  const [working, setWorking] = useState(false);
  const name = activeDevice?.name || 'Another device';
  const since = sinceText(activeDevice?.since);

  const handleTakeOver = async () => {
    if (working) return;
    setWorking(true);
    const ok = await onTakeOver?.();
    if (!ok) setWorking(false); // on success the screen unmounts; only reset on failure
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
      <div className="card" style={{ maxWidth: 420, width: '100%', padding: '28px 24px', textAlign: 'center' }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 30,
          letterSpacing: '0.04em',
          color: 'var(--accent)',
          marginBottom: 6,
        }}>
          Already signed in elsewhere
        </div>

        <p style={{
          fontFamily: "'Crimson Text', serif",
          fontSize: 15,
          color: 'var(--text-mid)',
          lineHeight: 1.6,
          margin: '0 0 18px',
        }}>
          Your account is active on another device. Only one device can be
          signed in at a time — log that one out to continue here.
        </p>

        {/* The contested device */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 14px',
          borderRadius: 'var(--radius)',
          background: 'rgba(240,181,74,0.08)',
          border: '1px solid rgba(240,181,74,0.25)',
          marginBottom: 22,
          textAlign: 'left',
        }}>
          <span aria-hidden="true" style={{ fontSize: 22 }}>🖥️</span>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 13,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {name}
            </div>
            {since && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                signed in {since}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          className="primary"
          onClick={handleTakeOver}
          disabled={working}
          style={{ width: '100%', padding: '13px', marginBottom: 10 }}
        >
          {working ? 'Logging it out…' : 'Log out that device & continue'}
        </button>

        <button
          type="button"
          onClick={onUseAnother}
          disabled={working}
          style={{ width: '100%', padding: '11px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}
        >
          Use a different account
        </button>
      </div>
    </div>
  );
}
