'use client';

import { useEffect, useRef, useState } from 'react';

// ─── useTourAnchor ────────────────────────────────────────────────────────────
// Tracks the on-screen rect of `[data-tour-id="<anchorId>"]` for the spotlight
// cutout. Re-measures aggressively because the target may mount/unmount per beat
// (menus, modals) and the viewport may resize/rotate/scroll:
//   - re-queries the element + re-measures on a RAF loop pumped by resize /
//     orientationchange / scroll (capture, so inner scrollers count) and a
//     ResizeObserver on the target.
//   - returns { rect, missing }. `missing` flips true if the anchor can't be
//     found within `missingTimeoutMs` (~1.5s) so TourLayer can SKIP the beat
//     rather than stranding the player under the overlay.
//
// `activeBeatKey` resets the missing-timer whenever the beat changes (a fresh
// anchor gets its own grace period).

const MISSING_TIMEOUT_MS = 1500;

function measure(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // A zero-area rect (display:none / not laid out yet) counts as not-ready.
  if (r.width <= 0 && r.height <= 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
}

function rectsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

export function useTourAnchor(anchorId, activeBeatKey, { missingTimeoutMs = MISSING_TIMEOUT_MS } = {}) {
  const [rect, setRect] = useState(null);
  const [missing, setMissing] = useState(false);
  const rectRef = useRef(null);
  const rafRef = useRef(0);
  const missingTimerRef = useRef(null);

  useEffect(() => {
    if (typeof document === 'undefined' || !anchorId) {
      setRect(null);
      setMissing(!anchorId);
      return undefined;
    }

    let cancelled = false;
    rectRef.current = null;
    setRect(null);
    setMissing(false);

    let resizeObserver = null;
    let observedEl = null;

    const pump = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour-id="${anchorId}"]`);
      const next = measure(el);

      // (Re)attach a ResizeObserver to the live element each time it changes.
      if (el && el !== observedEl && typeof ResizeObserver !== 'undefined') {
        if (resizeObserver) resizeObserver.disconnect();
        resizeObserver = new ResizeObserver(() => { schedule(); });
        try { resizeObserver.observe(el); } catch (_) {}
        observedEl = el;
      }

      if (next) {
        // Found + laid out — clear any pending missing timer.
        if (missingTimerRef.current) { clearTimeout(missingTimerRef.current); missingTimerRef.current = null; }
        if (!rectsEqual(next, rectRef.current)) {
          rectRef.current = next;
          setRect(next);
        }
        if (missing) setMissing(false);
      } else if (!missingTimerRef.current && !missing) {
        // Not found yet — arm the skip timer once.
        missingTimerRef.current = setTimeout(() => {
          if (!cancelled) setMissing(true);
        }, missingTimeoutMs);
      }
    };

    const schedule = () => {
      if (rafRef.current) return;
      rafRef.current = (typeof requestAnimationFrame !== 'undefined'
        ? requestAnimationFrame
        : (fn) => setTimeout(fn, 16))(() => {
          rafRef.current = 0;
          pump();
        });
    };

    // Initial measure + a couple of follow-ups for late-mounting targets.
    pump();
    const kick1 = setTimeout(schedule, 50);
    const kick2 = setTimeout(schedule, 200);

    const onResize = () => schedule();
    const onScroll = () => schedule();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    window.addEventListener('scroll', onScroll, true); // capture: catch inner scrollers

    return () => {
      cancelled = true;
      clearTimeout(kick1);
      clearTimeout(kick2);
      if (missingTimerRef.current) { clearTimeout(missingTimerRef.current); missingTimerRef.current = null; }
      if (rafRef.current && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorId, activeBeatKey, missingTimeoutMs]);

  return { rect, missing };
}
