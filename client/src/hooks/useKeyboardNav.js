'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── useKeyboardNav ───────────────────────────────────────────────────────────
// Global keyboard navigation hook for Phase 1 screens.
//
// Usage:
//   const { focusedIndex, navRef, handleKeyDown, setFocusedIndex } = useKeyboardNav(itemCount);
//
// Assign `navRef` to the container, add `data-nav-item` to each focusable child,
// and call `handleKeyDown` on the container's onKeyDown (or the document).
//
// Keyboard contract (matches the global requirement):
//   ArrowUp / W       - previous item
//   ArrowDown / S     - next item
//   ArrowLeft / A     - previous item (horizontal grids)
//   ArrowRight / D    - next item (horizontal grids)
//   Enter / Space     - confirm/activate focused item
//   B                 - bluff hotkey (dispatches custom event)
//   P                 - power-card hotkey (dispatches custom event)
//   Escape            - blur / close

export function useKeyboardNav(itemCount, { onConfirm, onEscape, loop = true } = {}) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const navRef = useRef(null);

  const clamp = useCallback(
    (idx) => {
      if (loop) return ((idx % itemCount) + itemCount) % itemCount;
      return Math.max(0, Math.min(idx, itemCount - 1));
    },
    [itemCount, loop],
  );

  const handleKeyDown = useCallback(
    (e) => {
      const key = e.key;

      if (key === 'ArrowDown' || key === 's' || key === 'S') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev < 0 ? 0 : clamp(prev + 1);
          focusItem(navRef.current, next);
          return next;
        });
        return;
      }

      if (key === 'ArrowUp' || key === 'w' || key === 'W') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev < 0 ? itemCount - 1 : clamp(prev - 1);
          focusItem(navRef.current, next);
          return next;
        });
        return;
      }

      if (key === 'ArrowRight' || key === 'd' || key === 'D') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev < 0 ? 0 : clamp(prev + 1);
          focusItem(navRef.current, next);
          return next;
        });
        return;
      }

      if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev < 0 ? 0 : clamp(prev - 1);
          focusItem(navRef.current, next);
          return next;
        });
        return;
      }

      if (key === 'Enter' || key === ' ') {
        if (focusedIndex >= 0) {
          e.preventDefault();
          const item = getItems(navRef.current)[focusedIndex];
          if (item) item.click();
          onConfirm?.(focusedIndex);
        }
        return;
      }

      if (key === 'Escape') {
        setFocusedIndex(-1);
        onEscape?.();
        return;
      }

      // Global game hotkeys - broadcast as custom DOM events so any
      // listener in the tree can react (Phase 2 will consume these).
      if (key === 'b' || key === 'B') {
        document.dispatchEvent(new CustomEvent('bluff-hotkey'));
        return;
      }

      if (key === 'p' || key === 'P') {
        document.dispatchEvent(new CustomEvent('power-hotkey'));
        return;
      }
    },
    [focusedIndex, itemCount, clamp, onConfirm, onEscape],
  );

  // Sync native focus → focusedIndex when the user clicks / tabs.
  useEffect(() => {
    const container = navRef.current;
    if (!container) return;

    const onFocusIn = () => {
      const items = getItems(container);
      const active = document.activeElement;
      const idx = items.indexOf(active);
      if (idx !== -1) setFocusedIndex(idx);
    };

    container.addEventListener('focusin', onFocusIn);
    return () => container.removeEventListener('focusin', onFocusIn);
  }, []);

  return { focusedIndex, setFocusedIndex, navRef, handleKeyDown };
}

function getItems(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll('[data-nav-item]'));
}

function focusItem(container, index) {
  const items = getItems(container);
  if (items[index]) items[index].focus();
}
