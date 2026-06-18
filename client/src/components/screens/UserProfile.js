'use client';

import { useState, useEffect, useCallback } from 'react';
import { CloseIcon } from '../shared/CloseIcon';
import { CosmeticsPanel } from './CosmeticsPanel';

// ─── Tab pill ─────────────────────────────────────────────────────────────────

function Tab({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 14px',
        fontFamily: "'Cinzel', serif",
        fontSize: 10,
        letterSpacing: '0.1em',
        background: active ? 'rgba(200,146,46,0.12)' : 'none',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        color: active ? 'var(--accent)' : 'var(--text-dim)',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

// ─── UserProfile modal ────────────────────────────────────────────────────────
// getProfileData / setCosmetic are optional — when absent only the username
// form is shown (backward-compat with the old 3-prop signature).

export function UserProfile({ username, onUpdateUsername, onClose, getProfileData, setCosmetic }) {
  const [tab, setTab] = useState('profile');
  const [newUsername, setNewUsername] = useState(username || '');
  const [usernameMsg, setUsernameMsg] = useState(null);
  const [savingUsername, setSavingUsername] = useState(false);

  // Cosmetics state
  const [profileData, setProfileData] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [savingSlot, setSavingSlot] = useState(null);

  const hasCosmeticsSupport = typeof getProfileData === 'function' && typeof setCosmetic === 'function';

  // Fetch on open whenever the cosmetics tab is available.
  useEffect(() => {
    if (!hasCosmeticsSupport) return;
    let cancelled = false;
    getProfileData().then(res => {
      if (cancelled) return;
      if (res?.success) {
        setProfileData(res);
      } else {
        setProfileError(res?.error || 'Could not load profile');
      }
    }).catch(() => {
      if (!cancelled) setProfileError('Could not load profile');
    });
    return () => { cancelled = true; };
  }, [hasCosmeticsSupport, getProfileData]);

  const handleUsernameSubmit = async (e) => {
    e.preventDefault();
    setSavingUsername(true);
    setUsernameMsg(null);
    const { error } = await onUpdateUsername(newUsername);
    setSavingUsername(false);
    setUsernameMsg(error ? { text: error, ok: false } : { text: 'Name updated.', ok: true });
  };

  const handleSetCosmetic = useCallback(async (slot, id) => {
    if (!setCosmetic || savingSlot) return;
    setSavingSlot(slot);
    const res = await setCosmetic(slot, id).catch(() => null);
    setSavingSlot(null);
    if (res?.success && res.selections) {
      setProfileData(prev => prev ? { ...prev, selections: res.selections } : prev);
    }
  }, [setCosmetic, savingSlot]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9500,
      padding: 24,
    }}>
      <div
        className="fade-in"
        style={{
          maxWidth: 420,
          width: '100%',
          maxHeight: '86dvh',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          background: 'linear-gradient(160deg, var(--surface2) 0%, var(--surface) 100%)',
          border: '1px solid var(--border-lit)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '22px 22px 0' }}>
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 12, right: 14,
              background: 'none', border: 'none',
              color: 'var(--text-dim)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Close"
          >
            <CloseIcon size={18} />
          </button>

          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: 'var(--accent)',
            marginBottom: hasCosmeticsSupport ? 14 : 22,
            textShadow: '0 0 12px rgba(200,146,46,0.25)',
          }}>
            Profile
          </div>

          {hasCosmeticsSupport && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              <Tab label="Account" active={tab === 'profile'} onClick={() => setTab('profile')} />
              <Tab label="Cosmetics" active={tab === 'cosmetics'} onClick={() => setTab('cosmetics')} />
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 22px 22px' }}>
          {/* ── Account tab ── */}
          {tab === 'profile' && (
            <form onSubmit={handleUsernameSubmit}>
              <label style={{
                display: 'block',
                marginBottom: 7,
                fontFamily: "'Cinzel', serif",
                fontSize: 9,
                color: 'var(--text-dim)',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
              }}>
                Display Name
              </label>
              <input
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                placeholder="4–20 characters"
                maxLength={20}
                style={{ marginBottom: 10 }}
              />
              <button
                type="submit"
                className="primary"
                disabled={savingUsername || newUsername.trim() === username}
                style={{ padding: '11px 20px', fontSize: 12, width: '100%' }}
              >
                {savingUsername ? 'Saving…' : 'Save Name'}
              </button>
              {usernameMsg && (
                <div style={{
                  padding: '9px 12px',
                  marginTop: 10,
                  background: usernameMsg.ok ? 'rgba(58,122,82,0.1)' : 'rgba(155,28,28,0.1)',
                  border: `1px solid ${usernameMsg.ok ? 'var(--alive)' : 'var(--accent2)'}`,
                  borderRadius: 'var(--radius)',
                  fontFamily: "'Crimson Text', serif",
                  fontSize: 14,
                  color: usernameMsg.ok ? 'var(--alive)' : '#c85050',
                  fontStyle: 'italic',
                }}>
                  {usernameMsg.text}
                </div>
              )}
            </form>
          )}

          {/* ── Cosmetics tab ── */}
          {tab === 'cosmetics' && hasCosmeticsSupport && (
            profileError ? (
              <div style={{
                padding: '14px 0',
                fontFamily: "'Crimson Text', serif",
                fontSize: 14,
                color: '#c85050',
                fontStyle: 'italic',
              }}>
                {profileError}
              </div>
            ) : (
              <CosmeticsPanel
                profileData={profileData}
                onSetCosmetic={handleSetCosmetic}
                savingSlot={savingSlot}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}
