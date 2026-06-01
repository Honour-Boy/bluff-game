'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

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

// ─── Master output bus (volume + peak limiter) ──────────────────────────────────
// Everything routes through one master gain → soft limiter → speakers. The gain
// makes the whole mix noticeably louder; the DynamicsCompressor catches peaks so
// stacked cues (clunk + boom + bed) don't clip/distort. Created once per context.
// NOTE: uses ctx['destination'] (bracket form) so the blanket replace of
// `ctx.destination` → masterOut(ctx) elsewhere never rewrites this line.
const MASTER_GAIN = 2.1;
function masterOut(ctx) {
  if (!ctx.__bluffMaster) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -9;
    comp.knee.value = 14;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    const g = ctx.createGain();
    g.gain.value = MASTER_GAIN;
    g.connect(comp);
    comp.connect(ctx['destination']);
    ctx.__bluffMaster = g;
  }
  return ctx.__bluffMaster;
}

// ─── Mobile/iOS audio unlock ────────────────────────────────────────────────────
// Mobile browsers keep the AudioContext suspended until it is resumed *inside* a
// user gesture, and iOS additionally needs a silent buffer played once to unlock
// Web Audio. We install capture-phase listeners on the first real gesture that
// resume + play a 1-sample silent buffer, then self-remove once running. Also
// re-resume when the tab returns to the foreground (iOS suspends on background).
let _unlockInstalled = false;
function _unlockAudio() {
  const ctx = getCtx();
  if (!ctx) return;
  resume(ctx);
  try {
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx['destination']);
    src.start(0);
  } catch (_) {}
}
function installAudioUnlock() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || _unlockInstalled) return;
  _unlockInstalled = true;
  const events = ['touchstart', 'touchend', 'pointerdown', 'mousedown', 'keydown', 'click'];
  const handler = () => {
    _unlockAudio();
    const ctx = getCtx();
    if (ctx && ctx.state === 'running') {
      try { _musicStart(); } catch (_) {}
      events.forEach((e) => document.removeEventListener(e, handler, true));
    }
  };
  events.forEach((e) => document.addEventListener(e, handler, true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const ctx = getCtx();
      if (ctx) resume(ctx);
    }
  });
}

// ─── One-shot sound primitives ────────────────────────────────────────────────

// Wood knock — card play
function playCardSound(ctx) {
  resume(ctx);
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(masterOut(ctx));
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
    gain.connect(masterOut(ctx));
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

// Survived — a warm celebratory relief chime (the cylinder came up empty).
// A quick exhale "phew" of filtered noise, then a bright rising major arpeggio
// (G–B–D–G) on soft triangles: tavern-warm, uplifting, but lighter than the
// full game-win fanfare.
function playSpinSound(ctx) {
  resume(ctx);
  const now = ctx.currentTime;

  // Relief exhale — short noise swell through a sweeping low-pass.
  const bufLen = Math.ceil(ctx.sampleRate * 0.35);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(500, now);
  lp.frequency.exponentialRampToValueAtTime(1600, now + 0.3);
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.0001, now);
  nGain.gain.linearRampToValueAtTime(0.05, now + 0.08);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
  noise.connect(lp); lp.connect(nGain); nGain.connect(masterOut(ctx));
  noise.start(now);

  // Rising major arpeggio — warm bells of relief.
  const notes = [392.0, 493.88, 587.33, 783.99]; // G4 B4 D5 G5
  notes.forEach((freq, i) => {
    const t = now + 0.16 + i * 0.1;
    const osc = ctx.createOscillator();
    const harm = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    harm.type = 'sine';
    osc.frequency.value = freq;
    harm.frequency.value = freq * 2;
    const g = 0.14 - i * 0.012;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(g, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(gain); harm.connect(gain); gain.connect(masterOut(ctx));
    osc.start(t); harm.start(t);
    osc.stop(t + 0.55); harm.stop(t + 0.55);
  });
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
        gain.connect(masterOut(ctx));
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

// Elimination — a sombre, mournful end: a deep gut-punch boom layered under a
// hollow funeral-bell toll and a sighing minor-third fall (a "down" two-note
// motif). Tavern-dark and sad rather than just a thud.
function playEliminateSound(ctx) {
  resume(ctx);
  const now = ctx.currentTime;

  // Deep descending boom — the body of the hit.
  const boom = ctx.createOscillator();
  const boomGain = ctx.createGain();
  boom.type = 'sine';
  boom.frequency.setValueAtTime(120, now);
  boom.frequency.exponentialRampToValueAtTime(28, now + 0.5);
  boomGain.gain.setValueAtTime(0.3, now);
  boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  boom.connect(boomGain); boomGain.connect(masterOut(ctx));
  boom.start(now); boom.stop(now + 0.65);

  // Hollow funeral-bell toll — dull, slightly detuned partials.
  [146.83, 220.0, 311.13].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = 0.12 - i * 0.035;
    gain.gain.setValueAtTime(0.0001, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(g, now + 0.09);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
    osc.connect(gain); gain.connect(masterOut(ctx));
    osc.start(now + 0.04); osc.stop(now + 1.45);
  });

  // Sighing minor-third fall (E4 → C4) — the "sad" gesture.
  const fall = ctx.createOscillator();
  const fallGain = ctx.createGain();
  fall.type = 'triangle';
  fall.frequency.setValueAtTime(329.63, now + 0.5);
  fall.frequency.exponentialRampToValueAtTime(261.63, now + 1.1);
  fallGain.gain.setValueAtTime(0.0001, now + 0.5);
  fallGain.gain.exponentialRampToValueAtTime(0.1, now + 0.56);
  fallGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
  fall.connect(fallGain); fallGain.connect(masterOut(ctx));
  fall.start(now + 0.5); fall.stop(now + 1.55);
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
  gain.connect(masterOut(ctx));
  src.start(now);
}

// Heavy hammer clunk — cylinder locks into the final chamber (250 ms)
function playSpinClunk(ctx) {
  resume(ctx);
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(masterOut(ctx));
  osc.type = 'sine';
  osc.frequency.setValueAtTime(95, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
  gain.gain.setValueAtTime(0.48, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  osc.start(now);
  osc.stop(now + 0.28);
}

// ─── Procedural tavern ambience (background music bed) ──────────────────────────
// A self-contained, infinitely-generative bed — no asset files, matching the
// all-synth cue design above. Two warm detuned drones (root + fifth + octave)
// form an open, never-resolving pad that loops forever without an audible seam;
// a slow LFO makes it "breathe"; and an occasional soft lute pluck from a
// pentatonic scale gives it a tavern-minstrel feel. Everything routes through a
// single `musicGain` so cues can sidechain-duck it (LOUD cue → quiet music →
// restore). The whole graph lives on `window.__bluffMusic` so it is a true
// singleton across React remounts and there is only ever one bed playing.

const MUSIC_BASE_GAIN = 0.16;   // subtle bed level
const MUSIC_DUCK_GAIN = 0.045;  // ducked level while a cue plays
const MUSIC_FADE = 1.2;         // fade-in / fade-out seconds
// G-pentatonic across two octaves — warm, folk, always-consonant.
const PENTATONIC = [196.0, 220.0, 246.94, 293.66, 329.63, 392.0, 440.0];

function _musicMutedFromStorage() {
  try { return window.localStorage.getItem('bluff_music_muted') === '1'; }
  catch (_) { return false; }
}

// Shared mute store so every consumer (the landing settings gear AND the
// in-game menu) reflects the same on/off state via useSyncExternalStore —
// toggling in one place updates everywhere, no per-instance desync.
const _mutedListeners = new Set();
function _subscribeMuted(cb) { _mutedListeners.add(cb); return () => _mutedListeners.delete(cb); }
function _notifyMuted() { _mutedListeners.forEach((cb) => { try { cb(); } catch (_) {} }); }
function _getMutedSnapshot() {
  if (typeof window === 'undefined') return false;
  const m = window.__bluffMusic;
  return m ? !!m.muted : _musicMutedFromStorage();
}

// One soft plucked lute note into `dest` (the breathing pad bus).
function _pluck(ctx, dest, freq) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const harm = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  harm.type = 'sine';
  osc.frequency.value = freq;
  harm.frequency.value = freq * 2.001; // tiny detune = string shimmer
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
  osc.connect(gain); harm.connect(gain); gain.connect(dest);
  osc.start(now); harm.start(now);
  osc.stop(now + 1.2); harm.stop(now + 1.2);
}

function _scheduleNextPluck(m) {
  // 4–9s apart; occasionally a quick two-note answer.
  const delay = 4000 + Math.random() * 5000;
  m.pluckTimer = setTimeout(() => {
    if (!m || !m.started) return;
    const ctx = m.ctx;
    const root = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
    try { _pluck(ctx, m.padBus, root); } catch (_) {}
    if (Math.random() < 0.4) {
      const second = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
      setTimeout(() => { try { _pluck(ctx, m.padBus, second); } catch (_) {} }, 240);
    }
    _scheduleNextPluck(m);
  }, delay);
}

// Build (once) the ambience graph on the window singleton.
function _ensureMusicEngine() {
  if (typeof window === 'undefined') return null;
  if (window.__bluffMusic) return window.__bluffMusic;
  const ctx = getCtx();
  if (!ctx) return null;

  const musicGain = ctx.createGain();
  musicGain.gain.value = 0; // silent until startMusic fades it up

  // Warm master low-pass — keeps the bed mellow, like music heard through a
  // tavern door rather than a hi-fi.
  const warmth = ctx.createBiquadFilter();
  warmth.type = 'lowpass';
  warmth.frequency.value = 1500;
  warmth.Q.value = 0.5;
  warmth.connect(musicGain);
  musicGain.connect(masterOut(ctx));

  // Drone bus (steady) + pad bus (breathing) both feed the warmth filter.
  const droneBus = ctx.createGain();
  droneBus.gain.value = 0.6;
  droneBus.connect(warmth);

  const padBus = ctx.createGain();
  padBus.gain.value = 0.5;
  padBus.connect(warmth);

  // Breathing LFO on the pad bus only (so it never fights the duck automation
  // on musicGain). ~0.07 Hz, ±0.18 around the pad base.
  const breath = ctx.createOscillator();
  const breathDepth = ctx.createGain();
  breath.frequency.value = 0.07;
  breath.type = 'sine';
  breathDepth.gain.value = 0.18;
  breath.connect(breathDepth); breathDepth.connect(padBus.gain);
  breath.start();

  // Three drones: G2, D3, G3 — an open fifth + octave (no third = neutral mood).
  const droneFreqs = [98.0, 146.83, 196.0];
  const droneOscs = [];
  droneFreqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = i === 0 ? 'sine' : 'triangle';
    osc.frequency.value = freq;
    osc.detune.value = (i - 1) * 4; // gentle chorus spread
    g.gain.value = i === 0 ? 0.5 : 0.28 - i * 0.04;
    osc.connect(g); g.connect(droneBus);
    osc.start();
    droneOscs.push(osc);
  });

  const m = {
    ctx, musicGain, warmth, droneBus, padBus, breath, droneOscs,
    started: false, muted: _musicMutedFromStorage(), pluckTimer: null,
  };
  window.__bluffMusic = m;
  return m;
}

function _musicStart() {
  // Arm the mobile/iOS unlock so the first real gesture resumes + unlocks audio
  // for BOTH the bed and the game cues (they share one context).
  installAudioUnlock();
  const m = _ensureMusicEngine();
  if (!m) return;
  resume(m.ctx);
  const now = m.ctx.currentTime;
  const target = m.muted ? 0 : MUSIC_BASE_GAIN;
  m.musicGain.gain.cancelScheduledValues(now);
  m.musicGain.gain.setValueAtTime(m.musicGain.gain.value, now);
  m.musicGain.gain.linearRampToValueAtTime(target, now + MUSIC_FADE);
  if (!m.started) {
    m.started = true;
    _scheduleNextPluck(m);
  }
}

function _musicStop() {
  const m = typeof window !== 'undefined' ? window.__bluffMusic : null;
  if (!m) return;
  const now = m.ctx.currentTime;
  m.musicGain.gain.cancelScheduledValues(now);
  m.musicGain.gain.setValueAtTime(m.musicGain.gain.value, now);
  m.musicGain.gain.linearRampToValueAtTime(0, now + 0.4);
  clearTimeout(m.pluckTimer);
  m.pluckTimer = null;
  m.started = false;
}

function _musicSetMuted(muted) {
  const m = _ensureMusicEngine();
  try { window.localStorage.setItem('bluff_music_muted', muted ? '1' : '0'); } catch (_) {}
  if (m) {
    m.muted = muted;
    const now = m.ctx.currentTime;
    m.musicGain.gain.cancelScheduledValues(now);
    m.musicGain.gain.setValueAtTime(m.musicGain.gain.value, now);
    m.musicGain.gain.linearRampToValueAtTime(muted ? 0 : MUSIC_BASE_GAIN, now + 0.35);
  }
  _notifyMuted();
}

// Sidechain duck: pull the bed down while a cue sounds, then ease it back.
function _duckMusic(holdMs) {
  const m = typeof window !== 'undefined' ? window.__bluffMusic : null;
  if (!m || !m.started || m.muted) return;
  const g = m.musicGain.gain;
  const now = m.ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(MUSIC_DUCK_GAIN, now + 0.08);
  const release = now + Math.max(0.1, holdMs / 1000);
  g.setValueAtTime(MUSIC_DUCK_GAIN, release);
  g.linearRampToValueAtTime(MUSIC_BASE_GAIN, release + 0.5);
}

// How long to hold the duck per cue kind (ms), matched to each cue's tail.
const DUCK_MS = { bluff: 700, card: 200, win: 1700, spin: 1600, eliminate: 1500 };

// ─── useMusic ───────────────────────────────────────────────────────────────────
// Standalone control surface for the background tavern bed, decoupled from the
// per-screen atmosphere hook. Used at the app root (start on first gesture) and
// by any settings UI (mute toggle). Mute state is shared via the module store
// so the landing gear and the in-game menu never drift apart.
//   startMusic() — idempotent; fades the bed in once the AudioContext runs.
//   toggleMusic() — flip mute (persisted); unmuting (re)starts the bed.
//   musicEnabled — boolean, reactive.
export function useMusic() {
  const muted = useSyncExternalStore(_subscribeMuted, _getMutedSnapshot, () => false);
  const startMusic = useCallback(() => { try { _musicStart(); } catch (_) {} }, []);
  const toggleMusic = useCallback(() => {
    const willMute = !_getMutedSnapshot();
    try {
      _musicSetMuted(willMute);
      if (!willMute) _musicStart();
    } catch (_) {}
  }, []);
  return { musicEnabled: !muted, startMusic, toggleMusic };
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
      // Duck the ambience bed under the cue, then let it swell back.
      try { _duckMusic(DUCK_MS[kind] ?? 400); } catch (_) {}
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

    // Duck the ambience for the whole spin (clicks decelerate over durationMs);
    // the result cue's own duck takes over right after the cylinder locks.
    try { _duckMusic(durationMs + 300); } catch (_) {}

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
