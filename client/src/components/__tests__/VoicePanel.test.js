import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoicePanel, VoiceIndicator } from '../VoicePanel';

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

describe('VoicePanel — layout invariant (issue #102)', () => {
  // Voice toggling between idle/connecting/connected MUST NOT change
  // the wrapper slot's footprint. Anything that changes the slot's
  // width or display reflows the parent flex header and pushes the
  // top-right info HUD onto a new line.
  const widthOf = (el) => el?.style?.width;
  const displayOf = (el) => el?.style?.display;

  it('idle, connecting, and connected all share the same slot width and display', () => {
    const cases = [
      { props: { status: 'idle', muted: true, isConnected: false } },
      { props: { status: 'connecting', muted: true, isConnected: false } },
      { props: { status: 'connected', muted: false, isConnected: true } },
      { props: { status: 'connected', muted: true, isConnected: true } },
      { props: { status: 'error', error: 'Mic permission denied', muted: true, isConnected: false } },
    ];

    let baselineWidth = null;
    let baselineDisplay = null;
    for (const { props } of cases) {
      const { unmount, getByTestId } = render(
        <VoicePanel
          {...props}
          connect={() => {}}
          disconnect={() => {}}
          toggleMute={() => {}}
        />,
      );
      const slot = getByTestId('voice-panel-slot');
      const w = widthOf(slot);
      const d = displayOf(slot);
      expect(w).toBeTruthy();
      expect(d).toBe('flex');
      if (baselineWidth == null) {
        baselineWidth = w;
        baselineDisplay = d;
      } else {
        expect(w).toBe(baselineWidth);
        expect(d).toBe(baselineDisplay);
      }
      unmount();
    }
  });

  it('slot is flex-shrink: 0 so a wider parent never compresses it', () => {
    const { getByTestId } = render(
      <VoicePanel
        status="connected"
        muted={false}
        isConnected
        connect={() => {}}
        disconnect={() => {}}
        toggleMute={() => {}}
      />,
    );
    expect(getByTestId('voice-panel-slot').style.flexShrink).toBe('0');
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
