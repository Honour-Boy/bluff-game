'use client';

import { useState } from 'react';
import { UserProfile } from '../screens/UserProfile';
import { VoicePanel } from '../VoicePanel';

// ─── Inline control icons (no emoji / font glyphs) ────────────────────────────
const _ic = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
const IconChat = () => (<svg {..._ic}><path d="M4 5h16v11H8l-4 4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>);
const IconRules = () => (<svg {..._ic}><path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>);
const IconBoard = () => (<svg {..._ic}><path d="M5 20V11M12 20V5M19 20v-6M3 20h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>);
const IconLeaveTable = () => (<svg {..._ic}><path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 12h10m0 0-3-3m3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>);
// #244 — host "Kick player": a person with a cross.
const IconKick = () => (<svg {..._ic}><circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" /><path d="M3.5 20c0-3.3 2.7-6 6-6 1.2 0 2.3.35 3.2.95" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M16 9l5 5m0-5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>);

// ─── SettingsGear — the global identity / settings menu ───────────────────────
// A small fixed gear button (top-right) available on EVERY screen once signed
// in: landing, groups, and in-game. Folds the player's identity, the music
// toggle, profile editing, and sign-out into one menu so the "main settings"
// are reachable everywhere. Icon-only trigger keeps the footprint tiny; the
// username shows inside the open menu. The in-game RoomHeader reserves top-right
// padding so this never overlaps the status tag / Rules.

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 2.6v2.3M12 19.1v2.3M21.4 12h-2.3M5 12H2.6M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6 17 17M7 7 5.4 5.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Prev / next track skip button — sits under the volume slider for the
// continuous playlist. Icon-only (matches the rest of the gear's SVG controls).
function TrackSkipButton({ dir, onClick }) {
  const isPrev = dir === 'prev';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isPrev ? 'Previous track' : 'Next track'}
      title={isPrev ? 'Previous track' : 'Next track'}
      disabled={!onClick}
      style={{
        width: 40, height: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--surface2)',
        border: '1px solid var(--border-lit)',
        borderRadius: 'var(--radius)',
        color: 'var(--text)',
        cursor: onClick ? 'pointer' : 'not-allowed',
        opacity: onClick ? 1 : 0.45,
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={(e) => { if (onClick) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; } }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-lit)'; e.currentTarget.style.color = 'var(--text)'; }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: 16, height: 16, flexShrink: 0 }}>
        {isPrev ? (
          <>
            <path d="M18 7v10l-7-5z" />
            <path d="M11 7v10l-7-5z" />
          </>
        ) : (
          <>
            <path d="M6 7v10l7-5z" />
            <path d="M13 7v10l7-5z" />
          </>
        )}
      </svg>
    </button>
  );
}

function SettingItem({ icon, label, onClick, accent = false, badge = null, disabled = false }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, width: '100%',
        padding: '9px 10px',
        background: 'none',
        border: '1px solid transparent',
        borderRadius: 'var(--radius)',
        color: accent ? 'var(--accent)' : 'var(--text-mid)',
        fontFamily: "'Cinzel', serif",
        fontSize: 11,
        letterSpacing: '0.06em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        textAlign: 'left',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--surface2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
    >
      {icon && <span aria-hidden="true" style={{ width: 16, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>}
      <span style={{ flex: 1 }}>{label}</span>
      {badge != null && (
        <span style={{
          minWidth: 18, height: 18, padding: '0 5px',
          borderRadius: 9, background: 'var(--accent2)', color: '#0a0a0b',
          fontSize: 10, fontWeight: 700, lineHeight: '18px', textAlign: 'center',
          flexShrink: 0,
        }}>{badge}</span>
      )}
    </button>
  );
}

export function SettingsGear({
  username,
  isGuest = false,
  musicEnabled = true,
  onToggleMusic,
  // (Module 5.3) master music volume (0..1) + setter for the in-menu slider.
  musicVolume = 1,
  onSetMusicVolume,
  // Continuous-playlist track skip controls (rendered beside the volume slider).
  onPrevTrack,
  onNextTrack,
  onSignOut,
  onSignOutGuest,
  onUpdateUsername,
  // ── Profile / cosmetics ───────────────────────────────────────────────────
  getProfileData,
  setCosmetic,
  // ── In-room game controls (Module 2) ──────────────────────────────────────
  // Ported here from the old bottom-right FAB. Rendered ONLY when `inRoom` is
  // true (i.e. the client is in a lobby OR an active game). Outside a room every
  // one of these is omitted, so the landing / groups gear is unchanged.
  inRoom = false,
  chatUnread = 0,
  onOpenChat,
  onOpenGameSettings,
  onOpenLeaderboard,
  // #244 — host-only Kick Player. Set only for the host, so its presence gates
  // the menu item (non-hosts never see it).
  onOpenKickPlayer,
  onLeaveTable,
  leaveDisabled = false,
  voice,
  // Extra top inset (px) pushed under any full-width band that occupies the very
  // top of the screen — currently the practice Power-Clinic progress bar, whose
  // right edge the gear button would otherwise overlap.
  topOffset = 0,
}) {
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // Nothing to manage if we have no identity at all.
  if (!username && !onSignOut && !onSignOutGuest) return null;

  return (
    <>
      {/* Hide the inline name on small screens so it never crowds the centred
          header status; the name still shows inside the opened menu. */}
      <style>{`@media (max-width: 520px){.settings-gear-name{display:none !important;}}`}</style>
      <div style={{
        position: 'fixed',
        top: `calc(max(12px, env(safe-area-inset-top, 0px)) + ${topOffset}px)`,
        right: 'max(12px, env(safe-area-inset-right, 0px))',
        transition: 'top 0.3s ease',
        // Above the table/header but below the controls modal (9300) so an open
        // modal cleanly covers it (avoids two top-right close targets on mobile).
        zIndex: 9200,
      }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Settings"
          title="Settings"
          style={{
            height: 40,
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '0 11px',
            color: open ? 'var(--accent)' : 'var(--text-mid)',
            border: `1px solid ${open ? 'var(--accent-dim)' : 'var(--border-lit)'}`,
            background: 'rgba(20,15,10,0.9)',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
            fontFamily: "'Cinzel', serif",
            fontSize: 10,
            letterSpacing: '0.08em',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <GearIcon />
          {username && (
            <span className="settings-gear-name" style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {username}
            </span>
          )}
          {isGuest && (
            <span style={{
              fontSize: 8,
              padding: '2px 6px',
              borderRadius: 2,
              background: 'rgba(200,146,46,0.1)',
              border: '1px solid rgba(200,146,46,0.35)',
              color: 'var(--accent)',
              letterSpacing: '0.14em',
            }}>
              GUEST
            </span>
          )}
        </button>

        {open && (
          <>
            {/* Click-away catcher */}
            <div
              onClick={() => setOpen(false)}
              aria-hidden="true"
              style={{ position: 'fixed', inset: 0 }}
            />
            <div
              role="menu"
              style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                minWidth: inRoom && voice ? 252 : 214,
                maxHeight: '78dvh', overflowY: 'auto',
                background: 'var(--surface)',
                border: '1px solid var(--border-lit)',
                borderRadius: 'var(--radius)',
                boxShadow: '0 14px 36px rgba(0,0,0,0.6)',
                padding: 6,
                display: 'flex', flexDirection: 'column', gap: 2,
              }}
            >
              <div style={{ padding: '8px 10px 9px', borderBottom: '1px solid var(--border)', marginBottom: 3 }}>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{username}</div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 2 }}>
                  {isGuest ? 'Guest player' : 'Signed in'}
                </div>
              </div>

              {/* ── In-room game controls (Module 2) — only inside a room ── */}
              {inRoom && (
                <>
                  <div style={{
                    padding: '4px 10px 5px', fontFamily: "'Space Mono', monospace",
                    fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                  }}>
                    Table
                  </div>
                  {onOpenChat && (
                    <SettingItem
                      icon={<IconChat />}
                      label="Chat"
                      badge={chatUnread > 99 ? '99+' : chatUnread > 0 ? String(chatUnread) : null}
                      onClick={() => { setOpen(false); onOpenChat(); }}
                    />
                  )}
                  {onOpenGameSettings && (
                    <SettingItem
                      icon={<IconRules />}
                      label="Game settings"
                      onClick={() => { setOpen(false); onOpenGameSettings(); }}
                    />
                  )}
                  {onOpenLeaderboard && (
                    <SettingItem
                      icon={<IconBoard />}
                      label="Leaderboard"
                      onClick={() => { setOpen(false); onOpenLeaderboard(); }}
                    />
                  )}
                  {onOpenKickPlayer && (
                    <SettingItem
                      icon={<IconKick />}
                      label="Kick player"
                      onClick={() => { setOpen(false); onOpenKickPlayer(); }}
                    />
                  )}
                  {onLeaveTable && (
                    <SettingItem
                      icon={<IconLeaveTable />}
                      label={leaveDisabled ? 'Leave (finish turn)' : 'Leave table'}
                      disabled={leaveDisabled}
                      onClick={() => { if (leaveDisabled) return; setOpen(false); onLeaveTable(); }}
                    />
                  )}
                  {voice && (
                    <div style={{ padding: '6px 8px 8px' }}>
                      <div style={{
                        fontFamily: "'Space Mono', monospace", fontSize: 8,
                        color: 'var(--text-dim)', letterSpacing: '0.18em',
                        textTransform: 'uppercase', marginBottom: 6, paddingLeft: 2,
                      }}>
                        Voice
                      </div>
                      <VoicePanel {...voice} />
                    </div>
                  )}
                  <div style={{ height: 1, background: 'var(--border)', margin: '3px 4px' }} />
                </>
              )}

              {!isGuest && onUpdateUsername && (
                <SettingItem
                  label="Edit profile"
                  onClick={() => { setOpen(false); setShowProfile(true); }}
                  icon={(
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  )}
                />
              )}

              {onSetMusicVolume && (
                <div style={{ padding: '6px 10px 8px' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontFamily: "'Space Mono', monospace", fontSize: 9,
                    color: 'var(--text-dim)', letterSpacing: '0.12em',
                    textTransform: 'uppercase', marginBottom: 5,
                  }}>
                    <span>Music volume</span>
                    <span>{Math.round((musicVolume ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round((musicVolume ?? 1) * 100)}
                    onChange={(e) => onSetMusicVolume((Number(e.target.value) || 0) / 100)}
                    aria-label="Music volume"
                    style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  {(onPrevTrack || onNextTrack) && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 9 }}>
                      <TrackSkipButton dir="prev" onClick={onPrevTrack} />
                      <span style={{
                        fontFamily: "'Space Mono', monospace", fontSize: 8,
                        color: 'var(--text-dim)', letterSpacing: '0.16em', textTransform: 'uppercase',
                      }}>Track</span>
                      <TrackSkipButton dir="next" onClick={onNextTrack} />
                    </div>
                  )}
                </div>
              )}

              {onToggleMusic && (
                <SettingItem
                  label={musicEnabled ? 'Music: On' : 'Music: Off'}
                  onClick={() => onToggleMusic()}
                  icon={musicEnabled ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M9 18V6l10-2v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="6.5" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.8" />
                      <circle cx="16.5" cy="16" r="2.5" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M9 18V6l10-2v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
                      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  )}
                />
              )}

              <div style={{ height: 1, background: 'var(--border)', margin: '3px 4px' }} />

              {isGuest && onSignOutGuest ? (
                <SettingItem label="Sign in to save →" accent onClick={() => { setOpen(false); onSignOutGuest(); }} />
              ) : onSignOut ? (
                <SettingItem
                  label="Leave Tavern"
                  onClick={() => { setOpen(false); onSignOut(); }}
                  icon={(
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M10 12h10m0 0-3-3m3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                />
              ) : null}
            </div>
          </>
        )}
      </div>

      {showProfile && (
        <UserProfile
          username={username}
          onUpdateUsername={onUpdateUsername}
          onClose={() => setShowProfile(false)}
          getProfileData={getProfileData}
          setCosmetic={setCosmetic}
        />
      )}
    </>
  );
}
