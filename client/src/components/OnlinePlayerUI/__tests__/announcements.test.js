// ============================================================
// #121 — Announcement accuracy
//
// Covers the kind→banner mapping (buildAnnouncementBannerProps) and
// the AnnouncementBanner preset guard. The pre-#121 bug: any kind not
// in the switch fell through to "BLUFF BLOCKED", so swaps, freezes,
// medic saves, sudden death, betting, ghost votes, etc. all rendered
// the WRONG banner — actively contradicting the real game state.
// ============================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildAnnouncementBannerProps } from '../helpers';
import { AnnouncementBanner } from '../../shared/AnnouncementBanner';

describe('buildAnnouncementBannerProps — #121 mapping accuracy', () => {
  // Each distinct server kind must map to its OWN preset, never be
  // squashed onto an unrelated one. (kind, expected preset, expected title)
  const cases = [
    ['shield_blocked', 'bluff_blocked', 'BLUFF BLOCKED'],
    ['sheriff_protected', 'sheriff_protected', 'SHERIFF PROTECTED'],
    ['assassin_backfire', 'assassin_backfire', 'ASSASSIN BACKFIRES'],
    ['mirror_reflected', 'bluff_reflected', 'BLUFF REFLECTED'],
    ['assassin_strike', 'assassin', 'ASSASSIN STRIKE'],
    ['gambler_caught', 'gambler_caught', 'GAMBLER CAUGHT'],
    ['sheriff_relief', 'sheriff_relief', 'SHERIFF RELIEVED'],
    ['swap_resolved', 'swap_resolved', 'SWAP RESOLVED'],
    ['freeze_skip', 'freeze_applied', 'FROZEN'],
    ['medic_deciding', 'medic_deciding', 'MEDIC DECIDING'],
    ['medic_saved', 'medic_saved', 'MEDIC SAVE'],
    ['medic_skipped', 'medic_skipped', 'NO SAVE'],
    ['sniper_redirect', 'sniper_redirect', 'SNIPER REDIRECT'],
    ['bounty_placed', 'bounty', 'BOUNTY PLACED'],
    ['bounty_collected', 'bounty_collected', 'BOUNTY COLLECTED'],
    ['betting_open', 'betting_open', 'PLACE YOUR BETS'],
    ['betting_streak_reward', 'betting_streak_reward', 'BETTING STREAK!'],
    ['sudden_death', 'sudden_death', 'SUDDEN DEATH'],
    ['ghost_vote_started', 'ghost_vote_started', 'GHOST COUNCIL CONVENES'],
    ['ghost_vote_result', 'ghost_vote_result', 'GHOST COUNCIL DECIDES'],
    ['last_stand_entered', 'last_stand_entered', 'LAST STAND'],
    ['system_notice', 'system_notice', 'NOTICE'],
  ];

  it.each(cases)('%s → preset %s / title %s', (kind, preset, title) => {
    const props = buildAnnouncementBannerProps({ kind });
    expect(props).not.toBeNull();
    expect(props.kind).toBe(preset);
    expect(props.title).toBe(title);
  });

  it('never squashes a distinct outcome onto bluff_blocked', () => {
    // Regression guard for the old default-fallback bug: these used to
    // all resolve to the 'bluff_blocked' preset.
    for (const kind of ['swap_resolved', 'freeze_skip', 'medic_saved', 'gambler_caught', 'sudden_death']) {
      expect(buildAnnouncementBannerProps({ kind }).kind).not.toBe('bluff_blocked');
    }
  });

  it('renders the redirect target name inline for a reflected bluff', () => {
    const props = buildAnnouncementBannerProps({ kind: 'mirror_reflected', redirectedToName: 'Ada' });
    expect(props.kind).toBe('bluff_reflected');
    expect(props.subtitle).toContain('Ada');
  });

  it('returns null and warns for an unknown kind (no bluff_blocked fallback)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const props = buildAnnouncementBannerProps({ kind: 'totally_made_up_kind' });
    expect(props).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[buildAnnouncementBannerProps] unknown event kind:',
      'totally_made_up_kind',
    );
    warn.mockRestore();
  });

  it('returns null for an event with no kind', () => {
    expect(buildAnnouncementBannerProps(null)).toBeNull();
    expect(buildAnnouncementBannerProps({})).toBeNull();
  });
});

describe('AnnouncementBanner — #121 preset guard', () => {
  it('renders the headline for a known kind', () => {
    render(<AnnouncementBanner kind="swap_resolved" />);
    expect(screen.getByText('SWAP RESOLVED')).toBeInTheDocument();
  });

  it('renders nothing and warns for an unknown preset kind', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<AnnouncementBanner kind="does_not_exist" />);
    expect(container).toBeEmptyDOMElement();
    expect(warn).toHaveBeenCalledWith('[AnnouncementBanner] unknown kind:', 'does_not_exist');
    warn.mockRestore();
  });
});
