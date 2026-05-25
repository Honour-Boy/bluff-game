// ============================================================
// Unit tests for nextActionId (lib/state).
//
// Spin-result `lastAction` payloads carry this id so the client can
// key its 8s spin animation on a STABLE identity. serializeRoom
// rebuilds lastAction on every broadcast, so without a per-spin id an
// incidental rebroadcast (reconnect / join) during the animation would
// tear the client effect down and hang the overlay. The only contract
// the client depends on: each call returns a value distinct from — and
// strictly greater than — the one before it.
// ============================================================

import { describe, it, expect } from 'vitest';
import { nextActionId } from '../lib/state.js';

describe('nextActionId', () => {
  it('returns strictly increasing values', () => {
    const a = nextActionId();
    const b = nextActionId();
    const c = nextActionId();
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('never repeats across a long run of calls', () => {
    const ids = Array.from({ length: 1000 }, () => nextActionId());
    expect(new Set(ids).size).toBe(ids.length);
  });
});
