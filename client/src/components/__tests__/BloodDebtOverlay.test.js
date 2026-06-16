import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BloodDebtOverlay } from '../BloodDebtOverlay';

const prompt = {
  alivePlayerIds: ['p1', 'p2'],
  alivePlayerNames: [
    { id: 'p1', username: 'Alice' },
    { id: 'p2', username: 'Bob' },
  ],
  deadline: Date.now() + 10000,
};

afterEach(() => { vi.useRealTimers(); });

describe('BloodDebtOverlay', () => {
  it('renders nothing without a prompt', () => {
    const { container } = render(<BloodDebtOverlay prompt={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('lists the alive players and the heading', () => {
    render(<BloodDebtOverlay prompt={prompt} onPick={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText(/BLOOD DEBT/)).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('picking a player calls onPick then onDismiss', () => {
    const onPick = vi.fn();
    const onDismiss = vi.fn();
    render(<BloodDebtOverlay prompt={prompt} onPick={onPick} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText('Bob'));
    expect(onPick).toHaveBeenCalledWith('p2');
    expect(onDismiss).toHaveBeenCalled();
  });

  it('auto-dismisses once the deadline passes', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <BloodDebtOverlay
        prompt={{ ...prompt, deadline: Date.now() + 1000 }}
        onPick={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    act(() => { vi.advanceTimersByTime(1300); });
    expect(onDismiss).toHaveBeenCalled();
  });
});
