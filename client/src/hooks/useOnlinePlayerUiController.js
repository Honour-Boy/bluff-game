import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsMobile } from './useIsMobile';
import {
  useAnnouncementSpeech,
  loadSpeechEnabled,
  saveSpeechEnabled,
} from './useAnnouncementSpeech';

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
  const turnNoticeShownRef = useRef(false);
  const tableCenterRef = useRef(null);
  const [spectatingId, setSpectatingId] = useState(null);
  const [spectatedHand, setSpectatedHand] = useState([]);
  const latestSpinActionRef = useRef(null);
  const [spinData, setSpinData] = useState(null);
  const [spinComplete, setSpinComplete] = useState(false);
  const [cylinderRotation, setCylinderRotation] = useState(0);
  const [cylinderAnimating, setCylinderAnimating] = useState(false);
  const prevStatusRef = useRef(null);
  const pendingEliminatedRef = useRef(false);
  const [justEliminated, setJustEliminated] = useState(false);
  const [peekedCard, setPeekedCard] = useState(null);
  // #139 — manual (click-to-open) power-card activation confirmation. There is
  // NO turn-start auto-prompt: the Activate/Skip modal opens only when the
  // player taps their held power card (this flag), and closes on activate/skip.
  const [powerConfirmOpen, setPowerConfirmOpen] = useState(false);
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

  const announcementHead = Array.isArray(powerEventQueue) && powerEventQueue.length > 0
    ? powerEventQueue[0]
    : null;

  useEffect(() => {
    setSpeechEnabled(loadSpeechEnabled());
  }, []);

  useAnnouncementSpeech(announcementHead, { enabled: speechEnabled });

  // The same spin_result rebroadcasts on every room_state push (serializeRoom
  // rebuilds lastAction each time). Key the animation on the server's stable
  // `actionId` — NOT the lastAction object ref — so an incidental rebroadcast
  // (a reconnect / join / config change) during the ~8s spin can't re-run this
  // effect, cancel the completion timer, and leave the full-screen overlay
  // hung. Falls back to the immutable spin fields for any payload predating
  // actionId. The ref hands the effect the latest spin snapshot without putting
  // the ever-changing object into the dependency array.
  const spinAction = roomState?.lastAction?.type === 'spin_result' ? roomState.lastAction : null;
  const spinResultId = spinAction
    ? (spinAction.actionId ?? `${spinAction.spinTargetId}:${spinAction.spinIndex}:${spinAction.eliminated}`)
    : null;
  latestSpinActionRef.current = spinAction;

  useEffect(() => {
    if (spinResultId == null) return undefined;
    const action = latestSpinActionRef.current;
    if (!action) return undefined;

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
  }, [spinResultId]);

  // §3.2 — spectator hand lockout. The server no longer emits `spectatedHand`,
  // so there is nothing to sync. `spectatedHand` stays an empty array and
  // `spectatingId` stays null; the picker UI is replaced by a hands-hidden
  // notice (see BottomSeat). Kept as inert state so prop contracts are stable.

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

  // Turn-start notice: a once-per-turn "it's your turn" acknowledgement, NOT a
  // re-derived prompt. It pops on the rising edge of (my turn + playing + alive)
  // and is dismissed with OK. It must NOT re-appear after the player acts mid-
  // turn (play / bluff / power) or after a same-turn bluff→spin (which keeps the
  // turn with us). The latch re-arms only once the turn actually leaves us.
  useEffect(() => {
    if (!isMyTurn) {
      turnNoticeShownRef.current = false;
      setShowTurnModal(false);
      return;
    }
    if (isPlaying && myPlayer?.status === 'alive' && !turnNoticeShownRef.current) {
      turnNoticeShownRef.current = true;
      setShowTurnModal(true);
    }
  }, [isMyTurn, isPlaying, myPlayer?.status]);

  useEffect(() => {
    if (!peekedCard) return undefined;
    const timer = setTimeout(() => setPeekedCard(null), 3000);
    return () => clearTimeout(timer);
  }, [peekedCard]);

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

  // §3.2 — spectating an opponent's hand is disabled (anti-cheat lockout). This
  // is intentionally a no-op: eliminated / dead players can watch the table but
  // never reveal a living opponent's cards. Kept so callers don't need to drop
  // the handler wiring.
  const handleSpectatePlayer = useCallback(() => {}, []);

  // #139 — open the activation confirmation modal by tapping the held power
  // card. The three turn actions (play / call bluff / activate power) are fully
  // order-independent: a power card may be armed at any point in the holder's
  // own turn — before OR after a card is played, and before OR after a bluff is
  // called. The only block is being already armed (one activation per turn).
  const handlePowerCardClick = useCallback(() => {
    if (!isMyTurn || !isPlaying) return;
    if (myPlayer?.armedPowerCard) return;
    // §1.1 — one power activation per turn. `armedPowerCard` misses a consumed
    // Peek (it leaves no armed marker), so also honour the server's ledger flag
    // to keep a Collector from Peeking then arming in the same turn.
    if (roomState?.powerActivatedThisTurn) return;
    setPowerConfirmOpen(true);
  }, [isMyTurn, isPlaying, myPlayer?.armedPowerCard, roomState?.powerActivatedThisTurn]);

  const handleActivatePower = useCallback(async () => {
    if (!activatePowerCard || activating) return;
    setActivating(true);
    try {
      const response = await activatePowerCard();
      setPowerConfirmOpen(false);
      if (response?.success && response?.power === 'peek') {
        setPeekedCard(response.peekedCard || { _empty: true });
      }
    } finally {
      setActivating(false);
    }
  }, [activatePowerCard, activating]);

  const handleSkipPower = useCallback(() => {
    setPowerConfirmOpen(false);
  }, []);

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
    peekedCard,
    powerConfirmOpen,
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
    handlePowerCardClick,
    handleSpectatePlayer,
    handleActivatePower,
    handleSkipPower,
    handleSwapPick,
    handleMedicDecide,
    handleSniperRedirect,
    handleSaboteurPick,
  };
}
