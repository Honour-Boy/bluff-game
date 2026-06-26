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

// Web Storage shim. Node 22+/26 ship a native experimental `localStorage` that
// is unavailable unless `--localstorage-file` is passed, and it shadows JSDOM's
// implementation on the global — so bare `localStorage.*` throws in tests while
// `sessionStorage` (in-memory) keeps working. When the global store is missing
// or broken, install a spec-ish in-memory Storage on both global + window. On
// Node 20 (where JSDOM's store works) the check passes and nothing is replaced.
function _makeStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    clear() { m.clear(); },
    getItem(k) { k = String(k); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(String(k), String(v)); },
    removeItem(k) { m.delete(String(k)); },
    key(i) { return Array.from(m.keys())[i] ?? null; },
  };
}
function _ensureStorage(name) {
  let broken = false;
  try {
    const s = globalThis[name];
    if (!s || typeof s.setItem !== 'function') broken = true;
    else { s.setItem('__probe__', '1'); s.removeItem('__probe__'); }
  } catch (_) { broken = true; }
  if (!broken) return;
  const store = _makeStorage();
  const install = (obj) => {
    if (!obj) return;
    try { Object.defineProperty(obj, name, { value: store, configurable: true, writable: true }); }
    catch (_) { try { obj[name] = store; } catch (_) { /* read-only — give up */ } }
  };
  install(globalThis);
  if (typeof window !== 'undefined' && window !== globalThis) install(window);
}
_ensureStorage('localStorage');
_ensureStorage('sessionStorage');

// Each test runs in isolation — make sure mounted components are
// unmounted between tests so refs / listeners don't leak.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
