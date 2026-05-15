'use client';

// useIsMobile — SSR-safe matchMedia hook. Defaults to false during
// SSR / first client render and flips to the live value on mount.
// Default query matches the existing 640px breakpoint used in
// OnlinePlayerUI's CSS for the same purpose (chip sizing / etc).

import { useEffect, useState } from 'react';

const DEFAULT_QUERY = '(max-width: 640px)';

export function useIsMobile(query = DEFAULT_QUERY) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const update = () => setIsMobile(mql.matches);
    update();
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', update);
      return () => mql.removeEventListener('change', update);
    }
    // Older Safari
    mql.addListener(update);
    return () => mql.removeListener(update);
  }, [query]);

  return isMobile;
}
