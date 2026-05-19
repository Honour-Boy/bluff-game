'use client';

import { useState, useEffect, useRef, lazy } from 'react';
const HowToPlayModal = lazy(() =>
  import('../HowToPlayModal').then((module) => ({ default: module.HowToPlayModal })),
);
import { HostHeader } from './HostHeader';
import { HostPhaseBanner, HostGameSummary } from './HostStatusPanels';
import { HostControlsPanel } from './HostControlsPanel';
import { HostPlayersPanel, HostRoundWinnerPanel } from './HostPlayersPanel';
import { HostConfirmModal, HostSpinOverlay, HostHowToPlayModal } from './HostOverlays';
import { HOST_UI_STYLE } from './shared';

export function HostUI({
  roomCode,
  roomState,
  startGame,
  nextTurn,
  resolveBluff,
  declareRoundWin,
  leaveGame,
  restartRoom,
  acknowledgeSpinResult,
  spinDismissed,
  voice,
}) {
  const [confirmAction, setConfirmAction] = useState(null);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [eliminationBanner, setEliminationBanner] = useState(null);
  const lastSpinKeyRef = useRef(null);
  const [spinData, setSpinData] = useState(null);
  const [spinComplete, setSpinComplete] = useState(false);
  const [cylinderRotation, setCylinderRotation] = useState(0);
  const [cylinderAnimating, setCylinderAnimating] = useState(false);

  useEffect(() => {
    if (spinDismissed && spinData && spinComplete) {
      setSpinData(null);
      setSpinComplete(false);
    }
  }, [spinDismissed, spinComplete, spinData]);

  useEffect(() => {
    const action = roomState?.lastAction;
    if (!action) return undefined;

    if (action.type === 'spin_result' && action.newCardType) {
      setEliminationBanner(action.newCardType);
    }

    if (action.type !== 'spin_result') return undefined;
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

  useEffect(() => {
    if (!spinComplete || !spinData) return undefined;
    const timer = setTimeout(() => {
      acknowledgeSpinResult?.();
    }, 15000);
    return () => clearTimeout(timer);
  }, [acknowledgeSpinResult, spinComplete, spinData]);

  if (!roomState) {
    return (
      <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 40 }}>
        Connecting...
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
    currentTurnIndex,
    spinTargetId,
  } = roomState;

  const currentPlayer = players?.find((player) => player.id === currentPlayerId);
  const alivePlayers = players?.filter((player) => player.status === 'alive') || [];
  const isLobby = phase === 'lobby';
  const isPlaying = phase === 'playing';
  const isBluffResolution = phase === 'bluff_resolution';
  const isSpinPending = phase === 'spin_pending';
  const isRoundEnd = phase === 'round_end';
  const isGameOver = phase === 'game_over';
  const prevIdx = turnOrder?.length ? (currentTurnIndex - 1 + turnOrder.length) % turnOrder.length : 0;
  const prevPlayerId = turnOrder?.[prevIdx];
  const prevPlayer = players?.find((player) => player.id === prevPlayerId);
  const spinTargetPlayer = players?.find((player) => player.id === spinTargetId);

  const executeConfirm = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'roundWin') declareRoundWin(confirmAction.payload);
    setConfirmAction(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 680, margin: '0 auto' }}>
      <HostHeader
        roomCode={roomCode}
        alivePlayersCount={alivePlayers.length}
        roundNumber={roundNumber}
        voice={voice}
        onShowHowToPlay={() => setShowHowToPlay(true)}
      />

      <HostPhaseBanner
        isLobby={isLobby}
        isPlaying={isPlaying}
        isBluffResolution={isBluffResolution}
        isSpinPending={isSpinPending}
        isRoundEnd={isRoundEnd}
        isGameOver={isGameOver}
        spinTargetPlayer={spinTargetPlayer}
        lastAction={lastAction}
      />

      <HostGameSummary
        isPlaying={isPlaying}
        isBluffResolution={isBluffResolution}
        isSpinPending={isSpinPending}
        currentCardType={currentCardType}
        currentPlayer={currentPlayer}
        lastAction={lastAction}
        isPlayingPhase={isPlaying}
        eliminationBanner={eliminationBanner}
        onDismissEliminationBanner={() => setEliminationBanner(null)}
      />

      <HostControlsPanel
        isLobby={isLobby}
        isPlaying={isPlaying}
        isRoundEnd={isRoundEnd}
        isBluffResolution={isBluffResolution}
        isSpinPending={isSpinPending}
        isGameOver={isGameOver}
        alivePlayers={alivePlayers}
        startGame={startGame}
        nextTurn={nextTurn}
        resolveBluff={resolveBluff}
        eliminationBanner={eliminationBanner}
        onDismissEliminationBanner={() => setEliminationBanner(null)}
        prevPlayer={prevPlayer}
        currentPlayer={currentPlayer}
        spinTargetPlayer={spinTargetPlayer}
        restartRoom={restartRoom}
        leaveGame={leaveGame}
      />

      <HostRoundWinnerPanel
        isPlaying={isPlaying}
        alivePlayers={alivePlayers}
        onRoundWin={(playerId) => setConfirmAction({ type: 'roundWin', payload: playerId })}
      />

      <HostPlayersPanel
        players={players}
        alivePlayers={alivePlayers}
        turnOrder={turnOrder}
        currentPlayerId={currentPlayerId}
        phase={phase}
        voice={voice}
      />

      <button
        onClick={() => {
          const isMidGame = !isLobby && !isGameOver;
          if (isMidGame && !window.confirm(
            'Leave the game? Hosting ends - all players will be returned to the lobby.',
          )) return;
          leaveGame();
        }}
        style={{ alignSelf: 'flex-start', fontSize: 11, color: 'var(--text-dim)', border: 'none', background: 'none', padding: 0, textDecoration: 'underline', cursor: 'pointer' }}
      >
        Leave game
      </button>

      <HostConfirmModal
        confirmAction={confirmAction}
        onCancel={() => setConfirmAction(null)}
        onConfirm={executeConfirm}
      />

      <HostHowToPlayModal
        showHowToPlay={showHowToPlay}
        onClose={() => setShowHowToPlay(false)}
        HowToPlayModal={HowToPlayModal}
      />

      <HostSpinOverlay
        spinData={spinData}
        spinComplete={spinComplete}
        cylinderRotation={cylinderRotation}
        cylinderAnimating={cylinderAnimating}
        acknowledgeSpinResult={acknowledgeSpinResult}
      />

      <style>{HOST_UI_STYLE}</style>
    </div>
  );
}
