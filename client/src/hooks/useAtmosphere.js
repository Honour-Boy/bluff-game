'use client';

import { useCallback, useEffect, useRef } from 'react';

// ─── useAtmosphere ────────────────────────────────────────────────────────────
// Phase 3: atmospheric effects hook.
// Exposes:
//   triggerShake()     — screen-shake the game wrapper (bluff resolution, spin)
//   triggerAudio(kind) — Web Audio API sound cue; kinds: 'bluff' | 'spin' |
//                        'card' | 'win' | 'eliminate'
//   SmokeLayer         — React component: renders two drifting smoke wisps
//   vignetteClass      — CSS class string for the body/wrapper (spin_pending)
//
// Audio is synthesised entirely in the Web Audio API — no asset files needed.
// All tones use warm frequencies (wood knocks, deep bells) to match the tavern theme.
// Silently no-ops on environments without AudioContext support.

// ─── Web Audio helpers ────────────────────────────────────────────────────────
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

// Wood knock — short percussive thud (card play)
function playCardSound(ctx) {
  resume(ctx);
  const now = ctx.currentTime;
  // Low-frequency burst through gain envelope
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

// Cylinder spin — rising metallic whir
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

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAtmosphere(wrapperRef) {
  const shakeTimeout = useRef(null);

  const triggerShake = useCallback(() => {
    const el = wrapperRef?.current;
    if (!el) return;
    // Honour reduced-motion preference
    if (typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.classList.remove('screen-shake');
    // Force reflow so re-adding the class re-triggers the animation
    void el.offsetWidth;
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

  useEffect(() => () => clearTimeout(shakeTimeout.current), []);

  return { triggerShake, triggerAudio };
}
