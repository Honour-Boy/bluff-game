import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SettingsGear } from '../../shared/SettingsGear';
import { OnlineTourLayer } from '../OnlineTourLayer';
import { tourBeatsFor } from '../tourContent';

// Render the REAL global settings gear (with in-room controls so the menu rows
// exist) next to the tour host, mirroring how page.js + OnlinePlayerUI mount
// them as siblings.
function Harness({ isGuest = false, onComplete = () => {}, onSkip = () => {} }) {
  return (
    <>
      <SettingsGear
        username="Tester"
        isGuest={isGuest}
        inRoom
        onOpenChat={() => {}}
        onOpenGameSettings={() => {}}
        onOpenLeaderboard={() => {}}
        onLeaveTable={() => {}}
        onToggleMusic={() => {}}
        onSetMusicVolume={() => {}}
        onUpdateUsername={() => {}}
        getProgression={() => {}}
        setCosmetics={() => {}}
        onSignOut={() => {}}
      />
      <OnlineTourLayer isGuest={isGuest} onComplete={onComplete} onSkip={onSkip} />
    </>
  );
}

describe('OnlineTourLayer — Part A settings walk', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom returns a zero rect; give anchors a real size so they measure.
    Element.prototype.getBoundingClientRect = function () {
      return { top: 20, left: 800, width: 120, height: 36, right: 920, bottom: 56, x: 800, y: 20, toJSON() {} };
    };
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('starts on beat A1 pointing at the settings gear', () => {
    render(<Harness />);
    act(() => { vi.advanceTimersByTime(120); });
    expect(screen.getByText(/this is the settings button/i)).toBeTruthy();
    expect(screen.getByText(/click it to open the menu/i)).toBeTruthy();
  });

  it('advances off A1 when the player actually opens the menu (click-target)', () => {
    render(<Harness />);
    act(() => { vi.advanceTimersByTime(120); });

    // Open the real menu by clicking the gear.
    act(() => { fireEvent.click(screen.getByLabelText('Settings')); });
    // Menu-open poll (150ms) flips the signal → A1 auto-advances.
    act(() => { vi.advanceTimersByTime(200); });

    expect(screen.getByText(/talk to the table mid-game/i)).toBeTruthy(); // A2 (Chat) copy
    expect(screen.getByRole('menu')).toBeTruthy();                        // menu is open
  });

  it('keeps the menu open across Next presses through the rows', () => {
    render(<Harness />);
    act(() => { vi.advanceTimersByTime(120); });
    act(() => { fireEvent.click(screen.getByLabelText('Settings')); });
    act(() => { vi.advanceTimersByTime(200); });

    // A2 → Next → A3 (Game settings copy), menu still mounted.
    act(() => { screen.getByText('Next').click(); });
    act(() => { vi.advanceTimersByTime(60); });
    expect(screen.getByText(/powers, modifiers and house rules/i)).toBeTruthy();
    expect(screen.getByRole('menu')).toBeTruthy();

    // A3 → Next → A4 (Leaderboard copy), still open.
    act(() => { screen.getByText('Next').click(); });
    act(() => { vi.advanceTimersByTime(60); });
    expect(screen.getByText(/live standings during a group game/i)).toBeTruthy();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('drops the profile + cosmetics rows for a guest (dynamic enumeration)', () => {
    // The guest gear never renders those rows…
    render(<Harness isGuest />);
    act(() => { vi.advanceTimersByTime(120); });
    act(() => { fireEvent.click(screen.getByLabelText('Settings')); });
    expect(screen.queryByText('Edit profile')).toBeNull();
    expect(screen.queryByText('Cosmetics')).toBeNull();

    // …and the beat list omits them too, so the tour can't strand on a missing row.
    const guestAnchors = tourBeatsFor({ isGuest: true }).map((b) => b.anchorId);
    expect(guestAnchors).not.toContain('settings-profile');
    expect(guestAnchors).not.toContain('settings-cosmetics');
  });
});
