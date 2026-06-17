'use client';

import { useState, useEffect, useRef, lazy, Suspense } from 'react';

const HowToPlayModal = lazy(() =>
  import('./HowToPlayModal').then((m) => ({ default: m.HowToPlayModal })),
);
import { ShapeIcon } from '../shared/ShapeIcon';
import { TierBadge } from '../shared/TierBadge';
import { TierSigil } from '../shared/TierSigil';
import { tierForLevel, tierMeta } from '../../lib/tiers';
import { useIsMobile } from '../../hooks/useIsMobile';

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
function PlaqueButton({ children, onClick, primary, ember, bronze, disabled, style = {} }) {
  return (
    <button
      className={bronze ? 'bronze' : ember ? 'ember' : primary ? 'primary' : undefined}
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

// Ghost (secondary) button — borderless-feeling, half-width in the ghost row.
// Relies on the global `button` CSS for the border/radius/hover; overrides only
// the fill (transparent) and weight so it reads quieter than the focal CTAs.
const GHOST_BTN_STYLE = {
  flex: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  padding: '12px',
  background: 'transparent',
  fontSize: 10,
  letterSpacing: '0.1em',
  color: 'var(--text-dim)',
  whiteSpace: 'nowrap',
};

// ─── Ember particle background ────────────────────────────────────────────────
// A vanilla canvas spark system: ~50 embers rise slowly and drift toward the
// cursor. No external library. Honours prefers-reduced-motion by leaving the
// canvas blank (no animation). Cleaned up (cancelAnimationFrame + listeners)
// on unmount.
function EmberCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const reduced = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return undefined; // leave the canvas blank — no motion

    let W = 0, H = 0, raf = 0, mx = 0, my = 0;
    const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    resize();
    const onResize = () => resize();
    const onMove = (e) => { mx = e.clientX; my = e.clientY; };
    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMove);

    const COLORS = ['#f0b54a', '#d4513a', '#e89030', '#ffd060', '#a83a28'];
    const spawn = () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0005,
      vy: -(Math.random() * 0.0009 + 0.0002),
      r: Math.random() * 1.6 + 0.4,
      a: Math.random() * 0.4 + 0.1,
      life: Math.random(),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
    const particles = Array.from({ length: 50 }, spawn);

    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      particles.forEach((p) => {
        const dx = mx / W - p.x;
        const dy = my / H - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.22 && d > 0) { p.vx += dx * d * 0.00018; p.vy += dy * d * 0.00018; }
        p.vx *= 0.97; p.vy *= 0.98; p.vy -= 0.000035;
        p.x += p.vx; p.y += p.vy; p.life += 0.003;
        if (p.life > 1 || p.y < -0.02) {
          p.y = 1.02; p.x = Math.random(); p.life = 0;
          p.vx = (Math.random() - 0.5) * 0.0005;
          p.vy = -(Math.random() * 0.0009 + 0.0002);
        }
        const fade = Math.sin(p.life * Math.PI);
        ctx.save();
        ctx.globalAlpha = p.a * fade;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * H, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}
    />
  );
}

// ─── Ambient looping backdrop — drifting Whot suits ──────────────────────────
// Large, faint card suits that drift up and slowly rotate on a perpetual loop
// behind the content — the landing's always-on background motion. Pure CSS
// (the `bg-suit-drift` keyframe in globals.css); each glyph gets its own
// duration/delay/position so they never sync up. Reduced motion freezes them.
const BG_SUITS = [
  { shape: 'circle',   top: '15%', left: '9%',  size: 118, dur: 34, delay: 0,  op: 0.06 },
  { shape: 'triangle', top: '64%', left: '13%', size: 92,  dur: 27, delay: 4,  op: 0.05 },
  { shape: 'cross',    top: '20%', left: '82%', size: 104, dur: 31, delay: 9,  op: 0.06 },
  { shape: 'square',   top: '70%', left: '80%', size: 110, dur: 39, delay: 2,  op: 0.05 },
  { shape: 'star',     top: '42%', left: '52%', size: 150, dur: 46, delay: 14, op: 0.04 },
  { shape: 'circle',   top: '85%', left: '46%', size: 70,  dur: 25, delay: 7,  op: 0.05 },
  { shape: 'triangle', top: '6%',  left: '56%', size: 84,  dur: 30, delay: 12, op: 0.05 },
];

function FloatingSuits() {
  return (
    <div
      className="bg-suit-layer"
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}
    >
      {BG_SUITS.map((s, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: s.top,
            left: s.left,
            opacity: s.op,
            animation: `bg-suit-drift ${s.dur}s linear ${s.delay}s infinite`,
          }}
        >
          {/* Amber (not the neon suit palette) so they read as candle-warm haze. */}
          <ShapeIcon shape={s.shape} size={s.size} color="#f0b54a" />
        </div>
      ))}
    </div>
  );
}

// ─── Level chip + profile drawer (top-left) ───────────────────────────────────
// Replaces the old full RankIdentity panel that lived in the button stack. A
// compact pill anchored top-left (where the wrought-iron bracket used to sit);
// tapping it drops a profile drawer with the rank sigil, XP-to-next bar and
// lifetime games played. Detailed match stats (wins/losses/bluffs/spins) aren't
// tracked server-side yet (docs/landing-redesign.md data note), so the drawer
// surfaces only what's real and flags the rest as coming.
const MAX_LEVEL = 20;

function xpPct(p) {
  const level = p?.level || 1;
  if (level >= MAX_LEVEL) return 100;
  const span = (p?.nextLevelXp ?? 0) - (p?.levelFloorXp ?? 0);
  if (!(span > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round(((p.xp - p.levelFloorXp) / span) * 100)));
}

function LevelChip({ progression, isGuest, username }) {
  const [open, setOpen] = useState(false);
  const p = progression || { level: 1, xp: 0, levelFloorXp: 0, nextLevelXp: 150, gamesPlayed: 0 };
  const level = p.level || 1;
  const isMax = level >= MAX_LEVEL;
  const tier = tierForLevel(level);
  const meta = tierMeta(tier);
  const pct = xpPct(p);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {/* Click-away catcher */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden="true"
          style={{ position: 'fixed', inset: 0, zIndex: 9190 }}
        />
      )}
      <div style={{
        position: 'fixed',
        top: 'max(14px, env(safe-area-inset-top, 0px))',
        left: 'max(14px, env(safe-area-inset-left, 0px))',
        zIndex: 9200,
      }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Your rank, level and stats"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px 6px 7px',
            border: `1px solid ${open ? meta.color : 'var(--border-lit)'}`,
            background: 'rgba(8,6,4,0.9)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderRadius: 999,
            cursor: 'pointer',
            boxShadow: meta.glow ? `0 4px 14px rgba(0,0,0,0.45), 0 0 12px ${meta.glow}` : '0 4px 14px rgba(0,0,0,0.45)',
            fontFamily: "'Cinzel', serif",
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <TierSigil tier={tier} size={17} />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: meta.color }}>
            {meta.label}
          </span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            · LV {level}
          </span>
          <svg
            width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true"
            style={{ color: 'var(--text-dim)', opacity: 0.55, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }}
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && (
          <div
            role="dialog"
            aria-label="Profile"
            className="fade-in"
            style={{
              position: 'absolute', top: 'calc(100% + 8px)', left: 0,
              width: 'min(296px, calc(100vw - 28px))',
              background: 'linear-gradient(160deg, var(--surface3), var(--surface))',
              border: '1px solid var(--border-lit)',
              borderRadius: 8,
              boxShadow: '0 20px 56px rgba(0,0,0,0.85)',
              padding: '18px 20px',
              zIndex: 9200,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <TierSigil tier={tier} size={40} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: meta.color, textShadow: meta.glow ? `0 0 10px ${meta.glow}` : 'none' }}>
                  {meta.name}
                </div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: 'var(--text-mid)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {isMax ? 'Max Level' : `Level ${level}`}{username ? ` · ${username}` : ''}
                </div>
              </div>
            </div>

            <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 5 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${meta.fill}, var(--accent))`, boxShadow: meta.glow ? `0 0 8px ${meta.glow}` : 'none', transition: 'width 0.6s cubic-bezier(0.22,1,0.36,1)' }} />
            </div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '0.06em', color: 'var(--text-dim)', marginBottom: 12 }}>
              {isGuest
                ? 'Guest — sign in to keep your XP & rank'
                : isMax
                  ? `${p.xp} XP · the top of the ladder`
                  : `${p.xp} / ${p.nextLevelXp} XP · ${p.nextLevelXp - p.xp} to next level`}
            </div>

            <div style={{ height: 1, background: 'var(--border)', marginBottom: 12 }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                Games Played
              </span>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                {isGuest ? '—' : (p.gamesPlayed ?? 0)}
              </span>
            </div>
            <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: 12, color: 'var(--text-dim)', marginTop: 10, lineHeight: 1.5 }}>
              Wins, bluffs called &amp; trigger pulls — coming to your ledger soon.
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── LandingScreen — the tavern common room ──────────────────────────────────
export function LandingScreen({
  username,
  isGuest = false,
  onCreateRoom,
  onStartTutorial,
  onStartSandbox,
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
  getProgression,
}) {
  const [mode, setMode] = useState(null);              // null | 'play' | 'host' | 'join' | 'practice'
  // The player's full progression (rank/level/XP), surfaced on the landing as a
  // prominent identity panel — fetched for everyone (guests read as Streets/Lv1,
  // shown with a sign-in nudge). `tier` is derived for the inline seat badges.
  const [progression, setProgression] = useState(null);
  useEffect(() => {
    if (!getProgression) { setProgression(null); return undefined; }
    let alive = true;
    let attempts = 0;
    let timer = null;
    // The landing can mount a beat before the socket finishes authenticating,
    // so a single fetch may come back "not authenticated". Retry a few times
    // until the rank resolves (identity panel is best-effort, never blocking).
    const load = () => {
      getProgression().then((res) => {
        if (!alive) return;
        if (res?.success && res.progression) { setProgression(res.progression); return; }
        if (attempts++ < 6) timer = setTimeout(load, 700);
      }).catch(() => {
        if (alive && attempts++ < 6) timer = setTimeout(load, 700);
      });
    };
    load();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [getProgression]);
  const tier = progression ? tierForLevel(progression.level) : null;
  const isMobile = useIsMobile();
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [selectedGameMode, setSelectedGameMode] = useState(null);
  const [codeLocked, setCodeLocked] = useState(false);
  // First-run nudge: badge the Practice button until the player has tried it
  // once. Read in an effect (not initial state) to avoid an SSR hydration mismatch.
  const [tutorialHint, setTutorialHint] = useState(false);
  // Once the player has FINISHED the clinic, the button becomes a "replay" entry
  // with a ✓ chip instead of the NEW badge.
  const [tutorialDone, setTutorialDone] = useState(false);
  // Lightweight rollout flag — default ON; build with NEXT_PUBLIC_TUTORIAL_ENABLED=false to hide.
  const tutorialEnabled = process.env.NEXT_PUBLIC_TUTORIAL_ENABLED !== 'false';

  useEffect(() => {
    if (initialJoinCode) {
      setRoomCode(initialJoinCode.toUpperCase());
      setCodeLocked(true);
      setMode('join');
    }
  }, [initialJoinCode]); // eslint-disable-line

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        if (!window.localStorage.getItem('bluff_tutorial_seen')) setTutorialHint(true);
        if (window.localStorage.getItem('bluff_tutorial_completed')) setTutorialDone(true);
      }
    } catch (_) { /* localStorage blocked - just skip the nudge */ }
  }, []);

  // Enter the practice room directly — the "Go through Basics / Skip to Power
  // Cards" choice now lives IN the room (TutorialLayer), not on the landing.
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

  // Host/Join now live one level under "Play", so their backs return there.
  const handleBackFromHost = () => {
    setMode('play');
    setSelectedGameMode(null);
    setError(null);
  };

  return (
    <div style={{
      // The page shell (app/page.js `wrap`) already gives this screen `24px 16px`
      // padding + a 100vh min-height. Matching 100vh here too stacked a second
      // viewport-height inside the first, so the body always scrolled ~48px on
      // mobile. Subtract the shell's vertical padding so we fill exactly one
      // viewport with no overflow, while keeping the centred layout.
      minHeight: 'calc(100vh - 48px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient looping backdrop — drifting Whot suits behind everything. */}
      <FloatingSuits />

      {/* Rising ember sparks — behind the ambient haze (see EmberCanvas). */}
      <EmberCanvas />

      {/* Top-left rank chip + profile drawer — fixed, frames the board with the
          name chip in the opposite corner. Only once progression resolves. */}
      {progression && (
        <LevelChip progression={progression} isGuest={isGuest} username={username} />
      )}

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

      {/* Wrought-iron corner brackets — only the two BOTTOM corners. Both top
          corners are intentionally omitted: the level chip (top-left) and the
          name chip (top-right) now live there, and the old brackets read as a
          stray white ruler poking out from under the chips. */}
      {[
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

      {/* ── Main content - tilted notice board ── */}
      <div
        className="fade-in tilt-panel"
        style={{ width: '100%', maxWidth: 480, position: 'relative', zIndex: 1 }}
      >
        {/* Tavern sign - a carved board hung from chains, gently swaying.
            Mobile compresses the sign's air (and the title below) so the whole
            landing fits one phone viewport with no scroll. */}
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 18 : 36, paddingTop: isMobile ? 6 : 20 }}>
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
              {/* Amber accent line along the very top edge of the carved board.
                  Inset from the rounded corners so it needs no overflow:hidden
                  (which would clip the title's candlelight glow). */}
              <div aria-hidden="true" style={{
                position: 'absolute', top: 1, left: 14, right: 14, height: 2,
                borderRadius: 2,
                background: 'linear-gradient(90deg, transparent, var(--accent-dim) 20%, var(--accent) 50%, var(--accent-dim) 80%, transparent)',
                opacity: 0.65,
              }} />
              <h1
                className="candle-title"
                style={{
                  fontFamily: "'Cinzel Decorative', 'Cinzel', serif",
                  fontSize: isMobile ? 'clamp(42px, 13vw, 60px)' : 'clamp(56px, 16vw, 88px)',
                  color: 'var(--accent)',
                  lineHeight: 0.9,
                  letterSpacing: '0.08em',
                  textShadow: '0 0 50px rgba(240,181,74,0.5), 0 3px 0 rgba(0,0,0,0.9)',
                }}
              >
                BLUFF
              </h1>
              {/* Crimson Text italic tagline — the hook, right under the title. */}
              <div style={{
                fontFamily: "'Crimson Text', serif",
                fontStyle: 'italic',
                color: 'var(--text-mid)',
                fontSize: isMobile ? 12 : 14,
                letterSpacing: '0.04em',
                marginTop: isMobile ? 6 : 10,
              }}>
                Lie. Call. Pull the Trigger.
              </div>
              {/* Subtitle flanked by ornamental rules. */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginTop: isMobile ? 8 : 10,
              }}>
                <span aria-hidden="true" style={{ flex: 1, height: 1, background: 'var(--border-lit)' }} />
                <span style={{
                  fontFamily: "'Cinzel', serif",
                  color: 'var(--text-dim)',
                  fontSize: 8,
                  letterSpacing: '0.26em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}>
                  The Card Game · Up to 15 Players
                </span>
                <span aria-hidden="true" style={{ flex: 1, height: 1, background: 'var(--border-lit)' }} />
              </div>
            </div>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 14,
            marginTop: isMobile ? 12 : 18,
          }}>
            {['circle', 'square', 'triangle', 'cross', 'star'].map((shape, i) => (
              <SuitMark key={shape} shape={shape} delay={i * 0.07} />
            ))}
          </div>
        </div>

        {/* Connection status - candlelight indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center',
          marginBottom: isMobile ? 16 : 26,
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
            {/* Rank/level/XP now lives in the top-left level chip, not in this
                stack — keeps the menu short and the Play CTA dominant. */}
            {/* ONE "Play" entry — like Practice, it opens a choice (Open Game /
                Join Game) instead of two separate landing buttons, so the
                landing stays short enough to fit a phone screen unscrolled.
                The dominant focal CTA: aged bronze (pairs with gold Practice),
                taller (20px) than the rest. */}
            <PlaqueButton bronze onClick={() => { setError(null); setMode('play'); }} disabled={!connected} style={{ padding: '20px 24px' }}>
              {/* Dice icon */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="2" y="2" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="1.8"/>
                <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
                <circle cx="16" cy="16" r="1.5" fill="currentColor"/>
                <circle cx="16" cy="8" r="1.5" fill="currentColor"/>
                <circle cx="8" cy="16" r="1.5" fill="currentColor"/>
                <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
              </svg>
              Play
            </PlaqueButton>

            {/* Learn by playing - a solo practice table against a bot. ONE entry
                point: tapping it opens a choice of Coaching (guided) or Sandbox
                (free) mode, so both live behind a single "Practice" button. */}
            {(onStartTutorial || onStartSandbox) && tutorialEnabled && (
              <PlaqueButton
                primary
                onClick={() => { setError(null); setMode('practice'); }}
                disabled={!connected}
                // Keep the icon · label · badge on a single line at any width.
                style={{ flexWrap: 'nowrap', whiteSpace: 'nowrap' }}
              >
                {/* Target / practice icon */}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
                  <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.6"/>
                  <circle cx="12" cy="12" r="1.6" fill="currentColor"/>
                </svg>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                  Practice
                </span>
                {tutorialDone ? (
                  <span
                    title="You've completed the coaching - replay or jump into sandbox any time"
                    style={{
                      flexShrink: 0, padding: '2px 7px', borderRadius: 999,
                      background: 'var(--alive)', color: '#0e1a10',
                      fontFamily: "'Space Mono', monospace", fontSize: 9,
                      letterSpacing: '0.1em', fontWeight: 700,
                    }}
                  >
                    {/* Mobile keeps the compact tick; larger screens spell it out. */}
                    {isMobile ? '✓' : '✓ Completed'}
                  </span>
                ) : tutorialHint ? (
                  <span
                    style={{
                      // Dark bronze chip with cream text — reads as engraved
                      // metal on the gold Practice button, same warm family.
                      flexShrink: 0, padding: '2px 7px', borderRadius: 999,
                      background: '#3f3016', color: '#f5dca6',
                      border: '1px solid #7a5f3e',
                      fontFamily: "'Space Mono', monospace", fontSize: 9,
                      letterSpacing: '0.1em', fontWeight: 700,
                    }}
                  >
                    NEW
                  </span>
                ) : null}
              </PlaqueButton>
            )}

            {/* Ornamental rule separating the focal CTAs from the ghost row. */}
            <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
              <span style={{ flex: 1, height: 1, background: 'var(--border-lit)' }} />
              <span style={{ color: 'var(--accent-dim)', fontSize: 10, lineHeight: 1 }}>✦</span>
              <span style={{ flex: 1, height: 1, background: 'var(--border-lit)' }} />
            </div>

            {/* Ghost row — quieter secondary entries, equal width side by side. */}
            <div style={{ display: 'flex', gap: 10 }}>
              {!isGuest && (
                <button
                  type="button"
                  onClick={() => { setError(null); onOpenGroups?.(); }}
                  disabled={!connected}
                  style={GHOST_BTN_STYLE}
                >
                  {/* Group icon */}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.8"/>
                    <circle cx="17" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.8"/>
                    <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    <path d="M17 14c1.8.5 3 2.1 3 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                  My Groups
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowHowToPlay(true)}
                style={GHOST_BTN_STYLE}
              >
                {/* Scroll icon */}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4z" stroke="currentColor" strokeWidth="1.8"/>
                  <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Rules
              </button>
            </div>

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

        {/* ── Play: choose Open Game or Join Game ── */}
        {mode === 'play' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 9,
              color: 'var(--text-dim)',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              marginBottom: 2,
            }}>
              Play with Others
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                {
                  key: 'open',
                  icon: (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="2" y="2" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="1.8"/>
                      <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
                      <circle cx="16" cy="16" r="1.5" fill="currentColor"/>
                      <circle cx="16" cy="8" r="1.5" fill="currentColor"/>
                      <circle cx="8" cy="16" r="1.5" fill="currentColor"/>
                      <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                    </svg>
                  ),
                  title: 'Open Game',
                  desc: 'Host a new table — physical or online — and invite the others with its room cipher.',
                  onPick: () => { setError(null); setMode('host'); },
                },
                {
                  key: 'join',
                  icon: (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="3" y="2" width="18" height="20" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                      <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
                    </svg>
                  ),
                  title: 'Join Game',
                  desc: 'Got a room cipher from a host? Enter it and take your seat at their table.',
                  onPick: () => { setError(null); setMode('join'); },
                },
              ].map(({ key, icon, title, desc, onPick }) => (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (connected) onPick(); }}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && connected) onPick(); }}
                  style={{
                    flex: '1 1 180px',
                    padding: '16px',
                    background: 'linear-gradient(160deg, var(--surface2) 0%, var(--surface) 100%)',
                    border: '2px solid var(--border-lit)',
                    borderRadius: 'var(--radius)',
                    cursor: connected ? 'pointer' : 'not-allowed',
                    opacity: connected ? 0.92 : 0.5,
                    transition: 'border-color 0.18s, background 0.18s, box-shadow 0.18s, opacity 0.18s',
                    outline: 'none',
                  }}
                >
                  <div style={{ color: 'var(--accent)', marginBottom: 8 }}>{icon}</div>
                  <div style={{
                    fontFamily: "'Cinzel', serif",
                    fontSize: 16,
                    color: 'var(--text)',
                    marginBottom: 6,
                  }}>
                    {title}
                  </div>
                  <div style={{
                    fontFamily: "'Crimson Text', serif",
                    fontSize: 13,
                    color: 'var(--text-dim)',
                    lineHeight: 1.5,
                  }}>
                    {desc}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              style={{ fontSize: 11 }}
              onClick={() => { setMode(null); setError(null); }}
            >
              ← Back to the Bar
            </button>
          </div>
        )}

        {/* ── Host: game mode selection ── */}
        {/* ── Practice: choose Coaching or Sandbox ── */}
        {mode === 'practice' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 9,
              color: 'var(--text-dim)',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              marginBottom: 2,
            }}>
              Practice vs Bot
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                {
                  key: 'coaching',
                  icon: (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
                      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.6"/>
                      <circle cx="12" cy="12" r="1.6" fill="currentColor"/>
                    </svg>
                  ),
                  title: 'Coaching',
                  desc: 'Guided lessons — learn the core loop, then a power-card clinic. Best for a first-timer.',
                  onPick: handleStartTutorial,
                },
                {
                  key: 'sandbox',
                  icon: (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="4" y="8" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                      <path d="M12 4v4M9 13h.01M15 13h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  ),
                  title: 'Sandbox',
                  desc: 'A free, unguided game vs the bot — your rules. Toggle power cards and just play.',
                  onPick: () => { setError(null); onStartSandbox?.(); },
                },
              ]
                .filter(({ key }) => (key === 'coaching' ? !!onStartTutorial : !!onStartSandbox))
                .map(({ key, icon, title, desc, onPick }) => (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    onClick={() => { if (connected) onPick(); }}
                    onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && connected) onPick(); }}
                    style={{
                      flex: '1 1 180px',
                      padding: '16px',
                      background: 'linear-gradient(160deg, var(--surface2) 0%, var(--surface) 100%)',
                      border: '2px solid var(--border-lit)',
                      borderRadius: 'var(--radius)',
                      cursor: connected ? 'pointer' : 'not-allowed',
                      opacity: connected ? 0.92 : 0.5,
                      transition: 'border-color 0.18s, background 0.18s, box-shadow 0.18s, opacity 0.18s',
                      outline: 'none',
                    }}
                  >
                    <div style={{ color: 'var(--accent)', marginBottom: 8 }}>{icon}</div>
                    <div style={{
                      fontFamily: "'Cinzel', serif",
                      fontSize: 16,
                      color: 'var(--text)',
                      marginBottom: 6,
                    }}>
                      {title}
                    </div>
                    <div style={{
                      fontFamily: "'Crimson Text', serif",
                      fontSize: 13,
                      color: 'var(--text-dim)',
                      lineHeight: 1.5,
                    }}>
                      {desc}
                    </div>
                  </div>
                ))}
            </div>

            <button
              type="button"
              style={{ fontSize: 11 }}
              onClick={() => { setMode(null); setError(null); }}
            >
              ← Back to the Bar
            </button>
          </div>
        )}

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

            {/* Mode cards - two physical game boards */}
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
                Host Mode - You are the Game Master, not a player
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
                  {tier && <TierBadge tier={tier} style={{ marginLeft: 8, verticalAlign: 'middle' }} />}
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
                  Powers, modifiers and house rules are set inside the room lobby once it opens - seat your guests first.
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
              {tier && <TierBadge tier={tier} style={{ marginLeft: 8, verticalAlign: 'middle' }} />}
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
                setMode('play');
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
