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
  // Every spin identity already shown this session. A Set (not just the last key)
  // so a re-broadcast of an OLDER spin_result — after a newer spin moved the
  // "last" key on — can never replay that older spin a second time ("spin playing
  // twice"). Each spin animates exactly once.
  const seenSpinKeysRef = useRef(new Set());
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
  // Practice hand-off gate: true from the instant the local player is eliminated
  // until they dismiss the "Eliminated" card. While held, the tutorial layer must
  // NOT pop the Power Clinic briefing — the learner first watches their spin land,
  // reads the elimination card, THEN moves on to powers (the server stages the
  // clinic ~2.6s in, so without this hold the briefing races over the spin/card).
  const [eliminationHold, setEliminationHold] = useState(false);
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

  // ── Spin detection: a NEW spin_result → snapshot it into spinData ──
  // Only sets state; the animation timers live in a SEPARATE effect keyed on the
  // spin identity (spinData.key) — NOT on lastAction. That decoupling is the fix
  // for the "spin hangs on every pull" bug: the old effect's cleanup cleared the
  // 8s completion timer whenever lastAction changed, and in practice mode the bot
  // plays its next card ~1.1s after a spin, swapping lastAction to `card_played`
  // and killing the timer before `spinComplete` ever fired → the cylinder spun
  // forever with no result + no Continue button.
  useEffect(() => {
    const action = roomState?.lastAction;
    if (action?.type !== 'spin_result') return;

    // Prefer the server's monotonic spinSeq so two spins with an identical target
    // + pre-spin chamber (e.g. the tutorial bot's empty chamber across drills)
    // don't collide and skip the second animation. Fall back to the old key.
    const key = action.spinSeq != null
      ? `seq:${action.spinSeq}`
      : `${action.spinTargetId}:${JSON.stringify(action.chamber)}`;
    if (seenSpinKeysRef.current.has(key)) return;
    seenSpinKeysRef.current.add(key);

    const { spinIndex, eliminated, spinTargetName, spinTargetId: targetId, chamber, chamberAfter } = action;
    const landingChamberIndex = spinIndex ?? 0;
    const toBulletSet = (slots) => new Set(
      (slots || []).map((value, index) => (value === 'bullet' ? index : -1)).filter((index) => index !== -1),
    );
    const bulletChambersAfter = toBulletSet(chamberAfter || chamber);

    setCylinderAnimating(false);
    setCylinderRotation(0);
    setSpinComplete(false);
    setSpinData({
      key,
      action,
      spinIndex: landingChamberIndex,
      eliminated,
      spinTargetName,
      spinTargetId: targetId,
      targetIsBot: !!roomState?.players?.find((p) => p.id === targetId)?.isBot,
      bulletChambers: toBulletSet(chamber),
      bulletChambersAfter,
      bulletCountAfter: bulletChambersAfter.size,
      landingChamberIndex,
      finalAngle: 10 * 360 - landingChamberIndex * 60,
    });
  }, [roomState?.lastAction]);

  // ── Spin animation: drive the cylinder + complete, keyed on the spin IDENTITY
  // (spinData.key). Cleanup fires only when a NEW spin starts or on unmount, so a
  // mid-spin lastAction change (the bot's next card) can NEVER cancel completion.
  useEffect(() => {
    if (!spinData) return undefined;
    const startTimer = setTimeout(() => {
      setCylinderAnimating(true);
      setCylinderRotation(spinData.finalAngle);
    }, 80);
    const completeTimer = setTimeout(() => {
      setSpinComplete(true);
      // #185 — surface the outcome to the Last Event panel only now, once stopped.
      setDisplayedLastAction(spinData.action);
    }, 8080);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(completeTimer);
    };
  }, [spinData?.key]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Start holding the clinic hand-off at the moment of elimination — before
      // the spin even completes — so the briefing can't surface mid-animation.
      setEliminationHold(true);
    }
    prevStatusRef.current = currentStatus;
  }, [myPlayer?.status]);

  useEffect(() => {
    if (spinData || !pendingEliminatedRef.current) return;
    pendingEliminatedRef.current = false;
    setTimeout(() => setJustEliminated(true), 300);
  }, [spinData]);

  // Settle a finished spin: clear the overlay LOCALLY and (when it's our spin or a
  // bot's) notify the server. STABLE (ref-backed) so the auto-dismiss timer below
  // is never reset by an unrelated re-render. Self-contained on purpose — the
  // shared `spinDismissed` flag is reset on every `spin_result` re-broadcast
  // (socketEvents), so depending on it to dismiss raced and stranded the overlay.
  const ackRef = useRef(acknowledgeSpinResult);
  ackRef.current = acknowledgeSpinResult;
  const playersRef = useRef(roomState?.players);
  playersRef.current = roomState?.players;
  const myIdRef = useRef(myPlayer?.id);
  myIdRef.current = myPlayer?.id;
  const settleSpin = useCallback((targetId) => {
    const amTarget = targetId === myIdRef.current;
    const targetIsBot = !!playersRef.current?.find((p) => p.id === targetId)?.isBot;
    if (amTarget || targetIsBot) ackRef.current?.();
    setSpinData(null);
    setSpinComplete(false);
  }, []);

  const isTutorialRoom = !!roomState?.isTutorial;
  // Auto-dismiss fallback. Keyed on the spin identity + completion only, so it is
  // armed exactly once per spin and never reset by re-renders. A bot/observer spin
  // has no Continue button, so this is its only exit; the human's own spin also
  // has a manual Continue button.
  useEffect(() => {
    if (!spinComplete || !spinData) return undefined;
    const targetIsBot = !!playersRef.current?.find((p) => p.id === spinData.spinTargetId)?.isBot;
    // Global pacing: an auto-closing spin (a bot's, or an observer's view) lingers
    // ≥10s so the result is readable; the human's own spin also has a manual
    // Continue button, so this is just its fallback.
    const delay = targetIsBot ? 10000 : (isTutorialRoom ? 12000 : 15000);
    const timer = setTimeout(() => settleSpin(spinData.spinTargetId), delay);
    return () => clearTimeout(timer);
  }, [spinComplete, spinData?.key, isTutorialRoom, settleSpin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Secondary path: if some other flow (online cross-client) flips spinDismissed
  // true, honour it. The primary dismissal is settleSpin above.
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
    // Module 4 — the tutorial gives a long, deliberate pause to study the peeked
    // card before the layout moves on; a real game dismisses it quickly.
    const timer = setTimeout(() => setPeekedCard(null), isTutorialRoom ? 10000 : 3000);
    return () => clearTimeout(timer);
  }, [peekedCard, isTutorialRoom]);

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

  // Continue button on the spin overlay → settle THIS spin (clear + ack).
  const handleSpinContinue = useCallback(() => {
    if (spinData) settleSpin(spinData.spinTargetId);
  }, [settleSpin, spinData]);

  // "Continue Watching" on the Eliminated card → close it AND release the clinic
  // hand-off hold, so the practice Power Clinic briefing can finally surface.
  const dismissEliminated = useCallback(() => {
    setJustEliminated(false);
    setEliminationHold(false);
  }, []);

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
    eliminationHold,
    dismissEliminated,
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
    handleSpinContinue,
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
