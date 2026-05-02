'use client';

import { useState, useEffect } from 'react';
import { HowToPlayModal } from './HowToPlayModal';
import { UserProfile } from './UserProfile';
import { ShapeIcon } from './ShapeIcon';
import { PreGameSettingsPanel, DEFAULT_V2_CONFIG } from './PreGameSettingsPanel';

export function LandingScreen({
  username,
  isGuest = false,           // true when current identity is a guest (no Supabase user)
  onCreateRoom,
  onJoinRoom,
  onSignOut,
  onSignOutGuest,            // optional — clears guest sessionStorage so AuthScreen
                             // can render again. Used by the "sign in to save" CTA.
  onUpdateUsername,
  initialJoinCode,   // ?join=CODE — auto-opens join form with code locked
  error,
  setError,
  connected,
}) {
  const [mode, setMode] = useState(null);              // null | 'host' | 'join'
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [selectedGameMode, setSelectedGameMode] = useState(null); // 'physical' | 'online'
  const [codeLocked, setCodeLocked] = useState(false); // true when code comes from URL
  const [v2Config, setV2Config] = useState(DEFAULT_V2_CONFIG);

  // Auto-open join form when a ?join= code is in the URL
  useEffect(() => {
    if (initialJoinCode) {
      setRoomCode(initialJoinCode.toUpperCase());
      setCodeLocked(true);
      setMode('join');
    }
  }, [initialJoinCode]); // eslint-disable-line

  const handleJoin = (e) => {
    e.preventDefault();
    setError(null);
    if (!roomCode.trim() || roomCode.trim().length < 4) return setError('Enter a valid room code');
    onJoinRoom(roomCode.trim());
  };

  const handleCreate = (e) => {
    e.preventDefault();
    setError(null);
    if (!selectedGameMode) return setError('Select a game mode');
    // Only forward v2 config when host picked online — physical mode ignores it.
    const config = selectedGameMode === 'online' ? v2Config : undefined;
    onCreateRoom(selectedGameMode, config);
  };

  const handleBackFromHost = () => {
    setMode(null);
    setSelectedGameMode(null);
    setV2Config(DEFAULT_V2_CONFIG);
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

      {/* User bar — top right */}
      {/* Guests can't edit their username via the profile modal
          (no row in the profiles table) so the chip is non-clickable
          for them. Authenticated users keep the click-to-edit affordance. */}
      <div style={{
        position: 'fixed', top: 14, right: 14, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <button
          onClick={() => { if (!isGuest) setShowProfile(true); }}
          disabled={isGuest}
          title={isGuest ? 'Sign in to edit your display name' : 'Edit profile'}
          style={{
            fontSize: 11, color: 'var(--text-dim)',
            border: '1px solid var(--border)',
            background: 'var(--surface2)',
            padding: '5px 10px', borderRadius: 4,
            cursor: isGuest ? 'default' : 'pointer',
            letterSpacing: '0.06em',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <span>👤 {username}</span>
          {isGuest && (
            <span style={{
              fontSize: 9,
              padding: '1px 6px',
              borderRadius: 3,
              background: 'rgba(232,255,74,0.12)',
              border: '1px solid rgba(232,255,74,0.4)',
              color: 'var(--accent)',
              letterSpacing: '0.1em',
              fontWeight: 600,
            }}>
              GUEST
            </span>
          )}
        </button>
        {/* Sign-in CTA for guests so they can convert to a real
            account without losing the page. Falls back to a plain
            sign-out for already-authenticated users. */}
        {isGuest && onSignOutGuest ? (
          <button
            onClick={onSignOutGuest}
            title="Sign in to save your username and stats across sessions"
            style={{
              fontSize: 11, color: 'var(--accent)',
              border: '1px solid var(--accent)',
              background: 'none',
              padding: '5px 10px', borderRadius: 4,
              cursor: 'pointer',
              letterSpacing: '0.06em',
            }}
          >
            Sign in to save →
          </button>
        ) : (
          <button
            onClick={onSignOut}
            style={{
              fontSize: 11, color: 'var(--text-dim)',
              border: '1px solid var(--border)',
              background: 'none',
              padding: '5px 10px', borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        )}
      </div>

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

            {/* Physical: host role note */}
            {selectedGameMode === 'physical' && (
              <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                HOST MODE — You manage the game as Game Master, not a player
              </div>
            )}

            {selectedGameMode === 'online' && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                Playing as: <strong style={{ color: 'var(--text)' }}>{username}</strong>
              </div>
            )}

            {selectedGameMode === 'online' && (
              <PreGameSettingsPanel config={v2Config} onChange={setV2Config} />
            )}

            <button
              type="submit"
              className="primary"
              style={{ padding: '16px', fontSize: 13, opacity: !selectedGameMode ? 0.5 : 1 }}
              disabled={!selectedGameMode}
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

            {/* Authenticated username display */}
            <div style={{ padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 11, color: 'var(--text-dim)' }}>
              Joining as: <strong style={{ color: 'var(--text)' }}>{username}</strong>
            </div>

            <div>
              <label style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
                ROOM CODE
              </label>
              <input
                value={roomCode}
                onChange={e => !codeLocked && setRoomCode(e.target.value.toUpperCase())}
                placeholder="e.g. ABC123"
                maxLength={6}
                readOnly={codeLocked}
                autoFocus
                style={{
                  letterSpacing: '0.2em', fontSize: 16, fontWeight: 700,
                  ...(codeLocked ? { opacity: 0.8, cursor: 'default', background: 'var(--surface)' } : {}),
                }}
              />
              {codeLocked && (
                <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 4, letterSpacing: '0.08em' }}>
                  Code from share link · locked
                </div>
              )}
            </div>

            <button type="submit" className="primary" style={{ padding: '14px', fontSize: 13 }}>
              Join Game →
            </button>
            <button
              type="button"
              style={{ fontSize: 11 }}
              onClick={() => {
                setMode(null);
                setError(null);
                if (!initialJoinCode) {
                  setRoomCode('');
                  setCodeLocked(false);
                }
              }}
            >
              ← Back
            </button>
          </form>
        )}
      </div>

      {showHowToPlay && <HowToPlayModal onClose={() => setShowHowToPlay(false)} />}

      {showProfile && (
        <UserProfile
          username={username}
          onUpdateUsername={onUpdateUsername}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  );
}
