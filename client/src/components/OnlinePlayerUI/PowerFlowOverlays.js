import { useEffect } from 'react';
import { PowerCard, POWER_META } from '../shared/PowerCard';
import { ShapeIcon } from '../shared/ShapeIcon';
import { AnnouncementBanner } from '../shared/AnnouncementBanner';
import { buildAnnouncementBannerProps } from './helpers';

export function PowerFlowOverlays({
  showPowerPrompt,
  heldPowerCard,
  handleActivatePower,
  activating,
  handleSkipPower,
  peekedCard,
  powerEventQueue,
  consumePowerEvent,
  amSwapHolder,
  swapPickOptions,
  handleSwapPick,
  swapping,
  isSwapPending,
  players,
  swapHolderId,
  // (Role timing) hold announcements while the spin cylinder is still turning.
  holdForSpin = false,
}) {
  const event = Array.isArray(powerEventQueue) && powerEventQueue.length > 0 ? powerEventQueue[0] : null;
  const bannerModel = buildAnnouncementBannerProps(event);

  // #121: an event at the head that maps to no banner (unknown kind)
  // renders nothing by design — but it must still be consumed or it
  // would stall every banner queued behind it. Drop it so the queue
  // keeps moving. `consumePowerEvent` is a stable useCallback.
  // While a spin is animating we hold the WHOLE queue (don't even drop
  // unknown kinds) so order + timing are preserved until the spin resolves.
  const headId = event?.id || null;
  const renderable = !!bannerModel;
  useEffect(() => {
    if (!holdForSpin && headId && !renderable) consumePowerEvent?.();
  }, [holdForSpin, headId, renderable, consumePowerEvent]);

  return (
    <>
      {showPowerPrompt && heldPowerCard && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 8400,
            padding: 24,
          }}
        >
          <div
            className="card fade-in"
            style={{
              maxWidth: 360,
              width: '100%',
              textAlign: 'center',
              padding: '28px 24px',
              border: `1px solid ${POWER_META[heldPowerCard.power]?.color || 'var(--accent)'}`,
            }}
          >
            <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 14 }}>
              POWER CARD
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <PowerCard type={heldPowerCard.power} size="md" />
            </div>
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 22,
                letterSpacing: '0.08em',
                color: POWER_META[heldPowerCard.power]?.color || 'var(--accent)',
                marginBottom: 8,
              }}
            >
              Activate {POWER_META[heldPowerCard.power]?.label || heldPowerCard.power}?
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 20, lineHeight: 1.5 }}>
              {POWER_META[heldPowerCard.power]?.flavor || ''}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="primary" onClick={handleActivatePower} disabled={activating} style={{ flex: 1, padding: '12px' }}>
                {activating ? '…' : '⚡ Activate'}
              </button>
              <button
                onClick={handleSkipPower}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {peekedCard && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 8500,
            padding: 24,
          }}
        >
          <div
            className="card fade-in"
            style={{
              maxWidth: 320,
              width: '100%',
              textAlign: 'center',
              padding: '28px 24px',
              border: `1px solid ${POWER_META.peek.color}`,
            }}
          >
            <div style={{ fontSize: 10, color: POWER_META.peek.color, letterSpacing: '0.15em', marginBottom: 14 }}>
              PEEK · LAST PLAYED
            </div>
            {peekedCard?._empty || !peekedCard?.shape ? (
              <div style={{ fontSize: 14, color: 'var(--text-dim)', padding: '20px 0' }}>
                No card has been played yet this round.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '12px 0' }}>
                <div
                  style={{
                    width: 80,
                    height: 112,
                    background: 'var(--surface2)',
                    border: '2px solid var(--accent)',
                    borderRadius: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 0 20px rgba(232,255,74,0.2)',
                    animation: 'cardFlipIn 0.5s ease-out',
                  }}
                >
                  <ShapeIcon shape={peekedCard.shape} size={36} />
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: "'Bebas Neue', sans-serif" }}>
                    {peekedCard.shape === 'whot' ? 'WHOT' : peekedCard.number}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'capitalize' }}>
                  {peekedCard.shape === 'whot' ? 'Whot (wild)' : `${peekedCard.shape} ${peekedCard.number}`}
                </div>
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 16, fontStyle: 'italic' }}>
              Only you can see this. Closing in a moment...
            </div>
          </div>
        </div>
      )}

      {bannerModel && event && !holdForSpin && (
        <AnnouncementBanner
          key={event.id}
          kind={bannerModel.kind}
          title={bannerModel.title}
          subtitle={bannerModel.subtitle}
          playerName={bannerModel.playerName}
          onComplete={consumePowerEvent}
        />
      )}

      {amSwapHolder && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 8700,
            padding: 24,
          }}
        >
          <div
            className="card fade-in"
            style={{
              maxWidth: 420,
              width: '100%',
              textAlign: 'center',
              padding: '24px 20px',
              border: `1px solid ${POWER_META.swap.color}`,
            }}
          >
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: '0.12em', color: POWER_META.swap.color, marginBottom: 6 }}>
              SWAP — PICK A CARD
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 18, lineHeight: 1.5 }}>
              Choose blindly. The cards below are ALL face-down — no shapes, no names. Your played card will be swapped with the one you pick, then both reveal face-up.
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
                gap: 10,
                marginBottom: 16,
                maxHeight: '50vh',
                overflowY: 'auto',
                padding: 4,
              }}
            >
              {swapPickOptions.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--text-dim)', padding: 20 }}>
                  No cards in the played pile. Cancel & spin instead.
                </div>
              ) : swapPickOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleSwapPick(option.id)}
                  disabled={swapping}
                  style={{
                    width: 56,
                    height: 80,
                    background: 'linear-gradient(160deg, #14141a 0%, #08080a 100%)',
                    border: `1.5px solid ${POWER_META.swap.color}66`,
                    borderRadius: 6,
                    cursor: swapping ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: `${POWER_META.swap.color}aa`,
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 18,
                    letterSpacing: '0.1em',
                    boxShadow: `inset 0 0 12px ${POWER_META.swap.color}22`,
                    transition: 'transform 0.1s, border-color 0.1s',
                  }}
                  onMouseEnter={(eventTarget) => {
                    if (!swapping) {
                      eventTarget.currentTarget.style.borderColor = POWER_META.swap.color;
                      eventTarget.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(eventTarget) => {
                    eventTarget.currentTarget.style.borderColor = `${POWER_META.swap.color}66`;
                    eventTarget.currentTarget.style.transform = 'none';
                  }}
                >
                  ?
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic' }}>
              {swapping ? 'Swapping…' : 'Tap any card to swap.'}
            </div>
          </div>
        </div>
      )}

      {isSwapPending && !amSwapHolder && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 8650,
            padding: 24,
            pointerEvents: 'none',
          }}
        >
          <div className="card" style={{ maxWidth: 320, textAlign: 'center', padding: '20px 24px', border: `1px solid ${POWER_META.swap.color}` }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: '0.12em', color: POWER_META.swap.color, marginBottom: 8 }}>
              SWAP IN PROGRESS
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {players?.find((player) => player.id === swapHolderId)?.username || 'Player'} is choosing a card…
            </div>
          </div>
        </div>
      )}
    </>
  );
}
