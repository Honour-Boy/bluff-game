import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActionLog } from './ActionLog';

describe('ActionLog', () => {
  it('returns null when no lastAction', () => {
    const { container } = render(<ActionLog lastAction={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null for an unknown action type', () => {
    const { container } = render(<ActionLog lastAction={{ type: 'mystery' }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders elimination text for spin_result with eliminated=true', () => {
    render(
      <ActionLog
        lastAction={{
          type: 'spin_result',
          spinTargetName: 'Alice',
          eliminated: true,
          roll: 4,
          riskLevelBefore: 5,
        }}
      />,
    );
    expect(screen.getByText(/Alice rolled 4/)).toBeInTheDocument();
    expect(screen.getByText(/ELIMINATED/)).toBeInTheDocument();
  });

  it('renders survival text for spin_result with eliminated=false', () => {
    render(
      <ActionLog
        lastAction={{
          type: 'spin_result',
          spinTargetName: 'Bob',
          eliminated: false,
          roll: 1,
          riskLevelBefore: 2,
        }}
      />,
    );
    expect(screen.getByText(/Bob rolled 1/)).toBeInTheDocument();
    expect(screen.getByText(/SURVIVED/)).toBeInTheDocument();
  });

  it('renders bluff_resolved with bluffCorrect=true', () => {
    render(
      <ActionLog
        lastAction={{
          type: 'bluff_resolved',
          bluffCorrect: true,
          spinTargetName: 'Carol',
          eliminated: false,
          roll: 2,
        }}
      />,
    );
    expect(screen.getByText(/Bluff was CORRECT/)).toBeInTheDocument();
  });

  it('renders bluff_resolved with bluffCorrect=false', () => {
    render(
      <ActionLog
        lastAction={{
          type: 'bluff_resolved',
          bluffCorrect: false,
          spinTargetName: 'Dan',
          eliminated: true,
          roll: 6,
        }}
      />,
    );
    expect(screen.getByText(/Bluff was WRONG/)).toBeInTheDocument();
  });

  it('renders card_played_online with shape + number', () => {
    render(
      <ActionLog
        lastAction={{
          type: 'card_played_online',
          playerName: 'Eve',
          card: { shape: 'circle', number: 3 },
        }}
      />,
    );
    expect(screen.getByText(/Eve played \(circle 3\)/)).toBeInTheDocument();
  });

  it('renders card_played_online with whot wildcard', () => {
    render(
      <ActionLog
        lastAction={{
          type: 'card_played_online',
          playerName: 'Frank',
          card: { shape: 'whot', number: 20 },
        }}
      />,
    );
    expect(screen.getByText(/WHOT 20/)).toBeInTheDocument();
  });

  it('renders round_win', () => {
    render(<ActionLog lastAction={{ type: 'round_win', winnerName: 'Grace' }} />);
    expect(screen.getByText(/Grace won the round/)).toBeInTheDocument();
  });

  it('renders game_over', () => {
    render(<ActionLog lastAction={{ type: 'game_over', winnerName: 'Hank' }} />);
    expect(screen.getByText(/GAME OVER/)).toBeInTheDocument();
    expect(screen.getByText(/Hank/)).toBeInTheDocument();
  });

  it('renders bluff_called with caller name', () => {
    render(
      <ActionLog
        lastAction={{ type: 'bluff_called', callerName: 'Ivy' }}
      />,
    );
    expect(screen.getByText(/Ivy called bluff/)).toBeInTheDocument();
  });

  it('renders disconnected', () => {
    render(<ActionLog lastAction={{ type: 'disconnected', playerName: 'Joe' }} />);
    expect(screen.getByText(/Joe disconnected/)).toBeInTheDocument();
  });
});
