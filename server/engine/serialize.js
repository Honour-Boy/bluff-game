// ============================================================
// ENGINE - Public room serialisation (the only thing over the wire)
// ============================================================
// serializeRoom is the engine's privacy boundary. Hands, secret
// roles, and ability flags are gated to their owner. Spectators
// (eliminated players who picked a target) get the spectated hand
// + ghosted prompt target hint.

const { MODES, MEDIC_MAX_SAVES } = require('./constants');
const { isBarehandVisible } = require('./roles');
const { filterVisibleCosmetics } = require('./progression');

function serializeRoom(room, requestingPlayerId = null, opts = {}) {
  const isOnline = room.mode === MODES.ONLINE;

  // §3.2 Spectator anti-cheat lockout. Eliminated / dead players must NEVER
  // receive an opponent's hand. The old #81 "spectate one chosen player's hand"
  // feature is fully removed: `spectatedHand` is no longer emitted to anyone, so
  // there is no payload path that carries a living opponent's cards off-server.
  // `currentPromptTarget` (below) carries only a player id + prompt kind - no
  // card data - and stays gated to eliminated callers for the ghost overlays.
  const requestingPlayer = requestingPlayerId
    ? room.players.find(p => p.id === requestingPlayerId)
    : null;
  const isSpectatorCaller =
    !!requestingPlayer
    && (requestingPlayer.status === 'eliminated' || requestingPlayer.isSpectator);
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
    // Host tier (Progression & Covenant overhaul). Drives client tier badges,
    // config-panel gating, and gates the Covenant-only Pact / Blood Debt UI.
    // Defaults to 'streets' for rooms created before the tier rollout.
    tier: room.tier || 'streets',
    // Host identity. Exposed so clients can RE-DERIVE isHost on every state
    // push - host can change live (stand-in reclaim / hand-back / migration)
    // and that only arrives via room_state. `hostUserId` is the host's Supabase
    // id (same value the server compares in join_room); `amHost` is the
    // per-recipient convenience flag (only meaningful when a requestingPlayerId
    // was supplied, i.e. the per-socket online broadcast).
    hostUserId: room.hostUserId || null,
    amHost: requestingPlayerId != null ? (requestingPlayerId === room.hostUserId) : undefined,
    // Tutorial / Practice - flag the room so the client can brand it (and the
    // guided layer can key off it). Always present (false for normal rooms).
    isTutorial: !!room.isTutorial,
    // Which guided lesson this practice room is running ('basics' | 'powers'),
    // so the coach + intro can adapt. null outside tutorial rooms.
    tutorialLesson: room.isTutorial ? (room.tutorialLesson || 'basics') : null,
    // Whether the guided coaching layer is active. False = an uncoached practice
    // replay (plain game vs the bot); the client suppresses every guide overlay.
    // Defaults true for any tutorial room that never opted out. null outside.
    tutorialCoaching: room.isTutorial ? (room.tutorialCoaching !== false) : undefined,
    // (Module 5) True for the unguided "Just Practice with Bot" sandbox: an
    // uncoached room where the human is the LOCAL HOST and can toggle power cards.
    sandbox: !!room.sandbox,
    // Active scripted Power-Clinic drill (engine/tutorialScenarios.js). The
    // client coach keys off { power, actor, step } to show the before/after copy;
    // `lockBluff` disables the Call-Bluff button during own-turn drills. null
    // outside the clinic. No card data here - hands stay gated to their owner.
    tutorialScenario: room.isTutorial && room.tutorialScenario
      ? (room.tutorialScenario.tour
          // Spotlight "Show me around" tour instance - a different shape the
          // client tour layer keys off (step + stepIndex drive the Part-B beats).
          ? {
              tour: true,
              step: room.tutorialScenario.step,
              stepIndex: room.tutorialScenario.stepIndex,
              totalSteps: room.tutorialScenario.totalSteps,
              expect: room.tutorialScenario.expect || null,
              lockBluff: !!room.tutorialScenario.lockBluff,
            }
          : {
              index: room.tutorialScenario.index,
              power: room.tutorialScenario.power,
              actor: room.tutorialScenario.actor || 'player',
              step: room.tutorialScenario.step || 'intro',
              lockBluff: !!room.tutorialScenario.lockBluff,
              expect: room.tutorialScenario.expect || null,
              // (Module 4.1) Defensive drills first show a distinct "the bot is calling
              // your bluff" beat; the client coach keys off this to announce the
              // challenge BEFORE the defend window opens.
              challengeAnnounced: !!room.tutorialScenario.challengeAnnounced,
              total: room.tutorialScenario.total || null,
              playerStep: room.tutorialScenario.playerStep ?? null,
              playerTotal: room.tutorialScenario.playerTotal ?? null,
            })
      : null,
    // True once the clinic's final drill is done (drives the "you've learned the
    // powers" end screen). Only meaningful in a tutorial room.
    tutorialClinicComplete: room.isTutorial ? !!room.tutorialClinicComplete : undefined,
    // True once the spotlight tour's last instance is done (drives the tour's
    // congrats card). Only meaningful in a tutorial room.
    tourComplete: room.isTutorial ? !!room.tourComplete : undefined,
    players: room.players.map(p => ({
      id: p.id,
      username: p.username,
      status: p.status,
      riskLevel: p.riskLevel,
      chamber: p.chamber,
      isSpectator: p.isSpectator,
      // Tutorial bots are real seats; surface the flag so the UI can mark them.
      isBot: !!p.isBot,
      handSize: isOnline && room.hands ? (room.hands.get(p.id) || []).length : undefined,
      armedPowerCard: p.armedPowerCard
        ? { power: p.armedPowerCard.power }
        : null,
      role:
        p.id === requestingPlayerId
          ? (p.role || 'barehand')
          : (room.phase === 'game_over' ? (p.role || 'barehand') : null),
      // #120 - Medic save budget. Only exposed to its owner. Keep the
      // derived `medicAbilityAvailable` boolean so existing consumers
      // keep working; add the raw count + remaining for UI ("2 saves left").
      medicSavesUsed: p.id === requestingPlayerId ? (p.medicSavesUsed || 0) : undefined,
      medicSavesRemaining: p.id === requestingPlayerId ? Math.max(0, MEDIC_MAX_SAVES - (p.medicSavesUsed || 0)) : undefined,
      medicAbilityAvailable: p.id === requestingPlayerId ? (p.medicSavesUsed || 0) < MEDIC_MAX_SAVES : undefined,
      saboteurAbilityAvailable: p.id === requestingPlayerId ? !!p.saboteurAbilityAvailable : undefined,
      sniperAbilityAvailable: p.id === requestingPlayerId ? !!p.sniperAbilityAvailable : undefined,
      hasBounty: !!p.hasBounty,
      consecutiveSurvivedSpins: p.consecutiveSurvivedSpins || 0,
      consecutiveCorrectBets: p.consecutiveCorrectBets || 0,
      // #205 - equipped cosmetics (validated server-side at equip time).
      // Purely visual and PUBLIC: every viewer sees each player's real look
      // (their deck skin on their seat chip, the spinner's gun skin on the
      // cylinder) - showing off the unlocks IS the feature.
      cosmetics: p.cosmetics || null,
    })),
    turnOrder: room.turnOrder,
    currentTurnIndex: room.currentTurnIndex,
    currentPlayerId: room.turnOrder[room.currentTurnIndex] || null,
    // The immediately-next player within the current cycle. Under Roulette
    // Rotation the rest of the cycle stays concealed (the next cycle isn't
    // generated yet), so this is null on the final turn of a cycle - the next
    // player is a genuine surprise. The client reveals only this much.
    nextPlayerId: Array.isArray(room.turnOrder)
      ? (room.turnOrder[room.currentTurnIndex + 1] || null)
      : null,
    currentCardType: room.currentCardType,
    currentCard: room.currentCard || null,
    phase: room.phase,
    roundNumber: room.roundNumber,
    lastAction: room.lastAction,
    bluffUsedThisTurn: room.bluffUsedThisTurn || false,
    cardPlayedThisTurn: room.cardPlayedThisTurn || false,
    powerActivatedThisTurn: room.powerActivatedThisTurn || false,
    bluffBlockedThisTurn: room.bluffBlockedThisTurn || false,
    spinTargetId: room.spinTargetId || null,
    isFirstTurn: room.isFirstTurn || false,
    deckSize: isOnline && room.deck ? room.deck.length : undefined,
    playedPileSize: isOnline && room.playedPile ? room.playedPile.length : undefined,
    discardPileSize: isOnline && room.discardPile ? room.discardPile.length : undefined,
    myHand: isOnline && requestingPlayerId && room.hands
      ? (room.hands.get(requestingPlayerId) || [])
      : undefined,
    myPowerCardSlot: isOnline && requestingPlayerId && room.powerCardSlot
      ? (room.powerCardSlot[requestingPlayerId] || [])
      : undefined,
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
    // §1.1 - bluff interception window. Everyone sees who's deciding; only the
    // accused gets the list of cards they may arm.
    pendingBluffIntercept: isOnline && room.pendingBluffIntercept
      ? {
          accuserId: room.pendingBluffIntercept.accuserId,
          accuserName: room.pendingBluffIntercept.accuserName,
          accusedId: room.pendingBluffIntercept.accusedId,
          accusedName: room.pendingBluffIntercept.accusedName,
          deadline: room.pendingBluffIntercept.deadline,
          amAccused: requestingPlayerId === room.pendingBluffIntercept.accusedId,
          options:
            requestingPlayerId === room.pendingBluffIntercept.accusedId
              ? room.pendingBluffIntercept.options
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
          // #243 - the single shared gun both finalists pass back and forth.
          chamber: room.lastStand.chamber || null,
          bulletCount: room.lastStand.bulletCount
            ?? (room.lastStand.chamber || []).filter(s => s === 'bullet').length,
        }
      : null,
    speedModeMsRemaining:
      isOnline && room.config?.roomModifiers?.speedMode && room.speedModeDeadline
        ? Math.max(0, room.speedModeDeadline - Date.now())
        : undefined,
    suddenDeathCounter: isOnline ? (room.suddenDeathCounter || 0) : undefined,
    mirrorMatchActive: isOnline ? !!room.mirrorMatchActive : undefined,
    // Redemption Spin (Phase E1) - who is being offered their one redemption
    // spin and how long is left before the server takes it for them. Drives the
    // client's redemption_pending overlay (the prompt for the target; a waiting
    // notice for everyone else).
    redemption:
      isOnline && room.phase === 'redemption_pending' && room.redemption
        ? {
            playerId: room.redemption.playerId,
            playerName: room.redemption.playerName || null,
            msRemaining: Math.max(0, (room.redemption.deadline || 0) - Date.now()),
          }
        : undefined,
    // Covenant - The Pact. Reconnect-safe view, gated so it never leaks the
    // secret bond: partnerId is exposed only to the two partners; the offer
    // (and the selector's identity) only to the target it's aimed at; amSelector
    // only to the selector themselves. null in non-Covenant rooms.
    pact: isOnline && (room.pact || room.pactSelectorId || room.pactOfferPending)
      ? {
          active: !!room.pact?.active,
          partnerId: room.pact?.active
            ? (room.pact.a === requestingPlayerId
                ? room.pact.b
                : room.pact.b === requestingPlayerId
                  ? room.pact.a
                  : null)
            : null,
          amSelector: !!room.pactSelectorId && requestingPlayerId === room.pactSelectorId,
          offerPending: !!room.pactOfferPending && requestingPlayerId === room.pactTargetId,
          selectorName:
            room.pactOfferPending && requestingPlayerId === room.pactTargetId
              ? (room.players.find(p => p.id === room.pactSelectorId)?.username || null)
              : null,
        }
      : null,
    // Pre-game selection & role reveal (#116). Authoritative view for
    // the requesting player - reconnect-safe. Only the caller's own
    // pool/selection is exposed; other players' picks stay private,
    // and the ready Set is reduced to live counts (Sets don't survive
    // JSON over the wire).
    pregame: isOnline && room.phase === 'pre_game'
      ? {
          selectionOpen: !!room.pregameSelectionOpen,
          deadline: room.pregameSelectionDeadline || null,
          totalCount: room.players.filter(p => p.status === 'alive').length,
          pendingCount: Math.max(
            0,
            room.players.filter(p => p.status === 'alive').length
              - (room.pregameSelectionsReady ? room.pregameSelectionsReady.size : 0),
          ),
          barehandVisible: isBarehandVisible(
            room.players.filter(p => p.status === 'alive').length,
          ),
          myPool: requestingPlayerId ? (room.pregamePools?.[requestingPlayerId] || null) : null,
          mySelectionId: requestingPlayerId
            ? (room.pregameSelections?.[requestingPlayerId]?.id || null)
            : null,
        }
      : null,
  };
}

module.exports = {
  serializeRoom,
};
