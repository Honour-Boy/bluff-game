import { ActionLog } from '../ActionLog';
import { CardShape } from '../shared/CardShape';

const cardStyle = {
  background: 'linear-gradient(160deg, var(--surface2) 0%, var(--surface) 100%)',
  border: '1px solid var(--border-lit)',
  borderRadius: 'var(--radius-lg)',
  padding: '16px 14px',
  boxShadow: '0 6px 18px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
};

export function RequiredCardPanel({ show, currentCardType }) {
  if (!show || !currentCardType) return null;

  return (
    <div style={cardStyle}>
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 8,
        color: 'var(--text-dim)',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        marginBottom: 14,
      }}>
        Required Card This Turn
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{
          padding: '8px',
          background: 'linear-gradient(160deg, rgba(30,22,14,0.9) 0%, rgba(16,12,8,0.9) 100%)',
          border: '1px solid var(--border-glow)',
          borderRadius: 4,
          boxShadow: '0 0 10px rgba(200,146,46,0.1)',
        }}>
          <CardShape type={currentCardType} size="md" />
        </div>
        <div style={{
          fontFamily: "'Crimson Text', serif",
          fontSize: 14,
          color: 'var(--text-dim)',
          lineHeight: 1.7,
          fontStyle: 'italic',
        }}>
          The proprietor has announced the required type.
          <br />
          Play a card face-down, claiming it matches.
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
    <div style={{
      ...cardStyle,
      border: '1px solid var(--border-glow)',
      background: 'linear-gradient(160deg, rgba(30,20,8,0.96) 0%, rgba(16,12,6,0.97) 100%)',
      boxShadow: '0 0 18px rgba(200,146,46,0.1), 0 6px 18px rgba(0,0,0,0.4)',
    }}>
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 8,
        color: 'var(--accent)',
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        marginBottom: 14,
        textShadow: '0 0 8px rgba(200,146,46,0.3)',
      }}>
        Your Actions
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {!isFirstTurn && (
          <button
            className="danger"
            onClick={callBluff}
            disabled={bluffUsedThisTurn}
            style={{
              flex: 1,
              padding: '13px',
              opacity: bluffUsedThisTurn ? 0.35 : 1,
              cursor: bluffUsedThisTurn ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Call Bluff
          </button>
        )}
        <button
          className="success"
          onClick={playCard}
          disabled={cardPlayedThisTurn}
          style={{
            flex: 1,
            padding: '13px',
            opacity: cardPlayedThisTurn ? 0.35 : 1,
            cursor: cardPlayedThisTurn ? 'not-allowed' : 'pointer',
          }}
        >
          Play Card
        </button>
      </div>
      {cardPlayedThisTurn && (
        <button className="primary" onClick={endTurn} style={{ width: '100%', marginTop: 10, padding: '13px' }}>
          End Turn
        </button>
      )}
      {actionHint && (
        <div style={{
          fontFamily: "'Crimson Text', serif",
          fontSize: 13,
          color: 'var(--text-dim)',
          marginTop: 12,
          fontStyle: 'italic',
        }}>
          {actionHint}
        </div>
      )}
    </div>
  );
}

export function BluffResolutionBanner({ show }) {
  if (!show) return null;

  return (
    <div style={{
      padding: '14px 16px',
      background: 'linear-gradient(160deg, rgba(30,8,8,0.97) 0%, rgba(16,5,5,0.97) 100%)',
      border: '1px solid rgba(155,28,28,0.5)',
      borderRadius: 'var(--radius-lg)',
      fontFamily: "'Crimson Text', serif",
      fontSize: 15,
      color: '#c85050',
      textAlign: 'center',
      fontStyle: 'italic',
    }}>
      Awaiting the proprietor to reveal the last card…
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
      <div style={{
        ...cardStyle,
        border: '1px solid rgba(155,28,28,0.6)',
        background: 'linear-gradient(160deg, rgba(40,8,8,0.97) 0%, rgba(20,4,4,0.97) 100%)',
        textAlign: 'center',
        boxShadow: '0 0 28px rgba(155,28,28,0.15), 0 6px 18px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 9,
          color: 'var(--accent2)',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          marginBottom: 16,
          opacity: 0.9,
        }}>
          Your Fate Awaits
        </div>
        <button
          className="danger"
          onClick={playerSpin}
          style={{
            width: '100%',
            fontSize: 14,
            padding: '16px',
            letterSpacing: '0.16em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
            <circle cx="12" cy="12" r="3" fill="currentColor"/>
            <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
            <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
            <circle cx="5" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="19" cy="12" r="1.5" fill="currentColor"/>
          </svg>
          Pull the Trigger
        </button>
        <div style={{
          fontFamily: "'Crimson Text', serif",
          fontSize: 13,
          color: 'var(--text-dim)',
          marginTop: 12,
          fontStyle: 'italic',
        }}>
          You must face the revolver. Click to reveal your fate.
        </div>
      </div>
    );
  }

  if (!isSpinPending || isMySpinTurn || !spinTargetPlayer) return null;

  return (
    <div style={{
      padding: '14px 16px',
      background: 'rgba(155,28,28,0.07)',
      border: '1px solid rgba(155,28,28,0.35)',
      borderRadius: 'var(--radius-lg)',
      fontFamily: "'Crimson Text', serif",
      fontSize: 15,
      color: '#c85050',
      textAlign: 'center',
      fontStyle: 'italic',
      animation: 'pulse 1.8s ease-in-out infinite',
    }}>
      Awaiting <strong style={{ fontStyle: 'normal', fontFamily: "'Cinzel', serif", fontSize: 13 }}>{spinTargetPlayer.username}</strong> to pull the trigger…
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
          'Leave the table? You will forfeit and cannot rejoin this round.',
        )) return;
        leaveGame();
      }}
      style={{
        display: 'block',
        margin: '4px auto 16px',
        fontFamily: "'Cinzel', serif",
        fontSize: 9,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--text-dim)',
        border: 'none',
        background: 'none',
        padding: '4px 8px',
        textDecoration: 'underline',
        cursor: 'pointer',
        opacity: 0.6,
      }}
    >
      Leave Table
    </button>
  );
}
