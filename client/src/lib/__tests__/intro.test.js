import { describe, it, expect, beforeEach } from 'vitest';
import { shouldShowIntro, markIntroSeen, rearmIntro } from '../intro';

const INTRO_SEEN_KEY = 'bluff_intro_seen';

beforeEach(() => {
  sessionStorage.clear();
});

describe('intro splash gating', () => {
  it('shows the intro on a fresh session (flag absent)', () => {
    expect(shouldShowIntro()).toBe(true);
  });

  it('does NOT replay once marked seen (refresh / reconnect / navigation)', () => {
    markIntroSeen();
    expect(sessionStorage.getItem(INTRO_SEEN_KEY)).toBe('1');
    expect(shouldShowIntro()).toBe(false);
  });

  it('rearm drops the flag so the next entry (after logout) replays it', () => {
    markIntroSeen();
    expect(shouldShowIntro()).toBe(false);
    rearmIntro();
    expect(sessionStorage.getItem(INTRO_SEEN_KEY)).toBeNull();
    expect(shouldShowIntro()).toBe(true);
  });
});
