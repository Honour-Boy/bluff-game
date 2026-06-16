import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TutorialLayer } from '../TutorialLayer';
import { introSlidesFor } from '../tutorialContent';

const lobbyRoom = {
  phase: 'lobby',
  isTutorial: true,
  tutorialLesson: 'basics',
  players: [{ id: 'me', status: 'alive' }],
};

function renderIntro(props = {}) {
  const startGame = vi.fn();
  const startTour = vi.fn();
  const finishTour = vi.fn();
  render(
    <TutorialLayer
      roomState={lobbyRoom}
      myPlayerId="me"
      startGame={startGame}
      startTour={startTour}
      finishTour={finishTour}
      skipToPowers={vi.fn()}
      advanceTutorial={vi.fn()}
      restartRoom={vi.fn()}
      leaveGame={vi.fn()}
      lesson="basics"
      {...props}
    />,
  );
  return { startGame, startTour, finishTour };
}

// Walk the Basics choice → intro → final slide.
function gotoFinalSlide() {
  fireEvent.click(screen.getByText('Go through Basics'));
  const steps = introSlidesFor('basics').length - 1;
  for (let i = 0; i < steps; i++) fireEvent.click(screen.getByText('Next →'));
}

describe('intro → tour routing (first run)', () => {
  beforeEach(() => {
    try { window.localStorage.removeItem('bluff_tour_done'); } catch (_) { /* ignore */ }
  });

  it('offers "Show me around" / "Skip tour" on the final Basics slide', () => {
    renderIntro();
    gotoFinalSlide();
    expect(screen.getByText('Show me around')).toBeTruthy();
    expect(screen.getByText('Skip tour →')).toBeTruthy();
  });

  it('"Show me around" starts the tour and not the plain Basics deal', () => {
    const { startGame, startTour } = renderIntro();
    gotoFinalSlide();
    fireEvent.click(screen.getByText('Show me around'));
    expect(startTour).toHaveBeenCalledTimes(1);
    expect(startGame).not.toHaveBeenCalled();
  });

  it('"Skip tour" deals the plain Basics game and never enters the tour', () => {
    const { startGame, startTour } = renderIntro();
    gotoFinalSlide();
    fireEvent.click(screen.getByText('Skip tour →'));
    expect(startGame).toHaveBeenCalledTimes(1);
    expect(startTour).not.toHaveBeenCalled();
  });
});

describe('intro → tour routing (returning player)', () => {
  beforeEach(() => {
    try { window.localStorage.setItem('bluff_tour_done', '1'); } catch (_) { /* ignore */ }
  });

  it('flips the emphasis: primary "Begin practice" + quieter "Show me around again"', () => {
    const { startGame, startTour } = renderIntro();
    gotoFinalSlide();
    // Primary now deals Basics directly…
    fireEvent.click(screen.getByText('Begin practice'));
    expect(startGame).toHaveBeenCalledTimes(1);
    expect(startTour).not.toHaveBeenCalled();
  });

  it('still lets a returning player re-take the tour', () => {
    const { startTour } = renderIntro();
    gotoFinalSlide();
    fireEvent.click(screen.getByText('Show me around again'));
    expect(startTour).toHaveBeenCalledTimes(1);
  });
});
