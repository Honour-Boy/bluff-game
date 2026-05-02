// ─── Test setup — extends Vitest's expect with jest-dom matchers and
// shims a few browser APIs that JSDOM doesn't ship.
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// JSDOM doesn't implement matchMedia. A handful of components / hooks
// can poke it indirectly (e.g. via libraries) — stub it once globally.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// ResizeObserver isn't in JSDOM. Some libs (e.g. focus-trap helpers)
// instantiate one on mount; a noop is fine for tests.
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Wake-lock is browser-only. The useGame hook calls navigator.wakeLock
// when entering a room; provide a noop so the hook doesn't blow up.
if (typeof navigator !== 'undefined' && !navigator.wakeLock) {
  // @ts-ignore — JSDOM types don't include wakeLock
  navigator.wakeLock = {
    request: async () => ({ release: async () => {} }),
  };
}

// Each test runs in isolation — make sure mounted components are
// unmounted between tests so refs / listeners don't leak.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
