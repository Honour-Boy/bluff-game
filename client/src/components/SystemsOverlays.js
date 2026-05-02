// ============================================================
// SystemsOverlays.js — v2 Phase F UI overlays
// ============================================================
//
// Compact, functional overlays for the four Phase F systems.
// Visual treatment is consistent with the existing CSS-variable
// styling throughout the app — no new design system. Dedicated
// polish + the top-down table view comes in Phase G.
//
// Components:
//   <BettingPopup />       — non-target player picks survive/elim.
//   <BettingWaitOverlay /> — shown to the spin target while window
//                            is open.
//   <GhostVotePopup />     — eliminated players cast their vote.
//   <GhostVoteWaitOverlay/>— alive players see "ghost council..."
//   <LastStandCinematic /> — full-screen Last Stand stage.
// ============================================================

'use client';

import { useEffect, useState } from 'react';

const BACKDROP_STYLE = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.74)',
  backdropFilter: 'blur(4px)',
  zIndex: 9000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
};

function Countdown({ closesAt }) {
  const [secs, setSecs] = useState(() =>
    Math.max(0, Math.ceil((closesAt - Date.now()) / 1000))
  );
  useEffect(() => {
    const id = setInterval(() => {
      setSecs(Math.max(0, Math.ceil((closesAt - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(id);
  }, [closesAt]);
  return (
    <span style={{ fontFamily: "'Space Mono', monospace", color: 'var(--accent)' }}>
      {secs}s
    </span>
  );
}

// ─── Betting popup (non-target) ──────────────────────────────

export function BettingPopup({ betting, players, myBet, onBet }) {
  const target = players?.find(p => p.id === betting.spinTargetId);
  const targetName = target?.username || 'someone';
  return (
    <div style={BACKDROP_STYLE}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--accent)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        maxWidth: 460,
        width: '100%',
        boxShadow: '0 0 32px rgba(189,234,68,0.18)',
      }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 28,
          letterSpacing: '0.12em',
          color: 'var(--accent)',
        }}>
          PLACE YOUR BET
        </div>
        <div style={{ marginTop: 8, color: 'var(--text-dim)', fontSize: 13 }}>
          {targetName} is about to spin. <Countdown closesAt={betting.closesAt} />
        </div>
        <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
          <button
            onClick={() => onBet('survive')}
            disabled={myBet === 'survive'}
            style={{
              flex: 1,
              padding: '14px',
              background: myBet === 'survive' ? 'var(--accent)' : 'var(--surface2)',
              color: myBet === 'survive' ? '#0a0a0b' : 'var(--text)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius)',
              fontWeight: 700,
              letterSpacing: '0.1em',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            SURVIVE
          </button>
          <button
            onClick={() => onBet('eliminated')}
            disabled={myBet === 'eliminated'}
            style={{
              flex: 1,
              padding: '14px',
              background: myBet === 'eliminated' ? 'var(--accent2)' : 'var(--surface2)',
              color: myBet === 'eliminated' ? '#0a0a0b' : 'var(--text)',
              border: '1px solid var(--accent2)',
              borderRadius: 'var(--radius)',
              fontWeight: 700,
              letterSpacing: '0.1em',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ELIMINATED
          </button>
        </div>
        {myBet && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>
            Bet locked. You can change it until the timer runs out.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Betting wait (spin target) ──────────────────────────────

export function BettingWaitOverlay({ closesAt }) {
  return (
    <div style={BACKDROP_STYLE}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--accent2)',
        borderRadius: 'var(--radius)',
        padding: '32px',
        textAlign: 'center',
        maxWidth: 380,
      }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 26,
          letterSpacing: '0.12em',
          color: 'var(--accent2)',
        }}>
          BETS ARE OPEN
        </div>
        <div style={{ marginTop: 12, color: 'var(--text-dim)', fontSize: 13 }}>
          The table is wagering on your fate.
          <br />
          Trigger unlocks in <Countdown closesAt={closesAt} />.
        </div>
      </div>
    </div>
  );
}

// ─── Ghost vote popup (eliminated voter) ─────────────────────

const GHOST_OPTION_LABELS = {
  1: { title: 'Change required shape', sub: 'Force a fresh shape on the table.' },
  2: { title: 'Deal one extra card to all living', sub: 'Hands grow.' },
  3: { title: 'Activate a random risk modifier', sub: 'For one round only.' },
};

export function GhostVotePopup({ ghostVote, myVote, onVote }) {
  return (
    <div style={BACKDROP_STYLE}>
      <div style={{
        background: 'linear-gradient(180deg, #07080a 0%, #0c0a14 100%)',
        border: '1px solid #6b5fb6',
        borderRadius: 'var(--radius)',
        padding: '26px',
        maxWidth: 460,
        width: '100%',
        boxShadow: '0 0 36px rgba(107,95,182,0.36)',
      }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 26,
          letterSpacing: '0.16em',
          color: '#aa9ee0',
          textShadow: '0 0 14px rgba(170,158,224,0.6)',
        }}>
          GHOST COUNCIL VOTE
        </div>
        <div style={{ marginTop: 6, color: 'var(--text-dim)', fontSize: 12 }}>
          Closes in <Countdown closesAt={ghostVote.closesAt} />.
        </div>
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(ghostVote.optionIds || []).map(opt => {
            const label = GHOST_OPTION_LABELS[opt] || { title: `Option ${opt}`, sub: '' };
            const selected = myVote === opt;
            return (
              <button
                key={opt}
                onClick={() => onVote(opt)}
                disabled={selected}
                style={{
                  textAlign: 'left',
                  padding: '12px 14px',
                  background: selected ? '#1d1830' : 'var(--surface2)',
                  border: `1px solid ${selected ? '#aa9ee0' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  color: 'var(--text)',
                  cursor: selected ? 'default' : 'pointer',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: selected ? '#aa9ee0' : 'var(--text)' }}>
                  {label.title}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-dim)' }}>
                  {label.sub}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Ghost vote wait (alive viewers) ─────────────────────────

export function GhostVoteWaitOverlay({ closesAt }) {
  return (
    <div style={BACKDROP_STYLE}>
      <div style={{
        background: 'linear-gradient(180deg, #07080a 0%, #0c0a14 100%)',
        border: '1px solid #6b5fb6',
        borderRadius: 'var(--radius)',
        padding: '32px',
        textAlign: 'center',
        maxWidth: 420,
      }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 26,
          letterSpacing: '0.16em',
          color: '#aa9ee0',
          textShadow: '0 0 14px rgba(170,158,224,0.55)',
        }}>
          THE GHOSTS ARE DECIDING
        </div>
        <div style={{ marginTop: 14, color: 'var(--text-dim)', fontSize: 13 }}>
          Eliminated players are voting on the next twist.
          <br />
          Result in <Countdown closesAt={closesAt} />.
        </div>
      </div>
    </div>
  );
}

// ─── Last Stand cinematic ────────────────────────────────────

export function LastStandCinematic({
  lastStand,
  players,
  myPlayerId,
  onSpin,
  onEndTurn,
  spinPending,
}) {
  const finalists = (lastStand?.finalistIds || [])
    .map(id => players?.find(p => p.id === id))
    .filter(Boolean);
  const active = finalists.find(p => p.id === lastStand?.activeFinalistId);
  const me = finalists.find(p => p.id === myPlayerId);
  const amActive = active?.id === myPlayerId;

  return (
    <div style={{
      ...BACKDROP_STYLE,
      background: 'radial-gradient(ellipse at center, rgba(40,4,12,0.94) 0%, rgba(5,1,2,0.98) 100%)',
      flexDirection: 'column',
      gap: 28,
    }}>
      <div style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 64,
        letterSpacing: '0.18em',
        color: '#ff3552',
        textShadow: '0 0 32px rgba(184,20,58,0.8), 0 4px 0 rgba(0,0,0,0.6)',
      }}>
        LAST STAND
      </div>
      <div style={{ color: 'var(--text-dim)', letterSpacing: '0.2em', fontSize: 11, textTransform: 'uppercase' }}>
        Two finalists. No cards. No bluffs. Pure spin.
      </div>

      <div style={{
        display: 'flex',
        gap: 36,
        marginTop: 16,
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        {finalists.map(p => {
          const isActive = p.id === lastStand?.activeFinalistId;
          const isMe = p.id === myPlayerId;
          return (
            <div key={p.id} style={{
              padding: '20px 28px',
              minWidth: 220,
              background: isActive ? 'rgba(255,53,82,0.12)' : 'rgba(20,20,28,0.6)',
              border: `2px solid ${isActive ? '#ff3552' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              textAlign: 'center',
              boxShadow: isActive ? '0 0 24px rgba(255,53,82,0.5)' : 'none',
            }}>
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 22,
                letterSpacing: '0.14em',
                color: isActive ? '#ff3552' : 'var(--text)',
              }}>
                {p.username}{isMe ? ' (you)' : ''}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.16em' }}>
                {p.chamber.filter(s => s === 'bullet').length}/{p.chamber.length} BULLETS
              </div>
              <div style={{
                marginTop: 12,
                display: 'flex',
                justifyContent: 'center',
                gap: 4,
              }}>
                {p.chamber.map((s, i) => (
                  <div key={i} style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: s === 'bullet' ? '#ff3552' : 'transparent',
                    border: '1px solid #ff3552',
                  }} />
                ))}
              </div>
              {isActive && (
                <div style={{
                  marginTop: 12,
                  fontSize: 10,
                  color: '#ff3552',
                  letterSpacing: '0.18em',
                }}>
                  // ON THE TRIGGER
                </div>
              )}
            </div>
          );
        })}
      </div>

      {me && (
        <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
          {amActive ? (
            <>
              <button
                onClick={onSpin}
                disabled={spinPending}
                style={{
                  padding: '14px 28px',
                  background: '#ff3552',
                  color: '#0a0a0b',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  fontWeight: 700,
                  fontFamily: "'Bebas Neue', sans-serif",
                  letterSpacing: '0.16em',
                  fontSize: 18,
                  cursor: spinPending ? 'not-allowed' : 'pointer',
                  boxShadow: '0 0 16px rgba(255,53,82,0.6)',
                }}
              >
                PULL TRIGGER
              </button>
              <button
                onClick={onEndTurn}
                disabled={spinPending}
                style={{
                  padding: '14px 28px',
                  background: 'var(--surface2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  fontFamily: "'Bebas Neue', sans-serif",
                  letterSpacing: '0.16em',
                  fontSize: 16,
                  cursor: spinPending ? 'not-allowed' : 'pointer',
                }}
              >
                PASS
              </button>
            </>
          ) : (
            <div style={{ color: 'var(--text-dim)', fontSize: 13, letterSpacing: '0.14em' }}>
              Waiting for {active?.username || 'opponent'}...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
