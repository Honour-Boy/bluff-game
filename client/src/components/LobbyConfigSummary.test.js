import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LobbyConfigSummary } from './LobbyConfigSummary';

function configWith({ powers = {}, risk = {}, room = {}, systems = {} } = {}) {
  return {
    powerCards: { enabled: powers, copiesPerDeck: 1 },
    riskModifiers: risk,
    roomModifiers: room,
    systems,
  };
}

describe('LobbyConfigSummary', () => {
  it('renders every section header even when nothing is enabled', () => {
    render(<LobbyConfigSummary config={configWith()} />);
    expect(screen.getByText('Power Cards')).toBeInTheDocument();
    expect(screen.getByText('Risk')).toBeInTheDocument();
    expect(screen.getByText('Room')).toBeInTheDocument();
    expect(screen.getByText('Systems')).toBeInTheDocument();
    // Sections without entries say "None".
    expect(screen.getAllByText('None')).toHaveLength(4);
  });

  it('joins enabled item labels for each section', () => {
    render(
      <LobbyConfigSummary
        config={configWith({
          powers: { shield: true, mirror: true },
          systems: { betting: true, lastStand: true },
        })}
      />,
    );
    expect(screen.getByText('Shield, Mirror')).toBeInTheDocument();
    expect(screen.getByText('Betting, Last Stand')).toBeInTheDocument();
    // Empty sections still say "None".
    expect(screen.getAllByText('None')).toHaveLength(2);
  });

  it('handles a null config without throwing', () => {
    render(<LobbyConfigSummary config={null} />);
    expect(screen.getByText('Power Cards')).toBeInTheDocument();
    expect(screen.getAllByText('None')).toHaveLength(4);
  });
});
