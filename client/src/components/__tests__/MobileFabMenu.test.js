import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileFabMenu } from './MobileFabMenu';

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
        config={null}
        voice={baseVoice}
        speechEnabled
        onCentralize={() => {}}
        onToggleSpeech={() => {}}
        onOpenChat={() => {}}
      />,
    );
    expect(screen.getByTestId('mobile-fab-button')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-fab-sheet')).not.toBeInTheDocument();
  });

  it('shows the chat unread badge on the FAB', () => {
    render(
      <MobileFabMenu
        config={null}
        voice={baseVoice}
        speechEnabled
        onCentralize={() => {}}
        onToggleSpeech={() => {}}
        onOpenChat={() => {}}
        chatUnread={4}
      />,
    );
    expect(screen.getByTestId('mobile-fab-unread')).toHaveTextContent('4');
  });

  it('clamps the unread badge at 99+', () => {
    render(
      <MobileFabMenu
        config={null}
        voice={baseVoice}
        speechEnabled
        onCentralize={() => {}}
        onToggleSpeech={() => {}}
        onOpenChat={() => {}}
        chatUnread={250}
      />,
    );
    expect(screen.getByTestId('mobile-fab-unread')).toHaveTextContent('99+');
  });

  it('hides the badge when there is no unread chat', () => {
    render(
      <MobileFabMenu
        config={null}
        voice={baseVoice}
        speechEnabled
        onCentralize={() => {}}
        onToggleSpeech={() => {}}
        onOpenChat={() => {}}
      />,
    );
    expect(screen.queryByTestId('mobile-fab-unread')).not.toBeInTheDocument();
  });
});

describe('MobileFabMenu — sheet interactions', () => {
  const renderOpen = (overrides = {}) => {
    const props = {
      config: null,
      voice: baseVoice,
      speechEnabled: true,
      onCentralize: () => {},
      onToggleSpeech: () => {},
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

  it('Centralize fires its callback and closes the sheet', () => {
    const onCentralize = vi.fn();
    renderOpen({ onCentralize });
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

  it('Speech toggle calls callback and keeps the sheet open', () => {
    const onToggleSpeech = vi.fn();
    renderOpen({ onToggleSpeech, speechEnabled: true });
    fireEvent.click(screen.getByText(/Mute announcements/i));
    expect(onToggleSpeech).toHaveBeenCalledOnce();
    expect(screen.getByTestId('mobile-fab-sheet')).toBeInTheDocument();
  });

  it('renders the inline VoicePanel inside the sheet (Join in idle state)', () => {
    renderOpen();
    expect(screen.getByText(/Join Voice/i)).toBeInTheDocument();
  });

  it('shows enabled active settings as chips when config has any flags on', () => {
    const config = {
      powerCards: { enabled: { shield: true, mirror: false } },
      riskModifiers: { russianRoulette: true },
      roomModifiers: {},
      systems: { betting: true },
    };
    renderOpen({ config });
    expect(screen.getByText(/Settings · 3 active/i)).toBeInTheDocument();
    expect(screen.getByText('Shield')).toBeInTheDocument();
    expect(screen.queryByText('Mirror')).not.toBeInTheDocument();
    expect(screen.getByText('Russian Roulette')).toBeInTheDocument();
    expect(screen.getByText('Betting')).toBeInTheDocument();
  });

  it('hides the Settings section when no flags are enabled', () => {
    renderOpen({ config: { powerCards: { enabled: {} }, riskModifiers: {}, roomModifiers: {}, systems: {} } });
    expect(screen.queryByText(/Settings ·/i)).not.toBeInTheDocument();
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
    render(
      <MobileFabMenu
        config={null}
        voice={baseVoice}
        speechEnabled
      />,
    );
    fireEvent.click(screen.getByTestId('mobile-fab-button'));
    expect(screen.queryByText('Centralize')).not.toBeInTheDocument();
    expect(screen.queryByText('Chat')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mute announcements/i)).not.toBeInTheDocument();
  });
});
