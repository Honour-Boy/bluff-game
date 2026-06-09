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
  DEFENSE_PREARM_HINT,
} from './tutorialContent';

const TONE_COLORS = {
  info: 'var(--accent)',
  action: 'var(--alive)',
  danger: 'var(--accent2)',
  win: 'var(--accent)',
};

// ─── Controls tour (intro slide) — small icon cards for chat/settings/board ───
const CONTROL_ICONS = {
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  chat: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />,
  trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M5 4H3v2a3 3 0 0 0 3 3M19 4h2v2a3 3 0 0 1-3 3" /></>,
};

function ControlsGrid({ controls }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, margin: '2px 0 8px' }}>
      {controls.map((c) => (
        <div key={c.label} style={{
          display: 'flex', gap: 12, alignItems: 'center', padding: '9px 11px',
          background: 'var(--surface2)', border: '1px solid var(--border-lit)', borderRadius: 'var(--radius)',
        }}>
          <div style={{
            flex: '0 0 auto', width: 34, height: 34, borderRadius: 8,
            background: 'var(--surface3)', border: '1px solid var(--border-lit)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {CONTROL_ICONS[c.icon] || CONTROL_ICONS.gear}
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 13, color: 'var(--accent)', letterSpacing: '0.04em' }}>{c.label}</div>
            <div style={{ fontFamily: "'Crimson Text', serif", fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.4 }}>{c.where}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

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
          color: 'var(--text)', marginBottom: (slide.points || slide.controls) ? 12 : 4,
        }}>
          {slide.body}
        </div>

        {slide.controls && <ControlsGrid controls={slide.controls} />}

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

// Where the coach docks: directly ABOVE the bottom seat (the hand dock). We
// measure the seat's top edge so the coach sits just above it on any viewport,
// with a sensible fixed fallback before the seat has mounted/measured.
function useDockBottom() {
  const [dockBottom, setDockBottom] = useState(null);
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const measure = () => {
      const seat = document.querySelector('.topdown-bottom');
      const r = seat?.getBoundingClientRect();
      if (r && r.height) setDockBottom(Math.max(0, Math.round(window.innerHeight - r.top + 8)));
      else setDockBottom(null);
    };
    measure();
    const id = setInterval(measure, 500); // track the dock as it morphs/resizes
    window.addEventListener('resize', measure);
    return () => { clearInterval(id); window.removeEventListener('resize', measure); };
  }, []);
  return dockBottom;
}

// ─── Coach focus-gate — a dimmed backdrop that blocks play until acknowledged ──
// For an action-required beat the table is dimmed and non-interactive so the
// learner can't misclick while reading; an OK button reveals the table to perform
// the step. The card itself docks just above the bottom seat (expanding in place
// from the collapsed pill), so it reads as part of the player's own controls.
// Sits BELOW the briefing/explanation modals (9300+) and the spin overlay.
function CoachGate({ coach, isMobile, dockBottom, onOk }) {
  const color = TONE_COLORS[coach.tone] || 'var(--accent)';
  const bottom = dockBottom != null ? dockBottom : (isMobile ? 168 : 188);
  return (
    <>
      {/* Backdrop — dims + blocks all play until the learner taps OK. No close
          button: in practice the guide is always present, so OK is the only exit. */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 2950, background: 'rgba(0,0,0,0.66)', pointerEvents: 'auto' }} />
      {/* Card — docked above the bottom seat, grows upward. */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom, zIndex: 2960,
        display: 'flex', justifyContent: 'center', padding: '0 12px', pointerEvents: 'none',
      }}>
        <div
          className="fade-in"
          style={{
            width: 'min(92vw, 420px)', pointerEvents: 'auto',
            background: 'linear-gradient(160deg, rgba(36,31,25,0.98), rgba(22,19,16,0.98))',
            border: `1px solid ${color}`, borderLeft: `3px solid ${color}`,
            borderRadius: 'var(--radius)', boxShadow: '0 12px 38px rgba(0,0,0,0.6)',
            padding: '11px 14px',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7, minWidth: 0,
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: '0.06em', color,
          }}>
            <span aria-hidden style={{
              width: 7, height: 7, borderRadius: '50%', background: color,
              boxShadow: `0 0 8px ${color}`, flex: '0 0 auto',
              animation: coach.tone === 'danger' || coach.tone === 'action' ? 'pulse 1.3s ease-in-out infinite' : 'none',
            }} />
            <span>{coach.title}</span>
          </div>
          <div style={{
            fontFamily: "'Crimson Text', serif", fontSize: isMobile ? 13 : 14, lineHeight: 1.5,
            color: 'var(--text)', margin: '5px 0 11px',
          }}>
            {coach.body}
          </div>
          <button onClick={onOk} className="primary" style={{ width: '100%', minHeight: 40, fontSize: 12 }}>
            OK — got it
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Collapsed coach bar — a slim reminder docked above the bottom seat ────────
// After the gate is acknowledged (or for a non-actionable info beat) the coach
// collapses to a slim bar sitting directly above the hand dock — within the
// player's natural line of sight, clear of the dealer bot up top. Tapping it
// re-expands to the full backdrop-gated card (blocking other inputs).
function CoachPill({ coach, isMobile, dockBottom, onExpand }) {
  const color = TONE_COLORS[coach.tone] || 'var(--accent)';
  const bottom = dockBottom != null ? dockBottom : (isMobile ? 168 : 188);
  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom, zIndex: 2900,
      display: 'flex', justifyContent: 'center', padding: '0 12px', pointerEvents: 'none',
    }}>
      <button
        onClick={onExpand}
        className="fade-in"
        aria-label="Show guide"
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '7px 12px', cursor: 'pointer', pointerEvents: 'auto',
          background: 'rgba(20,15,10,0.95)', border: `1px solid ${color}`,
          borderLeft: `3px solid ${color}`, borderRadius: 'var(--radius)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.55)',
        }}
      >
        <span aria-hidden style={{
          width: 6, height: 6, borderRadius: '50%', background: color,
          boxShadow: `0 0 8px ${color}`, flex: '0 0 auto',
        }} />
        <span style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: '0.06em', color,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1, textAlign: 'left',
        }}>
          {coach.title}
        </span>
        <span aria-hidden style={{
          fontFamily: "'Space Mono', monospace", fontSize: 8, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--text-dim)', flex: '0 0 auto',
        }}>
          Tap ›
        </span>
      </button>
    </div>
  );
}

// ─── Idle "tap a card" nudge — a small caret at the very bottom of the seat ────
// Pinned to the very bottom of the bottom seat and pointing UP (▲) at the hand,
// so it never overlaps the table / play area ("event place"). It stays
// horizontally aligned to the actual card fan (measures the rendered cards' centre
// each tick) and is deliberately small so it claims no vertical space above.
function CardNudge() {
  const [centerX, setCenterX] = useState(null); // px | null → centred fallback

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const measure = () => {
      const cards = document.querySelectorAll('[data-tour-id="my-hand-fan"] [data-card-id]');
      let left = Infinity; let right = -Infinity;
      cards.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width) return;
        left = Math.min(left, r.left); right = Math.max(right, r.right);
      });
      let cx = null;
      if (cards.length && right > left) cx = (left + right) / 2;
      else {
        const fan = document.querySelector('[data-tour-id="my-hand-fan"]')
          || document.querySelector('[data-tour-id="my-hand"]');
        const fr = fan?.getBoundingClientRect();
        if (fr && fr.width) cx = fr.left + fr.width / 2;
      }
      // Keep the small bubble fully on-screen even if the fan sits near an edge.
      if (cx != null) cx = Math.max(90, Math.min(window.innerWidth - 90, cx));
      setCenterX(cx);
    };
    measure();
    const id = setInterval(measure, 300); // track fan drag / layout settling
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(id);
      window.removeEventListener('resize', measure);
    };
  }, []);

  // The centering translateX(-50%) lives on the positioned wrapper (NOT on the
  // .fade-in inner, whose keyframes animate transform and would drop the centring).
  return (
    <div
      style={{
        position: 'fixed',
        left: centerX != null ? centerX : '50%',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4px)',
        transform: 'translateX(-50%)',
        zIndex: 2900, pointerEvents: 'none', textAlign: 'center',
      }}
    >
      <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <div aria-hidden style={{
          fontSize: 10, lineHeight: 1, color: 'var(--accent)',
          animation: 'bobUp 1.1s ease-in-out infinite',
        }}>
          ▲
        </div>
        <div style={{
          display: 'inline-block',
          background: 'rgba(26,23,20,0.95)', border: '1px solid var(--accent)',
          borderRadius: 999, padding: '1px 8px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
          fontFamily: "'Cinzel', serif", fontSize: 8.5, letterSpacing: '0.03em',
          color: 'var(--text)', whiteSpace: 'nowrap',
        }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Tap a card</span> to play
        </div>
      </div>
    </div>
  );
}

// (The clinic progress bar now lives IN-FLOW at the top of OnlinePlayerUI.)

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
      {/* On the gold (primary) option the accent/dim tones vanish — force a flat,
          deeply bold dark tone so the text stays legible on the bright background. */}
      <div style={{
        fontFamily: "'Cinzel', serif", fontSize: 16, marginBottom: 4, letterSpacing: '0.06em',
        color: primary ? '#140f08' : 'var(--accent)',
        fontWeight: primary ? 800 : 600,
      }}>
        {title}
      </div>
      <div style={{
        fontFamily: "'Crimson Text', serif", fontSize: 13, lineHeight: 1.5,
        color: primary ? 'rgba(20,15,8,0.85)' : 'var(--text-dim)',
        fontWeight: primary ? 600 : 400,
      }}>
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

// ─── Replay choice: coached re-run vs plain game vs the bot ───────────────────
// Shown when the learner taps "Play again" on a finished practice run (clinic
// complete OR an uncoached game's end card). Mirrors the lobby ChoiceModal style.
function ReplayChoiceModal({ onCoached, onUncoached, onBack }) {
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
      <div style={{
        fontFamily: "'Cinzel', serif", fontSize: 16, marginBottom: 4, letterSpacing: '0.06em',
        color: primary ? '#140f08' : 'var(--accent)', fontWeight: primary ? 800 : 600,
      }}>
        {title}
      </div>
      <div style={{
        fontFamily: "'Crimson Text', serif", fontSize: 13, lineHeight: 1.5,
        color: primary ? 'rgba(20,15,8,0.85)' : 'var(--text-dim)', fontWeight: primary ? 600 : 400,
      }}>
        {desc}
      </div>
    </button>
  );
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9460, background: 'rgba(0,0,0,0.9)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div className="card fade-in" style={{ maxWidth: 440, width: '100%' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: 'var(--accent)', letterSpacing: '0.06em', lineHeight: 1 }}>
          PLAY AGAIN
        </div>
        <div style={{ fontFamily: "'Crimson Text', serif", fontSize: 14, color: 'var(--text-dim)', margin: '6px 0 16px', lineHeight: 1.6 }}>
          Run it back with the guide, or just play {BOT_NAME} for fun.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Btn title={`Just play ${BOT_NAME}`} desc="A plain practice game — no tips, no pop-ups. Just you against the bot." onClick={onUncoached} />
          <Btn title="Coaching again" desc="Start over from the Basics with the full walkthrough, like your first time." onClick={onCoached} />
        </div>
        {typeof onBack === 'function' && (
          <button
            onClick={onBack}
            style={{
              width: '100%', marginTop: 14, fontSize: 11, color: 'var(--text-dim)',
              background: 'none', border: 'none', cursor: 'pointer',
              textDecoration: 'underline', letterSpacing: '0.08em',
            }}
          >
            Back
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Free-play (uncoached) end card — minimal "play again / leave" at game over ─
function FreePlayEndCard({ onPlayAgain, onLeave }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9400, background: 'rgba(0,0,0,0.86)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div className="card fade-in" style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, lineHeight: 1.05,
          letterSpacing: '0.05em', color: 'var(--accent)', marginBottom: 18,
        }}>
          Game over
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {typeof onPlayAgain === 'function' && (
            <button onClick={onPlayAgain} className="primary" style={{ flex: 1, minHeight: 46, fontSize: 13 }}>
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

// ─── Generic guided modal (briefing pop-up + resolved explanation) ────────────
// `gateMs` holds the CTA disabled for that long (a countdown) so the info has
// time to settle — Module 4 mandates a 5s pause before the "I understand now"
// button becomes active on each power's explanation.
function GuidedModal({ kicker, title, body, cta, onCta, tone = 'info', gateMs = 0 }) {
  const color = TONE_COLORS[tone] || 'var(--accent)';
  const [remaining, setRemaining] = useState(gateMs ? Math.ceil(gateMs / 1000) : 0);
  useEffect(() => {
    if (!gateMs) return undefined;
    const t0 = Date.now();
    setRemaining(Math.ceil(gateMs / 1000));
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((gateMs - (Date.now() - t0)) / 1000));
      setRemaining(left);
      if (left <= 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [gateMs]);
  const locked = gateMs > 0 && remaining > 0;
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
        <button
          onClick={locked ? undefined : onCta}
          disabled={locked}
          className="primary"
          style={{
            width: '100%', minHeight: 46, fontSize: 13,
            opacity: locked ? 0.5 : 1, cursor: locked ? 'default' : 'pointer',
          }}
        >
          {locked ? `${cta} · ${remaining}s` : cta}
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
  spinActive = false,
  holdClinic = false,
  reopenSignal = 0,
  preArmLockSignal = 0,
  clinicActionHint = null,
  lesson = 'basics',
}) {
  const phase = roomState?.phase;
  const isLobby = phase === 'lobby';
  const scenario = roomState?.tutorialScenario || null;
  const clinicComplete = !!roomState?.tutorialClinicComplete;
  const slides = introSlidesFor(lesson);
  // Uncoached replay: a plain game vs the bot. The server suppresses the clinic
  // director; the client suppresses every guide overlay (see the early return).
  const coachingOff = roomState?.tutorialCoaching === false;
  // "Play again" → choose coached re-run vs a plain game (used by both the clinic
  // -complete card and the uncoached end card).
  const [showReplayChoice, setShowReplayChoice] = useState(false);
  const startCoachedReplay = () => { setShowReplayChoice(false); if (typeof restartRoom === 'function') restartRoom(true); };
  const startUncoachedReplay = () => { setShowReplayChoice(false); if (typeof restartRoom === 'function') restartRoom(false); };

  // Lobby path choice (Basics vs skip to Power Cards) now lives in-room.
  const [path, setPath] = useState(null); // null | 'basics' | 'powers'
  const [introDone, setIntroDone] = useState(false);
  const [introReopened, setIntroReopened] = useState(false);
  const [introStep, setIntroStep] = useState(0);
  const [coachHidden, setCoachHidden] = useState(false);
  // Clinic: which drill index has had its briefing pop-up dismissed.
  const [briefedIndex, setBriefedIndex] = useState(-1);
  // Flashes a "not yet" coach hint when the learner taps the dimmed defensive
  // power card too early (the parent bumps preArmLockSignal on each such tap).
  const [preArmHint, setPreArmHint] = useState(false);
  useEffect(() => {
    if (!preArmLockSignal) return undefined;
    setPreArmHint(true);
    setCoachHidden(false);
    const t = setTimeout(() => setPreArmHint(false), 4200);
    return () => clearTimeout(t);
  }, [preArmLockSignal]);

  // Corrective flash when the learner attempts an off-script card play in a clinic
  // drill (e.g. plays a card when they should Call Bluff). Shown as a transient
  // coach bar — NOT a focus-gate — so it reads as an in-the-moment "hold on".
  const [actionHintText, setActionHintText] = useState(null);
  useEffect(() => {
    if (!clinicActionHint?.n) return undefined;
    setActionHintText(clinicActionHint.text || null);
    setCoachHidden(false);
    const t = setTimeout(() => setActionHintText(null), 4600);
    return () => clearTimeout(t);
  }, [clinicActionHint?.n]);

  // Per-instruction acknowledgement for the coach focus-gate: each distinct coach
  // beat dims the table once (backdrop + OK); once acknowledged it collapses to a
  // slim pill. A ref-backed Set + version counter so re-renders don't lose it.
  const ackKeysRef = useRef(new Set());
  const [, bumpAck] = useState(0);
  const [forcedGateKey, setForcedGateKey] = useState(null);
  const ackCoach = (key) => { if (key) ackKeysRef.current.add(key); setForcedGateKey(null); bumpAck((v) => v + 1); };

  // Where the coach docks — just above the bottom seat (measured).
  const dockBottom = useDockBottom();

  // Auto-expand policy: on the learner's FIRST practice run the coach pops open
  // (the focus-gate) at each new instruction so they learn the rhythm — they OK it
  // back to the collapsed bar, the next beat re-opens, and so on. Once they've
  // completed practice once (`bluff_tutorial_completed`), repeated runs stay
  // collapsed by default — the bar still updates, but only expands when tapped.
  // Re-read on each new game (lobby) so a replay after completing reflects it.
  const readAutoExpand = () => {
    try { return typeof window !== 'undefined' ? !window.localStorage.getItem('bluff_tutorial_completed') : true; }
    catch (_) { return true; }
  };
  const [autoExpand, setAutoExpand] = useState(readAutoExpand);

  // Sticky guards: the Basics match spawns at most ONCE (so reopening + closing
  // the guide mid-game can't re-deal), and the skip request fires once.
  const spawnedRef = useRef(false);
  const skipFiredRef = useRef(false);

  // Re-entering the lobby means a fresh COACHED replay ("start again as if new"):
  // wipe the sticky guards so the intro/choice re-shows and Basics re-deals.
  // Leaving the lobby latches introDone (so reopening the guide mid-game can't
  // re-trigger the intro flow). Uncoached replays never touch the lobby.
  useEffect(() => {
    if (isLobby) {
      spawnedRef.current = false;
      skipFiredRef.current = false;
      setPath(null);
      setIntroDone(false);
      setIntroReopened(false);
      setIntroStep(0);
      setBriefedIndex(-1);
      setCoachHidden(false);
      ackKeysRef.current.clear();
      setForcedGateKey(null);
      setAutoExpand(readAutoExpand()); // first run auto-expands; later runs stay collapsed
    } else {
      setIntroDone(true);
    }
  }, [isLobby]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist "tutorial completed" so the landing can stop badging it as NEW and
  // frame the entry as a replay instead.
  useEffect(() => {
    if (clinicComplete && typeof window !== 'undefined') {
      try { window.localStorage.setItem('bluff_tutorial_completed', '1'); } catch (_) { /* ignore */ }
    }
  }, [clinicComplete]);

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
  // Held back while a cylinder is still spinning OR the practice loss hand-off is
  // pending (the player must clear their "Eliminated" card first) — otherwise the
  // briefing races over the spin / elimination card during the Basics→Powers move.
  const briefing = scenario && scenario.step === 'intro' && briefedIndex !== scenario.index
    && !spinActive && !holdClinic
    ? clinicBriefingFor(scenario)
    : null;
  // Hold the explanation until any reflected-spin overlay (Mirror/Swap) has
  // finished animating, so it never pops over a live spinning cylinder.
  const showExplanation = !!scenario && scenario.step === 'resolved' && !clinicComplete && !spinActive;

  // Coach bar. Hidden while a guided modal (briefing / explanation / choice /
  // intro) owns the screen, and during clinic-complete (its own card shows).
  let coach = null;
  // A "correction" coach is a transient in-the-moment flash (a wrong tap), shown
  // as a plain bar — never as a focus-gate (it would be jarring to backdrop every
  // mis-tap, and these auto-dismiss).
  let coachIsCorrection = false;
  const modalUp = showIntro || showChoice || briefing || showExplanation;
  // Suppress the coach bar too while the loss hand-off is pending, so the only
  // thing on screen is the spin result → "Eliminated" card → (then) the clinic.
  if (!modalUp && !isLobby && !holdClinic) {
    if (clinicComplete) coach = CLINIC_COMPLETE_COACH;
    else if (scenario) coach = clinicCoachFor(scenario, { phase });
    else if (lesson !== 'powers' && (phase === 'game_over' || phase === 'round_end')) {
      coach = BASICS_HANDOFF_COACH;
    } else coach = coachFor(coachContextFromRoom(roomState, myPlayerId));
    // A too-early tap on the locked defensive card overrides the coach with a
    // pointed "not yet" hint for a few seconds (see preArmLockSignal above).
    if (preArmHint && coach) {
      coach = { key: 'prearm-lock', tone: 'danger', title: 'Not yet', body: DEFENSE_PREARM_HINT };
      coachIsCorrection = true;
    }
    // An off-script card-play attempt flashes its corrective line over the coach.
    if (actionHintText) {
      coach = { key: 'clinic-action-lock', tone: 'danger', title: 'Hold on', body: actionHintText };
      coachIsCorrection = true;
    }
  }

  // Focus-gate decision: an actionable instruction dims the table until OK'd; once
  // acknowledged (or for an info/win beat) it collapses to the slim pill. Never
  // gate a correction flash. Also never gate while a dedicated overlay or dock
  // control owns the screen — a spin (cylinder/Pull-Trigger), the bluff-intercept
  // arm UI, or a redemption — so the gate backdrop can't bury the very control the
  // player needs (it would dead-end the lesson). The pill still carries the tip.
  const overlayOwnsScreen = spinActive
    || phase === 'spin_pending'
    || phase === 'bluff_intercept_pending'
    || phase === 'redemption_pending';
  const coachActionable = !!coach && (coach.tone === 'action' || coach.tone === 'danger');
  const coachAcked = !!coach && ackKeysRef.current.has(coach.key);
  // Auto-gate the coach only in BASICS (no scenario): the clinic already gates
  // each drill with its briefing pop-up ("Got it — show me"), so a second backdrop
  // on the live coach would be redundant and re-hide the bot the briefing just
  // revealed. The auto-open only fires on the FIRST practice run (`autoExpand`);
  // after that the bar stays collapsed and only opens when the learner taps it
  // (forcedGateKey), which works in every run, clinic included.
  const showCoachGate = !!coach && !coachIsCorrection && !overlayOwnsScreen
    && (forcedGateKey === coach.key || (autoExpand && coachActionable && !coachAcked && !scenario));

  // Header "Guide" button → re-show the current drill's briefing (clinic) or
  // reopen the walkthrough (basics). Skip the initial mount.
  const firstReopenRef = useRef(true);
  useEffect(() => {
    if (firstReopenRef.current) { firstReopenRef.current = false; return; }
    setCoachHidden(false);
    // Reopening the guide should re-show the current instruction in full, so drop
    // its acknowledgement and let the focus-gate fire again.
    ackKeysRef.current.clear();
    setForcedGateKey(null);
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
  const [showCardNudge, setShowCardNudge] = useState(false);
  useEffect(() => {
    if (!canPlay || modalUp || scenario) { setShowCardNudge(false); return undefined; }
    const t = setTimeout(() => setShowCardNudge(true), 3500);
    return () => clearTimeout(t);
  }, [canPlay, modalUp, scenario]);

  const isLastDrill = scenario && scenario.total != null && scenario.index >= scenario.total - 1;
  // (The clinic progress bar now lives IN-FLOW at the top of OnlinePlayerUI so it
  // reserves layout height instead of overlaying the HUD.)

  // Uncoached free play: no guide overlays whatsoever. Only surface a minimal
  // "play again / leave" card once the game ends so the learner can loop or exit.
  if (coachingOff) {
    return (
      <>
        {phase === 'game_over' && (
          <FreePlayEndCard
            onPlayAgain={() => setShowReplayChoice(true)}
            onLeave={typeof leaveGame === 'function' ? leaveGame : undefined}
          />
        )}
        {showReplayChoice && (
          <ReplayChoiceModal
            onCoached={startCoachedReplay}
            onUncoached={startUncoachedReplay}
            onBack={() => setShowReplayChoice(false)}
          />
        )}
      </>
    );
  }

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

      {showExplanation && (
        <GuidedModal
          kicker="What just happened"
          tone={clinicCoachFor(scenario)?.tone || 'win'}
          title={clinicCoachFor(scenario)?.title || ''}
          body={clinicCoachFor(scenario)?.body || ''}
          gateMs={5000}
          cta={isLastDrill ? 'Finish' : 'I understand now'}
          onCta={() => { if (typeof advanceTutorial === 'function') advanceTutorial(); }}
        />
      )}

      {clinicComplete && !showReplayChoice && (
        <ClinicCompleteCard
          coach={CLINIC_COMPLETE_COACH}
          onReplay={typeof restartRoom === 'function' ? () => setShowReplayChoice(true) : undefined}
          onLeave={typeof leaveGame === 'function' ? leaveGame : undefined}
        />
      )}

      {showReplayChoice && (
        <ReplayChoiceModal
          onCoached={startCoachedReplay}
          onUncoached={startUncoachedReplay}
          onBack={() => setShowReplayChoice(false)}
        />
      )}

      {coach && !clinicComplete && !coachHidden && (
        coachIsCorrection ? (
          // Transient "hold on / not yet" flash — plain bar, no backdrop.
          <CoachBar
            coach={coach}
            isMobile={isMobile}
            onHide={() => setCoachHidden(true)}
            onReplayIntro={replayIntro}
          />
        ) : showCoachGate ? (
          // Action-required beat — dim the table until the learner taps OK, so
          // they can't misclick and the coach never hides the dealer bot mid-read.
          <CoachGate
            coach={coach}
            isMobile={isMobile}
            dockBottom={dockBottom}
            onOk={() => ackCoach(coach.key)}
          />
        ) : (
          // Acknowledged action beat, or a passive info/win beat — slim top-left
          // pill, clear of the centred bot. Tap to re-open the full instruction.
          <CoachPill
            coach={coach}
            isMobile={isMobile}
            dockBottom={dockBottom}
            onExpand={() => setForcedGateKey(coach.key)}
          />
        )
      )}

      {/* The "tap a card ▼" nudge now anchors to the fan CONTAINER (see CardNudge
          measure), so it stays aligned on every width — shown on all screens. */}
      {showCardNudge && <CardNudge />}
      <style>{'@keyframes bobUp{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}'}</style>
    </>
  );
}
