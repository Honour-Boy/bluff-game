'use client';

import { useState, useEffect, lazy, Suspense } from 'react';

const HowToPlayModal = lazy(() =>
  import('./HowToPlayModal').then((m) => ({ default: m.HowToPlayModal })),
);
import { ShapeIcon } from '../shared/ShapeIcon';

// ─── Tavern sign icon — carved suit marks ────────────────────────────────────
function SuitMark({ shape, delay = 0 }) {
  return (
    <div
      className="stagger-child fade-in"
      style={{
        animationDelay: `${delay}s`,
        opacity: 0,
        filter: 'sepia(40%) brightness(0.7)',
      }}
    >
      <ShapeIcon shape={shape} size={20} />
    </div>
  );
}

// ─── Wooden plaque button ─────────────────────────────────────────────────────
function PlaqueButton({ children, onClick, primary, ember, disabled, style = {} }) {
  return (
    <button
      className={ember ? 'ember' : primary ? 'primary' : undefined}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '17px 24px',
        fontSize: 13,
        letterSpacing: '0.16em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ─── LandingScreen — the tavern common room ──────────────────────────────────
export function LandingScreen({
  username,
  isGuest = false,
  onCreateRoom,
  onStartTutorial,
  onJoinRoom,
  onOpenGroups,
  onSignOut,
  onSignOutGuest,
  onUpdateUsername,
  initialJoinCode,
  error,
  setError,
  connected,
  musicEnabled = true,
  onToggleMusic,
}) {
  const [mode, setMode] = useState(null);              // null | 'host' | 'join'
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [selectedGameMode, setSelectedGameMode] = useState(null);
  const [codeLocked, setCodeLocked] = useState(false);
  // First-run nudge: badge the Practice button until the player has tried it
  // once. Read in an effect (not initial state) to avoid an SSR hydration mismatch.
  const [tutorialHint, setTutorialHint] = useState(false);

  useEffect(() => {
    if (initialJoinCode) {
      setRoomCode(initialJoinCode.toUpperCase());
      setCodeLocked(true);
      setMode('join');
    }
  }, [initialJoinCode]); // eslint-disable-line

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && !window.localStorage.getItem('bluff_tutorial_seen')) {
        setTutorialHint(true);
      }
    } catch (_) { /* localStorage blocked — just skip the nudge */ }
  }, []);

  const handleStartTutorial = () => {
    setError(null);
    try { window.localStorage.setItem('bluff_tutorial_seen', '1'); } catch (_) { /* ignore */ }
    setTutorialHint(false);
    onStartTutorial?.();
  };

  const handleJoin = (e) => {
    e.preventDefault();
    setError(null);
    if (!roomCode.trim() || roomCode.trim().length < 4) return setError('Enter a valid room code');
    onJoinRoom(roomCode.trim());
  };

  const handleCreate = (e) => {
    e.preventDefault();
    setError(null);
    if (!selectedGameMode) return setError('Choose a game mode');
    onCreateRoom(selectedGameMode);
  };

  const handleBackFromHost = () => {
    setMode(null);
    setSelectedGameMode(null);
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
      {/* Wood-plank floor texture */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: `
          repeating-linear-gradient(
            92deg,
            transparent 0px,
            transparent 22px,
            rgba(255,255,255,0.011) 22px,
            rgba(255,255,255,0.011) 23px
          ),
          repeating-linear-gradient(
            -1deg,
            transparent 0px,
            transparent 60px,
            rgba(0,0,0,0.05) 60px,
            rgba(0,0,0,0.05) 61px
          )
        `,
      }} />

      {/* Overhead candlelight bloom */}
      <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '80%', height: '40vh', pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 100% at 50% -10%, rgba(200,146,46,0.11) 0%, transparent 70%)',
      }} />

      {/* Wrought-iron corner brackets */}
      {[
        { top: 18, left: 18, borderTop: '2px solid', borderLeft: '2px solid' },
        { top: 18, right: 18, borderTop: '2px solid', borderRight: '2px solid' },
        { bottom: 18, left: 18, borderBottom: '2px solid', borderLeft: '2px solid' },
        { bottom: 18, right: 18, borderBottom: '2px solid', borderRight: '2px solid' },
      ].map((s, i) => (
        <div key={i} style={{
          position: 'fixed', width: 48, height: 48,
          borderColor: 'var(--border-lit)',
          opacity: 0.45,
          ...s,
        }} />
      ))}

      {/* ── Main content — tilted notice board ── */}
      <div
        className="fade-in tilt-panel"
        style={{ width: '100%', maxWidth: 480, position: 'relative', zIndex: 1 }}
      >
        {/* Tavern sign — a carved board hung from chains, gently swaying */}
        <div style={{ textAlign: 'center', marginBottom: 36, paddingTop: 20 }}>
          <div className="hanging-sign" style={{ display: 'inline-block', position: 'relative', maxWidth: '100%' }}>
            {/* Iron chains */}
            <div aria-hidden="true" style={{ position: 'absolute', top: -18, left: '20%', width: 2, height: 18, background: 'linear-gradient(180deg, var(--border-glow), var(--border))' }} />
            <div aria-hidden="true" style={{ position: 'absolute', top: -18, right: '20%', width: 2, height: 18, background: 'linear-gradient(180deg, var(--border-glow), var(--border))' }} />
            {/* Carved board */}
            <div
              className="wood-grain"
              style={{
                position: 'relative',
                padding: '16px 34px 18px',
                border: '2px solid var(--border-lit)',
                borderRadius: 10,
                background: 'linear-gradient(160deg, var(--surface3) 0%, var(--surface) 100%)',
                boxShadow: '0 12px 34px rgba(0,0,0,0.6), inset 0 0 30px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,210,140,0.06)',
              }}
            >
              <h1
                className="candle-title"
                style={{
                  fontFamily: "'Cinzel Decorative', 'Cinzel', serif",
                  fontSize: 'clamp(56px, 16vw, 88px)',
                  color: 'var(--accent)',
                  lineHeight: 0.9,
                  letterSpacing: '0.08em',
                  textShadow: '0 0 50px rgba(240,181,74,0.5), 0 3px 0 rgba(0,0,0,0.9)',
                }}
              >
                BLUFF
              </h1>
              <div style={{
                fontFamily: "'Cinzel', serif",
                color: 'var(--text-dim)',
                fontSize: 9,
                letterSpacing: '0.28em',
                marginTop: 9,
                textTransform: 'uppercase',
              }}>
                The Card Game · Up to 15 Players
              </div>
            </div>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 14,
            marginTop: 18,
          }}>
            {['circle', 'square', 'triangle', 'cross', 'star'].map((shape, i) => (
              <SuitMark key={shape} shape={shape} delay={i * 0.07} />
            ))}
          </div>
        </div>

        {/* Connection status — candlelight indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center',
          marginBottom: 26,
          fontFamily: "'Cinzel', serif",
          fontSize: 9,
          letterSpacing: '0.18em',
          color: connected ? 'var(--accent3)' : 'var(--accent2)',
          textTransform: 'uppercase',
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: connected ? 'var(--alive)' : 'var(--eliminated)',
            boxShadow: `0 0 8px ${connected ? 'var(--alive)' : 'var(--eliminated)'}`,
          }} />
          {connected ? 'Tavern connected' : 'Seeking the tavern…'}
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(155,28,28,0.1)',
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

        {/* ── Main menu ── */}
        {!mode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <PlaqueButton ember onClick={() => setMode('host')} disabled={!connected}>
              {/* Dice icon */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="2" y="2" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="1.8"/>
                <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
                <circle cx="16" cy="16" r="1.5" fill="currentColor"/>
                <circle cx="16" cy="8" r="1.5" fill="currentColor"/>
                <circle cx="8" cy="16" r="1.5" fill="currentColor"/>
                <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
              </svg>
              Open a Table (Host)
            </PlaqueButton>

            <PlaqueButton onClick={() => setMode('join')} disabled={!connected}>
              {/* Door icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="2" width="18" height="20" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
              </svg>
              Enter a Room (Player)
            </PlaqueButton>

            {/* Learn by playing — a solo practice table against a bot. The single
                lowest-friction way in for a first-timer: no code, no second
                player, the bot autoplays the opposite seat. */}
            {onStartTutorial && (
              <PlaqueButton onClick={handleStartTutorial} disabled={!connected}>
                {/* Target / practice icon */}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
                  <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.6"/>
                  <circle cx="12" cy="12" r="1.6" fill="currentColor"/>
                </svg>
                Practice vs Bot
                {tutorialHint && (
                  <span
                    style={{
                      marginLeft: 8,
                      padding: '2px 7px',
                      borderRadius: 999,
                      background: 'var(--accent)',
                      color: '#1a1714',
                      fontFamily: "'Space Mono', monospace",
                      fontSize: 9,
                      letterSpacing: '0.1em',
                      fontWeight: 700,
                    }}
                  >
                    NEW
                  </span>
                )}
              </PlaqueButton>
            )}

            {!isGuest && (
              <PlaqueButton onClick={() => { setError(null); onOpenGroups?.(); }} disabled={!connected}>
                {/* Group icon */}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.8"/>
                  <circle cx="17" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.8"/>
                  <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  <path d="M17 14c1.8.5 3 2.1 3 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                My Groups
              </PlaqueButton>
            )}

            <PlaqueButton
              onClick={() => setShowHowToPlay(true)}
              style={{ padding: '13px 24px', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em' }}
            >
              {/* Scroll icon */}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4z" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Rules of the House
            </PlaqueButton>

            {isGuest && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius)',
                border: '1px dashed var(--border)',
                color: 'var(--text-dim)',
                fontFamily: "'Crimson Text', serif",
                fontSize: 13,
                lineHeight: 1.65,
                fontStyle: 'italic',
                marginTop: 4,
              }}>
                Persistent groups require an established identity. Use the sign-in button above to unlock them.
              </div>
            )}

          </div>
        )}

        {/* ── Host: game mode selection ── */}
        {mode === 'host' && (
          <form
            onSubmit={handleCreate}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 9,
              color: 'var(--text-dim)',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              marginBottom: 2,
            }}>
              Choose Your Table
            </div>

            {/* Mode cards — two physical game boards */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                {
                  key: 'physical',
                  icon: (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                      <path d="M7 9h10M7 12h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  ),
                  title: 'Physical',
                  desc: 'Play with real Whot card decks. The app governs turns, bluffs, and the chamber. You are the Game Master.',
                },
                {
                  key: 'online',
                  icon: (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                      <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  ),
                  title: 'Online',
                  desc: 'Fully digital. Cards are dealt automatically. You play as a regular patron of the table.',
                },
              ].map(({ key, icon, title, desc }) => {
                const selected = selectedGameMode === key;
                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedGameMode(key)}
                    style={{
                      flex: '1 1 180px',
                      padding: '16px',
                      background: selected
                        ? 'linear-gradient(160deg, rgba(200,146,46,0.1) 0%, rgba(200,146,46,0.04) 100%)'
                        : 'linear-gradient(160deg, var(--surface2) 0%, var(--surface) 100%)',
                      border: `2px solid ${selected ? 'var(--accent)' : 'var(--border-lit)'}`,
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      transition: 'border-color 0.18s, background 0.18s, box-shadow 0.18s',
                      opacity: selected ? 1 : 0.72,
                      boxShadow: selected ? `0 0 18px var(--glow-gold)` : 'none',
                      outline: 'none',
                    }}
                  >
                    <div style={{ color: selected ? 'var(--accent)' : 'var(--text-dim)', marginBottom: 8 }}>
                      {icon}
                    </div>
                    <div style={{
                      fontFamily: "'Cinzel', serif",
                      fontSize: 16,
                      letterSpacing: '0.1em',
                      color: selected ? 'var(--accent)' : 'var(--text)',
                      marginBottom: 8,
                    }}>
                      {title}
                    </div>
                    <div style={{
                      fontFamily: "'Crimson Text', serif",
                      fontSize: 13,
                      color: 'var(--text-dim)',
                      lineHeight: 1.65,
                      fontStyle: 'italic',
                    }}>
                      {desc}
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedGameMode === 'physical' && (
              <div style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 9,
                color: 'var(--text-dim)',
                letterSpacing: '0.14em',
                padding: '8px 12px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                textTransform: 'uppercase',
              }}>
                Host Mode — You are the Game Master, not a player
              </div>
            )}

            {selectedGameMode === 'online' && (
              <>
                <div style={{
                  fontFamily: "'Crimson Text', serif",
                  fontSize: 13,
                  color: 'var(--text-dim)',
                  padding: '8px 12px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  fontStyle: 'italic',
                }}>
                  Seated as: <strong style={{ color: 'var(--text)', fontStyle: 'normal' }}>{username}</strong>
                </div>
                <div style={{
                  fontFamily: "'Crimson Text', serif",
                  fontSize: 13,
                  color: 'var(--text-dim)',
                  padding: '8px 12px',
                  background: 'var(--surface)',
                  border: '1px dashed var(--border)',
                  borderRadius: 'var(--radius)',
                  lineHeight: 1.6,
                  fontStyle: 'italic',
                }}>
                  Powers, modifiers and house rules are set inside the room lobby once it opens — seat your guests first.
                </div>
              </>
            )}

            <button
              type="submit"
              className="primary"
              style={{ padding: '16px', fontSize: 13, opacity: !selectedGameMode ? 0.45 : 1 }}
              disabled={!selectedGameMode}
            >
              Open the Table →
            </button>
            <button type="button" style={{ fontSize: 11 }} onClick={handleBackFromHost}>
              ← Back to the Bar
            </button>
          </form>
        )}

        {/* ── Player: join room ── */}
        {mode === 'join' && (
          <form
            onSubmit={handleJoin}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 9,
              color: 'var(--text-dim)',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              marginBottom: 2,
            }}>
              Join a Table
            </div>

            <div style={{
              padding: '9px 12px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              fontFamily: "'Crimson Text', serif",
              fontSize: 14,
              color: 'var(--text-dim)',
              fontStyle: 'italic',
            }}>
              Seated as: <strong style={{ color: 'var(--text)', fontStyle: 'normal' }}>{username}</strong>
            </div>

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
                Room Cipher
              </label>
              <input
                value={roomCode}
                onChange={e => !codeLocked && setRoomCode(e.target.value.toUpperCase())}
                placeholder="e.g. ABC123"
                maxLength={6}
                readOnly={codeLocked}
                autoFocus
                style={{
                  letterSpacing: '0.28em',
                  fontSize: 18,
                  fontWeight: 700,
                  fontFamily: "'Cinzel', serif",
                  ...(codeLocked ? { opacity: 0.75, cursor: 'default', background: 'var(--surface)' } : {}),
                }}
              />
              {codeLocked && (
                <div style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: 9,
                  color: 'var(--accent)',
                  marginTop: 5,
                  letterSpacing: '0.1em',
                }}>
                  Cipher from share link · sealed
                </div>
              )}
            </div>

            <button
              type="submit"
              className="primary"
              style={{ padding: '14px', fontSize: 13 }}
            >
              Enter the Room →
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
              ← Back to the Bar
            </button>
          </form>
        )}
      </div>

      {showHowToPlay && (
        <Suspense fallback={null}>
          <HowToPlayModal onClose={() => setShowHowToPlay(false)} />
        </Suspense>
      )}
    </div>
  );
}
