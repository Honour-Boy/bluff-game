import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CardHand } from '../CardHand';

const shapeCard = { id: 's1', shape: 'circle', number: 3 };
const powerCard = { id: 'p1', type: 'power', power: 'shield' };

describe('CardHand — power-card / shape-card click decoupling (#139)', () => {
  it('routes a power-card click to onPowerCardClick, never onCardClick', () => {
    const onCardClick = vi.fn();
    const onPowerCardClick = vi.fn();

    render(
      <CardHand
        hand={[shapeCard]}
        powerCardSlot={[powerCard]}
        selectedCardId={null}
        onCardClick={onCardClick}
        onPowerCardClick={onPowerCardClick}
      />,
    );

    fireEvent.click(screen.getByLabelText(/power card: shield/i));

    expect(onPowerCardClick).toHaveBeenCalledWith('p1');
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it('routes a shape-card click to onCardClick, never onPowerCardClick', () => {
    const onCardClick = vi.fn();
    const onPowerCardClick = vi.fn();

    render(
      <CardHand
        hand={[shapeCard]}
        powerCardSlot={[powerCard]}
        selectedCardId={null}
        onCardClick={onCardClick}
        onPowerCardClick={onPowerCardClick}
      />,
    );

    fireEvent.click(screen.getByText('3'));

    expect(onCardClick).toHaveBeenCalledWith('s1');
    expect(onPowerCardClick).not.toHaveBeenCalled();
  });

  it('does not fire either handler when not interactive', () => {
    const onCardClick = vi.fn();
    const onPowerCardClick = vi.fn();

    render(
      <CardHand
        hand={[shapeCard]}
        powerCardSlot={[powerCard]}
        onCardClick={onCardClick}
        onPowerCardClick={onPowerCardClick}
        interactive={false}
      />,
    );

    fireEvent.click(screen.getByLabelText(/power card: shield/i));
    fireEvent.click(screen.getByText('3'));

    expect(onCardClick).not.toHaveBeenCalled();
    expect(onPowerCardClick).not.toHaveBeenCalled();
  });

  it('shows a styled armed indicator (no crude "LOCK" text) for an armed power card', () => {
    render(
      <CardHand
        hand={[]}
        powerCardSlot={[{ ...powerCard, armed: true }]}
        onCardClick={vi.fn()}
        onPowerCardClick={vi.fn()}
      />,
    );

    // The crude text label is gone...
    expect(screen.queryByText('LOCK')).toBeNull();
    // ...replaced by an accessible armed badge.
    expect(screen.getByLabelText('Activated — awaiting trigger')).toBeInTheDocument();
  });

  it('does not invoke onPowerCardClick for an armed (locked) power card', () => {
    const onPowerCardClick = vi.fn();

    render(
      <CardHand
        hand={[]}
        powerCardSlot={[{ ...powerCard, armed: true }]}
        onCardClick={vi.fn()}
        onPowerCardClick={onPowerCardClick}
      />,
    );

    fireEvent.click(screen.getByLabelText(/power card: shield/i));
    expect(onPowerCardClick).not.toHaveBeenCalled();
  });
});
