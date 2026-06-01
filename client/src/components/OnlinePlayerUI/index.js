import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CardHand } from './CardHand';
import { PlayerChip } from './PlayerChip';
import { RoomHeader } from './RoomHeader';
import { TableScene } from './TableScene';
import { BottomSeat } from './BottomSeat';
import { FloatingControls } from './FloatingControls';
import { CoreGameOverlays } from './CoreGameOverlays';
import { PowerFlowOverlays } from './PowerFlowOverlays';
import { RolePromptOverlays } from './RolePromptOverlays';
import { SystemsLayer } from './SystemsLayer';
import { BluffInterceptOverlay } from './BluffInterceptOverlay';
import RedemptionOverlay from './RedemptionOverlay';
import SpeedModeTimer from './SpeedModeTimer';
import { PreGameSelectionModal } from '../PreGameSelectionModal';
import { SmokeLayer } from '../shared/SmokeLayer';
import {
  distributePlayers,
  GAME_UI_STYLE,
  orderClockwiseFromLocal,
} from './helpers';
import { useOnlinePlayerUiController } from '../../hooks/useOnlinePlayerUiController';
import { useAtmosphere, useMusic } from '../../hooks/useAtmosphere';

export { CardHand, distributePlayers, orderClockwiseFromLocal };

export function OnlinePlayerUI({
  roomCode,
  roomState,
  myPlayer,
  isMyTurn,
  isHost = false,
  startGame,
  playCardOnline,
  callBluff,
  endTurn,
  playerSpin,
  spectatePlayer,
  leaveGame,
  restartRoom,
  acknowledgeSpinResult,
  redemptionSpin,
  spinDismissed,
  activatePowerCard,
  swapPick,
  preGameSelect,
  pregame,
  updateRoomConfig,
  getGroupLeaderboard,
  leaderboardUpdateNonce = 0,
  medicDecide,
  saboteurTransfer,
  sniperRedirect,
  bluffIntercept,
  medicPrompt,
  sniperPrompt,
  powerEventQueue,
  consumePowerEvent,
  placeBet,
  ghostVote,
  lastStandSpin,
  lastStandEndTurn,
  voice,
  openChat,
  chatUnread = 0,
}) {
  const wrapperRef = useRef(null);
  const { triggerShake, triggerAudio, startSpinAudio, stopSpinAudio } = useAtmosphere(wrapperRef);
  // The bed itself is started at the app root (so it plays from the landing).
  // Here we only expose the mute toggle for the in-game menu; it shares the
  // same store as the landing settings gear, so the two never drift.
  const { musicEnabled, toggleMusic } = useMusic();

  const myHand = roomState?.myHand || [];
  const myPowerCardSlot = roomState?.myPowerCardSlot || [];
  const ui = useOnlinePlayerUiController({
    roomState,
    myPlayer,
    myHand,
    isMyTurn,
    isPlaying: roomState?.phase === 'playing',
    spectatePlayer,
    activatePowerCard,
    swapPick,
    medicDecide,
    sniperRedirect,
    saboteurTransfer,
    acknowledgeSpinResult,
    spinDismissed,
    powerEventQueue,
  });

  // ── Atmospheric triggers ────────────────────────────────────────────────────
  const prevPhaseRef = useRef(null);
  const prevLastActionRef = useRef(null);
  // Holds the setTimeout ID for the 80 ms spin-audio start delay so it can be
  // cancelled on unmount or if a second spin_result arrives before the first fires.
  const spinAudioDelayRef = useRef(null);

  useEffect(() => {
    if (!roomState) return;
    const phase = roomState.phase;
    const la = roomState.lastAction;
    const prevPhase = prevPhaseRef.current;
    const prevLa = prevLastActionRef.current;

    // Bluff resolution — shake + bell when spin_pending starts
    if (phase === 'spin_pending' && prevPhase !== 'spin_pending') {
      triggerShake();
      triggerAudio('bluff');
    }

    // Spin result — shake immediately, then start the click engine at the
    // same moment the CSS transition begins (+80 ms, matching useOnlinePlayerUiController).
    // The old flat spin-whir (`triggerAudio('spin'/'eliminate')`) is intentionally
    // removed here; it now plays only after spinComplete (see effect below).
    if (la && la !== prevLa && la.type === 'spin_result') {
      triggerShake();
      const spinIndex = la.spinIndex ?? 0;
      const finalAngle = 10 * 360 - spinIndex * 60;
      clearTimeout(spinAudioDelayRef.current);
      spinAudioDelayRef.current = setTimeout(() => startSpinAudio(finalAngle, 8000), 80);
    }

    // Card played — soft knock
    if (la && la !== prevLa && la.type === 'card_played') {
      triggerAudio('card');
    }
    // Game over — win fanfare
    if (phase === 'game_over' && prevPhase !== 'game_over') {
      triggerAudio('win');
    }

    prevPhaseRef.current = phase;
    prevLastActionRef.current = la;
  }, [roomState?.phase, roomState?.lastAction, triggerShake, triggerAudio, startSpinAudio]); // eslint-disable-line

  // Fire the result-reveal sound (survive/eliminate) once the cylinder animation
  // completes — not when the server event first arrives. Also stop any remaining
  // click timeouts (defensive; the last click already fired the clunk by this point).
  const prevSpinCompleteRef = useRef(false);
  useEffect(() => {
    if (ui.spinComplete && !prevSpinCompleteRef.current) {
      stopSpinAudio();
      if (ui.spinData) {
        triggerAudio(ui.spinData.eliminated ? 'eliminate' : 'spin');
      }
    }
    prevSpinCompleteRef.current = ui.spinComplete;
  }, [ui.spinComplete, ui.spinData, stopSpinAudio, triggerAudio]);

  // Cleanup spin audio timers on unmount
  useEffect(() => () => {
    clearTimeout(spinAudioDelayRef.current);
    stopSpinAudio();
  }, [stopSpinAudio]);

  // §2.1 — private late-pick review buffer. When the server flags a pick as
  // late (≥12s into the 15s window) it returns a reviewMs grace period. We
  // snapshot this player's pool + chosen id so their reveal can stay mounted
  // past the shared finalize, giving them a guaranteed private look before the
  // table appears. (They're already deprioritised off the opening turn server-
  // side.) Only the late picker ever sees this hold.
  // Redemption Spin (Phase E1) — guard against a double-tap on the offer.
  const [redemptionBusy, setRedemptionBusy] = useState(false);
  const handleRedemptionSpin = useCallback(() => {
    if (!redemptionSpin || redemptionBusy) return;
    setRedemptionBusy(true);
    redemptionSpin();
  }, [redemptionSpin, redemptionBusy]);
  // Reset the busy guard once the offer is no longer pending.
  useEffect(() => {
    if (roomState?.phase !== 'redemption_pending') setRedemptionBusy(false);
  }, [roomState?.phase]);

  const [reviewSnapshot, setReviewSnapshot] = useState(null);
  const handleLatePick = useCallback((reviewMs, optionId) => {
    setReviewSnapshot({
      pool: pregame?.myPool || [],
      selectedId: pregame?.mySelectionId || optionId || null,
      until: Date.now() + (reviewMs || 0),
    });
  }, [pregame]);
  useEffect(() => {
    if (!reviewSnapshot) return undefined;
    const remaining = reviewSnapshot.until - Date.now();
    if (remaining <= 0) {
      setReviewSnapshot(null);
      return undefined;
    }
    const id = setTimeout(() => setReviewSnapshot(null), remaining);
    return () => clearTimeout(id);
  }, [reviewSnapshot]);

  if (!roomState || !myPlayer) {
    return (
      <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 40 }}>
        Connecting to game...
      </div>
    );
  }

  const {
    players,
    turnOrder,
    currentPlayerId,
    nextPlayerId = null,
    currentCardType,
    phase,
    roundNumber,
    lastAction,
    bluffUsedThisTurn,
    cardPlayedThisTurn,
    spinTargetId,
    isFirstTurn,
    bluffBlockedThisTurn = false,
    deckSize = 0,
    playedPileSize = 0,
  } = roomState;

  const isEliminated = myPlayer.status === 'eliminated';
  const isSpectator = myPlayer.isSpectator;
  const showSpectatorView = isEliminated || isSpectator;
  // #197 — when the player taps a specific held card (a Collector holds up to
  // 3), the activation modal targets that card; otherwise default to slot[0].
  const heldPowerCard =
    (ui.pendingPowerCardId
      ? myPowerCardSlot.find((c) => c?.id === ui.pendingPowerCardId)
      : null) || myPowerCardSlot[0] || null;
  const armedPowerCard = myPlayer?.armedPowerCard || null;
  const isPlaying = phase === 'playing';
  const isSpinPending = phase === 'spin_pending';
  const isRoundEnd = phase === 'round_end';
  const isGameOver = phase === 'game_over';
  const isLobby = phase === 'lobby';
  const isMySpinTurn = isSpinPending && spinTargetId === myPlayer.id;
  const spinTargetPlayer = players?.find((player) => player.id === spinTargetId);
  const isSpinTarget = ui.spinData?.spinTargetId === myPlayer.id;
  const currentPlayer = players?.find((player) => player.id === currentPlayerId);
  const alivePlayers = players?.filter((player) => player.status === 'alive') || [];
  // Roulette Rotation conceals the upcoming order: only the current + next
  // player are revealed. Seat by a STABLE order (join order) instead of the
  // live, reshuffled turnOrder so the table doesn't telegraph the cycle.
  const rouletteActive = !!roomState?.config?.roomModifiers?.rouletteRotation;
  const otherPlayers = useMemo(() => {
    const others = players?.filter((player) => player.id !== myPlayer.id) || [];
    const seatOrder = rouletteActive ? (players?.map((p) => p.id) || []) : turnOrder;
    return orderClockwiseFromLocal(others, seatOrder, myPlayer.id);
  }, [myPlayer.id, players, turnOrder, rouletteActive]);
  const distributed = useMemo(() => distributePlayers(otherPlayers), [otherPlayers]);

  let actionHint = '';
  if (isMyTurn && isPlaying) {
    if (!bluffUsedThisTurn && !cardPlayedThisTurn) {
      if (bluffBlockedThisTurn) {
        actionHint = 'Last turn was frozen — no card to challenge. Play a card from your hand.';
      } else {
        actionHint = isFirstTurn
          ? 'Play a card from your hand. (No bluff on the first turn.)'
          : "Play a card from your hand, or call bluff on the previous player.";
      }
    } else if (bluffUsedThisTurn && !cardPlayedThisTurn) {
      actionHint = 'Bluff called. Now play your card.';
    } else if (cardPlayedThisTurn) {
      actionHint = 'Card played. End your turn when ready.';
    }
  }

  // #139 — eligibility to show the activation modal at all (turn/state gating).
  // The three turn actions are order-independent: neither `cardPlayedThisTurn`
  // nor `bluffUsedThisTurn` gates power activation — it's allowed before or
  // after a card is played and before or after a bluff is called. The only
  // block is already being armed (one activation per turn).
  const powerModalEligible = (
    isMyTurn
    && !isEliminated
    && !showSpectatorView
    && isPlaying
    && !!heldPowerCard
    && !armedPowerCard
    && !ui.spinData
    && !ui.justEliminated
  );
  // #139 — NO turn-start auto-prompt. The Activate/Skip modal opens ONLY
  // when the player explicitly taps their power-card slot (which flips
  // ui.powerConfirmOpen). Eligibility still gates whether that tap is honoured.
  const showPowerModal = powerModalEligible && ui.powerConfirmOpen;

  const isSwapPending = roomState?.phase === 'swap_pending';
  const amSwapHolder = isSwapPending && roomState?.swapHolderId === myPlayer?.id;
  const swapPickOptions = roomState?.swapPickOptions || [];
  const myRole = myPlayer?.role || 'barehand';
  // #116 — role reveal is now server-sequenced during the pre_game
  // phase, BEFORE the selection popup. Once the server opens selection
  // (pregame.selectionOpen) the reveal gives way to the picker.
  const inPreGame = phase === 'pre_game';
  const showRoleReveal = inPreGame && !pregame?.selectionOpen && !!myPlayer?.role;
  // §2.1 — keep the modal alive through the private review buffer even after
  // pre_game has finalised for the table at large.
  const reviewActive = !!reviewSnapshot && reviewSnapshot.until > Date.now();
  const showPreGameSelection = (inPreGame && !!pregame?.selectionOpen) || reviewActive;
  const isSaboteur = myRole === 'saboteur';
  const medicPending = roomState?.pendingMedicSave || null;
  const sniperPending = roomState?.pendingSniperRedirect || null;
  const amTargetMedic = !!medicPending?.amTargetMedic;
  const amTargetSniper = !!sniperPending?.amTargetSniper;
  const sniperEligibleTargets = sniperPending?.eligibleTargetIds || sniperPrompt?.eligibleTargetIds || [];
  const saboteurAvailable = isSaboteur
    && myPlayer?.status === 'alive'
    && myPlayer?.saboteurAbilityAvailable !== false
    && (roomState?.myHand?.length || 0) > 3;
  const bettingEnabled = !!roomState?.config?.systems?.betting;

  const renderChip = useCallback((player) => (
    <PlayerChip
      key={player.id}
      player={player}
      isCurrentTurn={player.id === currentPlayerId}
      isNextTurn={rouletteActive && isPlaying && player.id === nextPlayerId}
      isSpinTarget={isSpinPending && player.id === spinTargetId}
      voice={voice}
      onClick={showSpectatorView ? () => ui.handleSpectatePlayer(player.id) : undefined}
      bettingEnabled={bettingEnabled}
    />
  ), [
    bettingEnabled,
    currentPlayerId,
    rouletteActive,
    isPlaying,
    nextPlayerId,
    isSpinPending,
    spinTargetId,
    showSpectatorView,
    ui.handleSpectatePlayer,
    voice,
  ]);

  void medicPrompt;
  void lastStandEndTurn;

  const isSpinPendingPhase = roomState?.phase === 'spin_pending';

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Phase 3: ambient smoke drifting across the table during play */}
      <SmokeLayer
        active={roomState?.phase === 'playing' || isSpinPendingPhase}
        intensity={isSpinPendingPhase ? 'high' : 'low'}
      />

      <RoomHeader
        roomCode={roomCode}
        roundNumber={roundNumber}
        isEliminated={isEliminated}
        isHost={isHost}
        isLobby={isLobby}
        myPlayer={myPlayer}
        voice={voice}
        isMobile={ui.isMobile}
        onShowHowToPlay={() => ui.setShowHowToPlay(true)}
      />

      {/* Speed Mode — a turn countdown visible to ALL players (#speedMode). */}
      {roomState?.config?.roomModifiers?.speedMode
        && isPlaying
        && typeof roomState?.speedModeMsRemaining === 'number' && (
          <SpeedModeTimer
            key={currentPlayerId || 'speed'}
            msRemaining={roomState.speedModeMsRemaining}
            playerName={currentPlayer?.username}
            isMe={currentPlayerId === myPlayer?.id}
          />
        )}

      <TableScene
        tableCenterRef={ui.tableCenterRef}
        distributed={distributed}
        otherPlayers={otherPlayers}
        renderChip={renderChip}
        isPlaying={isPlaying}
        isSpinPending={isSpinPending}
        isRoundEnd={isRoundEnd}
        isGameOver={isGameOver}
        isLobby={isLobby}
        deckSize={deckSize}
        currentCardType={currentCardType}
        playedPileSize={playedPileSize}
        alivePlayers={alivePlayers}
        isHost={isHost}
        roomState={roomState}
        updateRoomConfig={updateRoomConfig}
        startGame={startGame}
        getGroupLeaderboard={getGroupLeaderboard}
        leaderboardUpdateNonce={leaderboardUpdateNonce}
        myPlayer={myPlayer}
        lastAction={lastAction}
        displayedLastAction={ui.displayedLastAction}
        isMySpinTurn={isMySpinTurn}
        isEliminated={isEliminated}
        playerSpin={playerSpin}
        spinTargetPlayer={spinTargetPlayer}
        restartRoom={restartRoom}
        leaveGame={leaveGame}
        isMyTurn={isMyTurn}
        currentPlayer={currentPlayer}
      />

      <BottomSeat
        voice={voice}
        myPlayer={myPlayer}
        isEliminated={isEliminated}
        isMyTurn={isMyTurn}
        isMyNextTurn={rouletteActive && isPlaying && nextPlayerId === myPlayer.id}
        isPlaying={isPlaying}
        isLobby={isLobby}
        isGameOver={isGameOver}
        callBluff={callBluff}
        endTurn={endTurn}
        isFirstTurn={isFirstTurn}
        bluffUsedThisTurn={bluffUsedThisTurn}
        cardPlayedThisTurn={cardPlayedThisTurn}
        bluffBlockedThisTurn={bluffBlockedThisTurn}
        actionHint={actionHint}
        showSpectatorView={showSpectatorView}
        alivePlayers={alivePlayers}
        spectatingId={ui.spectatingId}
        spectatedHand={ui.spectatedHand}
        handleSpectatePlayer={ui.handleSpectatePlayer}
        myHand={myHand}
        myPowerCardSlot={myPowerCardSlot}
        selectedCardId={ui.selectedCardId}
        handleCardClick={ui.handleCardClick}
        handlePowerCardClick={ui.handlePowerCardClick}
        phase={phase}
        leaveGame={leaveGame}
      />

      <FloatingControls
        isMobile={ui.isMobile}
        config={roomState?.config}
        voice={voice}
        speechEnabled={ui.speechEnabled}
        musicEnabled={musicEnabled}
        onCentralize={ui.scrollToCenter}
        onToggleSpeech={ui.toggleSpeech}
        onToggleMusic={toggleMusic}
        onOpenChat={openChat}
        chatUnread={chatUnread}
        leaveDisabled={isMyTurn && isPlaying && !isEliminated}
        onLeaveTable={() => {
          if (isMyTurn && isPlaying && !isEliminated) return;
          const isMidGame = !!phase && !['lobby', 'game_over'].includes(phase);
          if (isMidGame && !window.confirm(
            'Leave the table? You will forfeit and cannot rejoin this round.',
          )) return;
          leaveGame();
        }}
      />

      <CoreGameOverlays
        spinData={ui.spinData}
        spinComplete={ui.spinComplete}
        cylinderRotation={ui.cylinderRotation}
        cylinderAnimating={ui.cylinderAnimating}
        isSpinTarget={isSpinTarget}
        acknowledgeSpinResult={acknowledgeSpinResult}
        pendingCard={ui.pendingCard}
        setPendingCard={ui.setPendingCard}
        whotPickerCard={ui.whotPickerCard}
        setWhotPickerCard={ui.setWhotPickerCard}
        setSelectedCardId={ui.setSelectedCardId}
        playCardOnline={playCardOnline}
        justEliminated={ui.justEliminated}
        setJustEliminated={ui.setJustEliminated}
        showHowToPlay={ui.showHowToPlay}
        setShowHowToPlay={ui.setShowHowToPlay}
        showTurnModal={ui.showTurnModal}
        isEliminated={isEliminated}
        showPowerPrompt={showPowerModal}
        amSwapHolder={amSwapHolder}
        peekedCard={ui.peekedCard}
        isFirstTurn={isFirstTurn}
        bluffBlockedThisTurn={bluffBlockedThisTurn}
        setShowTurnModal={ui.setShowTurnModal}
      />

      <PowerFlowOverlays
        showPowerPrompt={showPowerModal}
        heldPowerCard={heldPowerCard}
        handleActivatePower={ui.handleActivatePower}
        activating={ui.activating}
        handleSkipPower={ui.handleSkipPower}
        peekedCard={ui.peekedCard}
        powerEventQueue={powerEventQueue}
        consumePowerEvent={consumePowerEvent}
        amSwapHolder={amSwapHolder}
        swapPickOptions={swapPickOptions}
        handleSwapPick={ui.handleSwapPick}
        swapping={ui.swapping}
        isSwapPending={isSwapPending}
        players={players}
        swapHolderId={roomState?.swapHolderId}
      />

      {phase === 'redemption_pending' && roomState?.redemption && (
        <RedemptionOverlay
          redemption={roomState.redemption}
          isMine={roomState.redemption.playerId === myPlayer?.id}
          onSpin={handleRedemptionSpin}
          busy={redemptionBusy}
        />
      )}

      {showPreGameSelection && (
        <PreGameSelectionModal
          pool={reviewActive ? reviewSnapshot.pool : (pregame?.myPool || [])}
          deadline={reviewActive ? null : (pregame?.deadline || null)}
          pendingCount={reviewActive ? 0 : (pregame?.pendingCount || 0)}
          totalCount={reviewActive ? 0 : (pregame?.totalCount || 0)}
          selectedId={reviewActive ? reviewSnapshot.selectedId : (pregame?.mySelectionId || null)}
          reviewUntil={reviewActive ? reviewSnapshot.until : null}
          onSelect={preGameSelect}
          onLatePick={handleLatePick}
        />
      )}

      <RolePromptOverlays
        showRoleReveal={showRoleReveal}
        myRole={myRole}
        barehandVisible={pregame?.barehandVisible !== false}
        setRoleRevealSeen={ui.setRoleRevealSeen}
        saboteurAvailable={saboteurAvailable}
        showRoleRevealBlock={showRoleReveal}
        setSaboteurOpen={ui.setSaboteurOpen}
        saboteurOpen={ui.saboteurOpen}
        alivePlayers={alivePlayers}
        myPlayerId={myPlayer.id}
        handleSaboteurPick={ui.handleSaboteurPick}
        saboteurBusy={ui.saboteurBusy}
        amTargetMedic={amTargetMedic}
        medicPending={medicPending}
        handleMedicDecide={ui.handleMedicDecide}
        medicDeciding={ui.medicDeciding}
        amTargetSniper={amTargetSniper}
        sniperPending={sniperPending}
        alivePlayersForSniper={alivePlayers}
        sniperEligibleTargets={sniperEligibleTargets}
        handleSniperRedirect={ui.handleSniperRedirect}
        sniperDeciding={ui.sniperDeciding}
        showSpectatorView={showSpectatorView}
        spectatingId={ui.spectatingId}
        roomState={roomState}
        players={players}
        spectatedHand={ui.spectatedHand}
      />

      {/* §1.1 — bluff interception window (accused arms a defence in response). */}
      {phase === 'bluff_intercept_pending' && roomState?.pendingBluffIntercept && (
        <BluffInterceptOverlay
          pending={roomState.pendingBluffIntercept}
          bluffIntercept={bluffIntercept}
        />
      )}

      <SystemsLayer
        roomState={roomState}
        myPlayer={myPlayer}
        bettingBusy={ui.bettingBusy}
        setBettingBusy={ui.setBettingBusy}
        placeBet={placeBet}
        ghostVotingBusy={ui.ghostVotingBusy}
        setGhostVotingBusy={ui.setGhostVotingBusy}
        ghostVote={ghostVote}
        lastStandSpinBusy={ui.lastStandSpinBusy}
        setLastStandSpinBusy={ui.setLastStandSpinBusy}
        lastStandSpin={lastStandSpin}
      />

      <style>{GAME_UI_STYLE}</style>
    </div>
  );
}
