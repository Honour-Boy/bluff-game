import { ROLE_META } from '../RoleRevealOverlay';

export function SpectatorGhostOverlays({
  showSpectatorView,
  spectatingId,
  roomState,
  players,
  medicPending,
  sniperPending,
  spectatedHand,
}) {
  if (!showSpectatorView || !spectatingId) return null;

  const promptTarget = roomState?.currentPromptTarget;
  const targetPlayer = players?.find((player) => player.id === spectatingId);

  return (
    <>
      {(() => {
        if (!promptTarget || promptTarget.playerId !== spectatingId) return null;

        const ghostFrame = {
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.78)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9050,
          padding: 24,
          pointerEvents: 'none',
        };

        if (promptTarget.kind === 'medic_save_pending' && medicPending) {
          return (
            <div style={ghostFrame} data-testid="spectator-ghost-medic">
              <div className="card" style={{ maxWidth: 380, width: '100%', textAlign: 'center', padding: '28px 24px', border: `1px solid ${ROLE_META.medic.color}`, opacity: 0.55 }}>
                <div style={{ fontSize: 10, color: ROLE_META.medic.color, letterSpacing: '0.18em', marginBottom: 8 }}>
                  👁 SPECTATING · {targetPlayer?.username || 'Player'}
                </div>
                <div style={{ fontSize: 10, color: ROLE_META.medic.color, letterSpacing: '0.18em', marginBottom: 12 }}>
                  MEDIC - SAVE THEM?
                </div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: 'var(--text)', marginBottom: 8, letterSpacing: '0.05em' }}>
                  {medicPending.eliminatedPlayerName || 'A player'} is about to be eliminated.
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>They are choosing whether to save them.</div>
              </div>
            </div>
          );
        }

        if (promptTarget.kind === 'sniper_redirect_pending' && sniperPending) {
          return (
            <div style={ghostFrame} data-testid="spectator-ghost-sniper">
              <div className="card" style={{ maxWidth: 420, width: '100%', textAlign: 'center', padding: '24px 20px', border: `1px solid ${ROLE_META.sniper.color}`, opacity: 0.55 }}>
                <div style={{ fontSize: 10, color: ROLE_META.sniper.color, letterSpacing: '0.18em', marginBottom: 8 }}>
                  👁 SPECTATING · {targetPlayer?.username || 'Player'}
                </div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: '0.12em', color: ROLE_META.sniper.color, marginBottom: 6 }}>
                  SNIPER - REDIRECT THE SHOT?
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Aimed at <strong style={{ color: 'var(--text)' }}>{sniperPending.originalSpinTargetName || 'someone'}</strong>. They are picking a new target.
                </div>
              </div>
            </div>
          );
        }

        return null;
      })()}
      {/* §3.2 - the hand-derived "activate power card?" ghost overlay was
          removed: it inferred a living opponent's held power card from their
          hand, which eliminated players may no longer see. */}
    </>
  );
}
