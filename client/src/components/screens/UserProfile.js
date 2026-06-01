'use client';

import { useState } from 'react';
import { CloseIcon } from '../shared/CloseIcon';

export function UserProfile({ username, onUpdateUsername, onClose }) {
  const [newUsername, setNewUsername] = useState(username || '');
  const [usernameMsg, setUsernameMsg] = useState(null);
  const [savingUsername, setSavingUsername] = useState(false);

  const handleUsernameSubmit = async (e) => {
    e.preventDefault();
    setSavingUsername(true);
    setUsernameMsg(null);
    const { error } = await onUpdateUsername(newUsername);
    setSavingUsername(false);
    setUsernameMsg(error ? { text: error, ok: false } : { text: 'Name updated.', ok: true });
  };

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
          maxWidth: 400,
          width: '100%',
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
          marginBottom: 22,
          textShadow: '0 0 12px rgba(200,146,46,0.25)',
        }}>
          Profile
        </div>

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
      </div>
    </div>
  );
}
