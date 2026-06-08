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
  clinicCoachFor, clinicBriefingFor, BASICS_HANDOFF_COACH, CLINIC_COMPLETE_COACH, BOT_NAME,
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

// ─── In-room path choice: Basics or skip straight to Power Cards ──────────────
function ChoiceModal({ onBasics, onSkip, onLeave }) {
  const Btn = ({ title, desc, onClick, primary }) => (
    <button
      onClick={onClick}
      className={primary ? 'primary' : undefined}
      style={{
        textAlign: 'left', padding: '16px 18px', borderRadius: 'var(--radius)',
        background: primary ? undefined : 'var(--surface2)',
        border: `1px solid ${primary ? 'var(--accent)' : 'var(--border-lit)'}`,
        cursor: 'pointer', color: 'var(--text)', width: '100%',
      }}
    >
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: 16, color: 'var(--accent)', marginBottom: 4, letterSpacing: '0.06em' }}>
        {title}
      </div>
      <div style={{ fontFamily: "'Crimson Text', serif", fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
        {desc}
      </div>
    </button>
  );
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9450, background: 'rgba(0,0,0,0.9)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div className="card fade-in" style={{ maxWidth: 440, width: '100%' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: 'var(--accent)', letterSpacing: '0.06em', lineHeight: 1 }}>
          WELCOME TO PRACTICE
        </div>
        <div style={{ fontFamily: "'Crimson Text', serif", fontSize: 14, color: 'var(--text-dim)', margin: '6px 0 16px', lineHeight: 1.6 }}>
          Learn against {BOT_NAME}. New here? Start with the Basics. Already know the
          core loop? Skip straight to the Power Cards.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Btn primary title="Go through Basics" desc="Play a card, bluff, call the bot’s bluffs, and survive the gun — then we move on to powers." onClick={onBasics} />
          <Btn title="Skip to Power Cards" desc="Jump to the power-card clinic: one guided drill for each power." onClick={onSkip} />
        </div>
        {typeof onLeave === 'function' && (
          <button
            onClick={onLeave}
            style={{
              width: '100%', marginTop: 14, fontSize: 11, color: 'var(--text-dim)',
              background: 'none', border: 'none', cursor: 'pointer',
              textDecoration: 'underline', letterSpacing: '0.08em',
            }}
          >
            Leave practice
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Generic guided modal (briefing pop-up + resolved explanation) ────────────
function GuidedModal({ kicker, title, body, cta, onCta, tone = 'info' }) {
  const color = TONE_COLORS[tone] || 'var(--accent)';
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9350, background: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div className="card fade-in" style={{ maxWidth: 440, width: '100%', borderTop: `3px solid ${color}` }}>
        {kicker && (
          <div style={{
            fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8,
          }}>
            {kicker}
          </div>
        )}
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, lineHeight: 1.05,
          letterSpacing: '0.05em', color, marginBottom: 12,
        }}>
          {title}
        </div>
        <div style={{
          fontFamily: "'Crimson Text', serif", fontSize: 15, lineHeight: 1.7,
          color: 'var(--text)', marginBottom: 22,
        }}>
          {body}
        </div>
        <button onClick={onCta} className="primary" style={{ width: '100%', minHeight: 46, fontSize: 13 }}>
          {cta}
        </button>
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
  skipToPowers,
  advanceTutorial,
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

  // Lobby path choice (Basics vs skip to Power Cards) now lives in-room.
  const [path, setPath] = useState(null); // null | 'basics' | 'powers'
  const [introDone, setIntroDone] = useState(false);
  const [introReopened, setIntroReopened] = useState(false);
  const [introStep, setIntroStep] = useState(0);
  const [coachHidden, setCoachHidden] = useState(false);
  // Clinic: which drill index has had its briefing pop-up dismissed.
  const [briefedIndex, setBriefedIndex] = useState(-1);

  // Sticky guards: the Basics match spawns at most ONCE (so reopening + closing
  // the guide mid-game can't re-deal), and the skip request fires once.
  const spawnedRef = useRef(false);
  const skipFiredRef = useRef(false);

  useEffect(() => {
    if (!isLobby) setIntroDone(true);
  }, [isLobby]);

  // The basics game starts the FIRST time the intro is dismissed — whether via
  // "Begin practice" OR by closing the pop-up — and never again.
  const spawnBasics = () => {
    if (isLobby && !spawnedRef.current && typeof startGame === 'function') {
      spawnedRef.current = true;
      startGame();
    }
  };

  // Skip → tell the server to jump straight to the clinic (once).
  useEffect(() => {
    if (path === 'powers' && isLobby && !skipFiredRef.current && typeof skipToPowers === 'function') {
      skipFiredRef.current = true;
      skipToPowers();
    }
  }, [path, isLobby, skipToPowers]);

  const showChoice = isLobby && path === null && !scenario && !clinicComplete;
  const showIntro = (path === 'basics' && isLobby && !introDone) || introReopened;

  const closeIntro = () => {
    spawnBasics(); // first close (in the lobby) deals the Basics game
    setIntroDone(true);
    setIntroReopened(false);
    setIntroStep(0);
  };
  const handleBegin = () => { spawnBasics(); closeIntro(); };
  const replayIntro = () => { setIntroStep(0); setIntroReopened(true); setCoachHidden(false); };

  // Clinic briefing pop-up (before each staged instance) + resolved explanation.
  const briefing = scenario && scenario.step === 'intro' && briefedIndex !== scenario.index
    ? clinicBriefingFor(scenario)
    : null;
  const showExplanation = !!scenario && scenario.step === 'resolved' && !clinicComplete;

  // Coach bar. Hidden while a guided modal (briefing / explanation / choice /
  // intro) owns the screen, and during clinic-complete (its own card shows).
  let coach = null;
  const modalUp = showIntro || showChoice || briefing || showExplanation;
  if (!modalUp && !isLobby) {
    if (clinicComplete) coach = CLINIC_COMPLETE_COACH;
    else if (scenario) coach = clinicCoachFor(scenario);
    else if (lesson !== 'powers' && (phase === 'game_over' || phase === 'round_end')) {
      coach = BASICS_HANDOFF_COACH;
    } else coach = coachFor(coachContextFromRoom(roomState, myPlayerId));
  }

  // Header "Guide" button → re-show the current drill's briefing (clinic) or
  // reopen the walkthrough (basics). Skip the initial mount.
  const firstReopenRef = useRef(true);
  useEffect(() => {
    if (firstReopenRef.current) { firstReopenRef.current = false; return; }
    setCoachHidden(false);
    if (roomState?.tutorialScenario) {
      setBriefedIndex(-1); // re-brief the active drill
    } else {
      setIntroStep(0);
      setIntroReopened(true);
    }
  }, [reopenSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Idle "tap a card" nudge (basics only; suppressed during the clinic + modals).
  const me = roomState?.players?.find((p) => p.id === myPlayerId) || null;
  const alive = !me || me.status === 'alive';
  const canPlay = phase === 'playing' && isMyTurn && !roomState?.cardPlayedThisTurn && alive;
  const canBluff = canPlay
    && !roomState?.isFirstTurn
    && !roomState?.bluffUsedThisTurn
    && !roomState?.bluffBlockedThisTurn
    && !scenario?.lockBluff;
  const [showCardNudge, setShowCardNudge] = useState(false);
  useEffect(() => {
    if (!canPlay || modalUp || scenario) { setShowCardNudge(false); return undefined; }
    const t = setTimeout(() => setShowCardNudge(true), 3500);
    return () => clearTimeout(t);
  }, [canPlay, modalUp, scenario]);

  const isLastDrill = scenario && scenario.total != null && scenario.index >= scenario.total - 1;

  return (
    <>
      {showChoice && (
        <ChoiceModal
          onBasics={() => setPath('basics')}
          onSkip={() => setPath('powers')}
          onLeave={typeof leaveGame === 'function' ? leaveGame : undefined}
        />
      )}

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

      {briefing && !showIntro && !showChoice && (
        <GuidedModal
          kicker="Power Clinic"
          tone="action"
          title={briefing.title}
          body={briefing.body}
          cta="Got it — show me"
          onCta={() => setBriefedIndex(scenario.index)}
        />
      )}

      {showExplanation && coach == null && (
        <GuidedModal
          kicker="What just happened"
          tone={clinicCoachFor(scenario)?.tone || 'win'}
          title={clinicCoachFor(scenario)?.title || ''}
          body={clinicCoachFor(scenario)?.body || ''}
          cta={isLastDrill ? 'Finish' : 'I Understand'}
          onCta={() => { if (typeof advanceTutorial === 'function') advanceTutorial(); }}
        />
      )}

      {clinicComplete && (
        <ClinicCompleteCard
          coach={CLINIC_COMPLETE_COACH}
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
