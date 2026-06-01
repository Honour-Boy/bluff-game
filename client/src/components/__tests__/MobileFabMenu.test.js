import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileFabMenu } from '../MobileFabMenu';

const baseVoice = {
  status: 'idle',
  error: null,
  muted: true,
  isConnected: false,
  connect: () => {},
  disconnect: () => {},
  toggleMute: () => {},
};

describe('MobileFabMenu — closed state', () => {
  it('renders only the FAB button by default', () => {
    render(
      <MobileFabMenu
        voice={baseVoice}
        onCentralize={() => {}}
        onOpenChat={() => {}}
      />,
    );
    expect(screen.getByTestId('mobile-fab-button')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-fab-sheet')).not.toBeInTheDocument();
  });

  it('shows the chat unread badge on the FAB', () => {
    render(
      <MobileFabMenu voice={baseVoice} onOpenChat={() => {}} chatUnread={4} />,
    );
    expect(screen.getByTestId('mobile-fab-unread')).toHaveTextContent('4');
  });

  it('clamps the unread badge at 99+', () => {
    render(
      <MobileFabMenu voice={baseVoice} onOpenChat={() => {}} chatUnread={250} />,
    );
    expect(screen.getByTestId('mobile-fab-unread')).toHaveTextContent('99+');
  });

  it('hides the badge when there is no unread chat', () => {
    render(
      <MobileFabMenu voice={baseVoice} onOpenChat={() => {}} />,
    );
    expect(screen.queryByTestId('mobile-fab-unread')).not.toBeInTheDocument();
  });
});

describe('MobileFabMenu — sheet interactions', () => {
  const renderOpen = (overrides = {}) => {
    const props = {
      voice: baseVoice,
      onCentralize: () => {},
      onOpenChat: () => {},
      ...overrides,
    };
    const utils = render(<MobileFabMenu {...props} />);
    fireEvent.click(screen.getByTestId('mobile-fab-button'));
    return utils;
  };

  it('opens the sheet when the FAB is tapped', () => {
    renderOpen();
    expect(screen.getByTestId('mobile-fab-sheet')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-fab-button')).not.toBeInTheDocument();
  });

  it('Centralize is hidden unless the table is scrollable', () => {
    renderOpen({ onCentralize: () => {}, scrollable: false });
    expect(screen.queryByText('Centralize')).not.toBeInTheDocument();
  });

  it('Centralize shows when scrollable, fires its callback, and closes the sheet', () => {
    const onCentralize = vi.fn();
    renderOpen({ onCentralize, scrollable: true });
    fireEvent.click(screen.getByText('Centralize'));
    expect(onCentralize).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('mobile-fab-sheet')).not.toBeInTheDocument();
  });

  it('Chat opens the chat panel and closes the sheet', () => {
    const onOpenChat = vi.fn();
    renderOpen({ onOpenChat });
    fireEvent.click(screen.getByText('Chat'));
    expect(onOpenChat).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('mobile-fab-sheet')).not.toBeInTheDocument();
  });

  it('Game settings fires its callback and closes the sheet', () => {
    const onOpenSettings = vi.fn();
    renderOpen({ onOpenSettings });
    fireEvent.click(screen.getByText('Game settings'));
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('mobile-fab-sheet')).not.toBeInTheDocument();
  });

  it('Leaderboard fires its callback and closes the sheet', () => {
    const onOpenLeaderboard = vi.fn();
    renderOpen({ onOpenLeaderboard });
    fireEvent.click(screen.getByText('Leaderboard'));
    expect(onOpenLeaderboard).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('mobile-fab-sheet')).not.toBeInTheDocument();
  });

  it('renders the inline VoicePanel inside the sheet (Join in idle state)', () => {
    renderOpen();
    expect(screen.getByText(/Join Voice/i)).toBeInTheDocument();
  });

  it('backdrop tap closes the sheet', () => {
    renderOpen();
    fireEvent.click(screen.getByTestId('mobile-fab-backdrop'));
    expect(screen.queryByTestId('mobile-fab-sheet')).not.toBeInTheDocument();
  });

  it('close button dismisses the sheet', () => {
    renderOpen();
    fireEvent.click(screen.getByRole('button', { name: /Close menu/i }));
    expect(screen.queryByTestId('mobile-fab-sheet')).not.toBeInTheDocument();
  });

  it('omits action items when their callback is not provided', () => {
    render(<MobileFabMenu voice={baseVoice} />);
    fireEvent.click(screen.getByTestId('mobile-fab-button'));
    expect(screen.queryByText('Centralize')).not.toBeInTheDocument();
    expect(screen.queryByText('Chat')).not.toBeInTheDocument();
    expect(screen.queryByText('Game settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Leaderboard')).not.toBeInTheDocument();
  });
});
