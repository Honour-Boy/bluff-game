'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TourLayer, isSettingsMenuOpen } from './TourLayer';
import { tourBeatsFor } from './tourContent';
import { TOUR_IDS } from './tourIds';

// ─── OnlineTourLayer — host that drives the tour over the live table ──────────
// The spotlight engine (TourLayer) is dumb; this wires it to the REAL app:
//   - builds the beat list for the current player (guest filtering),
//   - derives the `menu-open` signal by watching the global SettingsGear (which
//     is mounted at the app root, not here — so we read its DOM, no prop
//     drilling), and merges in the Part-B signals the host supplies,
//   - closes the settings menu programmatically when the walk crosses from the
//     Part-A controls into the Part-B in-game beats (beat A9 in the spec),
//   - forwards completion / skip to the host (Phase 4 routes these to the
//     congrats screen + `tutorial_finish_tour`).
//
// Part-B signals come from the host (serialized room + overlay state); until
// Phase 3 wires them they default to empty and only Part A is interactive.

const MENU_POLL_MS = 150;

function closeSettingsMenu() {
  if (typeof document === 'undefined') return;
  if (!isSettingsMenuOpen()) return;
  const gear = document.querySelector(`[data-tour-id="${TOUR_IDS.settingsGear}"]`);
  if (gear) gear.click(); // toggles the menu shut
}

export function OnlineTourLayer({
  isGuest = false,
  partBSignals = null,
  onComplete,
  onSkip,
}) {
  const beats = useMemo(() => tourBeatsFor({ isGuest }), [isGuest]);

  // Poll the live SettingsGear for its open state → the `menu-open` signal that
  // advances beat A1 (a click-target beat).
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const id = setInterval(() => setMenuOpen(isSettingsMenuOpen()), MENU_POLL_MS);
    setMenuOpen(isSettingsMenuOpen());
    return () => clearInterval(id);
  }, []);

  const signals = useMemo(
    () => ({ 'menu-open': menuOpen, ...(partBSignals || {}) }),
    [menuOpen, partBSignals],
  );

  // When the walk enters the first Part-B beat, shut the menu so the table is
  // clear for the in-game instances.
  const prevPartRef = useRef(null);
  const handleBeatChange = useCallback((beat) => {
    const prevPart = prevPartRef.current;
    prevPartRef.current = beat?.part || null;
    if (prevPart === 'A' && beat?.part === 'B') closeSettingsMenu();
  }, []);

  // Always leave the menu closed on the way out (complete or skip).
  const handleComplete = useCallback(() => { closeSettingsMenu(); onComplete?.(); }, [onComplete]);
  const handleSkip = useCallback(() => { closeSettingsMenu(); onSkip?.(); }, [onSkip]);

  if (!beats || beats.length === 0) return null;

  return (
    <TourLayer
      beats={beats}
      signals={signals}
      onBeatChange={handleBeatChange}
      onComplete={handleComplete}
      onSkip={handleSkip}
    />
  );
}
