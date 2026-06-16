import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PactOfferOverlay } from '../PactOfferOverlay';
import { PactVolunteerOverlay } from '../PactVolunteerOverlay';
import { PactSelectorOverlay } from '../PactSelectorOverlay';

afterEach(() => { vi.useRealTimers(); });

describe('PactOfferOverlay', () => {
  it('shows the proposer and routes accept/refuse', () => {
    const onRespond = vi.fn(() => Promise.resolve());
    render(<PactOfferOverlay selectorName="Alice" onRespond={onRespond} />);
    expect(screen.getByText(/A PACT IS OFFERED/)).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    fireEvent.click(screen.getByText('ACCEPT'));
    expect(onRespond).toHaveBeenCalledWith(true);
  });

  it('refuse passes false', () => {
    const onRespond = vi.fn(() => Promise.resolve());
    render(<PactOfferOverlay selectorName="Alice" onRespond={onRespond} />);
    fireEvent.click(screen.getByText('REFUSE'));
    expect(onRespond).toHaveBeenCalledWith(false);
  });
});

describe('PactVolunteerOverlay', () => {
  it('renders nothing without a prompt', () => {
    const { container } = render(<PactVolunteerOverlay prompt={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the partner and volunteers on click', () => {
    const onVolunteer = vi.fn(() => Promise.resolve());
    const onDismiss = vi.fn();
    render(
      <PactVolunteerOverlay
        prompt={{ spinTargetName: 'Bob', deadline: Date.now() + 6000 }}
        onVolunteer={onVolunteer}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText(/TAKE THE BULLET/)).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/VOLUNTEER/));
    expect(onVolunteer).toHaveBeenCalled();
  });

  it('auto-dismisses on expiry', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <PactVolunteerOverlay
        prompt={{ spinTargetName: 'Bob', deadline: Date.now() + 1000 }}
        onVolunteer={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    act(() => { vi.advanceTimersByTime(1300); });
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe('PactSelectorOverlay', () => {
  it('lists candidate partners and picks one', () => {
    const onChoose = vi.fn(() => Promise.resolve());
    const onDismiss = vi.fn();
    render(
      <PactSelectorOverlay
        players={[{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }]}
        onChoose={onChoose}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText(/FORGE A PACT/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Bob'));
    expect(onChoose).toHaveBeenCalledWith('p2');
  });
});
