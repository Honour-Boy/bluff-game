import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RedemptionOverlay from '../RedemptionOverlay';

describe('RedemptionOverlay (#redemptionSpin)', () => {
  it('renders nothing without a redemption offer', () => {
    const { container } = render(<RedemptionOverlay redemption={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('offers the spin to the target player and fires onSpin on click', () => {
    const onSpin = vi.fn();
    render(
      <RedemptionOverlay
        redemption={{ playerId: 'me', playerName: 'Me', msRemaining: 30000 }}
        isMine
        onSpin={onSpin}
        busy={false}
      />,
    );
    const button = screen.getByRole('button', { name: /pull the trigger/i });
    fireEvent.click(button);
    expect(onSpin).toHaveBeenCalledTimes(1);
  });

  it('disables the button and shows a spinning state while busy', () => {
    render(
      <RedemptionOverlay
        redemption={{ playerId: 'me', playerName: 'Me', msRemaining: 30000 }}
        isMine
        onSpin={vi.fn()}
        busy
      />,
    );
    expect(screen.getByRole('button', { name: /spinning/i })).toBeDisabled();
  });

  it('shows a waiting notice (no button) to everyone else', () => {
    render(
      <RedemptionOverlay
        redemption={{ playerId: 'p2', playerName: 'Fallen Friend', msRemaining: 30000 }}
        isMine={false}
        onSpin={vi.fn()}
      />,
    );
    expect(screen.getByText(/Fallen Friend/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
