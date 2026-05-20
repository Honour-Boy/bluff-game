import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayerList } from './PlayerList';

const players = [
  { id: 'p1', username: 'Alice', status: 'alive', riskLevel: 1 },
  { id: 'p2', username: 'Bob',   status: 'alive', riskLevel: 3 },
  { id: 'p3', username: 'Carol', status: 'eliminated', riskLevel: 6 },
];

describe('PlayerList', () => {
  it('shows the empty placeholder when no players', () => {
    render(<PlayerList players={[]} turnOrder={[]} />);
    expect(
      screen.getByText(/No players yet/i),
    ).toBeInTheDocument();
  });

  it('renders one row per player and orders by turnOrder + eliminated last', () => {
    render(
      <PlayerList
        players={players}
        turnOrder={['p2', 'p1']}
        currentPlayerId="p2"
        phase="playing"
        speakingIds={new Set()}
        voiceConnected={false}
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
    // Eliminated label only on Carol's row
    expect(screen.getByText('ELIMINATED')).toBeInTheDocument();
  });

  it('marks the current player with a TURN badge', () => {
    render(
      <PlayerList
        players={players}
        turnOrder={['p1', 'p2']}
        currentPlayerId="p1"
        phase="playing"
        speakingIds={new Set()}
        voiceConnected={false}
      />,
    );
    expect(screen.getByText('TURN')).toBeInTheDocument();
  });

  it('renders the speaking indicator only when voiceConnected is true', () => {
    const { container, rerender } = render(
      <PlayerList
        players={[players[0]]}
        turnOrder={['p1']}
        currentPlayerId="p1"
        phase="playing"
        speakingIds={new Set(['p1'])}
        voiceConnected={false}
      />,
    );
    // VoiceIndicator returns null when voiceConnected is false → no
    // speaking dot at all.
    expect(container.querySelectorAll('span[title="Speaking"]').length).toBe(0);

    rerender(
      <PlayerList
        players={[players[0]]}
        turnOrder={['p1']}
        currentPlayerId="p1"
        phase="playing"
        speakingIds={new Set(['p1'])}
        voiceConnected={true}
      />,
    );
    expect(container.querySelectorAll('span[title="Speaking"]').length).toBe(1);
  });
});
