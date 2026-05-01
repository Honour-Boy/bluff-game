'use client';

import { useState } from 'react';

export function UserProfile({ username, onUpdateUsername, onClose }) {
  const [newUsername, setNewUsername] = useState(username || '');
  const [usernameMsg, setUsernameMsg] = useState(null); // { text, ok }
  const [savingUsername, setSavingUsername] = useState(false);

  const handleUsernameSubmit = async (e) => {
    e.preventDefault();
    setSavingUsername(true);
    setUsernameMsg(null);
    const { error } = await onUpdateUsername(newUsername);
    setSavingUsername(false);
    setUsernameMsg(error ? { text: error, ok: false } : { text: 'Username updated!', ok: true });
  };

  const MSG = ({ msg }) => msg ? (
    <div style={{
      padding: '8px 12px',
      background: msg.ok ? 'rgba(74,255,128,0.06)' : 'rgba(255,74,110,0.08)',
      border: `1px solid ${msg.ok ? 'var(--alive)' : 'var(--accent2)'}`,
      borderRadius: 'var(--radius)',
      color: msg.ok ? 'var(--alive)' : 'var(--accent2)',
      fontSize: 12, marginTop: 8,
    }}>
      {msg.text}
    </div>
  ) : null;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9500, padding: 24,
    }}>
      <div className="card fade-in" style={{ maxWidth: 400, width: '100%', position: 'relative' }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'none', border: 'none',
            color: 'var(--text-dim)', fontSize: 18, cursor: 'pointer',
          }}
          aria-label="Close"
        >✕</button>

        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 22, letterSpacing: '0.12em',
          color: 'var(--accent)', marginBottom: 24,
        }}>
          Profile Settings
        </div>

        <form onSubmit={handleUsernameSubmit}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 8 }}>
            DISPLAY NAME
          </div>
          <input
            value={newUsername}
            onChange={e => setNewUsername(e.target.value)}
            placeholder="4–20 characters"
            maxLength={20}
            style={{ marginBottom: 8 }}
          />
          <button
            type="submit"
            className="primary"
            disabled={savingUsername || newUsername.trim() === username}
            style={{ padding: '9px 20px', fontSize: 12 }}
          >
            {savingUsername ? 'Saving...' : 'Save Name'}
          </button>
          <MSG msg={usernameMsg} />
        </form>
      </div>
    </div>
  );
}
