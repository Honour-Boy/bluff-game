import { ActionLog } from '../ActionLog';
import { CardShape } from '../shared/CardShape';

export function RequiredCardPanel({ show, currentCardType }) {
  if (!show || !currentCardType) return null;

  return (
    <div className="card">
      <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 14 }}>
        REQUIRED CARD THIS TURN
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <CardShape type={currentCardType} size="md" />
        <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          The host has announced the required card type.
          <br />
          Players must play a card face-down, claiming it matches.
        </div>
      </div>
    </div>
  );
}

export function PlayerTurnActions({
  show,
  isFirstTurn,
  bluffUsedThisTurn,
  cardPlayedThisTurn,
  actionHint,
  callBluff,
  playCard,
  endTurn,
}) {
  if (!show) return null;

  return (
    <div className="card" style={{ border: '1px solid var(--warning)' }}>
      <div style={{ fontSize: 10, color: 'var(--warning)', letterSpacing: '0.12em', marginBottom: 14 }}>
        YOUR ACTIONS
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {!isFirstTurn && (
          <button
            className="danger"
            onClick={callBluff}
            disabled={bluffUsedThisTurn}
            style={{
              flex: 1,
              opacity: bluffUsedThisTurn ? 0.4 : 1,
              cursor: bluffUsedThisTurn ? 'not-allowed' : 'pointer',
            }}
          >
            Call Bluff
          </button>
        )}
        <button
          className="success"
          onClick={playCard}
          disabled={cardPlayedThisTurn}
          style={{
            flex: 1,
            opacity: cardPlayedThisTurn ? 0.4 : 1,
            cursor: cardPlayedThisTurn ? 'not-allowed' : 'pointer',
          }}
        >
          Play Card
        </button>
      </div>
      {cardPlayedThisTurn && (
        <button className="primary" onClick={endTurn} style={{ width: '100%', marginTop: 10 }}>
          End Turn
        </button>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 12 }}>
        {actionHint}
      </div>
    </div>
  );
}

export function BluffResolutionBanner({ show }) {
  if (!show) return null;

  return (
    <div
      style={{
        padding: '14px 16px',
        background: 'rgba(255,74,110,0.05)',
        border: '1px solid var(--accent2)',
        borderRadius: 'var(--radius)',
        fontSize: 12,
        color: 'var(--accent2)',
        textAlign: 'center',
      }}
    >
      Waiting for host to reveal the last card played...
    </div>
  );
}

export function SpinPendingPanel({
  isMySpinTurn,
  isSpinPending,
  isEliminated,
  spinTargetPlayer,
  playerSpin,
}) {
  if (isMySpinTurn && !isEliminated) {
    return (
      <div className="card" style={{ border: '1px solid var(--accent2)', textAlign: 'center' }}>
        <div style={{ fontSize: 10, color: 'var(--accent2)', letterSpacing: '0.12em', marginBottom: 14 }}>
          YOUR FATE AWAITS
        </div>
        <button
          className="danger"
          onClick={playerSpin}
          style={{ width: '100%', fontSize: 16, padding: '14px' }}
        >
          Pull the Trigger
        </button>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 12 }}>
          You must spin. Click to reveal your fate.
        </div>
      </div>
    );
  }

  if (!isSpinPending || isMySpinTurn || !spinTargetPlayer) return null;

  return (
    <div
      style={{
        padding: '14px 16px',
        background: 'rgba(255,74,110,0.05)',
        border: '1px solid var(--accent2)',
        borderRadius: 'var(--radius)',
        fontSize: 12,
        color: 'var(--accent2)',
        textAlign: 'center',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    >
      Waiting for <strong>{spinTargetPlayer.username}</strong> to pull the trigger...
    </div>
  );
}

export function PlayerActionLog({ lastAction }) {
  if (!lastAction) return null;
  return <ActionLog lastAction={lastAction} />;
}

export function LeaveGameButton({ roomState, leaveGame }) {
  return (
    <button
      onClick={() => {
        const phase = roomState?.phase;
        const isMidGame = !!phase && !['lobby', 'game_over'].includes(phase);
        if (isMidGame && !window.confirm(
          'Leave the game? You will forfeit and cannot rejoin this round.',
        )) return;
        leaveGame();
      }}
      style={{
        alignSelf: 'flex-start',
        fontSize: 11,
        color: 'var(--text-dim)',
        border: 'none',
        background: 'none',
        padding: 0,
        textDecoration: 'underline',
        cursor: 'pointer',
      }}
    >
      Leave game
    </button>
  );
}
