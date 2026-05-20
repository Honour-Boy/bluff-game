import { useCallback, useMemo } from 'react';
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
import { PreGameSelectionModal } from '../PreGameSelectionModal';
import {
  distributePlayers,
  GAME_UI_STYLE,
  orderClockwiseFromLocal,
} from './helpers';
import { useOnlinePlayerUiController } from '../../hooks/useOnlinePlayerUiController';

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
  const myHand = roomState?.myHand || [];
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
  const heldPowerCard = myHand.find((card) => card?.type === 'power') || null;
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
  const otherPlayers = useMemo(() => {
    const others = players?.filter((player) => player.id !== myPlayer.id) || [];
    return orderClockwiseFromLocal(others, turnOrder, myPlayer.id);
  }, [myPlayer.id, players, turnOrder]);
  const distributed = useMemo(() => distributePlayers(otherPlayers), [otherPlayers]);

  const myTurnIdx = turnOrder?.indexOf(myPlayer.id) ?? -1;
  const prevPlayerId = myTurnIdx >= 0 && turnOrder?.length > 1
    ? turnOrder[(myTurnIdx - 1 + turnOrder.length) % turnOrder.length]
    : null;
  const prevPlayer = prevPlayerId ? players?.find((player) => player.id === prevPlayerId) : null;

  let actionHint = '';
  if (isMyTurn && isPlaying) {
    if (!bluffUsedThisTurn && !cardPlayedThisTurn) {
      if (bluffBlockedThisTurn) {
        actionHint = 'Last turn was frozen â€” no card to challenge. Play a card from your hand.';
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

  const showPowerPrompt = (
    isMyTurn
    && !isEliminated
    && !showSpectatorView
    && isPlaying
    && !cardPlayedThisTurn
    && !bluffUsedThisTurn
    && !!heldPowerCard
    && !armedPowerCard
    && ui.powerPromptDismissedFor !== ui.powerPromptTurnKey
    && !ui.spinData
    && !ui.justEliminated
  );

  const isSwapPending = roomState?.phase === 'swap_pending';
  const amSwapHolder = isSwapPending && roomState?.swapHolderId === myPlayer?.id;
  const swapPickOptions = roomState?.swapPickOptions || [];
  const myRole = myPlayer?.role || 'barehand';
  // #116 — role reveal is now server-sequenced during the pre_game
  // phase, BEFORE the selection popup. Once the server opens selection
  // (pregame.selectionOpen) the reveal gives way to the picker.
  const inPreGame = phase === 'pre_game';
  const showRoleReveal = inPreGame && !pregame?.selectionOpen && !!myPlayer?.role;
  const showPreGameSelection = inPreGame && !!pregame?.selectionOpen;
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
      isSpinTarget={isSpinPending && player.id === spinTargetId}
      voice={voice}
      onClick={showSpectatorView ? () => ui.handleSpectatePlayer(player.id) : undefined}
      bettingEnabled={bettingEnabled}
    />
  ), [
    bettingEnabled,
    currentPlayerId,
    isSpinPending,
    spinTargetId,
    showSpectatorView,
    ui.handleSpectatePlayer,
    voice,
  ]);

  void medicPrompt;
  void lastStandEndTurn;

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
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
        selectedCardId={ui.selectedCardId}
        handleCardClick={ui.handleCardClick}
        phase={phase}
        leaveGame={leaveGame}
      />

      <FloatingControls
        isMobile={ui.isMobile}
        config={roomState?.config}
        voice={voice}
        speechEnabled={ui.speechEnabled}
        onCentralize={ui.scrollToCenter}
        onToggleSpeech={ui.toggleSpeech}
        onOpenChat={openChat}
        chatUnread={chatUnread}
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
        showPowerPrompt={showPowerPrompt}
        amSwapHolder={amSwapHolder}
        peekedCard={ui.peekedCard}
        isFirstTurn={isFirstTurn}
        bluffUsedThisTurn={bluffUsedThisTurn}
        cardPlayedThisTurn={cardPlayedThisTurn}
        prevPlayerName={prevPlayer?.username || null}
        callBluff={callBluff}
        setShowTurnModal={ui.setShowTurnModal}
      />

      <PowerFlowOverlays
        showPowerPrompt={showPowerPrompt}
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

      {showPreGameSelection && (
        <PreGameSelectionModal
          pool={pregame?.myPool || []}
          deadline={pregame?.deadline || null}
          pendingCount={pregame?.pendingCount || 0}
          totalCount={pregame?.totalCount || 0}
          selectedId={pregame?.mySelectionId || null}
          onSelect={preGameSelect}
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
