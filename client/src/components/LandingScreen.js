'use client';

import { useState } from 'react';
import { HowToPlayModal } from './HowToPlayModal';
import { ShapeIcon } from './ShapeIcon';

export function LandingScreen({ onCreateRoom, onJoinRoom, error, setError, connected }) {
  const [mode, setMode] = useState(null); // null | 'host' | 'join'
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [selectedGameMode, setSelectedGameMode] = useState(null); // null | 'physical' | 'online'
  const [hostUsername, setHostUsername] = useState('');

  const handleJoin = (e) => {
    e.preventDefault();
    setError(null);
    const name = username.trim();
    if (!name) return setError('Enter a username');
    if (name.length < 4) return setError('Username must be at least 4 characters');
    if (!roomCode.trim() || roomCode.trim().length < 4) return setError('Enter a valid room code');
    onJoinRoom(roomCode.trim(), name);
  };

  const handleCreate = (e) => {
    e.preventDefault();
    setError(null);
    if (!selectedGameMode) return setError('Select a game mode');
    if (selectedGameMode === 'online') {
      const name = hostUsername.trim();
      if (!name) return setError('Enter your username');
      if (name.length < 4) return setError('Username must be at least 4 characters');
    }
    onCreateRoom(selectedGameMode, hostUsername.trim());
  };

  const handleBackFromHost = () => {
    setMode(null);
    setSelectedGameMode(null);
    setHostUsername('');
    setError(null);
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
        position: 'fixed', inset: 0,
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

      <div className="fade-in" style={{ width: '100%', maxWidth: 480, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 className="glitch" style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 96, color: 'var(--accent)',
            lineHeight: 0.9, letterSpacing: '0.06em',
          }}>
            BLUFF
          </h1>
          <div style={{ color: 'var(--text-dim)', fontSize: 11, letterSpacing: '0.2em', marginTop: 8 }}>
            THE CARD GAME · UP TO 15 PLAYERS
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 20, opacity: 0.5 }}>
            {['circle', 'square', 'triangle', 'cross', 'star'].map((shape, i) => (
              <div key={shape} style={{ animation: `fadeIn 0.3s ease ${i * 0.08}s both` }}>
                <ShapeIcon shape={shape} size={22} />
              </div>
            ))}
          </div>
        </div>

        {/* Connection status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
          marginBottom: 28, fontSize: 10,
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
            fontSize: 12, marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {/* Landing: main buttons */}
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
            <button
              style={{ padding: '12px', fontSize: 12, letterSpacing: '0.1em', borderColor: 'var(--border)', color: 'var(--text-dim)' }}
              onClick={() => setShowHowToPlay(true)}
            >
              ? How to Play
            </button>
          </div>
        )}

        {/* Host: mode selection then create */}
        {mode === 'host' && (
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.15em' }}>
              SELECT GAME MODE
            </div>

            {/* Mode cards */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                {
                  key: 'physical',
                  icon: '🃏',
                  title: 'PHYSICAL',
                  desc: 'Play with real Whot card decks. The app manages turns, bluffs, and eliminations. You are the game master — not a player.',
                },
                {
                  key: 'online',
                  icon: '💻',
                  title: 'ONLINE',
                  desc: 'Fully digital. Cards are dealt automatically. You play as a regular player. The game manages itself.',
                },
              ].map(({ key, icon, title, desc }) => {
                const selected = selectedGameMode === key;
                return (
                  <div
                    key={key}
                    onClick={() => setSelectedGameMode(key)}
                    style={{
                      flex: '1 1 180px',
                      padding: '16px',
                      background: selected ? 'rgba(232,255,74,0.05)' : 'var(--surface)',
                      border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s, background 0.15s',
                      opacity: selected ? 1 : 0.7,
                    }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
                    <div style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 20, letterSpacing: '0.1em',
                      color: selected ? 'var(--accent)' : 'var(--text)',
                      marginBottom: 8,
                    }}>
                      {title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.7 }}>
                      {desc}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Online: username field */}
            {selectedGameMode === 'online' && (
              <div>
                <label style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
                  YOUR USERNAME
                </label>
                <input
                  value={hostUsername}
                  onChange={e => setHostUsername(e.target.value)}
                  placeholder="Enter your name"
                  maxLength={20}
                  autoFocus
                />
              </div>
            )}

            {/* Physical: host role note */}
            {selectedGameMode === 'physical' && (
              <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                HOST MODE — You manage the game as Game Master, not a player
              </div>
            )}

            <button
              type="submit"
              className="primary"
              style={{ padding: '16px', fontSize: 13, opacity: !selectedGameMode ? 0.5 : 1 }}
              disabled={!selectedGameMode || (selectedGameMode === 'online' && !hostUsername.trim())}
            >
              ▶ Create Room
            </button>
            <button type="button" style={{ fontSize: 11 }} onClick={handleBackFromHost}>
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

      {showHowToPlay && <HowToPlayModal onClose={() => setShowHowToPlay(false)} />}
    </div>
  );
}
