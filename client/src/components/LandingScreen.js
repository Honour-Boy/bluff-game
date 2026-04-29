'use client';

import { useState } from 'react';

export function LandingScreen({ onCreateRoom, onJoinRoom, error, setError, connected }) {
  const [mode, setMode] = useState(null); // null | 'host' | 'join'
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');

  const handleJoin = (e) => {
    e.preventDefault();
    setError(null);
    if (!username.trim()) return setError('Enter a username');
    if (!roomCode.trim() || roomCode.trim().length < 4) return setError('Enter a valid room code');
    onJoinRoom(roomCode.trim(), username.trim());
  };

  const handleCreate = (e) => {
    e.preventDefault();
    setError(null);
    onCreateRoom();
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundImage: `
          linear-gradient(rgba(232,255,74,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(232,255,74,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        pointerEvents: 'none',
      }} />

      {/* Corner decorations */}
      <div style={{ position: 'fixed', top: 20, left: 20, width: 60, height: 60, borderTop: '2px solid var(--accent)', borderLeft: '2px solid var(--accent)', opacity: 0.3 }} />
      <div style={{ position: 'fixed', top: 20, right: 20, width: 60, height: 60, borderTop: '2px solid var(--accent)', borderRight: '2px solid var(--accent)', opacity: 0.3 }} />
      <div style={{ position: 'fixed', bottom: 20, left: 20, width: 60, height: 60, borderBottom: '2px solid var(--accent)', borderLeft: '2px solid var(--accent)', opacity: 0.3 }} />
      <div style={{ position: 'fixed', bottom: 20, right: 20, width: 60, height: 60, borderBottom: '2px solid var(--accent)', borderRight: '2px solid var(--accent)', opacity: 0.3 }} />

      <div className="fade-in" style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 className="glitch" style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 96,
            color: 'var(--accent)',
            lineHeight: 0.9,
            letterSpacing: '0.06em',
          }}>
            BLUFF
          </h1>
          <div style={{ color: 'var(--text-dim)', fontSize: 11, letterSpacing: '0.2em', marginTop: 8 }}>
            THE CARD GAME · UP TO 15 PLAYERS
          </div>

          {/* Card shape decorations */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 20, opacity: 0.6 }}>
            {['⬛', '⭕', '🔺', '✖️', '⭐'].map((s, i) => (
              <div key={i} style={{
                fontSize: 18,
                animation: `fadeIn 0.3s ease ${i * 0.08}s both`,
                filter: 'grayscale(0.5)',
              }}>{s}</div>
            ))}
          </div>
        </div>

        {/* Connection status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          justifyContent: 'center',
          marginBottom: 28,
          fontSize: 10,
          color: connected ? 'var(--alive)' : 'var(--accent2)',
          letterSpacing: '0.1em',
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: connected ? 'var(--alive)' : 'var(--accent2)',
            boxShadow: `0 0 6px ${connected ? 'var(--alive)' : 'var(--accent2)'}`,
          }} />
          {connected ? 'Connected to server' : 'Connecting...'}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(255,74,110,0.08)',
            border: '1px solid var(--accent2)',
            borderRadius: 'var(--radius)',
            color: 'var(--accent2)',
            fontSize: 12,
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {/* Mode selection */}
        {!mode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              className="primary"
              style={{ padding: '16px', fontSize: 13, letterSpacing: '0.15em' }}
              onClick={() => setMode('host')}
              disabled={!connected}
            >
              🎮 Create Room (Host)
            </button>
            <button
              style={{ padding: '16px', fontSize: 13, letterSpacing: '0.15em' }}
              onClick={() => setMode('join')}
              disabled={!connected}
            >
              🚪 Join Room (Player)
            </button>

            <div style={{ marginTop: 16, padding: '14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.8 }}>
              <div style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.1em' }}>HOW TO PLAY</div>
              Host creates a room, up to 15 players join with a code. Host announces the required card type each turn. Players play face-down — truthfully or bluffing. Call a bluff to force a reveal. The caught party spins the gun. Last alive wins.
            </div>
          </div>
        )}

        {/* Host: create room */}
        {mode === 'host' && (
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 4 }}>
              HOST MODE — You manage the game, not a player
            </div>
            <button type="submit" className="primary" style={{ padding: '16px', fontSize: 13 }}>
              ▶ Create Room
            </button>
            <button type="button" style={{ fontSize: 11 }} onClick={() => { setMode(null); setError(null); }}>
              ← Back
            </button>
          </form>
        )}

        {/* Player: join room */}
        {mode === 'join' && (
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 4 }}>
              PLAYER — JOIN WITH ROOM CODE
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
                USERNAME
              </label>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter your name"
                maxLength={20}
                autoFocus
              />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
                ROOM CODE
              </label>
              <input
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                placeholder="e.g. ABC123"
                maxLength={6}
                style={{ letterSpacing: '0.2em', fontSize: 16, fontWeight: 700 }}
              />
            </div>
            <button type="submit" className="primary" style={{ padding: '14px', fontSize: 13 }}>
              Join Game →
            </button>
            <button type="button" style={{ fontSize: 11 }} onClick={() => { setMode(null); setError(null); }}>
              ← Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
