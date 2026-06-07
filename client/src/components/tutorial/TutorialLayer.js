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

import { useEffect, useState } from 'react';
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

// Small pill to bring the hidden coach back.
function ShowGuidePill({ isMobile, onShow }) {
  return (
    <button
      onClick={onShow}
      style={{
        position: 'fixed', top: isMobile ? 56 : 70, left: '50%', transform: 'translateX(-50%)',
        zIndex: 3000, padding: '6px 14px', borderRadius: 999,
        background: 'rgba(26,23,20,0.95)', border: '1px solid var(--accent)',
        color: 'var(--accent)', cursor: 'pointer',
        fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
      }}
    >
      ? Show Guide
    </button>
  );
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────
export function TutorialLayer({ roomState, myPlayerId, isHost = false, startGame, isMobile = false }) {
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

      {coach && coachHidden && (
        <ShowGuidePill isMobile={isMobile} onShow={() => setCoachHidden(false)} />
      )}
    </>
  );
}
