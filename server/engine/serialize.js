// ============================================================
// ENGINE — Public room serialisation (the only thing over the wire)
// ============================================================
// serializeRoom is the engine's privacy boundary. Hands, secret
// roles, and ability flags are gated to their owner. Spectators
// (eliminated players who picked a target) get the spectated hand
// + ghosted prompt target hint.

const { MODES } = require('./constants');

function serializeRoom(room, requestingPlayerId = null, opts = {}) {
  const isOnline = room.mode === MODES.ONLINE;
  const { spectatingTargetId = null } = opts;

  // Spectator gating (issue #81): a caller is treated as a spectator
  // ONLY if their own player record is eliminated / isSpectator.
  // Living players never receive `spectatedHand` or
  // `currentPromptTarget`, regardless of any client-side claim.
  const requestingPlayer = requestingPlayerId
    ? room.players.find(p => p.id === requestingPlayerId)
    : null;
  const isSpectatorCaller =
    !!requestingPlayer
    && (requestingPlayer.status === 'eliminated' || requestingPlayer.isSpectator);
  const spectatedPlayer =
    isOnline && isSpectatorCaller && spectatingTargetId
      ? room.players.find(p => p.id === spectatingTargetId) || null
      : null;
  const spectatedHand =
    spectatedPlayer && room.hands && spectatedPlayer.status !== 'eliminated'
      ? (room.hands.get(spectatingTargetId) || [])
      : undefined;
  let currentPromptTarget = null;
  if (isOnline && isSpectatorCaller) {
    if (room.phase === 'medic_pending' && room.pendingMedicSave) {
      currentPromptTarget = {
        playerId: room.pendingMedicSave.medicId,
        kind: 'medic_save_pending',
      };
    } else if (room.phase === 'sniper_pending' && room.pendingSniperRedirect) {
      currentPromptTarget = {
        playerId: room.pendingSniperRedirect.sniperId,
        kind: 'sniper_redirect_pending',
      };
    }
  }

  return {
    code: room.code,
    groupId: room.groupId || null,
    mode: room.mode,
    players: room.players.map(p => ({
      id: p.id,
      username: p.username,
      status: p.status,
      riskLevel: p.riskLevel,
      chamber: p.chamber,
      isSpectator: p.isSpectator,
      handSize: isOnline && room.hands ? (room.hands.get(p.id) || []).length : undefined,
      armedPowerCard: p.armedPowerCard
        ? { power: p.armedPowerCard.power }
        : null,
      role:
        p.id === requestingPlayerId
          ? (p.role || 'barehand')
          : (room.phase === 'game_over' ? (p.role || 'barehand') : null),
      medicAbilityAvailable: p.id === requestingPlayerId ? !!p.medicAbilityAvailable : undefined,
      saboteurAbilityAvailable: p.id === requestingPlayerId ? !!p.saboteurAbilityAvailable : undefined,
      sniperAbilityAvailable: p.id === requestingPlayerId ? !!p.sniperAbilityAvailable : undefined,
      hasBounty: !!p.hasBounty,
      consecutiveSurvivedSpins: p.consecutiveSurvivedSpins || 0,
      consecutiveCorrectBets: p.consecutiveCorrectBets || 0,
    })),
    turnOrder: room.turnOrder,
    currentTurnIndex: room.currentTurnIndex,
    currentPlayerId: room.turnOrder[room.currentTurnIndex] || null,
    currentCardType: room.currentCardType,
    currentCard: room.currentCard || null,
    phase: room.phase,
    roundNumber: room.roundNumber,
    lastAction: room.lastAction,
    bluffUsedThisTurn: room.bluffUsedThisTurn || false,
    cardPlayedThisTurn: room.cardPlayedThisTurn || false,
    bluffBlockedThisTurn: room.bluffBlockedThisTurn || false,
    spinTargetId: room.spinTargetId || null,
    isFirstTurn: room.isFirstTurn || false,
    deckSize: isOnline && room.deck ? room.deck.length : undefined,
    playedPileSize: isOnline && room.playedPile ? room.playedPile.length : undefined,
    discardPileSize: isOnline && room.discardPile ? room.discardPile.length : undefined,
    myHand: isOnline && requestingPlayerId && room.hands
      ? (room.hands.get(requestingPlayerId) || [])
      : undefined,
    spectatedHand,
    spectatedPlayerId: spectatedPlayer ? spectatingTargetId : undefined,
    currentPromptTarget,
    chatLog: room.chatLog || [],
    config: room.config || null,
    groupSettingsMeta: room.groupId ? (room.groupSettingsMeta || null) : null,
    swapHolderId: isOnline ? (room.swapHolderId || null) : undefined,
    swapPickOptions:
      isOnline
      && room.phase === 'swap_pending'
      && room.swapHolderId
      && requestingPlayerId === room.swapHolderId
      && Array.isArray(room.playedPile)
        ? room.playedPile.map(c => ({ id: c.id }))
        : undefined,
    pendingMedicSave: isOnline && room.pendingMedicSave
      ? {
          eliminatedPlayerId: room.pendingMedicSave.eliminatedPlayerId,
          eliminatedPlayerName: room.pendingMedicSave.eliminatedPlayerName,
          source: room.pendingMedicSave.source,
          amTargetMedic: requestingPlayerId === room.pendingMedicSave.medicId,
        }
      : null,
    pendingSniperRedirect: isOnline && room.pendingSniperRedirect
      ? {
          originalSpinTargetId: room.pendingSniperRedirect.originalSpinTargetId,
          originalSpinTargetName: room.pendingSniperRedirect.originalSpinTargetName,
          amTargetSniper: requestingPlayerId === room.pendingSniperRedirect.sniperId,
          eligibleTargetIds:
            requestingPlayerId === room.pendingSniperRedirect.sniperId
              ? room.pendingSniperRedirect.eligibleTargetIds
              : undefined,
        }
      : null,
    betting: isOnline && room.betting && !room.betting.closed
      ? {
          spinTargetId: room.betting.spinTargetId,
          eligibleIds: room.betting.eligibleIds,
          closesAt: room.betting.closesAt,
          myBet: requestingPlayerId
            ? (room.betting.bets[requestingPlayerId] || null)
            : null,
        }
      : null,
    ghostVote: isOnline && room.ghostVote && !room.ghostVote.closed
      ? {
          closesAt: room.ghostVote.closesAt,
          optionIds: room.ghostVote.eligibleVoterIds.includes(requestingPlayerId)
            ? room.ghostVote.optionIds
            : null,
          myVote: requestingPlayerId
            ? (room.ghostVote.votes[requestingPlayerId] || null)
            : null,
          amGhostVoter: room.ghostVote.eligibleVoterIds.includes(requestingPlayerId),
        }
      : null,
    lastStand: isOnline && room.lastStand
      ? {
          finalistIds: room.lastStand.finalistIds,
          activeFinalistId: room.lastStand.activeFinalistId,
        }
      : null,
    speedModeMsRemaining:
      isOnline && room.config?.roomModifiers?.speedMode && room.speedModeDeadline
        ? Math.max(0, room.speedModeDeadline - Date.now())
        : undefined,
    suddenDeathCounter: isOnline ? (room.suddenDeathCounter || 0) : undefined,
    mirrorMatchActive: isOnline ? !!room.mirrorMatchActive : undefined,
  };
}

module.exports = {
  serializeRoom,
};
