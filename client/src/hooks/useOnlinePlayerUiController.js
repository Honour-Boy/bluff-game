import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsMobile } from './useIsMobile';

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
  const lastSpinKeyRef = useRef(null);
  const [spinData, setSpinData] = useState(null);
  const [spinComplete, setSpinComplete] = useState(false);
  // #185 — what the "Last Event" panel renders. Mirrors roomState.lastAction
  // for every action type EXCEPT a spin_result, which is held back until its
  // cylinder animation finishes (see the spin effect below).
  const [displayedLastAction, setDisplayedLastAction] = useState(null);
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
  // #197 — which held power card the activation modal is targeting. A Collector
  // holds up to 3; everyone else holds one. null = fall back to slot[0] server-side.
  const [pendingPowerCardId, setPendingPowerCardId] = useState(null);
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

  useEffect(() => {
    const action = roomState?.lastAction;
    if (action?.type !== 'spin_result') return undefined;

    const actionKey = `${action.spinTargetId}:${JSON.stringify(action.chamber)}`;
    if (lastSpinKeyRef.current === actionKey) return undefined;
    lastSpinKeyRef.current = actionKey;

    const { spinIndex, eliminated, spinTargetName, spinTargetId: targetId, chamber, chamberAfter } = action;
    const landingChamberIndex = spinIndex ?? 0;
    const finalAngle = 10 * 360 - landingChamberIndex * 60;
    const toBulletSet = (slots) => new Set(
      (slots || []).map((value, index) => (value === 'bullet' ? index : -1)).filter((index) => index !== -1),
    );
    // Pre-spin chamber drives the cylinder DURING the spin (you watch the bullet
    // pass). The post-spin chamber (`chamberAfter`) is what survivors actually
    // carry afterwards — it folds in any bullets a survival adds (always +1, or
    // +2 under Hot Potato). Surfacing it lets the cylinder reveal the new bullets
    // the instant the spin lands instead of looking like nothing changed (#238).
    const bulletChambers = toBulletSet(chamber);
    const bulletChambersAfter = toBulletSet(chamberAfter || chamber);

    setCylinderAnimating(false);
    setCylinderRotation(0);
    setSpinComplete(false);
    setSpinData({
      spinIndex: landingChamberIndex,
      eliminated,
      spinTargetName,
      spinTargetId: targetId,
      bulletChambers,
      bulletChambersAfter,
      bulletCountAfter: bulletChambersAfter.size,
      landingChamberIndex,
      finalAngle,
    });

    const startTimer = setTimeout(() => {
      setCylinderAnimating(true);
      setCylinderRotation(finalAngle);
    }, 80);

    const completeTimer = setTimeout(() => {
      setSpinComplete(true);
      // #185 — only now, once the cylinder has stopped, surface the spin
      // outcome to the Last Event panel. Until here `displayedLastAction` keeps
      // showing the pre-spin event so the result isn't readable mid-animation.
      setDisplayedLastAction(action);
    }, 8080);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(completeTimer);
    };
  }, [roomState?.lastAction]);

  // #185 — keep the Last Event panel showing the event that LED to the spin
  // while the cylinder animates, then reveal the outcome only once it stops.
  // Two action types are withheld here so `displayedLastAction` retains the
  // prior *renderable* event instead of going blank:
  //   • `spin_result`  — surfaced by the spin effect's completion timer above.
  //   • `spin_pending` — the "must spin" marker; ActionLog renders nothing for
  //     it, so letting it through would empty the panel during the wait + spin.
  // Every other (renderable) action still flows straight through.
  useEffect(() => {
    const action = roomState?.lastAction || null;
    if (action?.type === 'spin_result' || action?.type === 'spin_pending') return;
    setDisplayedLastAction(action);
  }, [roomState?.lastAction]);

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
    // A bot spin target never acknowledges on its own (no socket). In a practice
    // room this client is the only human, so it drives the ack quickly instead of
    // leaving the overlay (and play) frozen for the full 15s observer fallback —
    // this is what made the bot "not auto-continue" after surviving a spin. It
    // also lets the server resolve anything waiting on spin_acknowledged.
    const targetIsBot = !!roomState?.players?.find((p) => p.id === spinData.spinTargetId)?.isBot;
    // Long enough to read the "survived — a bullet was added" explainer, short
    // enough that play resumes promptly instead of the old 15s observer stall.
    const delay = targetIsBot ? 3500 : 15000;
    const timer = setTimeout(() => {
      if (amTarget || targetIsBot) acknowledgeSpinResult?.();
      else setSpinData(null);
    }, delay);
    return () => clearTimeout(timer);
  }, [acknowledgeSpinResult, myPlayer?.id, spinComplete, spinData, roomState?.players]);

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
      // The table scene pans horizontally now — bring the dealer's cards back
      // into the centre of the view.
      tableCenterRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
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
  const handlePowerCardClick = useCallback((cardId = null) => {
    if (!isMyTurn || !isPlaying) return;
    if (myPlayer?.armedPowerCard) return;
    // §1.1 — one power activation per turn. `armedPowerCard` misses a consumed
    // Peek (it leaves no armed marker), so also honour the server's ledger flag
    // to keep a Collector from Peeking then arming in the same turn.
    if (roomState?.powerActivatedThisTurn) return;
    // #197 — remember which card was tapped so a Collector can activate any of
    // its held cards, not just slot[0].
    setPendingPowerCardId(typeof cardId === 'string' ? cardId : null);
    setPowerConfirmOpen(true);
  }, [isMyTurn, isPlaying, myPlayer?.armedPowerCard, roomState?.powerActivatedThisTurn]);

  const handleActivatePower = useCallback(async () => {
    if (!activatePowerCard || activating) return;
    setActivating(true);
    try {
      const response = await activatePowerCard(pendingPowerCardId);
      setPowerConfirmOpen(false);
      setPendingPowerCardId(null);
      if (response?.success && response?.power === 'peek') {
        setPeekedCard(response.peekedCard || { _empty: true });
      }
    } finally {
      setActivating(false);
    }
  }, [activatePowerCard, activating, pendingPowerCardId]);

  const handleSkipPower = useCallback(() => {
    setPowerConfirmOpen(false);
    setPendingPowerCardId(null);
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
    displayedLastAction,
    cylinderRotation,
    cylinderAnimating,
    justEliminated,
    setJustEliminated,
    peekedCard,
    powerConfirmOpen,
    pendingPowerCardId,
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
