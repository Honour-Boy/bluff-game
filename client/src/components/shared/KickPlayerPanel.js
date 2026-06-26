'use client';

import { useState } from 'react';

// ─── KickPlayerPanel (#244) — host-only roster with per-player Kick buttons.
// Rendered inside the global ControlsModal from the settings gear. Lists every
// current player EXCEPT the host; kicking removes that player (the server boots
// their socket to landing and re-broadcasts the roster, which re-renders this
// list). Host-only is enforced both here (only the host opens it) and on the
// server (`kick_player` rejects non-hosts).
export function KickPlayerPanel({ players = [], hostId, onKick }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const kickable = (players || []).filter((p) => p && p.id !== hostId);

  const handleKick = async (playerId) => {
    setError(null);
    setBusyId(playerId);
    try {
      const res = await onKick(playerId);
      if (res && res.success === false) setError(res.error || 'Could not kick that player.');
    } catch (_) {
      setError('Could not kick that player.');
    } finally {
      setBusyId(null);
    }
  };

  if (kickable.length === 0) {
    return (
      <div style={{ color: 'var(--text-dim)', fontFamily: "'Crimson Text', serif", fontStyle: 'italic', padding: '6px 2px' }}>
        No other players to remove.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        fontFamily: "'Crimson Text', serif", fontStyle: 'italic',
        color: 'var(--text-dim)', fontSize: 13, marginBottom: 2,
      }}>
        Remove a player from the table. They are returned to the landing screen.
      </div>
      {error && (
        <div style={{ color: 'var(--accent2)', fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
          {error}
        </div>
      )}
      {kickable.map((p) => {
        const eliminated = p.status === 'eliminated';
        return (
          <div
            key={p.id}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '8px 10px',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}
          >
            <span style={{
              fontFamily: "'Cinzel', serif", fontSize: 13,
              color: eliminated ? 'var(--text-dim)' : 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {p.username || 'Player'}
              {eliminated && (
                <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 6, letterSpacing: '0.1em' }}>OUT</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => handleKick(p.id)}
              disabled={busyId === p.id}
              style={{
                flexShrink: 0,
                padding: '5px 14px',
                fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: '0.08em',
                color: '#0a0a0b',
                background: 'var(--accent2)',
                border: 'none',
                borderRadius: 'var(--radius)',
                cursor: busyId === p.id ? 'wait' : 'pointer',
                opacity: busyId === p.id ? 0.6 : 1,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {busyId === p.id ? 'Kicking…' : 'Kick'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
