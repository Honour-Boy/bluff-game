import { RoleRevealOverlay, ROLE_META } from '../RoleRevealOverlay';
import { SpectatorGhostOverlays } from './SpectatorGhostOverlays';

export function RolePromptOverlays({
  showRoleReveal,
  myRole,
  barehandVisible = true,
  setRoleRevealSeen,
  saboteurAvailable,
  showRoleRevealBlock,
  setSaboteurOpen,
  saboteurOpen,
  alivePlayers,
  myPlayerId,
  handleSaboteurPick,
  saboteurBusy,
  amTargetMedic,
  medicPending,
  handleMedicDecide,
  medicDeciding,
  amTargetSniper,
  sniperPending,
  alivePlayersForSniper,
  sniperEligibleTargets,
  handleSniperRedirect,
  sniperDeciding,
  showSpectatorView,
  spectatingId,
  roomState,
  players,
  spectatedHand,
}) {
  return (
    <>
      {showRoleReveal && (
        <RoleRevealOverlay
          role={myRole}
          barehandVisible={barehandVisible}
          onComplete={() => setRoleRevealSeen(true)}
        />
      )}

      {saboteurAvailable && !showRoleRevealBlock && (
        <button
          onClick={() => setSaboteurOpen(true)}
          style={{
            position: 'fixed',
            bottom: 90,
            right: 12,
            padding: '12px 16px',
            minHeight: 44,
            background: 'rgba(122,60,255,0.12)',
            border: `1px solid ${ROLE_META.saboteur.color}`,
            borderRadius: 'var(--radius)',
            color: ROLE_META.saboteur.color,
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 13,
            letterSpacing: '0.1em',
            cursor: 'pointer',
            boxShadow: `0 0 12px ${ROLE_META.saboteur.color}33`,
            zIndex: 8200,
          }}
          title="Saboteur â€” silently move a random card from your hand into another player's hand. Once per game."
        >
          ðŸ•¶ SABOTAGE
        </button>
      )}

      {saboteurOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 8950,
            padding: 24,
          }}
        >
          <div className="card fade-in" style={{ maxWidth: 380, width: '100%', textAlign: 'center', padding: '24px 20px', border: `1px solid ${ROLE_META.saboteur.color}` }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: '0.12em', color: ROLE_META.saboteur.color, marginBottom: 6 }}>
              SABOTAGE
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 18, lineHeight: 1.5 }}>
              Pick a target. One random card will move from your hand into theirs. They won&apos;t be told.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginBottom: 14 }}>
              {alivePlayers.filter((player) => player.id !== myPlayerId).map((player) => (
                <button
                  key={player.id}
                  onClick={() => handleSaboteurPick(player.id)}
                  disabled={saboteurBusy}
                  style={{
                    padding: '12px 8px',
                    minHeight: 44,
                    background: 'var(--surface2)',
                    border: `1px solid ${ROLE_META.saboteur.color}66`,
                    borderRadius: 6,
                    color: 'var(--text)',
                    cursor: saboteurBusy ? 'wait' : 'pointer',
                    fontSize: 12,
                    letterSpacing: '0.04em',
                  }}
                >
                  {player.username}
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>ðŸƒ {player.handSize ?? '?'}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setSaboteurOpen(false)}
              disabled={saboteurBusy}
              style={{
                fontSize: 11,
                color: 'var(--text-dim)',
                background: 'none',
                border: 'none',
                cursor: saboteurBusy ? 'wait' : 'pointer',
                textDecoration: 'underline',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {amTargetMedic && medicPending && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9100,
            padding: 24,
          }}
        >
          <div className="card fade-in" style={{ maxWidth: 380, width: '100%', textAlign: 'center', padding: '28px 24px', border: `1px solid ${ROLE_META.medic.color}` }}>
            <div style={{ fontSize: 10, color: ROLE_META.medic.color, letterSpacing: '0.18em', marginBottom: 12 }}>
              MEDIC â€” SAVE THEM?
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: 'var(--text)', marginBottom: 8, letterSpacing: '0.05em' }}>
              {medicPending.eliminatedPlayerName || 'A player'} is about to be eliminated.
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 22, lineHeight: 1.55 }}>
              Save them? You&apos;ll take +2 cards as the cost. This is your only Medic save â€” once per game.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="primary" disabled={medicDeciding} onClick={() => handleMedicDecide(true)} style={{ flex: 1, padding: '12px', minHeight: 44 }}>
                {medicDeciding ? 'â€¦' : 'âœš Save them'}
              </button>
              <button
                disabled={medicDeciding}
                onClick={() => handleMedicDecide(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  minHeight: 44,
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-dim)',
                  cursor: medicDeciding ? 'wait' : 'pointer',
                  fontSize: 13,
                }}
              >
                Let them go
              </button>
            </div>
          </div>
        </div>
      )}

      {medicPending && !amTargetMedic && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            top: 'calc(38vh + 110px)',
            display: 'flex',
            justifyContent: 'center',
            zIndex: 8650,
            padding: '0 16px',
            pointerEvents: 'none',
          }}
        >
          <div className="card" style={{ maxWidth: 320, textAlign: 'center', padding: '14px 18px', border: `1px solid ${ROLE_META.medic.color}`, background: 'rgba(8,12,20,0.96)' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: ROLE_META.medic.color, marginBottom: 4 }}>
              MEDIC IS DECIDINGâ€¦
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {medicPending.eliminatedPlayerName || 'Someone'} hangs in the balance.
            </div>
          </div>
        </div>
      )}

      {amTargetSniper && sniperPending && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9100,
            padding: 24,
          }}
        >
          <div className="card fade-in" style={{ maxWidth: 420, width: '100%', textAlign: 'center', padding: '24px 20px', border: `1px solid ${ROLE_META.sniper.color}` }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: '0.12em', color: ROLE_META.sniper.color, marginBottom: 6 }}>
              SNIPER â€” REDIRECT THE SHOT?
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 18, lineHeight: 1.5 }}>
              Currently aimed at <strong style={{ color: 'var(--text)' }}>{sniperPending.originalSpinTargetName || 'someone'}</strong>.
              Pick a new target â€” Mirror holders are off-limits â€” or pass.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginBottom: 14 }}>
              {alivePlayersForSniper.map((player) => {
                const eligible = sniperEligibleTargets.includes(player.id);
                return (
                  <button
                    key={player.id}
                    onClick={() => eligible && handleSniperRedirect(player.id)}
                    disabled={!eligible || sniperDeciding}
                    style={{
                      padding: '12px 8px',
                      minHeight: 44,
                      background: eligible ? 'var(--surface2)' : 'rgba(40,40,40,0.4)',
                      border: `1px solid ${eligible ? `${ROLE_META.sniper.color}66` : 'var(--border)'}`,
                      borderRadius: 6,
                      color: eligible ? 'var(--text)' : 'var(--text-dim)',
                      cursor: !eligible ? 'not-allowed' : sniperDeciding ? 'wait' : 'pointer',
                      fontSize: 12,
                      letterSpacing: '0.04em',
                      opacity: eligible ? 1 : 0.45,
                    }}
                    title={!eligible ? 'Cannot redirect â€” Mirror holder or self.' : undefined}
                  >
                    {player.username}
                    {player.id === sniperPending.originalSpinTargetId && (
                      <div style={{ fontSize: 9, color: ROLE_META.sniper.color, marginTop: 3 }}>current target</div>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => handleSniperRedirect(null)}
              disabled={sniperDeciding}
              style={{
                fontSize: 11,
                color: 'var(--text-dim)',
                background: 'none',
                border: 'none',
                cursor: sniperDeciding ? 'wait' : 'pointer',
                textDecoration: 'underline',
              }}
            >
              Pass â€” let the original target spin
            </button>
          </div>
        </div>
      )}

      <SpectatorGhostOverlays
        showSpectatorView={showSpectatorView}
        spectatingId={spectatingId}
        roomState={roomState}
        players={players}
        medicPending={medicPending}
        sniperPending={sniperPending}
        spectatedHand={spectatedHand}
      />

      {sniperPending && !amTargetSniper && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            top: 'calc(38vh + 110px)',
            display: 'flex',
            justifyContent: 'center',
            zIndex: 8650,
            padding: '0 16px',
            pointerEvents: 'none',
          }}
        >
          <div className="card" style={{ maxWidth: 320, textAlign: 'center', padding: '14px 18px', border: `1px solid ${ROLE_META.sniper.color}`, background: 'rgba(20,4,8,0.96)' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: ROLE_META.sniper.color, marginBottom: 4 }}>
              REDIRECT INCOMINGâ€¦
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {sniperPending.originalSpinTargetName || 'Someone'} was the target.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
