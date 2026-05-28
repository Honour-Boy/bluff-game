'use client';

import { useCallback, useEffect, useRef } from 'react';

// ─── useAtmosphere ────────────────────────────────────────────────────────────
// Phase 3: atmospheric effects hook.
// Exposes:
//   triggerShake()                      — screen-shake the wrapper
//   triggerAudio(kind)                  — one-shot cue: 'bluff'|'spin'|'card'|'win'|'eliminate'
//   startSpinAudio(finalAngle, durMs)   — schedules mechanical cylinder clicks
//                                         that decelerate in lockstep with the 8 s
//                                         CSS transition cubic-bezier(0.1,0,0.15,1).
//                                         Call when the animation begins (after the
//                                         80 ms start delay). Fires a final heavy
//                                         clunk at the last click position.
//   stopSpinAudio()                     — cancels all pending click timeouts (early
//                                         dismiss / unmount cleanup).
//
// Audio is synthesised entirely via Web Audio API — no asset files required.
// Silently no-ops when AudioContext is unavailable.

// ─── Web Audio context ────────────────────────────────────────────────────────
function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!window.__bluffAudioCtx) {
    try {
      window.__bluffAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {
      return null;
    }
  }
  return window.__bluffAudioCtx;
}

function resume(ctx) {
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

// ─── One-shot sound primitives ────────────────────────────────────────────────

// Wood knock — card play
function playCardSound(ctx) {
  resume(ctx);
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);
  gain.gain.setValueAtTime(0.22, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  osc.start(now);
  osc.stop(now + 0.14);
}

// Heavy bell toll — bluff called
function playBluffSound(ctx) {
  resume(ctx);
  const now = ctx.currentTime;
  [220, 330, 440].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + i * 0.04;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18 - i * 0.04, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
    osc.start(start);
    osc.stop(start + 0.6);
  });
}

// Survived — soft metallic exhale (used after the spin resolves as empty)
function playSpinSound(ctx) {
  resume(ctx);
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(80, now);
  osc.frequency.exponentialRampToValueAtTime(320, now + 0.6);
  osc.frequency.exponentialRampToValueAtTime(110, now + 1.1);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.linearRampToValueAtTime(0.14, now + 0.4);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
  osc.start(now);
  osc.stop(now + 1.25);
}

// Victory fanfare — three ascending chords
function playWinSound(ctx) {
  resume(ctx);
  const now = ctx.currentTime;
  [[261.6, 329.6, 392], [293.7, 369.9, 440], [349.2, 440, 523.2]].forEach(
    (chord, ci) => {
      chord.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const t = now + ci * 0.22;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.1, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.start(t);
        osc.stop(t + 0.5);
      });
    },
  );
}

// Elimination thud — deep descending boom
function playEliminateSound(ctx) {
  resume(ctx);
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(28, now + 0.5);
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
  osc.start(now);
  osc.stop(now + 0.6);
}

const AUDIO_MAP = {
  card: playCardSound,
  bluff: playBluffSound,
  spin: playSpinSound,
  win: playWinSound,
  eliminate: playEliminateSound,
};

// ─── Dynamic spin-audio engine ────────────────────────────────────────────────
// The cylinder CSS transition is: transform 8s cubic-bezier(0.1, 0, 0.15, 1)
// P0=(0,0) P1=(0.1,0) P2=(0.15,1) P3=(1,1)
//
// Strategy (Option A — Angular Tick Model):
//   Evaluate the inverse of the easing curve to find the exact wall-clock
//   instant when the cylinder crosses each 60° segment boundary. Schedule a
//   crisp noise-burst click at each crossing. As the CSS easing decelerates,
//   the inter-click interval naturally widens — creating a physically correct
//   slow-down without any DOM polling.
//   The very last click fires a heavier "clunk" sound to mark the lock.

const EASE_P1X = 0.1;
const EASE_P1Y = 0;
const EASE_P2X = 0.15;
const EASE_P2Y = 1;

// Parametric Y (progress) for Bezier parameter t
function easeY(t) {
  const mt = 1 - t;
  return 3 * mt * mt * t * EASE_P1Y + 3 * mt * t * t * EASE_P2Y + t * t * t;
}
// Parametric X (time fraction) for Bezier parameter t
function easeX(t) {
  const mt = 1 - t;
  return 3 * mt * mt * t * EASE_P1X + 3 * mt * t * t * EASE_P2X + t * t * t;
}

// Given a target animation-progress fraction (0–1), return the CSS time
// fraction (0–1) via binary search on the parametric curve.
function progressToTimeFraction(progress) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (easeY(mid) < progress) lo = mid;
    else hi = mid;
  }
  return easeX((lo + hi) / 2);
}

// Crisp metallic detent click — noise burst through a bandpass filter (15 ms)
function playSpinClick(ctx) {
  resume(ctx);
  const now = ctx.currentTime;
  const bufLen = Math.ceil(ctx.sampleRate * 0.015);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3800;
  bp.Q.value = 1.8;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.22, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
  src.connect(bp);
  bp.connect(gain);
  gain.connect(ctx.destination);
  src.start(now);
}

// Heavy hammer clunk — cylinder locks into the final chamber (250 ms)
function playSpinClunk(ctx) {
  resume(ctx);
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(95, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
  gain.gain.setValueAtTime(0.48, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  osc.start(now);
  osc.stop(now + 0.28);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAtmosphere(wrapperRef) {
  const shakeTimeout = useRef(null);
  // IDs of all pending click/clunk setTimeout calls for the current spin
  const spinClickIdsRef = useRef([]);

  const triggerShake = useCallback(() => {
    const el = wrapperRef?.current;
    if (!el) return;
    if (typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.classList.remove('screen-shake');
    void el.offsetWidth; // force reflow so the class re-triggers the animation
    el.classList.add('screen-shake');
    clearTimeout(shakeTimeout.current);
    shakeTimeout.current = setTimeout(() => {
      el.classList.remove('screen-shake');
    }, 600);
  }, [wrapperRef]);

  const triggerAudio = useCallback((kind) => {
    const ctx = getCtx();
    if (!ctx) return;
    const fn = AUDIO_MAP[kind];
    if (fn) {
      try { fn(ctx); } catch (_) {}
    }
  }, []);

  // Schedule mechanical clicks for a spin of `finalAngle` degrees over `durationMs`.
  // Each chamber boundary (every 60°) triggers a click; the last one fires the
  // heavier clunk. Call this at the moment the CSS transition begins.
  const startSpinAudio = useCallback((finalAngle, durationMs = 8000) => {
    // Cancel any leftover clicks from a previous spin
    spinClickIdsRef.current.forEach(clearTimeout);
    spinClickIdsRef.current = [];

    const ctx = getCtx();
    if (!ctx) return;

    const DEGREES_PER_CHAMBER = 60;
    const totalClicks = Math.floor(finalAngle / DEGREES_PER_CHAMBER);
    const ids = [];

    for (let i = 1; i <= totalClicks; i++) {
      const progress = (i * DEGREES_PER_CHAMBER) / finalAngle;
      // Clamp slightly below 1 to avoid floating-point extrapolation at the boundary
      const timeFrac = progressToTimeFraction(Math.min(progress, 0.9998));
      const delayMs = timeFrac * durationMs;
      const isLast = i === totalClicks;

      ids.push(setTimeout(() => {
        const audioCtx = getCtx();
        if (!audioCtx) return;
        try {
          if (isLast) playSpinClunk(audioCtx);
          else playSpinClick(audioCtx);
        } catch (_) {}
      }, delayMs));
    }

    spinClickIdsRef.current = ids;
  }, []);

  // Cancel all pending clicks (component unmount or early dismiss).
  const stopSpinAudio = useCallback(() => {
    spinClickIdsRef.current.forEach(clearTimeout);
    spinClickIdsRef.current = [];
  }, []);

  useEffect(() => () => {
    clearTimeout(shakeTimeout.current);
    spinClickIdsRef.current.forEach(clearTimeout);
  }, []);

  return { triggerShake, triggerAudio, startSpinAudio, stopSpinAudio };
}
