'use client';

// ─── MobileFabMenu — single FAB + popup sheet (mobile only) ───
// Issue #102 — replaces the scattered floating controls
// (Centralize, speech-mute, chat, settings, voice-join) with one
// non-obstructive button + a slide-up sheet exposing each. Sits
// at bottom-right above the safe-area inset; the sheet docks at
// the bottom of the viewport so it never overlaps the top-right
// info HUD.
//
// Controlled-by-parent: parent decides whether to render this at
// all (only when on the mobile breakpoint). Internal state is
// just the open/closed sheet.

import { useEffect, useMemo, useState } from 'react';
import { VoicePanel } from './VoicePanel';

// Mirror of ActiveConfigPanel's section labels — kept inline so
// the menu stays self-contained and we don't pull a second
// fixed-position component into the sheet.
const POWER_CARDS = [
  { key: 'shield',   label: 'Shield' },
  { key: 'mirror',   label: 'Mirror' },
  { key: 'swap',     label: 'Swap' },
  { key: 'peek',     label: 'Peek' },
  { key: 'freeze',   label: 'Freeze' },
  { key: 'assassin', label: 'Assassin' },
];
const RISK_MODS = [
  { key: 'doubleBarrel',    label: 'Double Barrel' },
  { key: 'russianRoulette', label: 'Russian Roulette' },
  { key: 'hotPotato',       label: 'Hot Potato' },
  { key: 'redemptionSpin',  label: 'Redemption Spin' },
];
const ROOM_MODS = [
  { key: 'speedMode',   label: 'Speed Mode' },
  { key: 'suddenDeath', label: 'Sudden Death' },
  { key: 'mirrorMatch', label: 'Mirror Match' },
];
const SYSTEMS = [
  { key: 'bounty',       label: 'Bounty' },
  { key: 'betting',      label: 'Betting' },
  { key: 'deadMansHand', label: "Dead Man's Hand" },
  { key: 'lastStand',    label: 'Last Stand' },
];

function pickEnabled(items, source) {
  if (!source) return [];
  return items.filter(({ key }) => !!source[key]);
}

function ItemButton({ icon, label, sub, onClick, badge }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        minHeight: 48,
        padding: '10px 12px',
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        color: 'var(--text)',
        fontSize: 13,
        letterSpacing: '0.04em',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        textTransform: 'none',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{icon}</span>
      <span style={{ flex: 1, textAlign: 'left' }}>
        <span style={{ display: 'block' }}>{label}</span>
        {sub && (
          <span style={{ display: 'block', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.06em', marginTop: 2 }}>
            {sub}
          </span>
        )}
      </span>
      {badge != null && (
        <span style={{
          minWidth: 20, height: 20, padding: '0 6px',
          borderRadius: 10,
          background: 'var(--accent2)', color: '#0a0a0b',
          fontSize: 11, fontWeight: 700,
          lineHeight: '20px', textAlign: 'center',
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}

export function MobileFabMenu({
  config,
  voice,
  speechEnabled,
  onCentralize,
  onToggleSpeech,
  onOpenChat,
  chatUnread = 0,
}) {
  const [open, setOpen] = useState(false);

  // Lock body scroll while the sheet is open so taps on items
  // don't accidentally scroll the underlying page.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const close = () => setOpen(false);

  const sections = useMemo(() => {
    if (!config) return [];
    return [
      { title: 'Power Cards', items: pickEnabled(POWER_CARDS, config?.powerCards?.enabled) },
      { title: 'Risk',        items: pickEnabled(RISK_MODS,   config?.riskModifiers) },
      { title: 'Room',        items: pickEnabled(ROOM_MODS,   config?.roomModifiers) },
      { title: 'Systems',     items: pickEnabled(SYSTEMS,     config?.systems) },
    ].filter((section) => section.items.length > 0);
  }, [config]);
  const totalEnabled = sections.reduce((sum, s) => sum + s.items.length, 0);

  const unreadLabel = chatUnread > 99 ? '99+' : chatUnread > 0 ? String(chatUnread) : null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={chatUnread > 0 ? `Open menu — ${chatUnread} unread chat` : 'Open menu'}
          aria-haspopup="dialog"
          aria-expanded={false}
          data-testid="mobile-fab-button"
          style={{
            position: 'fixed',
            right: 'max(16px, env(safe-area-inset-right))',
            bottom: 'max(16px, env(safe-area-inset-bottom))',
            zIndex: 9000,
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'var(--surface2)',
            border: '1px solid var(--accent)',
            color: 'var(--accent)',
            fontSize: 22,
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            WebkitTapHighlightColor: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          ☰
          {unreadLabel && (
            <span
              data-testid="mobile-fab-unread"
              style={{
                position: 'absolute', top: -4, right: -4,
                minWidth: 20, height: 20, padding: '0 6px',
                borderRadius: 10,
                background: 'var(--accent2)', color: '#0a0a0b',
                fontSize: 11, fontWeight: 700,
                lineHeight: '20px', textAlign: 'center',
                boxShadow: '0 0 6px var(--accent2)',
              }}
            >
              {unreadLabel}
            </span>
          )}
        </button>
      )}

      {open && (
        <div
          onClick={close}
          aria-hidden="true"
          data-testid="mobile-fab-backdrop"
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 9050,
          }}
        />
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Game controls"
          data-testid="mobile-fab-sheet"
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9100,
            background: 'var(--surface)',
            borderTop: '1px solid var(--border)',
            borderLeft: '1px solid var(--border)',
            borderRight: '1px solid var(--border)',
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
            paddingLeft: 16,
            paddingRight: 16,
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 -12px 40px rgba(0,0,0,0.6)',
            WebkitOverflowScrolling: 'touch',
          }}
          // Prevent backdrop click-through when tapping inside the sheet.
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingTop: 14, paddingBottom: 12,
          }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 18, letterSpacing: '0.12em',
              color: 'var(--accent)',
            }}>
              CONTROLS
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              style={{
                background: 'none', border: 'none',
                color: 'var(--text-dim)', fontSize: 18,
                cursor: 'pointer',
                width: 44, height: 44,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginRight: -8,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              ✕
            </button>
          </div>

          {/* Action items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {onCentralize && (
              <ItemButton
                icon="↻"
                label="Centralize"
                sub="Centre on the table"
                onClick={() => { onCentralize(); close(); }}
              />
            )}
            {onOpenChat && (
              <ItemButton
                icon="💬"
                label="Chat"
                sub="Open room chat"
                onClick={() => { onOpenChat(); close(); }}
                badge={unreadLabel}
              />
            )}
            {onToggleSpeech && (
              <ItemButton
                icon={speechEnabled ? '🔊' : '🔇'}
                label={speechEnabled ? 'Mute announcements' : 'Unmute announcements'}
                sub="Spoken event narration"
                onClick={() => { onToggleSpeech(); }}
              />
            )}
          </div>

          {/* Voice — rendered inline. Joining/leaving is fully self-
              contained inside the slot so it cannot reflow anything
              behind the sheet (issue #102 invariant). */}
          {voice && (
            <div style={{ marginTop: 16 }}>
              <div style={{
                fontSize: 10, color: 'var(--text-dim)',
                letterSpacing: '0.12em', textTransform: 'uppercase',
                marginBottom: 8,
              }}>
                Voice
              </div>
              <VoicePanel {...voice} />
            </div>
          )}

          {/* Settings — surface the same data ActiveConfigPanel shows
              on desktop. Hidden when nothing is enabled. */}
          {totalEnabled > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{
                fontSize: 10, color: 'var(--text-dim)',
                letterSpacing: '0.12em', textTransform: 'uppercase',
                marginBottom: 8,
              }}>
                Settings · {totalEnabled} active
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sections.map((section) => (
                  <li key={section.title}>
                    <div style={{
                      fontSize: 10, color: 'var(--text-dim)',
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      marginBottom: 4,
                    }}>
                      {section.title}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {section.items.map((item) => (
                        <span
                          key={item.key}
                          style={{
                            padding: '2px 8px',
                            background: 'var(--surface2)',
                            border: '1px solid var(--border)',
                            borderRadius: 999,
                            color: 'var(--text)',
                            fontSize: 11,
                          }}
                        >
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}
