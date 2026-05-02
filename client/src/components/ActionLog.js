'use client';

export function ActionLog({ lastAction }) {
  if (!lastAction) return null;

  const messages = {
    spin: ({ targetName, eliminated, roll, riskLevel }) =>
      eliminated
        ? `💀 ${targetName} rolled ${roll} (risk ${riskLevel - 1}) — ELIMINATED`
        : `😮‍💨 ${targetName} rolled ${roll} (risk ${riskLevel - 1}) — SURVIVED. Risk now ${riskLevel}/6`,
    bluff_resolved: ({ bluffCorrect, spinTargetName, eliminated, roll }) =>
      bluffCorrect
        ? `✅ Bluff was CORRECT — ${spinTargetName} spun, rolled ${roll}, ${eliminated ? 'ELIMINATED' : 'survived'}`
        : `❌ Bluff was WRONG — ${spinTargetName} (accuser) spun, rolled ${roll}, ${eliminated ? 'ELIMINATED' : 'survived'}`,
    bluff_called: ({ callerName, callerId }) => callerName
      ? `⚠️ ${callerName} called bluff! Host: reveal the last card played.`
      : `⚠️ Bluff called! Host: reveal the last card played.`,
    spin_result: ({ spinTargetName, eliminated, roll, riskLevelBefore }) =>
      eliminated
        ? `💀 ${spinTargetName} rolled ${roll} (risk ${riskLevelBefore}/6) — ELIMINATED`
        : `😮‍💨 ${spinTargetName} rolled ${roll} (risk ${riskLevelBefore}/6) — SURVIVED`,
    card_played_online: ({ card, playerName }) => {
      const who = playerName ? `${playerName} played` : 'Card played';
      return card
        ? `🃏 ${who} (${card.shape === 'whot' ? 'WHOT' : card.shape} ${card.number})`
        : `🃏 ${who} a card.`;
    },
    card_played: ({ playerName }) =>
      playerName ? `🃏 ${playerName} played a card face-down.` : '🃏 Card played face-down.',
    round_win: ({ winnerName }) => `🏆 ${winnerName} won the round! All players redealt.`,
    game_over: ({ winnerName }) => `🎉 GAME OVER — ${winnerName} is the last player standing!`,
    continued: ({ playerId }) => `→ Player continued their turn.`,
    disconnected: ({ playerName }) => `🔌 ${playerName} disconnected — eliminated.`,
    // v2 Phase C — power-card outcome lines.
    bluff_blocked: () => `🛡 Shield blocked the bluff.`,
    assassin_strike: ({ eliminatedName, assassinHolderName }) => {
      if (eliminatedName && assassinHolderName) {
        return `🗡 ${assassinHolderName}'s Assassin struck — ${eliminatedName} eliminated.`;
      }
      return `🗡 Assassin struck.`;
    },
    swap_pending: () => `🔄 Swap activated — holder is choosing a card.`,
  };

  const fn = messages[lastAction.type];
  if (!fn) return null;

  const text = fn(lastAction);

  const colors = {
    spin: lastAction.eliminated ? 'var(--accent2)' : 'var(--alive)',
    spin_result: lastAction.eliminated ? 'var(--accent2)' : 'var(--alive)',
    bluff_resolved: lastAction.bluffCorrect ? 'var(--alive)' : 'var(--accent2)',
    bluff_called: 'var(--warning)',
    card_played_online: 'var(--text-dim)',
    card_played: 'var(--text-dim)',
    round_win: 'var(--accent)',
    game_over: 'var(--accent)',
    continued: 'var(--text-dim)',
    disconnected: 'var(--accent2)',
    bluff_blocked: 'var(--alive)',
    assassin_strike: 'var(--accent2)',
    swap_pending: 'var(--warning)',
  };

  const color = colors[lastAction.type] || 'var(--text-dim)';

  return (
    <div
      className="fade-in"
      style={{
        padding: '12px 16px',
        background: 'var(--surface2)',
        border: `1px solid ${color}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 'var(--radius)',
        color: color,
        fontSize: 12,
        letterSpacing: '0.04em',
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Last Event
      </div>
      {text}
    </div>
  );
}
