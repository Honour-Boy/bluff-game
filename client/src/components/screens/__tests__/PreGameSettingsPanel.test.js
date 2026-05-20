import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreGameSettingsPanel, DEFAULT_V2_CONFIG } from '../PreGameSettingsPanel';

function renderPanel({ initialConfig = DEFAULT_V2_CONFIG } = {}) {
  const onChange = vi.fn();
  const utils = render(<PreGameSettingsPanel config={initialConfig} onChange={onChange} />);
  // Panel is collapsed by default; the in-lobby UX wants the toggles
  // visible immediately for tests too.
  fireEvent.click(screen.getByText(/V2 GAME SETTINGS/i));
  return { ...utils, onChange };
}

describe('PreGameSettingsPanel — Select All controls (#66)', () => {
  it('per-section "All" enables only that section', () => {
    const { onChange } = renderPanel();
    fireEvent.click(screen.getByLabelText('Enable all in POWER CARDS'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    // Every power-card flag flipped on.
    expect(Object.values(next.powerCards.enabled).every(Boolean)).toBe(true);
    // Other sections untouched (still all false from the default).
    expect(Object.values(next.riskModifiers).some(Boolean)).toBe(false);
    expect(Object.values(next.roomModifiers).some(Boolean)).toBe(false);
    expect(Object.values(next.systems).some(Boolean)).toBe(false);
  });

  it('per-section "None" disables only that section', () => {
    const allOn = {
      ...DEFAULT_V2_CONFIG,
      powerCards: {
        ...DEFAULT_V2_CONFIG.powerCards,
        enabled: Object.fromEntries(
          Object.keys(DEFAULT_V2_CONFIG.powerCards.enabled).map((k) => [k, true]),
        ),
      },
      systems: Object.fromEntries(
        Object.keys(DEFAULT_V2_CONFIG.systems).map((k) => [k, true]),
      ),
    };
    const { onChange } = renderPanel({ initialConfig: allOn });
    fireEvent.click(screen.getByLabelText('Disable all in POWER CARDS'));

    const next = onChange.mock.calls[0][0];
    expect(Object.values(next.powerCards.enabled).some(Boolean)).toBe(false);
    // Systems stay enabled — the button is scoped to its section.
    expect(Object.values(next.systems).every(Boolean)).toBe(true);
  });

  it('"Enable Everything" flips every toggle on across all sections', () => {
    const { onChange } = renderPanel();
    fireEvent.click(screen.getByLabelText('Enable everything'));

    const next = onChange.mock.calls[0][0];
    expect(Object.values(next.powerCards.enabled).every(Boolean)).toBe(true);
    expect(Object.values(next.riskModifiers).every(Boolean)).toBe(true);
    expect(Object.values(next.roomModifiers).every(Boolean)).toBe(true);
    expect(Object.values(next.systems).every(Boolean)).toBe(true);
  });

  it('"Disable Everything" flips every toggle off across all sections', () => {
    const allOn = {
      ...DEFAULT_V2_CONFIG,
      powerCards: {
        ...DEFAULT_V2_CONFIG.powerCards,
        enabled: Object.fromEntries(
          Object.keys(DEFAULT_V2_CONFIG.powerCards.enabled).map((k) => [k, true]),
        ),
      },
      riskModifiers: Object.fromEntries(
        Object.keys(DEFAULT_V2_CONFIG.riskModifiers).map((k) => [k, true]),
      ),
      roomModifiers: Object.fromEntries(
        Object.keys(DEFAULT_V2_CONFIG.roomModifiers).map((k) => [k, true]),
      ),
      systems: Object.fromEntries(
        Object.keys(DEFAULT_V2_CONFIG.systems).map((k) => [k, true]),
      ),
    };
    const { onChange } = renderPanel({ initialConfig: allOn });
    fireEvent.click(screen.getByLabelText('Disable everything'));

    const next = onChange.mock.calls[0][0];
    expect(Object.values(next.powerCards.enabled).some(Boolean)).toBe(false);
    expect(Object.values(next.riskModifiers).some(Boolean)).toBe(false);
    expect(Object.values(next.roomModifiers).some(Boolean)).toBe(false);
    expect(Object.values(next.systems).some(Boolean)).toBe(false);
  });
});

describe('PreGameSettingsPanel - group settings affordances', () => {
  it('shows the saved-settings indicator for persisted group rooms', () => {
    render(
      <PreGameSettingsPanel
        config={DEFAULT_V2_CONFIG}
        onChange={() => {}}
        isGroupRoom
        savedMeta={{
          updatedAt: '2026-05-15T20:00:00.000Z',
          updatedByUsername: 'HostUser',
        }}
      />,
    );

    expect(screen.getByText(/Settings saved - updated/i)).toBeInTheDocument();
    expect(screen.getByText(/@HostUser/)).toBeInTheDocument();
  });

  it('renders reset to defaults only for group rooms and routes through onChange', () => {
    const onChange = vi.fn();
    render(
      <PreGameSettingsPanel
        config={{
          ...DEFAULT_V2_CONFIG,
          powerCards: {
            ...DEFAULT_V2_CONFIG.powerCards,
            enabled: {
              ...DEFAULT_V2_CONFIG.powerCards.enabled,
              shield: true,
            },
          },
        }}
        onChange={onChange}
        isGroupRoom
      />,
    );

    fireEvent.click(screen.getByText(/V2 GAME SETTINGS/i));
    fireEvent.click(screen.getByRole('button', { name: /Reset to defaults/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      version: 1,
      powerCards: expect.objectContaining({
        enabled: expect.objectContaining({ shield: false }),
      }),
    }));
  });
});
