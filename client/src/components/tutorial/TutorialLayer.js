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
import {
  introSlidesFor, coachFor, coachContextFromRoom,
  clinicCoachFor, BASICS_HANDOFF_COACH, CLINIC_COMPLETE_COACH,
} from './tutorialContent';

const TONE_COLORS = {
  info: 'var(--accent)',
  action: 'var(--alive)',
  danger: 'var(--accent2)',
  win: 'var(--accent)',
};

// ─── Intro walkthrough modal ──────────────────────────────────────────────────
function IntroModal({ slides, step, slide, canBegin, isHost, onBack, onNext, onSkip, onBegin }) {
  const total = slides.length;
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
          {slides.map((s, i) => (
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
              {canBegin ? (slide.cta || 'Begin practice') : 'Got it'}
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
// Anchors to the real hand fan (`[data-tour-id="my-hand"]`, set in BottomSeat)
// so the bubble sits centred just above the cards on ANY viewport — the old
// fixed `bottom` guess drifted off the hand on wide screens. Falls back to the
// fixed offset until the anchor is measurable.
function CardNudge({ isMobile, canBluff }) {
  const [pos, setPos] = useState(null); // { centerX, bottom } | null → fallback

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const measure = () => {
      const el = document.querySelector('[data-tour-id="my-hand"]');
      const r = el?.getBoundingClientRect();
      if (!r || !r.width || !r.height) { setPos(null); return; }
      // Sit the bubble's bottom edge (the ▼ arrow) just above the hand's top,
      // centred on the fan's horizontal middle.
      setPos({ centerX: r.left + r.width / 2, bottom: window.innerHeight - r.top + 6 });
    };
    measure();
    const raf = requestAnimationFrame(measure); // re-measure after layout settles
    window.addEventListener('resize', measure);
    let ro;
    const el = document.querySelector('[data-tour-id="my-hand"]');
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      if (ro) ro.disconnect();
    };
  }, []);

  const anchored = pos != null;
  return (
    <div
      className="fade-in"
      style={{
        position: 'fixed',
        ...(anchored
          ? { left: pos.centerX, bottom: pos.bottom, transform: 'translateX(-50%)' }
          : { left: '50%', bottom: isMobile ? 150 : 176, transform: 'translateX(-50%)' }),
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

// ─── Clinic-complete end card — celebrate + replay / leave ───────────────────
function ClinicCompleteCard({ coach, onReplay, onLeave }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9400,
        background: 'rgba(0,0,0,0.86)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div className="card fade-in" style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, lineHeight: 1.05,
          letterSpacing: '0.05em', color: 'var(--accent)', marginBottom: 12,
        }}>
          {coach.title}
        </div>
        <div style={{
          fontFamily: "'Crimson Text', serif", fontSize: 15, lineHeight: 1.7,
          color: 'var(--text)', marginBottom: 22,
        }}>
          {coach.body}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {typeof onReplay === 'function' && (
            <button onClick={onReplay} className="primary" style={{ flex: 1, minHeight: 46, fontSize: 13 }}>
              Play again
            </button>
          )}
          {typeof onLeave === 'function' && (
            <button onClick={onLeave} style={{ flex: 1, minHeight: 46, fontSize: 13 }}>
              Leave practice
            </button>
          )}
        </div>
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
  restartRoom,
  leaveGame,
  isMobile = false,
  isMyTurn = false,
  reopenSignal = 0,
  lesson = 'basics',
}) {
  const phase = roomState?.phase;
  const isLobby = phase === 'lobby';
  const scenario = roomState?.tutorialScenario || null;
  const clinicComplete = !!roomState?.tutorialClinicComplete;
  const slides = introSlidesFor(lesson);

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
    // The bot hosts the practice table, but the learner paces the first deal:
    // this layer only mounts in tutorial rooms, so the local human starts the
    // game (the server's start_game tutorial bypass accepts it). No isHost gate.
    if (isLobby && typeof startGame === 'function') startGame();
    closeIntro();
  };

  const replayIntro = () => {
    setIntroStep(0);
    setIntroReopened(true);
    setCoachHidden(false);
  };

  // Coach selection. The clinic + its hand-offs take priority over the generic
  // state-driven coach, so the guided lesson speaks with one voice:
  //   • clinic complete → the celebratory end card (with replay/leave);
  //   • an active drill → its scripted before/after copy;
  //   • a finished Basics round → the "now let's learn powers" hand-off;
  //   • otherwise → the normal contextual coach.
  let coach = null;
  if (!showIntro && !isLobby) {
    if (clinicComplete) coach = CLINIC_COMPLETE_COACH;
    else if (scenario) coach = clinicCoachFor(scenario);
    else if (lesson !== 'powers' && (phase === 'game_over' || phase === 'round_end')) {
      coach = BASICS_HANDOFF_COACH;
    } else coach = coachFor(coachContextFromRoom(roomState, myPlayerId));
  }

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
    && !roomState?.bluffBlockedThisTurn
    && !scenario?.lockBluff;
  // The clinic gives explicit, drill-specific guidance, so the generic idle
  // "tap a card" nudge would only add noise — suppress it during the clinic.
  const [showCardNudge, setShowCardNudge] = useState(false);
  useEffect(() => {
    if (!canPlay || showIntro || scenario) { setShowCardNudge(false); return undefined; }
    const t = setTimeout(() => setShowCardNudge(true), 3500);
    return () => clearTimeout(t);
  }, [canPlay, showIntro, scenario]);

  return (
    <>
      {showIntro && (
        <IntroModal
          slides={slides}
          step={Math.min(introStep, slides.length - 1)}
          slide={slides[Math.min(introStep, slides.length - 1)]}
          canBegin={isLobby}
          isHost={isHost}
          onBack={() => setIntroStep((s) => Math.max(0, s - 1))}
          onNext={() => setIntroStep((s) => Math.min(slides.length - 1, s + 1))}
          onSkip={closeIntro}
          onBegin={handleBegin}
        />
      )}

      {clinicComplete && coach && (
        <ClinicCompleteCard
          coach={coach}
          onReplay={typeof restartRoom === 'function' ? restartRoom : undefined}
          onLeave={typeof leaveGame === 'function' ? leaveGame : undefined}
        />
      )}

      {coach && !clinicComplete && !coachHidden && (
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
