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

// Gunshot — (Module 8.2) a high-impact crack + low boom, fired when a spin lands
// on a live round (lethal bullet hit). Sharp filtered-noise crack over a fast
// descending boom body, then a short tail.
function playGunshot(ctx) {
  resume(ctx);
  const now = ctx.currentTime;
  const out = masterOut(ctx);

  // tanh saturator — the nonlinear grit that makes this read as a real shot
  // rather than the soft "blank" a clean sine gives. One per noise layer.
  const mkShaper = () => {
    const sh = ctx.createWaveShaper();
    const c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = Math.tanh(x * 3.4); }
    sh.curve = c; sh.oversample = '4x';
    return sh;
  };

  // 1) CRACK — the muzzle snap. Full-spectrum white noise, instant attack, very
  //    fast decay, through a wide bandpass + saturation. This sharp transient is
  //    what the ear actually hears as "gunshot".
  const crackLen = Math.ceil(ctx.sampleRate * 0.05);
  const cbuf = ctx.createBuffer(1, crackLen, ctx.sampleRate);
  const cd = cbuf.getChannelData(0);
  for (let i = 0; i < crackLen; i++) cd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / crackLen, 1.3);
  const crack = ctx.createBufferSource(); crack.buffer = cbuf;
  const cbp = ctx.createBiquadFilter(); cbp.type = 'bandpass'; cbp.frequency.value = 2400; cbp.Q.value = 0.5;
  const csh = mkShaper();
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(1.0, now);
  cg.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  crack.connect(cbp); cbp.connect(csh); csh.connect(cg); cg.connect(out);
  crack.start(now);

  // 2) BODY — the explosive punch. A burst of low-passed noise (an explosion is
  //    noise, not a tone) sweeping down, saturated, decaying fast.
  const bodyLen = Math.ceil(ctx.sampleRate * 0.24);
  const bbuf = ctx.createBuffer(1, bodyLen, ctx.sampleRate);
  const bd = bbuf.getChannelData(0);
  for (let i = 0; i < bodyLen; i++) bd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bodyLen, 2);
  const body = ctx.createBufferSource(); body.buffer = bbuf;
  const blp = ctx.createBiquadFilter(); blp.type = 'lowpass';
  blp.frequency.setValueAtTime(1900, now);
  blp.frequency.exponentialRampToValueAtTime(170, now + 0.22);
  const bsh = mkShaper();
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.95, now);
  bg.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
  body.connect(blp); blp.connect(bsh); bsh.connect(bg); bg.connect(out);
  body.start(now);

  // 3) SUB — the chest-thump low end under the body.
  const sub = ctx.createOscillator();
  const sg = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(140, now);
  sub.frequency.exponentialRampToValueAtTime(33, now + 0.18);
  sg.gain.setValueAtTime(0.9, now);
  sg.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  sub.connect(sg); sg.connect(out);
  sub.start(now); sub.stop(now + 0.34);

  // 4) TAIL — a short low-passed noise decay so the shot rings out into the room
  //    instead of cutting off abruptly.
  const tailLen = Math.ceil(ctx.sampleRate * 0.4);
  const tbuf = ctx.createBuffer(1, tailLen, ctx.sampleRate);
  const tdat = tbuf.getChannelData(0);
  for (let i = 0; i < tailLen; i++) tdat[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / tailLen, 3);
  const tail = ctx.createBufferSource(); tail.buffer = tbuf;
  const tlp = ctx.createBiquadFilter(); tlp.type = 'lowpass'; tlp.frequency.value = 1000;
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.2, now + 0.02);
  tg.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
  tail.connect(tlp); tlp.connect(tg); tg.connect(out);
  tail.start(now);
}

const AUDIO_MAP = {
  card: playCardSound,
  bluff: playBluffSound,
  spin: playSpinSound,
  win: playWinSound,
  eliminate: playEliminateSound,
  gunshot: playGunshot,
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
  '/audio/In-game(song).mp3':                  { vol: SONG_VOL },
  '/audio/Gutter-Candle Dread 2.mp3':          { vol: SONG_VOL },
  '/audio/shoegaze style.mp3':                 { vol: INSTRUMENTAL_VOL },
  '/audio/Bluff Anthem (instrumental)-v2.mp3': { vol: INSTRUMENTAL_VOL },
};
// (Module 5.3) Player-controlled master music volume (0..1) scales every track's
// base level. Persisted; a shared store keeps the settings slider in sync.
function _musicVolumeFromStorage() {
  try {
    const v = parseFloat(window.localStorage.getItem('bluff_music_volume'));
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
  } catch (_) { return 1; }
}
let _musicVolume = (typeof window !== 'undefined') ? _musicVolumeFromStorage() : 1;
const _volListeners = new Set();
function _subscribeVol(cb) { _volListeners.add(cb); return () => _volListeners.delete(cb); }
function _getVolSnapshot() { return _musicVolume; }

function _trackVol(src) {
  // The volume slider maps DIRECTLY to the track's own playback volume, so 100%
  // means full song volume (1.0) — not 100% of the old ~8% ambient cap. `src` is
  // kept for call-site compatibility.
  void src;
  return Math.max(0, Math.min(1, _musicVolume));
}

function _setMusicVolume(v) {
  _musicVolume = Math.max(0, Math.min(1, Number(v) || 0));
  try { window.localStorage.setItem('bluff_music_volume', String(_musicVolume)); } catch (_) {}
  // Live-apply to the audible deck (skip while muted; unmute will pick it up).
  const eng = (typeof window !== 'undefined') ? window.__bluffMusic : null;
  if (eng && !eng.muted && eng.currentSrc) {
    const deck = eng.decks[eng.active];
    if (deck && !deck.paused) { try { deck.volume = _trackVol(eng.currentSrc); } catch (_) {} }
  }
  _volListeners.forEach((cb) => { try { cb(); } catch (_) {} });
}

const MUSIC_SECTIONS = {
  // Lobby shuffles all three (the new instrumental v2 included).
  lobby:    ['/audio/BLUFF Tavern.mp3', '/audio/Click_Clack_Spin.mp3', '/audio/Bluff Anthem (instrumental)-v2.mp3'],
  // ACTIVE GAME holds the largest pool — every track that isn't a lobby / groups
  // / gameover cue lives here, so nothing is left unassigned. The progression now
  // SCALES to this list's length (gameMusicStage), stepping up one track per
  // elimination so each is reached as the field thins: stage 0 at the full table
  // → the peak (last) track for the final two. Ordered so the new in-game song
  // leads (stage 0, the longest phase) and the new dread variant closes the
  // deadly finale (peak, always reached):
  //   0 In-game(song) · 1 Nordic Hums · 2 shoegaze style ·
  //   3 Bluff Anthem (instrumental) · 4 Call It Bluff · 5 Gutter-Candle Dread 2
  game:     [
    '/audio/In-game(song).mp3',
    '/audio/Nordic Hums.mp3',
    '/audio/shoegaze style.mp3',
    '/audio/Bluff Anthem (instrumental).mp3',
    '/audio/Call It Bluff.mp3',
    '/audio/Gutter-Candle Dread 2.mp3',
  ],
  groups:   ['/audio/Bluff Anthem.mp3'],
  gameover: ['/audio/Gutter-Candle Dread.mp3'],
};
const SECTION_MODE = {
  lobby: 'shuffle',
  game: 'progressive',
  groups: 'loop',
  gameover: 'once',
};

const SECTION_FADE_MS = 900;      // fade used when the playlist first starts
const TRACK_CROSSFADE_MS = 2500;  // crossfade between consecutive / skipped tracks
const MUSIC_DUCK_VOL = 0.04;      // ducked level while a one-shot cue plays

// ── One continuous, app-wide playlist ────────────────────────────────────────
// The music is now a SINGLE uninterrupted stream: moving between sections never
// stops or restarts it. We derive the order from the section pools (deduped) so
// every assigned track still plays and nothing is orphaned — the section grouping
// just defines the running order. Tracks advance automatically when one ends, and
// the player can step through them with the prev/next controls in settings.
const PLAYLIST = Array.from(new Set([
  ...MUSIC_SECTIONS.lobby,
  ...MUSIC_SECTIONS.game,
  ...MUSIC_SECTIONS.groups,
  ...MUSIC_SECTIONS.gameover,
]));

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
    positions: {},      // (Module 8.1) src → last playhead (s), for smooth resume
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

// (Module 8.1) Seek a deck to `time`, deferring until metadata is ready so the
// seek isn't dropped on a freshly-assigned src. A 0/empty time is a no-op (the
// deck already starts at 0).
function _seekDeck(deck, time) {
  if (!time || time <= 0) return;
  const apply = () => { try { deck.currentTime = time; } catch (_) {} };
  if (deck.readyState >= 1) apply();
  else {
    const h = () => { deck.removeEventListener('loadedmetadata', h); apply(); };
    deck.addEventListener('loadedmetadata', h);
  }
}

// Crossfade the foreground deck out while bringing `src` up on the other deck.
// Used for section switches, lobby track-ends, and game stage escalations.
function _crossfadeTo(eng, src, ms, loop) {
  const curIdx = eng.active;
  const nxtIdx = 1 - eng.active;
  const cur = eng.decks[curIdx];
  const nxt = eng.decks[nxtIdx];
  // (Module 8.1) Persist the outgoing track's playhead so re-entering its view
  // resumes mid-track instead of restarting at 0:00. A track that ended (shuffle)
  // is stored at 0 so it doesn't immediately re-end on resume.
  if (eng.currentSrc) {
    try { eng.positions[eng.currentSrc] = cur.ended ? 0 : (cur.currentTime || 0); } catch (_) {}
  }
  try {
    nxt.src = encodeURI(src);
    nxt.loop = !!loop;
    nxt.currentTime = 0;
    nxt.volume = 0;
  } catch (_) { return; }
  _seekDeck(nxt, eng.positions[src] || 0);
  const target = eng.muted ? 0 : _trackVol(src);
  const p = nxt.play(); if (p && p.catch) p.catch(() => {}); // must run in a gesture on mobile
  _fadeDeck(eng, nxtIdx, target, ms, 'in');
  _fadeDeck(eng, curIdx, 0, ms, 'out', () => { try { cur.pause(); } catch (_) {} });
  eng.active = nxtIdx;
  eng.currentSrc = src;
}

// Continuous playlist: when the foreground track ends, crossfade straight into
// the next one (wrapping at the end) so the stream never stops.
function _onDeckEnded(eng, deckIdx) {
  if (eng.muted || deckIdx !== eng.active) return;
  if (!eng.queue || !eng.queue.length) eng.queue = PLAYLIST;
  eng.idx = (eng.idx + 1) % eng.queue.length;
  _crossfadeTo(eng, eng.queue[eng.idx], TRACK_CROSSFADE_MS, false);
}

// Section switch. Playback is ONE continuous playlist, so this never changes the
// track or restarts the music when navigating — it only kicks the stream off the
// first time (and nudges a paused deck back to life, e.g. after a tab return).
function _setSection(name) {
  installAudioUnlock();
  const eng = _engine();
  if (!eng) return;
  eng.section = name;            // retained for reference only
  eng.queue = PLAYLIST;
  // Already playing or queued (while muted)? Leave it running — continuity.
  if (eng.currentSrc || eng.pendingSrc) {
    if (!eng.muted) {
      const d = eng.decks[eng.active];
      if (d && d.paused && eng.currentSrc) {
        const p = d.play(); if (p && p.catch) p.catch(() => {});
        _fadeDeck(eng, eng.active, _trackVol(eng.currentSrc), 400, 'in');
      }
    }
    return;
  }
  // First start — open the playlist on a random track for session variety.
  eng.idx = Math.floor(Math.random() * eng.queue.length);
  const src = eng.queue[eng.idx];
  if (eng.muted) { eng.currentSrc = src; eng.pendingSrc = src; return; }
  _crossfadeTo(eng, src, SECTION_FADE_MS, false);
}

// Progressive in-game escalation is retired in favour of the single continuous
// playlist (escalating would restart tracks). Kept as a no-op so existing callers
// (page.js still feeds it gameMusicStage) need no change.
function _setGameStage() { /* no-op — continuous playlist mode */ }

// Step to the next (dir=1) or previous (dir=-1) track in the playlist.
function _musicSkip(dir) {
  installAudioUnlock();
  const eng = _engine();
  if (!eng) return;
  if (!eng.queue || !eng.queue.length) eng.queue = PLAYLIST;
  const len = eng.queue.length;
  if (!len) return;
  eng.idx = ((eng.idx + dir) % len + len) % len;
  const src = eng.queue[eng.idx];
  // A manual skip starts the chosen track fresh, not from a retained playhead.
  try { delete eng.positions[src]; } catch (_) {}
  if (eng.muted) { eng.currentSrc = src; eng.pendingSrc = src; return; }
  _crossfadeTo(eng, src, 600, false);
}
function _musicNext() { _musicSkip(1); }
function _musicPrev() { _musicSkip(-1); }

// Start / resume the continuous playlist (first user gesture / unmute).
function _musicResume() {
  const eng = (typeof window !== 'undefined') ? window.__bluffMusic : null;
  if (!eng || eng.muted) return;
  if (!eng.queue || !eng.queue.length) eng.queue = PLAYLIST;
  let src = eng.pendingSrc || eng.currentSrc;
  if (!src) {
    // Nothing started yet (gesture arrived before any section switch).
    eng.idx = Math.floor(Math.random() * eng.queue.length);
    src = eng.queue[eng.idx];
  }
  const idx = eng.active;
  const deck = eng.decks[idx];
  if (deck.paused || eng.pendingSrc || !deck.src) {
    try {
      deck.src = encodeURI(src);
      deck.loop = false;
      deck.currentTime = 0;
      deck.volume = 0;
    } catch (_) {}
    // (Module 8.1) resume from the retained playhead rather than 0:00.
    _seekDeck(deck, eng.positions[src] || 0);
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
      // (Module 8.1) snapshot the playhead so unmuting resumes in place.
      if (eng.currentSrc) {
        try { eng.positions[eng.currentSrc] = eng.decks[eng.active].currentTime || 0; } catch (_) {}
      }
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
const DUCK_MS = { bluff: 700, card: 200, win: 1700, spin: 1600, eliminate: 1500, gunshot: 600 };

// ─── Game-state → progressive music stage ────────────────────────────────────
// Derive the game music intensity from live room state. The stage SCALES to the
// active-game playlist length so every track in it is reached as the field thins:
// stage 0 at the full table, stepping up monotonically with each elimination, to
// the peak (last) track for the final two. Exported pure so it can be unit-tested
// without audio; `stageCount` defaults to the live game playlist length so the
// app calls it with just the room state.
export function gameMusicStage(roomState, stageCount = (MUSIC_SECTIONS.game ? MUSIC_SECTIONS.game.length : 1)) {
  if (!roomState || !Array.isArray(roomState.players)) return 0;
  const phase = roomState.phase;
  if (phase === 'lobby' || phase === 'pre_game' || !phase) return 0;
  const maxStage = Math.max(0, stageCount - 1);
  if (maxStage === 0) return 0;
  const total = roomState.players.length || 1;
  const alive = roomState.players.filter((p) => p && p.status === 'alive').length;
  if (alive <= 2) return maxStage;                 // final two — the peak track
  // Fraction of the way from a full field to the final two, mapped across the
  // available stages. Monotonic; _setGameStage never steps back down.
  const denom = Math.max(1, total - 2);            // eliminations from full field → final two
  const elim = Math.max(0, total - alive);
  const frac = Math.min(1, elim / denom);
  return Math.min(maxStage, Math.round(frac * maxStage));
}

// ─── useMusic ───────────────────────────────────────────────────────────────────
// Standalone control surface for the background bed, decoupled from the
// per-screen atmosphere hook. Used at the app root (start on first gesture) and
// by any settings UI (mute toggle). Mute state is shared via the module store
// so the landing gear and the in-game menu never drift apart.
//   setSection(name)   — note the active view context; the music is ONE
//                        continuous playlist, so this never restarts it.
//   setGameStage(n)    — retained no-op (continuous playlist mode).
//   nextTrack()/prevTrack() — step through the playlist (settings skip buttons).
//   startMusic()       — arm the mobile unlock + start/resume the playlist.
//   toggleMusic()      — flip mute (persisted); unmuting resumes playback.
//   musicEnabled       — boolean, reactive.
export function useMusic() {
  const muted = useSyncExternalStore(_subscribeMuted, _getMutedSnapshot, () => false);
  // (Module 5.3) reactive master music volume (0..1), shared across consumers.
  const volume = useSyncExternalStore(_subscribeVol, _getVolSnapshot, () => 1);
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
  const setMusicVolume = useCallback((v) => { try { _setMusicVolume(v); } catch (_) {} }, []);
  const nextTrack = useCallback(() => { try { _musicNext(); } catch (_) {} }, []);
  const prevTrack = useCallback(() => { try { _musicPrev(); } catch (_) {} }, []);
  return { musicEnabled: !muted, musicVolume: volume, setSection, setGameStage, startMusic, toggleMusic, setMusicVolume, nextTrack, prevTrack };
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
