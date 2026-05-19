'use client';

import { useEffect, useRef, useState, lazy } from 'react';
const HowToPlayModal = lazy(() =>
  import('../HowToPlayModal').then((module) => ({ default: module.HowToPlayModal })),
);
import { PlayerHeader } from './PlayerHeader';
import { PlayerStatusCard } from './PlayerStatusCard';
import {
  BluffResolutionBanner,
  LeaveGameButton,
  PlayerActionLog,
  PlayerTurnActions,
  RequiredCardPanel,
  SpinPendingPanel,
} from './PlayerActionPanels';
import { PlayerPlayersPanel } from './PlayerPlayersPanel';
import { PlayerEliminationOverlay, PlayerHowToPlayModal, PlayerSpinOverlay } from './PlayerOverlays';
import { PLAYER_UI_STYLE } from './shared';

export function PlayerUI({
  roomCode,
  roomState,
  myPlayer,
  isMyTurn,
  callBluff,
  playCard,
  endTurn,
  playerSpin,
  leaveGame,
  acknowledgeSpinResult,
  spinDismissed,
  voice,
}) {
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const lastSpinKeyRef = useRef(null);
  const [spinData, setSpinData] = useState(null);
  const [spinComplete, setSpinComplete] = useState(false);
  const [cylinderRotation, setCylinderRotation] = useState(0);
  const [cylinderAnimating, setCylinderAnimating] = useState(false);
  const prevStatusRef = useRef(null);
  const [justEliminated, setJustEliminated] = useState(false);

  useEffect(() => {
    if (spinDismissed && spinData && spinComplete) {
      setSpinData(null);
      setSpinComplete(false);
    }
  }, [spinDismissed, spinComplete, spinData]);

  useEffect(() => {
    const currentStatus = myPlayer?.status || null;
    if (prevStatusRef.current === 'alive' && currentStatus === 'eliminated') {
      setTimeout(() => setJustEliminated(true), 400);
    }
    prevStatusRef.current = currentStatus;
  }, [myPlayer?.status]);

  useEffect(() => {
    if (!spinComplete || !spinData) return undefined;
    const amTarget = spinData.spinTargetId === myPlayer?.id;
    const timer = setTimeout(() => {
      if (amTarget) acknowledgeSpinResult?.();
      else setSpinData(null);
    }, 15000);
    return () => clearTimeout(timer);
  }, [acknowledgeSpinResult, myPlayer?.id, spinComplete, spinData]);

  useEffect(() => {
    const action = roomState?.lastAction;
    if (action?.type !== 'spin_result') return undefined;

    const actionKey = `${action.spinTargetId}:${JSON.stringify(action.chamber)}`;
    if (lastSpinKeyRef.current === actionKey) return undefined;
    lastSpinKeyRef.current = actionKey;

    const { spinIndex, eliminated, spinTargetName, spinTargetId: targetId, chamber } = action;
    const landingChamberIndex = spinIndex ?? 0;
    const finalAngle = 10 * 360 - landingChamberIndex * 60;
    const bulletChambers = new Set(
      (chamber || []).map((value, index) => (value === 'bullet' ? index : -1)).filter((index) => index !== -1),
    );

    setCylinderRotation(0);
    setCylinderAnimating(false);
    setSpinComplete(false);
    setSpinData({ spinIndex: landingChamberIndex, eliminated, spinTargetName, spinTargetId: targetId, bulletChambers, landingChamberIndex, finalAngle });

    const startTimer = setTimeout(() => {
      setCylinderRotation(finalAngle);
      setCylinderAnimating(true);
    }, 80);
    const completeTimer = setTimeout(() => setSpinComplete(true), 8080);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(completeTimer);
    };
  }, [roomState?.lastAction]);

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
  } = roomState;

  const currentPlayer = players?.find((player) => player.id === currentPlayerId);
  const isEliminated = myPlayer.status === 'eliminated';
  const isPlaying = phase === 'playing';
  const isLobby = phase === 'lobby';
  const isBluffResolution = phase === 'bluff_resolution';
  const isSpinPending = phase === 'spin_pending';
  const isRoundEnd = phase === 'round_end';
  const isGameOver = phase === 'game_over';
  const isMySpinTurn = isSpinPending && spinTargetId === myPlayer.id;
  const spinTargetPlayer = isSpinPending ? players?.find((player) => player.id === spinTargetId) : null;
  const isSpinTarget = spinData && spinData.spinTargetId === myPlayer.id;

  let actionHint = '';
  if (!bluffUsedThisTurn && !cardPlayedThisTurn) {
    actionHint = isFirstTurn
      ? 'Play your card face-down. (No bluff allowed on the first turn.)'
      : "Call bluff on the previous player's card, or play your card face-down.";
  } else if (bluffUsedThisTurn && !cardPlayedThisTurn) {
    actionHint = 'Bluff already called this turn. Now play your card face-down.';
  } else if (cardPlayedThisTurn) {
    actionHint = 'Card played. End your turn when ready.';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 500, margin: '0 auto' }}>
      <PlayerHeader
        roomCode={roomCode}
        roundNumber={roundNumber}
        username={myPlayer.username}
        isEliminated={isEliminated}
        onShowHowToPlay={() => setShowHowToPlay(true)}
      />

      <PlayerStatusCard
        roomCode={roomCode}
        myPlayer={myPlayer}
        currentPlayer={currentPlayer}
        isMyTurn={isMyTurn}
        isPlaying={isPlaying}
        isLobby={isLobby}
        isRoundEnd={isRoundEnd}
        isGameOver={isGameOver}
        isEliminated={isEliminated}
        lastAction={lastAction}
        voice={voice}
      />

      <RequiredCardPanel
        show={(isPlaying || isBluffResolution || isSpinPending) && !!currentCardType}
        currentCardType={currentCardType}
      />

      <PlayerTurnActions
        show={isMyTurn && isPlaying && !isEliminated}
        isFirstTurn={isFirstTurn}
        bluffUsedThisTurn={bluffUsedThisTurn}
        cardPlayedThisTurn={cardPlayedThisTurn}
        actionHint={actionHint}
        callBluff={callBluff}
        playCard={playCard}
        endTurn={endTurn}
      />

      <BluffResolutionBanner show={isBluffResolution && isMyTurn} />

      <SpinPendingPanel
        isMySpinTurn={isMySpinTurn}
        isSpinPending={isSpinPending}
        isEliminated={isEliminated}
        spinTargetPlayer={spinTargetPlayer}
        playerSpin={playerSpin}
      />

      <PlayerActionLog lastAction={lastAction} />

      <PlayerPlayersPanel
        players={players}
        currentPlayerId={currentPlayerId}
        myPlayerId={myPlayer.id}
        turnOrder={turnOrder}
        isSpinPending={isSpinPending}
        spinTargetId={spinTargetId}
      />

      <LeaveGameButton roomState={roomState} leaveGame={leaveGame} />

      <PlayerSpinOverlay
        spinData={spinData}
        cylinderRotation={cylinderRotation}
        cylinderAnimating={cylinderAnimating}
        spinComplete={spinComplete}
        isSpinTarget={isSpinTarget}
        acknowledgeSpinResult={acknowledgeSpinResult}
      />

      <PlayerEliminationOverlay show={justEliminated && !spinData} onClose={() => setJustEliminated(false)} />

      <PlayerHowToPlayModal
        show={showHowToPlay}
        HowToPlayModal={HowToPlayModal}
        onClose={() => setShowHowToPlay(false)}
      />

      <style>{PLAYER_UI_STYLE}</style>
    </div>
  );
}
