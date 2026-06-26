import { describe, it, expect } from 'vitest';
import { ALL_TOUR_BEATS, tourBeatsFor, nextBeat, TOUR_STEPS } from '../tourContent';
import { TOUR_IDS } from '../tourIds';

describe('tourContent - beat list shape', () => {
  it('every beat has a unique id, a known anchorId, a shape, an advance mode and copy', () => {
    const ids = new Set();
    const knownAnchors = new Set(Object.values(TOUR_IDS));
    const shapes = new Set(['square', 'rect', 'big-rect']);
    const advances = new Set(['next', 'click-target', 'do-action']);
    for (const b of ALL_TOUR_BEATS) {
      expect(typeof b.id).toBe('string');
      expect(ids.has(b.id), `duplicate id ${b.id}`).toBe(false);
      ids.add(b.id);
      expect(knownAnchors.has(b.anchorId), `unknown anchor ${b.anchorId}`).toBe(true);
      expect(shapes.has(b.shape), `bad shape ${b.shape}`).toBe(true);
      expect(advances.has(b.advance), `bad advance ${b.advance}`).toBe(true);
      expect(b.copy).toBeTruthy();
    }
  });

  it('action beats (click-target / do-action) carry a waitFor key', () => {
    for (const b of ALL_TOUR_BEATS) {
      if (b.advance !== 'next') expect(b.waitFor, `${b.id} missing waitFor`).toBeTruthy();
    }
  });

  it("'next' beats never carry a waitFor", () => {
    for (const b of ALL_TOUR_BEATS) {
      if (b.advance === 'next') expect(b.waitFor).toBeUndefined();
    }
  });

  it('every Part-B beat is tagged with a known tour step', () => {
    for (const b of ALL_TOUR_BEATS) {
      if (b.part === 'B') expect(TOUR_STEPS.includes(b.step), `${b.id} bad step ${b.step}`).toBe(true);
    }
  });
});

describe('tourBeatsFor - guest filtering', () => {
  it('drops profile + cosmetics rows for guests', () => {
    const beats = tourBeatsFor({ isGuest: true });
    const anchors = beats.map((b) => b.anchorId);
    expect(anchors).not.toContain(TOUR_IDS.settingsProfile);
    expect(anchors).not.toContain(TOUR_IDS.settingsCosmetics);
  });

  it('keeps profile + cosmetics rows for signed-in players', () => {
    const beats = tourBeatsFor({ isGuest: false });
    const anchors = beats.map((b) => b.anchorId);
    expect(anchors).toContain(TOUR_IDS.settingsProfile);
    expect(anchors).toContain(TOUR_IDS.settingsCosmetics);
  });

  it('preserves the overall A-then-B order', () => {
    const beats = tourBeatsFor({ isGuest: false });
    const firstB = beats.findIndex((b) => b.part === 'B');
    const lastA = beats.map((b) => b.part).lastIndexOf('A');
    expect(lastA).toBeLessThan(firstB);
  });
});

describe('nextBeat', () => {
  it('returns the following beat or null at the end', () => {
    const beats = tourBeatsFor({ isGuest: false });
    expect(nextBeat(beats, 0)).toBe(beats[1]);
    expect(nextBeat(beats, beats.length - 1)).toBeNull();
  });
});
