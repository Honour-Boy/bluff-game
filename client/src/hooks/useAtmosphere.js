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
    // Resume the current section's track within the gesture (mobile autoplay).
    try { _musicResume(); } catch (_) {}
    const ctx = getCtx();
    if (ctx && ctx.state === 'running') {
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

// ─── Background music — multi-track playlists w/ crossfade (per view context) ───
// Each app SECTION owns a PLAYLIST and a playback MODE. Two HTMLAudio "decks"
// let us crossfade between tracks (a single element can't overlap itself). The
// one-shot cues stay on the Web Audio path above; this only governs the bed.
//
//   lobby      SHUFFLE     — start on a RANDOM track, loop; when a track ends,
//                            crossfade to the alternative in the pool.
//   game       PROGRESSIVE — stage 0 = Nordic Hums (quiet tension); as stakes
//                            rise, 3 s crossfade up to the Bluff Anthem
//                            (instrumental), then Call It Bluff, to drive
//                            momentum. Stage is fed from live game state
//                            (player attrition) by page.js via setGameStage().
//   groups     LOOP        — the vocal Bluff Anthem on a clean continuous loop.
//   gameover   ONCE        — Gutter-Candle Dread, gently faded in over 2 s.
//
// Volume (per the brief): songs play at 8% of max, instrumentals at 12% (the
// instrumentals sit a touch louder so the ambience still reads under the cues).
// All files are PRE-FETCHED on boot so crossfades never stream-stall. Drop files
// in client/public/audio/; a missing file just leaves that slot silent.

const SONG_VOL = 0.08;          // vocal tracks → 8% of max
const INSTRUMENTAL_VOL = 0.12;  // instrumental / ambient beds → 12% of max

// src → { vol }. Classification: the "(instrumental)" anthem and the ambient
// beds are instrumentals; the two vocal anthems (Bluff Anthem / Call It Bluff)
// are songs.
const TRACKS = {
  '/audio/BLUFF Tavern.mp3':                { vol: INSTRUMENTAL_VOL },
  '/audio/Click_Clack_Spin.mp3':            { vol: INSTRUMENTAL_VOL },
  '/audio/Nordic Hums.mp3':                 { vol: INSTRUMENTAL_VOL },
  '/audio/Bluff Anthem (instrumental).mp3': { vol: INSTRUMENTAL_VOL },
  '/audio/Gutter-Candle Dread.mp3':         { vol: INSTRUMENTAL_VOL },
  '/audio/Call It Bluff.mp3':               { vol: SONG_VOL },
  '/audio/Bluff Anthem.mp3':                { vol: SONG_VOL },
};
function _trackVol(src) {
  return (TRACKS[src] && typeof TRACKS[src].vol === 'number') ? TRACKS[src].vol : SONG_VOL;
}

const MUSIC_SECTIONS = {
  lobby:    ['/audio/BLUFF Tavern.mp3', '/audio/Click_Clack_Spin.mp3'],
  game:     ['/audio/Nordic Hums.mp3', '/audio/Bluff Anthem (instrumental).mp3', '/audio/Call It Bluff.mp3'],
  groups:   ['/audio/Bluff Anthem.mp3'],
  gameover: ['/audio/Gutter-Candle Dread.mp3'],
};
const SECTION_MODE = {
  lobby: 'shuffle',
  game: 'progressive',
  groups: 'loop',
  gameover: 'once',
};

const SECTION_FADE_MS = 900;      // crossfade when switching view contexts
const CROSSFADE_MS = 3000;        // game progressive stage crossfade (3 s)
const LOBBY_CROSSFADE_MS = 2500;  // lobby track-end → alternative
const GAMEOVER_FADEIN_MS = 2000;  // gameover gentle fade-in
const MUSIC_DUCK_VOL = 0.04;      // ducked level while a one-shot cue plays

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
  const e = window.__bluffMusic;
  return e ? !!e.muted : _musicMutedFromStorage();
}

// Proactively pre-fetch every track on boot so crossfades never stream-stall.
// Detached <audio preload="auto"> elements pull each file into the HTTP cache;
// the playback decks then load instantly. Runs once.
function _prefetchAll() {
  if (typeof window === 'undefined' || typeof Audio === 'undefined' || window.__bluffPrefetch) return;
  window.__bluffPrefetch = [];
  Object.keys(TRACKS).forEach((src) => {
    try {
      const a = new Audio();
      a.preload = 'auto';
      a.src = encodeURI(src);
      a.load();
      window.__bluffPrefetch.push(a);
    } catch (_) { /* best effort */ }
  });
}

// The crossfade engine: two HTMLAudio decks + bookkeeping, on a window singleton.
function _engine() {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (window.__bluffMusic) return window.__bluffMusic;
  const mk = () => { const a = new Audio(); a.preload = 'auto'; a.volume = 0; return a; };
  const eng = {
    decks: [mk(), mk()],
    rafs: [0, 0],
    active: 0,          // index of the foreground (audible) deck
    section: null,
    mode: null,
    queue: [],
    idx: 0,             // current track index within the section's playlist
    stage: 0,           // game progressive stage (0 calm → up)
    currentSrc: null,
    pendingSrc: null,   // deferred start while muted
    muted: _musicMutedFromStorage(),
    duckTimer: null,
  };
  // SHUFFLE sections crossfade to the alternative when a track ends; LOOP/ONCE/
  // PROGRESSIVE tracks set loop=true so 'ended' never fires.
  eng.decks.forEach((deck, i) => {
    deck.addEventListener('ended', () => _onDeckEnded(eng, i));
  });
  window.__bluffMusic = eng;
  _prefetchAll();
  return eng;
}

// Tween one deck's volume to `to` over `ms`. `curve` shapes the ramp: 'in'
// (ease-in) for the rising side and 'out' (ease-out) for the falling side
// approximate a perceptual / logarithmic crossfade when paired.
function _fadeDeck(eng, deckIdx, to, ms, curve = 'linear', onDone) {
  const deck = eng.decks[deckIdx];
  if (!deck) return;
  if (eng.rafs[deckIdx]) cancelAnimationFrame(eng.rafs[deckIdx]);
  const from = deck.volume;
  const startT = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const ease = (k) => (curve === 'in' ? k * k : curve === 'out' ? 1 - (1 - k) * (1 - k) : k);
  const step = (now) => {
    const k = ms <= 0 ? 1 : Math.min(1, (now - startT) / ms);
    try { deck.volume = Math.max(0, Math.min(1, from + (to - from) * ease(k))); } catch (_) {}
    if (k < 1) { eng.rafs[deckIdx] = requestAnimationFrame(step); }
    else { eng.rafs[deckIdx] = 0; if (onDone) { try { onDone(); } catch (_) {} } }
  };
  eng.rafs[deckIdx] = requestAnimationFrame(step);
}

// Crossfade the foreground deck out while bringing `src` up on the other deck.
// Used for section switches, lobby track-ends, and game stage escalations.
function _crossfadeTo(eng, src, ms, loop) {
  const curIdx = eng.active;
  const nxtIdx = 1 - eng.active;
  const cur = eng.decks[curIdx];
  const nxt = eng.decks[nxtIdx];
  try {
    nxt.src = encodeURI(src);
    nxt.loop = !!loop;
    nxt.currentTime = 0;
    nxt.volume = 0;
  } catch (_) { return; }
  const target = eng.muted ? 0 : _trackVol(src);
  const p = nxt.play(); if (p && p.catch) p.catch(() => {}); // must run in a gesture on mobile
  _fadeDeck(eng, nxtIdx, target, ms, 'in');
  _fadeDeck(eng, curIdx, 0, ms, 'out', () => { try { cur.pause(); } catch (_) {} });
  eng.active = nxtIdx;
  eng.currentSrc = src;
}

// Lobby SHUFFLE: when the foreground deck's (non-looping) track ends, crossfade
// to a different track in the pool.
function _onDeckEnded(eng, deckIdx) {
  if (eng.muted || deckIdx !== eng.active || eng.mode !== 'shuffle') return;
  if (!eng.queue.length) return;
  let next = eng.idx;
  if (eng.queue.length > 1) {
    do { next = Math.floor(Math.random() * eng.queue.length); } while (next === eng.idx);
  }
  eng.idx = next;
  _crossfadeTo(eng, eng.queue[next], LOBBY_CROSSFADE_MS, false);
}

// Switch the active view context. Picks the starting track per the section's
// MODE and crossfades to it. No-op (but ensures playback) if unchanged.
function _setSection(name) {
  installAudioUnlock();
  const eng = _engine();
  if (!eng) return;
  if (eng.section === name) {
    if (!eng.muted && eng.currentSrc) {
      const d = eng.decks[eng.active];
      if (d.paused) {
        const p = d.play(); if (p && p.catch) p.catch(() => {});
        _fadeDeck(eng, eng.active, _trackVol(eng.currentSrc), 400, 'in');
      }
    }
    return;
  }
  eng.section = name;
  eng.mode = SECTION_MODE[name] || 'loop';
  eng.queue = MUSIC_SECTIONS[name] || [];
  eng.stage = 0;
  if (!eng.queue.length) {
    _fadeDeck(eng, eng.active, 0, SECTION_FADE_MS, 'out', () => { try { eng.decks[eng.active].pause(); } catch (_) {} });
    eng.currentSrc = null;
    return;
  }
  // Pick the opening track: random for shuffle, top for everything else.
  if (eng.mode === 'shuffle') eng.idx = Math.floor(Math.random() * eng.queue.length);
  else eng.idx = 0;
  const src = eng.queue[eng.idx];
  // Shuffle tracks must NOT loop (so 'ended' fires → crossfade to the other);
  // every other mode loops its current track.
  const loop = eng.mode !== 'shuffle';
  const fadeMs = eng.mode === 'once' ? GAMEOVER_FADEIN_MS : SECTION_FADE_MS;
  if (eng.muted) { eng.currentSrc = src; eng.pendingSrc = src; return; }
  _crossfadeTo(eng, src, fadeMs, loop);
}

// Game PROGRESSIVE: escalate to a higher-intensity track. Monotonic within a
// game (never steps back down); a fresh game resets stage via _setSection.
function _setGameStage(stage) {
  const eng = (typeof window !== 'undefined') ? window.__bluffMusic : null;
  if (!eng || eng.section !== 'game' || eng.mode !== 'progressive' || !eng.queue.length) return;
  const clamped = Math.max(0, Math.min(stage | 0, eng.queue.length - 1));
  if (clamped <= eng.stage) return;
  eng.stage = clamped;
  eng.idx = clamped;
  const src = eng.queue[clamped];
  if (eng.muted) { eng.currentSrc = src; eng.pendingSrc = src; return; }
  _crossfadeTo(eng, src, CROSSFADE_MS, true); // 3 s logarithmic-feel crossfade, looped
}

// Resume the current section (first user gesture / unmute).
function _musicResume() {
  const eng = (typeof window !== 'undefined') ? window.__bluffMusic : null;
  if (!eng || eng.muted || !eng.queue.length) return;
  const src = eng.pendingSrc || eng.currentSrc;
  if (!src) return;
  const idx = eng.active;
  const deck = eng.decks[idx];
  if (deck.paused || eng.pendingSrc) {
    const loop = eng.mode !== 'shuffle';
    try {
      deck.src = encodeURI(src);
      deck.loop = loop;
      if (eng.pendingSrc) deck.currentTime = 0;
      deck.volume = 0;
    } catch (_) {}
    const p = deck.play(); if (p && p.catch) p.catch(() => {});
    _fadeDeck(eng, idx, _trackVol(src), 600, 'in');
    eng.currentSrc = src;
    eng.pendingSrc = null;
  } else {
    _fadeDeck(eng, idx, _trackVol(src), 400, 'in');
  }
}

function _musicSetMuted(muted) {
  const eng = _engine();
  try { window.localStorage.setItem('bluff_music_muted', muted ? '1' : '0'); } catch (_) {}
  if (eng) {
    eng.muted = muted;
    if (muted) {
      [0, 1].forEach((i) => _fadeDeck(eng, i, 0, 250, 'out', () => { try { eng.decks[i].pause(); } catch (_) {} }));
    } else {
      _musicResume();
    }
  }
  _notifyMuted();
}

// Sidechain duck: dip the foreground deck under a cue, then ease it back up.
function _duckMusic(holdMs) {
  const eng = (typeof window !== 'undefined') ? window.__bluffMusic : null;
  if (!eng || eng.muted || !eng.currentSrc) return;
  const deck = eng.decks[eng.active];
  if (deck.paused) return;
  clearTimeout(eng.duckTimer);
  const base = _trackVol(eng.currentSrc);
  _fadeDeck(eng, eng.active, Math.min(MUSIC_DUCK_VOL, base), 90, 'out');
  eng.duckTimer = setTimeout(() => {
    if (!eng.muted) _fadeDeck(eng, eng.active, _trackVol(eng.currentSrc), 450, 'in');
  }, Math.max(100, holdMs));
}

// How long to hold the duck per cue kind (ms), matched to each cue's tail.
const DUCK_MS = { bluff: 700, card: 200, win: 1700, spin: 1600, eliminate: 1500 };

// ─── Game-state → progressive music stage ────────────────────────────────────
// Derive the game music intensity from live room state. Escalation tracks player
// attrition (a proxy for "move-count escalation / high stakes"): early game is
// calm, the field thinning pushes momentum up, and the final two players hit the
// peak. Exported pure so it can be unit-tested without audio.
//   0 = calm (Nordic Hums) · 1 = building (Bluff Anthem instrumental) · 2 = peak (Call It Bluff)
export function gameMusicStage(roomState) {
  if (!roomState || !Array.isArray(roomState.players)) return 0;
  const phase = roomState.phase;
  if (phase === 'lobby' || phase === 'pre_game' || !phase) return 0;
  const total = roomState.players.length || 1;
  const alive = roomState.players.filter((p) => p && p.status === 'alive').length;
  if (alive <= 2) return 2;                       // last two standing — peak stakes
  if (alive <= Math.ceil(total * 0.6)) return 1;  // the field is thinning — build
  return 0;                                       // early game — quiet tension
}

// ─── useMusic ───────────────────────────────────────────────────────────────────
// Standalone control surface for the background bed, decoupled from the
// per-screen atmosphere hook. Used at the app root (start on first gesture) and
// by any settings UI (mute toggle). Mute state is shared via the module store
// so the landing gear and the in-game menu never drift apart.
//   setSection(name)   — switch the active view context ('lobby'|'game'|
//                        'groups'|'gameover'); the app root drives this.
//   setGameStage(n)    — escalate the in-game progressive playlist (0..2).
//   startMusic()       — arm the mobile unlock + resume the current section.
//   toggleMusic()      — flip mute (persisted); unmuting resumes the section.
//   musicEnabled       — boolean, reactive.
export function useMusic() {
  const muted = useSyncExternalStore(_subscribeMuted, _getMutedSnapshot, () => false);
  // Pre-fetch + build the engine on boot so the playlists are warm before the
  // first section switch.
  useEffect(() => { try { _engine(); } catch (_) {} }, []);
  const setSection = useCallback((name) => { try { _setSection(name); } catch (_) {} }, []);
  const setGameStage = useCallback((stage) => { try { _setGameStage(stage); } catch (_) {} }, []);
  const startMusic = useCallback(() => {
    try { installAudioUnlock(); _engine(); _musicResume(); } catch (_) {}
  }, []);
  const toggleMusic = useCallback(() => {
    const willMute = !_getMutedSnapshot();
    try { _musicSetMuted(willMute); } catch (_) {}
  }, []);
  return { musicEnabled: !muted, setSection, setGameStage, startMusic, toggleMusic };
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
