'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TourSpotlight } from './TourSpotlight';
import { useTourAnchor } from './useTourAnchor';
import { TOUR_IDS } from './tourIds';

// ─── TourLayer - the spotlight tour state machine ─────────────────────────────
// Walks a filtered beat list one beat at a time, rendering TourSpotlight over
// the live UI. Advance handling per beat:
//   - 'next'          → a Next button in the popup.
//   - 'click-target'  → auto-advances when `signals[beat.waitFor]` goes true
//                       (e.g. the settings menu actually opened).
//   - 'do-action'     → same, but the signal reflects a SERVER-confirmed effect
//                       (card played, turn ended, spin acknowledged…). The real
//                       element under the hole receives the real click.
// Never strands the player: if the current beat's anchor can't be found
// (`useTourAnchor` → missing), the beat is skipped. Skip-tour and Escape exit
// at any time.
//
// Props:
//   beats     - filtered ordered beat list (tourContent.tourBeatsFor).
//   signals   - { [waitForKey]: boolean } observable state, supplied by the host
//               (DOM/menu state + serialized room/overlay state).
//   onComplete() / onSkip()  - terminal callbacks.
//   onBeatChange(beat)       - optional, fired on each beat entry.

export function TourLayer({ beats, signals = {}, onComplete, onSkip, onBeatChange }) {
  const [index, setIndex] = useState(0);
  const beat = beats && beats[index] ? beats[index] : null;
  const total = beats ? beats.length : 0;

  const { rect, missing } = useTourAnchor(beat?.anchorId, beat?.id);

  // Baseline of the current beat's signal at entry, so we advance on a RISING
  // edge (the action happening DURING the beat), not a residual true value.
  const baselineRef = useRef(false);
  const advancedRef = useRef(false);

  const goTo = useCallback((nextIdx) => {
    advancedRef.current = false;
    if (!beats || nextIdx >= beats.length) {
      if (onComplete) onComplete();
      return;
    }
    setIndex(nextIdx);
  }, [beats, onComplete]);

  const advance = useCallback(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    goTo(index + 1);
  }, [goTo, index]);

  // On each beat entry: reset the rising-edge guard, snapshot the signal
  // baseline, and notify the host.
  useEffect(() => {
    advancedRef.current = false;
    baselineRef.current = beat?.waitFor ? !!signals[beat.waitFor] : false;
    if (beat && onBeatChange) onBeatChange(beat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat?.id]);

  // Auto-advance for click-target / do-action beats when their signal rises.
  useEffect(() => {
    if (!beat || beat.advance === 'next' || !beat.waitFor) return;
    const now = !!signals[beat.waitFor];
    if (now && !baselineRef.current) advance();
    // If the signal is somehow already true at entry, clear the baseline so a
    // later genuine toggle still fires (covers a same-value-then-true case).
    if (!now) baselineRef.current = false;
  }, [beat, signals, advance]);

  // Skip-on-missing: if the anchor can't be found, move on rather than strand.
  useEffect(() => {
    if (beat && missing) {
      // eslint-disable-next-line no-console
      if (typeof console !== 'undefined') console.warn(`[tour] anchor missing, skipping beat ${beat.id} (${beat.anchorId})`);
      advance();
    }
  }, [beat, missing, advance]);

  // Escape = skip the whole tour.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && onSkip) onSkip(); };
    if (typeof document !== 'undefined') document.addEventListener('keydown', onKey);
    return () => { if (typeof document !== 'undefined') document.removeEventListener('keydown', onKey); };
  }, [onSkip]);

  if (!beat) return null;
  // While the anchor is resolving (not yet measured, not yet missing) render
  // nothing - TourSpotlight no-ops on a null rect anyway.
  if (!rect) return null;

  const interactive = beat.advance === 'click-target' || beat.advance === 'do-action';

  return (
    <TourSpotlight
      rect={rect}
      shape={beat.shape}
      interactive={interactive}
      copy={beat.copy}
      instruction={beat.instruction}
      stepLabel={`${index + 1} / ${total}`}
      showNext={beat.advance === 'next'}
      onNext={advance}
      onSkip={onSkip}
    />
  );
}

// Helper for hosts: derive the `menu-open` signal from the live SettingsGear
// without prop drilling (the gear button carries aria-expanded + data-tour-id).
export function isSettingsMenuOpen() {
  if (typeof document === 'undefined') return false;
  const gear = document.querySelector(`[data-tour-id="${TOUR_IDS.settingsGear}"]`);
  return gear ? gear.getAttribute('aria-expanded') === 'true' : false;
}
