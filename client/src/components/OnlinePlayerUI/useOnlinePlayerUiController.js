import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  useAnnouncementSpeech,
  loadSpeechEnabled,
  saveSpeechEnabled,
} from '../../hooks/useAnnouncementSpeech';

export function useOnlinePlayerUiController({
  roomState,
  myPlayer,
  myHand,
  isMyTurn,
  isPlaying,
  spectatePlayer,
  activatePowerCard,
  swapPick,
  medicDecide,
  sniperRedirect,
  saboteurTransfer,
  acknowledgeSpinResult,
  spinDismissed,
  powerEventQueue,
}) {
  const isMobile = useIsMobile();
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [pendingCard, setPendingCard] = useState(null);
  const [whotPickerCard, setWhotPickerCard] = useState(null);
  const [showTurnModal, setShowTurnModal] = useState(false);
  const tableCenterRef = useRef(null);
  const [spectatingId, setSpectatingId] = useState(null);
  const [spectatedHand, setSpectatedHand] = useState([]);
  const lastSpinKeyRef = useRef(null);
  const [spinData, setSpinData] = useState(null);
  const [spinComplete, setSpinComplete] = useState(false);
  const [cylinderRotation, setCylinderRotation] = useState(0);
  const [cylinderAnimating, setCylinderAnimating] = useState(false);
  const prevStatusRef = useRef(null);
  const pendingEliminatedRef = useRef(false);
  const [justEliminated, setJustEliminated] = useState(false);
  const [powerPromptTurnKey, setPowerPromptTurnKey] = useState(null);
  const [powerPromptDismissedFor, setPowerPromptDismissedFor] = useState(null);
  const [peekedCard, setPeekedCard] = useState(null);
  const [activating, setActivating] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [roleRevealSeen, setRoleRevealSeen] = useState(false);
  const [medicDeciding, setMedicDeciding] = useState(false);
  const [sniperDeciding, setSniperDeciding] = useState(false);
  const [saboteurOpen, setSaboteurOpen] = useState(false);
  const [saboteurBusy, setSaboteurBusy] = useState(false);
  const [bettingBusy, setBettingBusy] = useState(false);
  const [ghostVotingBusy, setGhostVotingBusy] = useState(false);
  const [lastStandSpinBusy, setLastStandSpinBusy] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);

  const myTurnKey = `${roomState?.currentPlayerId || ''}:${roomState?.currentTurnIndex || 0}:${roomState?.roundNumber || 0}`;
  const announcementHead = Array.isArray(powerEventQueue) && powerEventQueue.length > 0
    ? powerEventQueue[0]
    : null;

  useEffect(() => {
    setSpeechEnabled(loadSpeechEnabled());
  }, []);

  useAnnouncementSpeech(announcementHead, { enabled: speechEnabled });

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

    setCylinderAnimating(false);
    setCylinderRotation(0);
    setSpinComplete(false);
    setSpinData({
      spinIndex: landingChamberIndex,
      eliminated,
      spinTargetName,
      spinTargetId: targetId,
      bulletChambers,
      landingChamberIndex,
      finalAngle,
    });

    const startTimer = setTimeout(() => {
      setCylinderAnimating(true);
      setCylinderRotation(finalAngle);
    }, 80);

    const completeTimer = setTimeout(() => setSpinComplete(true), 8080);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(completeTimer);
    };
  }, [roomState?.lastAction]);

  useEffect(() => {
    if (roomState?.spectatedHand && Array.isArray(roomState.spectatedHand)) {
      setSpectatedHand(roomState.spectatedHand);
    }
  }, [roomState?.spectatedHand]);

  useEffect(() => {
    const currentStatus = myPlayer?.status || null;
    if (prevStatusRef.current === 'alive' && currentStatus === 'eliminated') {
      pendingEliminatedRef.current = true;
    }
    prevStatusRef.current = currentStatus;
  }, [myPlayer?.status]);

  useEffect(() => {
    if (spinData || !pendingEliminatedRef.current) return;
    pendingEliminatedRef.current = false;
    setTimeout(() => setJustEliminated(true), 300);
  }, [spinData]);

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
    if (spinDismissed && spinData && spinComplete) {
      setSpinData(null);
      setSpinComplete(false);
    }
  }, [spinDismissed, spinComplete, spinData]);

  useEffect(() => {
    if (isMyTurn && isPlaying && !roomState?.cardPlayedThisTurn && myPlayer?.status === 'alive') {
      setShowTurnModal(true);
    } else {
      setShowTurnModal(false);
    }
  }, [isMyTurn, isPlaying, roomState?.cardPlayedThisTurn, myPlayer?.status]);

  useEffect(() => {
    if (!peekedCard) return undefined;
    const timer = setTimeout(() => setPeekedCard(null), 3000);
    return () => clearTimeout(timer);
  }, [peekedCard]);

  useEffect(() => {
    if (!isMyTurn) return;
    setPowerPromptTurnKey(myTurnKey);
  }, [myTurnKey, isMyTurn]);

  useEffect(() => {
    if (roomState?.phase === 'lobby') setRoleRevealSeen(false);
  }, [roomState?.phase]);

  const scrollToCenter = useCallback(() => {
    if (tableCenterRef.current) {
      tableCenterRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const toggleSpeech = useCallback(() => {
    setSpeechEnabled((current) => {
      const next = !current;
      saveSpeechEnabled(next);
      return next;
    });
  }, []);

  const handleCardClick = useCallback((cardId) => {
    if (!isMyTurn || !isPlaying || roomState?.cardPlayedThisTurn) return;
    const card = myHand.find((entry) => entry.id === cardId);
    if (!card) return;
    setSelectedCardId(cardId);
    setPendingCard(card);
  }, [isMyTurn, isPlaying, myHand, roomState?.cardPlayedThisTurn]);

  const handleSpectatePlayer = useCallback((targetId) => {
    setSpectatingId(targetId);
    spectatePlayer(targetId, (response) => {
      setSpectatedHand(response.hand || []);
    });
  }, [spectatePlayer]);

  const handleActivatePower = useCallback(async () => {
    if (!activatePowerCard || activating) return;
    setActivating(true);
    try {
      const response = await activatePowerCard();
      setPowerPromptDismissedFor(powerPromptTurnKey);
      if (response?.success && response?.power === 'peek') {
        setPeekedCard(response.peekedCard || { _empty: true });
      }
    } finally {
      setActivating(false);
    }
  }, [activatePowerCard, activating, powerPromptTurnKey]);

  const handleSkipPower = useCallback(() => {
    setPowerPromptDismissedFor(powerPromptTurnKey);
  }, [powerPromptTurnKey]);

  const handleSwapPick = useCallback(async (cardId) => {
    if (!swapPick || swapping || !cardId) return;
    setSwapping(true);
    try {
      await swapPick(cardId);
    } finally {
      setSwapping(false);
    }
  }, [swapPick, swapping]);

  const handleMedicDecide = useCallback(async (save) => {
    if (!medicDecide || medicDeciding) return;
    setMedicDeciding(true);
    try {
      await medicDecide(save);
    } finally {
      setMedicDeciding(false);
    }
  }, [medicDecide, medicDeciding]);

  const handleSniperRedirect = useCallback(async (newTargetId) => {
    if (!sniperRedirect || sniperDeciding) return;
    setSniperDeciding(true);
    try {
      await sniperRedirect(newTargetId);
    } finally {
      setSniperDeciding(false);
    }
  }, [sniperRedirect, sniperDeciding]);

  const handleSaboteurPick = useCallback(async (targetId) => {
    if (!saboteurTransfer || saboteurBusy) return;
    setSaboteurBusy(true);
    try {
      const response = await saboteurTransfer(targetId);
      if (response?.success) setSaboteurOpen(false);
    } finally {
      setSaboteurBusy(false);
    }
  }, [saboteurBusy, saboteurTransfer]);

  return {
    isMobile,
    tableCenterRef,
    scrollToCenter,
    showHowToPlay,
    setShowHowToPlay,
    selectedCardId,
    setSelectedCardId,
    pendingCard,
    setPendingCard,
    whotPickerCard,
    setWhotPickerCard,
    showTurnModal,
    setShowTurnModal,
    spectatingId,
    spectatedHand,
    spinData,
    setSpinData,
    spinComplete,
    setSpinComplete,
    cylinderRotation,
    cylinderAnimating,
    justEliminated,
    setJustEliminated,
    powerPromptTurnKey,
    powerPromptDismissedFor,
    peekedCard,
    activating,
    swapping,
    roleRevealSeen,
    setRoleRevealSeen,
    medicDeciding,
    sniperDeciding,
    saboteurOpen,
    setSaboteurOpen,
    saboteurBusy,
    bettingBusy,
    setBettingBusy,
    ghostVotingBusy,
    setGhostVotingBusy,
    lastStandSpinBusy,
    setLastStandSpinBusy,
    speechEnabled,
    toggleSpeech,
    handleCardClick,
    handleSpectatePlayer,
    handleActivatePower,
    handleSkipPower,
    handleSwapPick,
    handleMedicDecide,
    handleSniperRedirect,
    handleSaboteurPick,
  };
}
