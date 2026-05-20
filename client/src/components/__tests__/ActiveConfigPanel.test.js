import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActiveConfigPanel } from '../ActiveConfigPanel';

function configWith({ powers = {}, risk = {}, room = {}, systems = {} } = {}) {
  return {
    powerCards: { enabled: powers, copiesPerDeck: 1 },
    riskModifiers: risk,
    roomModifiers: room,
    systems,
  };
}

describe('ActiveConfigPanel', () => {
  it('returns null when no config is provided', () => {
    const { container } = render(<ActiveConfigPanel config={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when nothing is enabled', () => {
    const { container } = render(<ActiveConfigPanel config={configWith()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a collapsed chip with the active count when something is enabled', () => {
    render(
      <ActiveConfigPanel
        config={configWith({
          powers: { shield: true, assassin: true },
          systems: { betting: true },
        })}
      />,
    );
    const chip = screen.getByRole('button', { name: /show active game settings/i });
    expect(chip).toHaveTextContent('3 active');
    expect(chip).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands into a sectioned list on click and lists each enabled item', () => {
    render(
      <ActiveConfigPanel
        config={configWith({
          powers: { shield: true, assassin: true },
          risk: { russianRoulette: true },
          systems: { betting: true, lastStand: true },
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /show active game settings/i }));

    const region = screen.getByRole('region', { name: /active game settings/i });
    expect(region).toBeInTheDocument();
    // Each enabled item appears in the open list.
    expect(screen.getByText('Shield')).toBeInTheDocument();
    expect(screen.getByText('Assassin')).toBeInTheDocument();
    expect(screen.getByText('Russian Roulette')).toBeInTheDocument();
    expect(screen.getByText('Betting')).toBeInTheDocument();
    expect(screen.getByText('Last Stand')).toBeInTheDocument();
    // Disabled items do not appear.
    expect(screen.queryByText('Mirror')).not.toBeInTheDocument();
    expect(screen.queryByText('Bounty')).not.toBeInTheDocument();
  });

  it('omits sections that have no enabled items', () => {
    render(
      <ActiveConfigPanel
        config={configWith({ systems: { betting: true } })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /show active game settings/i }));
    expect(screen.getByText('Systems')).toBeInTheDocument();
    expect(screen.queryByText('Power Cards')).not.toBeInTheDocument();
    expect(screen.queryByText('Risk')).not.toBeInTheDocument();
    expect(screen.queryByText('Room')).not.toBeInTheDocument();
  });

  it('collapses back to the chip when the close button is clicked', () => {
    render(
      <ActiveConfigPanel config={configWith({ systems: { betting: true } })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /show active game settings/i }));
    expect(screen.getByRole('region', { name: /active game settings/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /hide active settings/i }));
    expect(screen.queryByRole('region', { name: /active game settings/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show active game settings/i })).toBeInTheDocument();
  });

  it('counts items across all four sections in the chip badge', () => {
    render(
      <ActiveConfigPanel
        config={configWith({
          powers: { shield: true, mirror: true },
          risk: { russianRoulette: true, hotPotato: true },
          room: { speedMode: true },
          systems: { betting: true, lastStand: true, bounty: true },
        })}
      />,
    );
    expect(screen.getByRole('button')).toHaveTextContent('8 active');
  });
});
