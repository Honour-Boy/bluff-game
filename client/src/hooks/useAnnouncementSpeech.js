// ============================================================
// useAnnouncementSpeech HOOK — Browser-native TTS for v2 power
// card / role / system announcements.
// ============================================================
//
// Watches the head of the announcement queue (typically
// `powerEventQueue[0]`) and speaks a short dramatic phrase via
// `window.speechSynthesis.speak()` whenever a new event arrives.
//
// Usage (in OnlinePlayerUI / HostUI):
//
//   const head = powerEventQueue?.[0] || null;
//   useAnnouncementSpeech(head, { enabled, voicePreference });
//
// Notes
// - Browser-native. Free, no API cost. Voice availability differs
//   per OS/browser. Safari / iOS has notable quirks: utterances must
//   typically be initiated from a user gesture the first time, and
//   `getVoices()` returns an empty list until the
//   `voiceschanged` event fires.
// - When `enabled === false`, the hook no-ops and immediately
//   cancels any in-flight utterance.
// - Cancels in-flight utterance before queueing a new one so
//   back-to-back events don't pile up.
// ============================================================

'use client';

import { useEffect, useRef } from 'react';

// ─── Phrase builder ────────────────────────────────────────────
// Match the spec's "dramatic announcement" tone — short, punchy.
// If a kind isn't listed, returns null and the caller can fall
// back to the banner's title text.
//
// Empty strings (saboteur, betting_open) are intentional: those
// events are silent per spec but still flow through the queue.
function buildPhrase(evt) {
  if (!evt || !evt.kind) return null;
  switch (evt.kind) {
    case 'shield_blocked':
      return `${evt.holderName || 'A player'}'s Shield blocks the bluff!`;
    case 'mirror_reflected':
      return `Mirror! Bluff reflected back to ${evt.redirectedToName || 'the caller'}`;
    case 'swap_resolved':
      return `${evt.holderName || 'A player'} swapped the card!`;
    case 'assassin_strike':
      return `Assassin strikes! ${evt.eliminatedName || 'A player'} eliminated`;
    case 'freeze_skip':
      return `Freeze! ${evt.skippedName || 'A player'}'s turn is skipped`;
    case 'sheriff_protected':
      return 'Sheriff intervenes — Assassin nullified';
    case 'sheriff_relief':
      return 'Sheriff caught the bluff — risk reduced';
    case 'gambler_caught':
      return 'Gambler caught — risk jumps to four';
    case 'medic_save':
      return `Medic intervenes — ${evt.savedName || evt.revivedPlayerName || 'a player'} survives`;
    case 'sniper_redirect':
      return `Sniper redirects — ${evt.newTargetName || evt.toName || 'a new target'} is the new target`;
    case 'saboteur_planted':
      return ''; // silent per spec
    case 'bounty_placed':
      return `Bounty on ${evt.holderName || 'a player'}`;
    case 'bounty_collected':
      return `Bounty collected — ${evt.collectorName || 'a player'} reduces risk`;
    case 'sudden_death':
      return 'Sudden Death! Everyone gains a bullet';
    case 'ghost_vote_started':
      return 'The dead are voting';
    case 'ghost_vote_result':
      return `Ghost vote: ${evt.result || 'decided'}`;
    case 'last_stand_entered':
      return 'Last Stand! Two finalists remain';
    case 'betting_open':
      return ''; // silent — visual only
    case 'betting_streak_reward':
      return `${evt.playerName || 'A player'} predicts well — risk drops`;
    default:
      return null; // caller can fall back to banner title
  }
}

// ─── Voice picker ──────────────────────────────────────────────
// Honour `voicePreference` if set (English voice with name match),
// otherwise prefer the first English voice, otherwise default.
function pickVoice(voices, voicePreference) {
  if (!Array.isArray(voices) || voices.length === 0) return null;
  const englishVoices = voices.filter(
    (v) => v?.lang && v.lang.toLowerCase().startsWith('en')
  );
  if (voicePreference) {
    const pref = String(voicePreference).toLowerCase();
    const match = englishVoices.find((v) =>
      v.name && v.name.toLowerCase().includes(pref)
    );
    if (match) return match;
  }
  return englishVoices[0] || null;
}

export function useAnnouncementSpeech(latestEvent, options = {}) {
  const { enabled = true, voicePreference = null } = options;

  // Track which event ids we've already spoken so re-renders that
  // don't change the head don't re-trigger speech.
  const lastSpokenIdRef = useRef(null);
  const enabledRef = useRef(enabled);

  // Keep latest enabled in a ref so the cleanup-on-disable effect
  // can read it without re-running the speak effect.
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // When toggled off, cancel any in-flight utterance immediately.
  useEffect(() => {
    if (enabled) return;
    if (typeof window === 'undefined') return;
    if (!('speechSynthesis' in window)) return;
    try { window.speechSynthesis.cancel(); } catch (_) { /* ignore */ }
  }, [enabled]);

  // Speak whenever the head event id changes.
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    if (!('speechSynthesis' in window)) return;
    if (!latestEvent || !latestEvent.id) return;
    if (lastSpokenIdRef.current === latestEvent.id) return;
    lastSpokenIdRef.current = latestEvent.id;

    const phrase = buildPhrase(latestEvent);
    // null → unmapped kind; '' → intentionally silent. Both skip.
    if (!phrase) return;

    try {
      // Cancel any in-flight utterance so back-to-back events don't
      // queue up inside the synth's own buffer.
      window.speechSynthesis.cancel();

      const utter = new window.SpeechSynthesisUtterance(phrase);
      utter.rate = 1.05;
      utter.pitch = 1.0;
      utter.volume = 1.0;

      // Voice picking — getVoices() can be empty until the async
      // `voiceschanged` event fires (notably on Chrome / Safari).
      // Try to set a voice if we have one; otherwise let the browser
      // pick its default.
      const voices = window.speechSynthesis.getVoices?.() || [];
      const chosen = pickVoice(voices, voicePreference);
      if (chosen) utter.voice = chosen;
      utter.lang = chosen?.lang || 'en-US';

      window.speechSynthesis.speak(utter);
    } catch (_) {
      // Any synth failure is non-fatal — visual banner still shows.
    }
  }, [latestEvent, enabled, voicePreference]);

  // Cancel speech on unmount.
  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return;
      if (!('speechSynthesis' in window)) return;
      try { window.speechSynthesis.cancel(); } catch (_) { /* ignore */ }
    };
  }, []);
}

// ─── Settings persistence helpers ──────────────────────────────
// Default ON. Persist to localStorage under `bluff_speech_enabled`.
// Exported so the toggle button can share the same key.

export const SPEECH_STORAGE_KEY = 'bluff_speech_enabled';

export function loadSpeechEnabled() {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(SPEECH_STORAGE_KEY);
    if (raw === null) return true; // default ON
    return raw === '1' || raw === 'true';
  } catch (_) {
    return true;
  }
}

export function saveSpeechEnabled(enabled) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SPEECH_STORAGE_KEY, enabled ? '1' : '0');
  } catch (_) {
    // ignore — quota / privacy mode
  }
}
