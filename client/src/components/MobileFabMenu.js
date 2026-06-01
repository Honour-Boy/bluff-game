'use client';

// ─── MobileFabMenu — single FAB + popup sheet (mobile + desktop) ───
// Issue #102 / #146 — one non-obstructive button + a slide-up sheet that
// consolidates the in-game controls. Contents now:
//   • Centralize  — only when the table area is actually scrollable
//   • Chat
//   • Game settings — opens the host's config (editable) / read-only summary
//   • Leaderboard   — group standings (groups only)
//   • Leave table
//   • Voice (join/leave) — on every screen size
// Music is handled by the global settings gear (not here); spoken
// announcements were removed entirely.

import { useEffect, useState } from 'react';
import { VoicePanel } from './VoicePanel';

// ─── Inline SVG icons (no emoji — keeps the tavern look crisp) ────────────────
const ic = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
const IconMenu = () => (<svg {...ic}><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>);
const IconClose = () => (<svg {...ic} width={18} height={18}><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>);
const IconCentralize = () => (<svg {...ic}><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>);
const IconChat = () => (<svg {...ic}><path d="M4 5h16v11H8l-4 4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>);
const IconSettings = () => (<svg {...ic}><path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="9" cy="7" r="2.2" fill="var(--surface)" stroke="currentColor" strokeWidth="1.8" /><circle cx="15" cy="12" r="2.2" fill="var(--surface)" stroke="currentColor" strokeWidth="1.8" /><circle cx="8" cy="17" r="2.2" fill="var(--surface)" stroke="currentColor" strokeWidth="1.8" /></svg>);
const IconBoard = () => (<svg {...ic}><path d="M5 20V11M12 20V5M19 20v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M3 20h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>);
const IconLeave = () => (<svg {...ic}><path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 12h10m0 0-3-3m3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>);

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
  voice,
  onCentralize,
  onOpenChat,
  chatUnread = 0,
  onOpenSettings,
  onOpenLeaderboard,
  onLeaveTable,
  leaveDisabled = false,
  // On desktop the standalone VoicePanel used to live in the header; voice now
  // lives in this menu on every screen size, so this defaults on. #146
  showVoice = true,
  // Centralize only appears when the table area is genuinely scrollable — with
  // the fixed-height shell there is normally nothing to scroll. #compact
  scrollable = false,
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
          <IconMenu />
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
                background: 'var(--surface2)',
                border: '1px solid var(--border-lit)',
                borderRadius: 'var(--radius)',
                color: 'var(--text)',
                cursor: 'pointer',
                width: 40, height: 40,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <IconClose />
            </button>
          </div>

          {/* Action items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scrollable && onCentralize && (
              <ItemButton
                icon={<IconCentralize />}
                label="Centralize"
                sub="Scroll back to the table"
                onClick={() => { onCentralize(); close(); }}
              />
            )}
            {onOpenChat && (
              <ItemButton
                icon={<IconChat />}
                label="Chat"
                sub="Open room chat"
                onClick={() => { onOpenChat(); close(); }}
                badge={unreadLabel}
              />
            )}
            {onOpenSettings && (
              <ItemButton
                icon={<IconSettings />}
                label="Game settings"
                sub="Powers & house rules"
                onClick={() => { onOpenSettings(); close(); }}
              />
            )}
            {onOpenLeaderboard && (
              <ItemButton
                icon={<IconBoard />}
                label="Leaderboard"
                sub="Standings for this group"
                onClick={() => { onOpenLeaderboard(); close(); }}
              />
            )}
            {onLeaveTable && (
              <ItemButton
                icon={<IconLeave />}
                label="Leave table"
                sub={leaveDisabled ? 'Finish your turn first' : 'Forfeit and exit'}
                onClick={() => { if (leaveDisabled) return; close(); onLeaveTable(); }}
              />
            )}
          </div>

          {/* Voice — rendered inline. Joining/leaving is fully self-
              contained inside the slot so it cannot reflow anything
              behind the sheet (issue #102 invariant). */}
          {voice && showVoice && (
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
        </div>
      )}
    </>
  );
}
