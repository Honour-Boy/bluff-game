import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoicePanel, VoiceIndicator } from './VoicePanel';

describe('VoicePanel', () => {
  it('renders the join button in idle state', () => {
    const connect = vi.fn();
    render(
      <VoicePanel
        status="idle"
        muted
        isConnected={false}
        connect={connect}
        disconnect={() => {}}
        toggleMute={() => {}}
      />,
    );
    const btn = screen.getByRole('button', { name: /Join Voice/i });
    fireEvent.click(btn);
    expect(connect).toHaveBeenCalledOnce();
  });

  it('shows the error message in error state', () => {
    render(
      <VoicePanel
        status="error"
        error="Mic permission denied"
        muted
        isConnected={false}
        connect={() => {}}
        disconnect={() => {}}
        toggleMute={() => {}}
      />,
    );
    expect(screen.getByText('Mic permission denied')).toBeInTheDocument();
  });

  it('renders connecting placeholder', () => {
    render(
      <VoicePanel
        status="connecting"
        muted
        isConnected={false}
        connect={() => {}}
        disconnect={() => {}}
        toggleMute={() => {}}
      />,
    );
    // Note: the panel uses a unicode ellipsis character (…) not three dots.
    expect(screen.getByText(/Connecting/)).toBeInTheDocument();
  });

  it('toggles mute when connected and muted', () => {
    const toggleMute = vi.fn();
    render(
      <VoicePanel
        status="connected"
        muted
        isConnected
        connect={() => {}}
        disconnect={() => {}}
        toggleMute={toggleMute}
      />,
    );
    fireEvent.click(screen.getByText(/Muted/));
    expect(toggleMute).toHaveBeenCalledOnce();
  });

  it('shows mic on when unmuted, leave button calls disconnect', () => {
    const disconnect = vi.fn();
    render(
      <VoicePanel
        status="connected"
        muted={false}
        isConnected
        connect={() => {}}
        disconnect={disconnect}
        toggleMute={() => {}}
      />,
    );
    expect(screen.getByText(/Mic ON/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Leave Voice/));
    expect(disconnect).toHaveBeenCalledOnce();
  });
});

describe('VoiceIndicator', () => {
  it('renders nothing when voice is not connected', () => {
    const { container } = render(
      <VoiceIndicator playerId="p1" speakingIds={new Set(['p1'])} voiceConnected={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a speaking dot when player is speaking', () => {
    const { container } = render(
      <VoiceIndicator playerId="p1" speakingIds={new Set(['p1'])} voiceConnected />,
    );
    expect(container.querySelector('span[title="Speaking"]')).toBeTruthy();
  });

  it('renders a quiet dot when player is not speaking', () => {
    const { container } = render(
      <VoiceIndicator playerId="p1" speakingIds={new Set(['p2'])} voiceConnected />,
    );
    expect(container.querySelector('span[title="Quiet"]')).toBeTruthy();
  });
});
