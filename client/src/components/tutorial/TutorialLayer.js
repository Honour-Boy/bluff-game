'use client';

// ============================================================
// TUTORIAL — Guided layer over the real practice table
// ============================================================
// Two pieces, both gated to tutorial rooms (roomState.isTutorial):
//   • Intro modal — a short stepped walkthrough shown in the lobby; its final
//     "Begin practice" button deals the cards (startGame).
//   • Coach bar — a compact, state-driven tip docked at the top of the table
//     that updates every turn (coachFor()). Dismissable + reopenable.
//
// Deliberately NO DOM spotlight cut-outs (the roadmap flags those as the
// highest-risk surface across the responsive/pannable table) — the coach teaches
// with clear, live copy that references the on-screen controls by name.

import { useEffect, useRef, useState } from 'react';
import { CloseIcon } from '../shared/CloseIcon';
import { INTRO_SLIDES, coachFor, coachContextFromRoom } from './tutorialContent';

const TONE_COLORS = {
  info: 'var(--accent)',
  action: 'var(--alive)',
  danger: 'var(--accent2)',
  win: 'var(--accent)',
};

// ─── Intro walkthrough modal ──────────────────────────────────────────────────
function IntroModal({ step, total, slide, canBegin, isHost, onBack, onNext, onSkip, onBegin }) {
  const isLast = step === total - 1;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9400,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onSkip}
    >
      <div
        className="card fade-in"
        style={{ maxWidth: 460, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: kicker + skip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{
            fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: 'var(--text-dim)',
          }}>
            Tutorial · {step + 1} / {total}
          </div>
          <button
            onClick={onSkip}
            aria-label="Skip tutorial"
            style={{
              minWidth: 36, minHeight: 36, background: 'none', border: 'none',
              color: 'var(--text-dim)', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, lineHeight: 1,
          letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 12,
        }}>
          {slide.title}
        </div>

        <div style={{
          fontFamily: "'Crimson Text', serif", fontSize: 15, lineHeight: 1.7,
          color: 'var(--text)', marginBottom: slide.points ? 12 : 4,
        }}>
          {slide.body}
        </div>

        {slide.points && (
          <ul style={{ margin: '0 0 4px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {slide.points.map((p, i) => (
              <li key={i} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                fontFamily: "'Crimson Text', serif", fontSize: 14, lineHeight: 1.55, color: 'var(--text-dim)',
              }}>
                <span aria-hidden style={{ color: 'var(--accent)', marginTop: 1 }}>◆</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '18px 0' }}>
          {INTRO_SLIDES.map((s, i) => (
            <span key={s.id} aria-hidden style={{
              width: i === step ? 18 : 6, height: 6, borderRadius: 3,
              background: i === step ? 'var(--accent)' : 'var(--border)',
              transition: 'width 0.2s, background 0.2s',
            }} />
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 10 }}>
          {step > 0 && (
            <button onClick={onBack} style={{ flex: '0 0 auto', minHeight: 44, padding: '0 18px', fontSize: 12 }}>
              ← Back
            </button>
          )}
          {!isLast ? (
            <button onClick={onNext} className="primary" style={{ flex: 1, minHeight: 44, fontSize: 13 }}>
              Next →
            </button>
          ) : (
            <button onClick={onBegin} className="primary" style={{ flex: 1, minHeight: 44, fontSize: 13 }}>
              {canBegin && isHost ? (slide.cta || 'Begin practice') : 'Got it'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Live coach bar ───────────────────────────────────────────────────────────
function CoachBar({ coach, isMobile, onHide, onReplayIntro }) {
  const color = TONE_COLORS[coach.tone] || 'var(--accent)';
  return (
    <div
      style={{
        position: 'fixed', top: isMobile ? 56 : 70, left: '50%', transform: 'translateX(-50%)',
        zIndex: 3000, width: 'min(92vw, 440px)', pointerEvents: 'auto',
      }}
    >
      <div
        className="fade-in"
        style={{
          background: 'linear-gradient(160deg, rgba(36,31,25,0.97), rgba(26,23,20,0.97))',
          border: `1px solid ${color}`,
          borderLeft: `3px solid ${color}`,
          borderRadius: 'var(--radius)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
          padding: '10px 12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: '0.08em', color,
          }}>
            <span aria-hidden style={{
              width: 7, height: 7, borderRadius: '50%', background: color,
              boxShadow: `0 0 8px ${color}`, flex: '0 0 auto',
              animation: coach.tone === 'danger' || coach.tone === 'action' ? 'pulse 1.3s ease-in-out infinite' : 'none',
            }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {coach.title}
            </span>
          </div>
          <button
            onClick={onHide}
            aria-label="Hide guide"
            style={{
              minWidth: 30, minHeight: 30, background: 'none', border: 'none',
              color: 'var(--text-dim)', cursor: 'pointer', flex: '0 0 auto',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <CloseIcon size={13} />
          </button>
        </div>
        <div style={{
          fontFamily: "'Crimson Text', serif", fontSize: isMobile ? 13 : 14, lineHeight: 1.55,
          color: 'var(--text)', marginTop: 4,
        }}>
          {coach.body}
        </div>
        <button
          onClick={onReplayIntro}
          style={{
            background: 'none', border: 'none', padding: '4px 0 0', cursor: 'pointer',
            fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--text-dim)', textDecoration: 'underline',
          }}
        >
          Replay intro
        </button>
      </div>
    </div>
  );
}

// ─── Idle "tap a card" nudge — points at the hand when the player stalls ──────
function CardNudge({ isMobile, canBluff }) {
  return (
    <div
      className="fade-in"
      style={{
        position: 'fixed', bottom: isMobile ? 150 : 176, left: '50%', transform: 'translateX(-50%)',
        zIndex: 2900, width: 'min(90vw, 420px)', pointerEvents: 'none', textAlign: 'center',
      }}
    >
      <div style={{
        display: 'inline-block',
        background: 'rgba(26,23,20,0.96)', border: '1px solid var(--accent)',
        borderRadius: 'var(--radius)', padding: '8px 14px',
        boxShadow: '0 6px 22px rgba(0,0,0,0.55)',
        fontFamily: "'Crimson Text', serif", fontSize: isMobile ? 13 : 14, color: 'var(--text)',
        lineHeight: 1.45,
      }}>
        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Tap a card</span> in your hand below to play it
        {canBluff && (
          <> — or hit <span style={{ color: 'var(--accent2)', fontWeight: 700 }}>Call Bluff</span> to challenge the bot</>
        )}
      </div>
      <div aria-hidden style={{
        fontSize: 20, color: 'var(--accent)', marginTop: 2,
        animation: 'bobDown 1.1s ease-in-out infinite',
      }}>
        ▼
      </div>
    </div>
  );
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────
export function TutorialLayer({
  roomState,
  myPlayerId,
  isHost = false,
  startGame,
  isMobile = false,
  isMyTurn = false,
  reopenSignal = 0,
}) {
  const phase = roomState?.phase;
  const isLobby = phase === 'lobby';

  const [introDone, setIntroDone] = useState(false); // auto-intro dismissed/began
  const [introReopened, setIntroReopened] = useState(false); // manual reopen
  const [introStep, setIntroStep] = useState(0);
  const [coachHidden, setCoachHidden] = useState(false);

  // Once the game leaves the lobby, the auto-intro is finished for good (covers
  // pressing the lobby's own Start button instead of "Begin practice").
  useEffect(() => {
    if (!isLobby) setIntroDone(true);
  }, [isLobby]);

  const showIntro = (!introDone && isLobby) || introReopened;

  const closeIntro = () => {
    setIntroDone(true);
    setIntroReopened(false);
    setIntroStep(0);
  };

  const handleBegin = () => {
    if (isLobby && isHost && typeof startGame === 'function') startGame();
    closeIntro();
  };

  const replayIntro = () => {
    setIntroStep(0);
    setIntroReopened(true);
    setCoachHidden(false);
  };

  const coach = !showIntro && !isLobby ? coachFor(coachContextFromRoom(roomState, myPlayerId)) : null;

  // Header "Guide" button → reopen the walkthrough. Skip the initial mount so it
  // only fires on an actual press (reopenSignal is bumped by OnlinePlayerUI).
  const firstReopenRef = useRef(true);
  useEffect(() => {
    if (firstReopenRef.current) { firstReopenRef.current = false; return; }
    setIntroStep(0);
    setIntroReopened(true);
    setCoachHidden(false);
  }, [reopenSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Idle "tap a card" nudge: if the player owes a play and stalls (~3.5s), point
  // at the hand. Auto-clears the moment they act or the turn moves on.
  const me = roomState?.players?.find((p) => p.id === myPlayerId) || null;
  const alive = !me || me.status === 'alive';
  const canPlay = phase === 'playing' && isMyTurn && !roomState?.cardPlayedThisTurn && alive;
  const canBluff = canPlay
    && !roomState?.isFirstTurn
    && !roomState?.bluffUsedThisTurn
    && !roomState?.bluffBlockedThisTurn;
  const [showCardNudge, setShowCardNudge] = useState(false);
  useEffect(() => {
    if (!canPlay || showIntro) { setShowCardNudge(false); return undefined; }
    const t = setTimeout(() => setShowCardNudge(true), 3500);
    return () => clearTimeout(t);
  }, [canPlay, showIntro]);

  return (
    <>
      {showIntro && (
        <IntroModal
          step={introStep}
          total={INTRO_SLIDES.length}
          slide={INTRO_SLIDES[introStep]}
          canBegin={isLobby}
          isHost={isHost}
          onBack={() => setIntroStep((s) => Math.max(0, s - 1))}
          onNext={() => setIntroStep((s) => Math.min(INTRO_SLIDES.length - 1, s + 1))}
          onSkip={closeIntro}
          onBegin={handleBegin}
        />
      )}

      {coach && !coachHidden && (
        <CoachBar
          coach={coach}
          isMobile={isMobile}
          onHide={() => setCoachHidden(true)}
          onReplayIntro={replayIntro}
        />
      )}

      {showCardNudge && <CardNudge isMobile={isMobile} canBluff={canBluff} />}
      <style>{'@keyframes bobDown{0%,100%{transform:translateY(0)}50%{transform:translateY(5px)}}'}</style>
    </>
  );
}
