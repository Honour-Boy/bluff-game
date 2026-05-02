// ─── Fake socket — EventEmitter-backed stand-in for socket.io-client.
//
// Used by hook tests that import getSocket() from lib/socket. Keeping
// this in one place means every test gets the same shape and we can
// extend (e.g. add `volatile`, `compress`) without touching call sites.
import { EventEmitter } from 'node:events';
import { vi } from 'vitest';

export function makeMockSocket({ connected = true, autoCallback = true } = {}) {
  const ee = new EventEmitter();
  // Bump max listeners — useGame attaches ~7 handlers and tests that
  // re-render multiple times can trip the default limit (10) and dump
  // a noisy warning to stderr.
  ee.setMaxListeners(100);

  const socket = {
    connected,
    on: (event, handler) => ee.on(event, handler),
    off: (event, handler) => ee.off(event, handler),
    once: (event, handler) => ee.once(event, handler),
    // emit is a Vitest mock so tests can assert arguments and pretend
    // the server replied (callback({ success: true })) when needed.
    emit: vi.fn((event, payload, callback) => {
      if (autoCallback && typeof callback === 'function') {
        callback({ success: true });
      }
    }),
    // For tests to drive incoming server events, expose the emitter.
    __emit: (...args) => ee.emit(...args),
    __removeAllListeners: () => ee.removeAllListeners(),
  };

  return socket;
}
