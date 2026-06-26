import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnimationControls } from 'framer-motion';
import { CardHand } from './CardHand';
import { PlayerChip } from './PlayerChip';
import { ChipPopup } from './ChipPopup';
import { RoomHeader } from './RoomHeader';
import { TableScene } from './TableScene';
import { BottomSeat } from './BottomSeat';
import { CoreGameOverlays } from './CoreGameOverlays';
import { FlyingCardLayer, useCardFlight } from './FlyingCardLayer';
import { PowerFlowOverlays } from './PowerFlowOverlays';
import { RolePromptOverlays } from './RolePromptOverlays';
import { SystemsLayer } from './SystemsLayer';
import { BluffInterceptOverlay } from './BluffInterceptOverlay';
import RedemptionOverlay from './RedemptionOverlay';
import SpeedModeTimer from './SpeedModeTimer';
import { BloodDebtOverlay } from '../BloodDebtOverlay';
import { PactOfferOverlay } from '../PactOfferOverlay';
import { PactVolunteerOverlay } from '../PactVolunteerOverlay';
import { PactSelectorOverlay } from '../PactSelectorOverlay';
import { PreGameSelectionModal } from '../PreGameSelectionModal';
import { SmokeLayer } from '../shared/SmokeLayer';
import { TutorialLayer } from '../tutorial/TutorialLayer';
import { OnlineTourLayer } from '../tutorial/OnlineTourLayer';
import { TourCongrats } from '../tutorial/TourCongrats';
import { isDefensivePreArmLocked, clinicEndTurnLock } from '../tutorial/tutorialContent';
import {
  arcPlayers,
  coachingActive,
  distributePlayers,
  GAME_UI_STYLE,
  orderClockwiseFromLocal,
} from './helpers';
import { XpSummary } from './XpSummary';
import { cosmeticStyleVars } from '../../lib/cosmetics';
import { useOnlinePlayerUiController } from '../../hooks/useOnlinePlayerUiController';
import { useAtmosphere } from '../../hooks/useAtmosphere';

export { CardHand, coachingActive, distributePlayers, orderClockwiseFromLocal };

export function OnlinePlayerUI({
  roomCode,
  roomState,
  myPlayer,
  isMyTurn,
  isHost = false,
  startGame,
  skipToPowers,
  advanceTutorial,
  startTour,
  finishTour,
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
  bloodDebtTarget,
  pactChoose,
  pactRespond,
  volunteerForPact,
  pactVolunteer,
  setPactVolunteer,
  bluffIntercept,
  medicPrompt,
  sniperPrompt,
  bloodDebtPrompt,
  setBloodDebtPrompt,
  powerEventQueue,
  consumePowerEvent,
  placeBet,
  ghostVote,
  lastStandSpin,
  lastStandEndTurn,
  voice,
  openChat,
  chatUnread = 0,
  // #205 - this client's private end-of-game XP payload (useGame), if any.
  xpAward = null,
  // Spotlight tour: whether THIS client is a guest (drops the profile / cosmetics
  // beats, which guests don't have in the settings menu).
  isGuest = false,
}) {
  const wrapperRef = useRef(null);
  const { triggerShake, triggerAudio, startSpinAudio, stopSpinAudio } = useAtmosphere(wrapperRef);
  // Music mute now lives only in the global settings gear (app root). No music
  // control is rendered in the in-game menu anymore.
  // Card-fly: fixed-layer clones that arc from the hand to the discard pile.
  const { flights, launch: launchCardFlight } = useCardFlight();

  // (Module 2) Game settings + leaderboard dialogs and all in-room controls now
  // live in the global top-right SettingsGear (rendered at the app root); the
  // old bottom-right FAB is gone. Nothing for them to track here anymore.

  // (Module 1) Pannable canvas. We measure the board against the viewport and
  // derive symmetric drag constraints centred on the middle: when the board
  // fits, constraints collapse to {0,0,0,0} (locked, centred); when it overflows,
  // you can pan ±half-the-overflow in each axis. `pannable` gates the Re-center
  // control, and we snap back to centre whenever the board no longer overflows
  // (e.g. a player left and everyone fits again).
  const viewportRef = useRef(null);
  const boardRef = useRef(null);
  const panControls = useAnimationControls();
  const [panConstraints, setPanConstraints] = useState({ left: 0, right: 0, top: 0, bottom: 0 });
  const [pannable, setPannable] = useState(false);
  // Tutorial - bumped by the header "Guide" button to reopen the guided walkthrough.
  const [guideSignal, setGuideSignal] = useState(0);
  // Covenant - the Pact selector can dismiss their partner-picker (keeps the
  // server-set default). Sticky so it doesn't re-pop on every room_state push.
  const [pactSelectorDismissed, setPactSelectorDismissed] = useState(false);
  // Spotlight tour - flips true when the walk's last beat is finished, so the
  // congrats card replaces the spotlight. Reset whenever we leave the tour.
  const [tourDone, setTourDone] = useState(false);
  const ready = !!(roomState && myPlayer);

  useEffect(() => {
    const viewport = viewportRef.current;
    const board = boardRef.current;
    if (!viewport || !board || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const ox = Math.max(0, (board.offsetWidth - viewport.clientWidth) / 2);
      const oy = Math.max(0, (board.offsetHeight - viewport.clientHeight) / 2);
      setPanConstraints({ left: -ox, right: ox, top: -oy, bottom: oy });
      const overflows = ox > 1 || oy > 1;
      setPannable(overflows);
      if (!overflows) panControls.start({ x: 0, y: 0, transition: { duration: 0.2 } });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    ro.observe(board);
    measure();
    return () => ro.disconnect();
  }, [ready, panControls]);

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
  // (Module 2.3) Dedup the spin-audio START by the server's monotonic spinSeq, the
  // same way the cylinder animation dedups (useOnlinePlayerUiController). Without
  // this, a re-stamped / re-broadcast spin_result - seen during Mirror/Swap clinic
  // resolution - restarts the cylinder/click SFX a second time in rapid succession.
  const seenSpinAudioKeysRef = useRef(new Set());
  // Set when the server flips to game_over WHILE a terminal spin is still
  // animating: the victory fanfare is deferred and fired at spinComplete (below)
  // so it never plays over a live cylinder.
  const pendingWinRef = useRef(false);

  useEffect(() => {
    if (!roomState) return;
    const phase = roomState.phase;
    const la = roomState.lastAction;
    const prevPhase = prevPhaseRef.current;
    const prevLa = prevLastActionRef.current;

    // Bluff resolution - shake + bell when spin_pending starts
    if (phase === 'spin_pending' && prevPhase !== 'spin_pending') {
      triggerShake();
      triggerAudio('bluff');
    }

    // Spin result - shake immediately, then start the click engine at the
    // same moment the CSS transition begins (+80 ms, matching useOnlinePlayerUiController).
    // The old flat spin-whir (`triggerAudio('spin'/'eliminate')`) is intentionally
    // removed here; it now plays only after spinComplete (see effect below).
    if (la && la !== prevLa && la.type === 'spin_result') {
      // (Module 2.3) Start the spin SFX exactly once per spin. Key on the server's
      // monotonic spinSeq (fall back to target+chamber) so a re-stamped/re-broadcast
      // spin_result can't fire the cylinder/click audio twice (Mirror/Swap bug).
      const audioKey = la.spinSeq != null
        ? `seq:${la.spinSeq}`
        : `${la.spinTargetId}:${JSON.stringify(la.chamber)}`;
      if (!seenSpinAudioKeysRef.current.has(audioKey)) {
        seenSpinAudioKeysRef.current.add(audioKey);
        triggerShake();
        const spinIndex = la.spinIndex ?? 0;
        const finalAngle = 10 * 360 - spinIndex * 60;
        clearTimeout(spinAudioDelayRef.current);
        spinAudioDelayRef.current = setTimeout(() => startSpinAudio(finalAngle, 8000), 80);
      }
    }

    // Card played - soft knock
    if (la && la !== prevLa && la.type === 'card_played') {
      triggerAudio('card');
    }
    // Game over - victory fanfare for the LOCAL winner only, and held until the
    // terminal spin finishes. Two old bugs are fixed here: playing 'win' the
    // instant the server flipped to game_over fired it OVER the still-spinning
    // cylinder, and it sounded a "win" even when the local player had just lost.
    // The loser's defeat sting now rides the "Eliminated" card instead (below).
    if (phase === 'game_over' && prevPhase !== 'game_over') {
      // Covenant - a Pact dual win credits both partners (winnerIds).
      const iWon = la?.dualWin
        ? (la.winnerIds || []).includes(myPlayer?.id)
        : la?.winnerId === myPlayer?.id;
      if (iWon) {
        // Spin-driven game-overs are deferred server-side to the spin-acknowledge,
        // so by here the cylinder has normally already stopped + been dismissed →
        // play now. The guard is a safety net: if a cylinder is somehow still
        // turning, hold the fanfare for the spinComplete handler below.
        if (ui.spinData && !ui.spinComplete) pendingWinRef.current = true;
        else triggerAudio('win');
      }
    }

    prevPhaseRef.current = phase;
    prevLastActionRef.current = la;
  }, [roomState?.phase, roomState?.lastAction, myPlayer?.id, triggerShake, triggerAudio, startSpinAudio]); // eslint-disable-line

  // Fire the result-reveal sound (survive/eliminate) once the cylinder animation
  // completes - not when the server event first arrives. Also stop any remaining
  // click timeouts (defensive; the last click already fired the clunk by this point).
  const prevSpinCompleteRef = useRef(false);
  useEffect(() => {
    if (ui.spinComplete && !prevSpinCompleteRef.current) {
      // Stop any leftover click timers. (Module 8.2) When the cylinder locks on a
      // lethal chamber, fire the high-impact gunshot cue right as the result
      // lands. Read the spin SNAPSHOT (ui.spinData) rather than roomState.lastAction:
      // in practice mode the tutorial director restages the room ~2.6s after the
      // game ends, swapping lastAction out before the 8s cylinder finishes - so by
      // spinComplete `lastAction` is no longer the spin and the cue would be lost.
      stopSpinAudio();
      if (ui.spinData?.eliminated) {
        triggerAudio('gunshot');
      }
      // Deferred victory fanfare - held since the server flipped to game_over so it
      // lands once the cylinder stops, just after the gunshot/clunk.
      if (pendingWinRef.current) {
        pendingWinRef.current = false;
        setTimeout(() => triggerAudio('win'), 400);
      }
      // (Global redeal) a resolved bluff that triggered a reshuffle rides the
      // SAME spin_result lastAction. Don't play the card flight now - the spin
      // overlay is still up. Stash it and let the overlay-close effect play it
      // once the cylinder has been dismissed.
      const la = roomState?.lastAction;
      if (la && la.type === 'spin_result' && la.globalReshuffle && playedReshuffleRef.current !== la) {
        pendingReshuffleRef.current = la;
      }
    }
    prevSpinCompleteRef.current = ui.spinComplete;
  }, [ui.spinComplete, stopSpinAudio, triggerAudio, roomState?.lastAction, ui.spinData]);

  // Defeat sting - the mournful cue rides the "Eliminated" card surfacing (after
  // the cylinder has locked AND been dismissed), never over the live spin. Covers
  // both an ordinary elimination and the practice loss that hands into the clinic.
  const prevJustElimRef = useRef(false);
  useEffect(() => {
    if (ui.justEliminated && !prevJustElimRef.current) {
      triggerAudio('eliminate');
    }
    prevJustElimRef.current = ui.justEliminated;
  }, [ui.justEliminated, triggerAudio]);

  // Cleanup spin audio timers on unmount
  useEffect(() => () => {
    clearTimeout(spinAudioDelayRef.current);
    stopSpinAudio();
  }, [stopSpinAudio]);

  // ── Global-redeal flight animation ──────────────────────────────────────────
  // On a resolved bluff the server silently re-deals every alive player's shape
  // hand (powers kept, same count) and flags it on lastAction as
  // `globalReshuffle: true`. To make the swap legible, this client's shape cards
  // visibly fly OUT to the draw pile, then fresh backs deal back IN - played
  // only AFTER the trigger/spin animation has finished so the two don't overlap.
  const [reshuffling, setReshuffling] = useState(false);
  // Spin path: the reshuffle rides the spin_result lastAction, so we stash it at
  // spinComplete and play it when the overlay closes. Dedup ref guards both
  // paths so a given lastAction animates exactly once.
  const pendingReshuffleRef = useRef(null);
  const playedReshuffleRef = useRef(null);
  const prevSpinDataRef = useRef(null);
  const reshuffleDelayRef = useRef(null);
  const awaitingTurnAckReshuffleRef = useRef(false);

  const playReshuffleAnimation = useCallback(() => {
    if (typeof document === 'undefined' || !launchCardFlight) return;
    // No draw pile rendered (eliminated / spectating) → nothing to fly to.
    const deckEl = document.querySelector('[data-deck-anchor]');
    if (!deckEl) return;
    const shapeCards = (roomState?.myHand || []).filter((card) => card?.type !== 'power');
    if (shapeCards.length === 0) return;
    const deckRect = deckEl.getBoundingClientRect();
    // Snapshot each shape card's current rect (opacity:0 keeps layout, so these
    // stay valid as the deal-back landing spots even after the fan is hidden).
    const rects = shapeCards
      .map((card) => {
        const el = document.querySelector(`[data-card-id="${card.id}"]`);
        return el ? el.getBoundingClientRect() : null;
      })
      .filter(Boolean);
    if (rects.length === 0) return;
    const n = rects.length;
    setReshuffling(true);
    // Phase 1 - cards fly OUT to the draw pile, staggered.
    rects.forEach((rect, i) => {
      setTimeout(
        () => launchCardFlight({ back: true }, rect, deckRect, { mode: 'out', back: true }),
        i * 55,
      );
    });
    // Phase 2 - fresh backs deal back IN from the draw pile to each spot.
    const phase2 = n * 55 + 240;
    rects.forEach((rect, i) => {
      setTimeout(
        () => launchCardFlight({ back: true }, deckRect, rect, { mode: 'in', back: true }),
        phase2 + i * 55,
      );
    });
    // Restore the fan once the deal-back has landed.
    setTimeout(() => setReshuffling(false), phase2 + n * 55 + 320);
  }, [launchCardFlight, roomState?.myHand]);

  // Gate keeper for both reshuffle paths: the flight animation plays ONLY for
  // the player whose turn it now is, and never under the "YOUR TURN" notice -
  // if the notice is still up (it always is right after the turn flips), hold
  // the animation until the player taps OK, then play. Coached tutorial rooms
  // suppress the notice entirely, so they play immediately.
  const requestReshuffleAnimation = useCallback(() => {
    if (!isMyTurn) return; // bystanders just get the silently refreshed fan
    if (ui.showTurnModal && !coachingActive(roomState)) {
      awaitingTurnAckReshuffleRef.current = true;
      return;
    }
    playReshuffleAnimation();
  }, [isMyTurn, ui.showTurnModal, roomState, playReshuffleAnimation]);

  // Release: the held reshuffle plays once the turn notice is acknowledged.
  useEffect(() => {
    if (!ui.showTurnModal && awaitingTurnAckReshuffleRef.current) {
      awaitingTurnAckReshuffleRef.current = false;
      clearTimeout(reshuffleDelayRef.current);
      reshuffleDelayRef.current = setTimeout(() => playReshuffleAnimation(), 250);
    }
  }, [ui.showTurnModal, playReshuffleAnimation]);

  // Overlay-close watcher (spin path). When the spin overlay goes non-null →
  // null and a reshuffle is queued, play it after a short settle.
  useEffect(() => {
    const prev = prevSpinDataRef.current;
    prevSpinDataRef.current = ui.spinData;
    if (prev && !ui.spinData && pendingReshuffleRef.current) {
      const la = pendingReshuffleRef.current;
      pendingReshuffleRef.current = null;
      playedReshuffleRef.current = la;
      clearTimeout(reshuffleDelayRef.current);
      reshuffleDelayRef.current = setTimeout(() => requestReshuffleAnimation(), 250);
    }
  }, [ui.spinData, requestReshuffleAnimation]);

  // No-spin path (shield block / assassin backfire): the reshuffle arrives on a
  // non-spin lastAction with no overlay, so play it on arrival. Guarded by the
  // dedup ref so it fires once per lastAction.
  useEffect(() => {
    const la = roomState?.lastAction;
    if (!la || !la.globalReshuffle) return;
    if (la.type === 'spin_result') return;   // spin path handles this one
    if (ui.spinData) return;                  // wait for any overlay to clear
    if (playedReshuffleRef.current === la) return;
    playedReshuffleRef.current = la;
    requestReshuffleAnimation();
  }, [roomState?.lastAction, ui.spinData, requestReshuffleAnimation]);

  // Clear the pending-reshuffle delay timer on unmount.
  useEffect(() => () => clearTimeout(reshuffleDelayRef.current), []);

  // §2.1 - private late-pick review buffer. When the server flags a pick as
  // late (≥12s into the 15s window) it returns a reviewMs grace period. We
  // snapshot this player's pool + chosen id so their reveal can stay mounted
  // past the shared finalize, giving them a guaranteed private look before the
  // table appears. (They're already deprioritised off the opening turn server-
  // side.) Only the late picker ever sees this hold.
  // Redemption Spin (Phase E1) - guard against a double-tap on the offer.
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
  // #197 - when the player taps a specific held card (a Collector holds up to
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
  // Coaching layer is active for a tutorial that is NOT a sandbox. Sandbox is a
  // plain online game vs the bot (no TutorialLayer / coach hints / clinic locks /
  // end-of-game replay POP-UP; header shows "Rules" not "? Guide"). See helpers.
  const isTutorial = coachingActive(roomState);
  // Spotlight "Show me around" tour is the active practice lesson. Gated on the
  // server-set lesson so normal rooms (and the Basics / Power-Clinic lessons)
  // are untouched. Drives the OnlineTourLayer + suppressions below.
  const tourActive = isTutorial && roomState?.tutorialLesson === 'tour';
  // Clear the local "tour finished" latch whenever we're not in the tour, so a
  // later replay starts the walk fresh instead of jumping straight to congrats.
  useEffect(() => { if (!tourActive) setTourDone(false); }, [tourActive]);
  const isMySpinTurn = isSpinPending && spinTargetId === myPlayer.id;
  // (Module 3) The challenged card is face-up for the whole spin_pending window
  // and reverse-flips the moment the spin result lands (ui.spinData is set when
  // the cylinder begins). Drives BluffRevealCard via CenterTablePanel.
  const revealFlipped = isSpinPending && !ui.spinData;
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
  // Responsive seating (Module 1): desktop spreads seats top/left/right around
  // the table; mobile fans them all into the top band (top-arc / horseshoe).
  const distributed = useMemo(
    () => (ui.isMobile ? arcPlayers(otherPlayers) : distributePlayers(otherPlayers)),
    [otherPlayers, ui.isMobile],
  );

  let actionHint = '';
  if (isMyTurn && isPlaying) {
    if (!bluffUsedThisTurn && !cardPlayedThisTurn) {
      if (bluffBlockedThisTurn) {
        actionHint = 'Last turn was frozen - no card to challenge. Play a card from your hand.';
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

  // (Module 5) Unified status ticker. The active player gets the explicit
  // instruction; everyone else gets a subtle line describing what the active
  // player (or the spin target) is doing.
  let tickerText = '';
  if (isMyTurn && isPlaying) {
    tickerText = actionHint;
  } else if (isPlaying && currentPlayer) {
    tickerText = cardPlayedThisTurn
      ? `${currentPlayer.username} has played a card face-down`
      : `${currentPlayer.username} is deciding…`;
  } else if (isSpinPending && spinTargetPlayer && !isMySpinTurn) {
    tickerText = `${spinTargetPlayer.username} is on the spot…`;
  }

  // (Module 3.3) Bluff outcome line. Surfaced on the felt (desktop, bold/large)
  // and above the Pull-Trigger morph (mobile, in BottomSeat).
  const bluffOutcomeText = lastAction?.accusedName
    ? (lastAction.bluffCorrect
        ? `${lastAction.accusedName} bluffed`
        : `${lastAction.accusedName} was not lying`)
    : '';
  const bluffOutcomeColor = lastAction?.bluffCorrect ? 'var(--accent2)' : 'var(--alive)';

  // #139 - eligibility to show the activation modal at all (turn/state gating).
  // The three turn actions are order-independent: neither `cardPlayedThisTurn`
  // nor `bluffUsedThisTurn` gates power activation - it's allowed before or
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
  // #139 - NO turn-start auto-prompt. The Activate/Skip modal opens ONLY
  // when the player explicitly taps their power-card slot (which flips
  // ui.powerConfirmOpen). Eligibility still gates whether that tap is honoured.
  const showPowerModal = powerModalEligible && ui.powerConfirmOpen;

  // Tutorial defensive drill: dim the held Shield/Mirror/Swap during the "play a
  // bluff + end turn" step so the learner doesn't pre-arm it (which would stall
  // the clinic - the server refuses it too). It becomes armable only once the
  // bot's challenge opens the intercept window.
  const powerPreArmLocked = (
    isTutorial
    && isMyTurn
    && !!heldPowerCard
    && !armedPowerCard
    && isDefensivePreArmLocked(roomState?.tutorialScenario, phase)
  );

  // Power Clinic: block End Turn until the drill's scripted action is done (e.g.
  // Call Bluff in the bot-Shield demo, arm the power in Freeze/Assassin). Returns
  // a coach hint to disable the button; null in normal play / once satisfied.
  const endTurnClinicHint = (isTutorial && isMyTurn)
    ? clinicEndTurnLock(roomState?.tutorialScenario, {
        cardPlayedThisTurn,
        bluffUsedThisTurn,
        powerActivatedThisTurn: roomState?.powerActivatedThisTurn,
        // (Module 3.1) Freeze bonus turn - don't block End Turn once it's spent.
        freezeConsumed: !(roomState?.myPowerCardSlot || []).some((c) => c?.power === 'freeze'),
      })
    : null;

  const isSwapPending = roomState?.phase === 'swap_pending';
  const amSwapHolder = isSwapPending && roomState?.swapHolderId === myPlayer?.id;
  const swapPickOptions = roomState?.swapPickOptions || [];
  const myRole = myPlayer?.role || 'barehand';
  // #116 - role reveal is now server-sequenced during the pre_game
  // phase, BEFORE the selection popup. Once the server opens selection
  // (pregame.selectionOpen) the reveal gives way to the picker.
  const inPreGame = phase === 'pre_game';
  const showRoleReveal = inPreGame && !pregame?.selectionOpen && !!myPlayer?.role;
  // §2.1 - keep the modal alive through the private review buffer even after
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

  const renderChip = useCallback((player) => {
    const isSpin = isSpinPending && player.id === spinTargetId;
    const isTurn = isPlaying && player.id === currentPlayerId && player.status === 'alive';
    // (Module 2) Turn / spin status now lives in a contextual bubble anchored to
    // the avatar instead of a global centre banner. Spin takes priority.
    const popup = isSpin
      ? <ChipPopup tone="danger" pulse>On the spot</ChipPopup>
      : isTurn
        ? <ChipPopup tone="turn" pulse>Their turn</ChipPopup>
        : null;
    return (
      <div key={player.id} style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
        {popup}
        <PlayerChip
          player={player}
          isCurrentTurn={player.id === currentPlayerId}
          isNextTurn={rouletteActive && isPlaying && player.id === nextPlayerId}
          isSpinTarget={isSpinPending && player.id === spinTargetId}
          voice={voice}
          onClick={showSpectatorView ? () => ui.handleSpectatePlayer(player.id) : undefined}
          bettingEnabled={bettingEnabled}
          isPactPartner={roomState?.pact?.active && roomState?.pact?.partnerId === player.id}
        />
      </div>
    );
  }, [
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

  // (Role timing) While the spin cylinder is still turning, hold BOTH the
  // event/achievement announcements AND any role decision prompt (Medic save,
  // Sniper redirect) until the animation resolves - so nothing pops over a
  // live spin. They surface the instant the cylinder locks (spinComplete).
  const holdForSpin = !!ui.spinData && !ui.spinComplete;

  // Global pacing - only one overlay at a time. While ANY focus-stealing overlay
  // is up (a spin, a phase prompt, a power/peek/swap modal, the eliminated card),
  // suppress the lower-priority "your turn" notice and HOLD the announcement queue
  // so banners surface one after another instead of stacking over each other.
  const blockingOverlayActive = !!ui.spinData
    || showPowerModal
    || !!ui.peekedCard
    || amSwapHolder
    || isSwapPending
    || (phase === 'bluff_intercept_pending' && !!roomState?.pendingBluffIntercept)
    || phase === 'redemption_pending'
    || showPreGameSelection
    || showRoleReveal
    || amTargetMedic
    || amTargetSniper
    || ui.justEliminated;
  const aBannerShowing = (powerEventQueue?.length || 0) > 0;
  // Announcements wait behind any blocking overlay (broadens the spin-only hold).
  // Also held for the whole spotlight tour so a stray banner can't pop over the
  // cutout (the staged steps don't generate any, but this keeps it guaranteed).
  const holdAnnouncements = holdForSpin || blockingOverlayActive || tourActive;
  // The "your turn" notice is redundant in the guided tutorial (the coach says it)
  // and must never render over another overlay.
  const suppressTurnNotice = isTutorial || blockingOverlayActive || aBannerShowing;

  // Clinic progress for the in-flow top band (reserves its own height; the rest
  // of the HUD sits below it, so nothing is obstructed). The spotlight tour uses
  // a different scenario shape (no index/total) - exclude it so the bar never
  // renders a NaN width during the tour.
  const scenarioForBar = (roomState?.tutorialScenario && !roomState.tutorialScenario.tour)
    ? roomState.tutorialScenario
    : null;
  const clinicComplete = !!roomState?.tutorialClinicComplete;
  const clinicProgressPct = clinicComplete
    ? 100
    : (scenarioForBar ? Math.round(((scenarioForBar.index + 1) / (scenarioForBar.total || 7)) * 100) : null);
  const clinicProgressLabel = clinicComplete
    ? 'Complete'
    : (scenarioForBar?.playerStep ? `Power ${scenarioForBar.playerStep} of ${scenarioForBar.playerTotal || 6}` : 'Power Clinic');

  const isSpinPendingPhase = roomState?.phase === 'spin_pending';

  // #205 - cosmetics. The viewer's OWN felt + card back theme the table via CSS
  // custom properties on this root (defaults in the CSS keep the original look);
  // the spin overlay paints the SPINNER's gun skin so everyone sees their iron.
  // Memoized: this component re-renders constantly (timers, spin frames) and a
  // fresh vars object would make React re-diff the whole root style each time.
  const myCosmeticVars = useMemo(
    () => cosmeticStyleVars(myPlayer?.cosmetics),
    [myPlayer?.cosmetics],
  );
  const spinGunSkinId = ui.spinData
    ? (players?.find((p) => p.id === ui.spinData.spinTargetId)?.cosmetics?.gunSkin || null)
    : null;

  // Spotlight tour - Part-B signals. Each `do-action` beat advances when the
  // SERVER-confirmed effect (or a client overlay) reflects the action, NOT on the
  // raw click. Keyed to the tourContent `waitFor` strings. The step transitions
  // (turn-ended / spin-acknowledged) are driven by the director restaging.
  const tourScenarioStep = roomState?.tutorialScenario?.tour ? roomState.tutorialScenario.step : null;
  const tourSignals = useMemo(() => ({
    'card-pending': !!ui.pendingCard,
    'card-played': !!cardPlayedThisTurn,
    'turn-ended': tourScenarioStep != null && tourScenarioStep !== 'play_card',
    'bluff-called': !!bluffUsedThisTurn,
    'spun': !!ui.spinData,
    'spin-acknowledged': tourScenarioStep === 'activate_power',
    'power-modal-open': !!ui.powerConfirmOpen,
    'power-activated': !!ui.peekedCard || !!roomState?.powerActivatedThisTurn,
  }), [
    ui.pendingCard, cardPlayedThisTurn, tourScenarioStep, bluffUsedThisTurn,
    ui.spinData, ui.powerConfirmOpen, ui.peekedCard, roomState?.powerActivatedThisTurn,
  ]);

  return (
    <div
      ref={wrapperRef}
      style={{
        ...myCosmeticVars,
        position: 'relative',
        // Fill exactly one viewport (dynamic vh handles the mobile URL bar) so
        // the table is compact with no page scroll. The middle scene flexes and
        // scrolls internally only when its content (e.g. lobby settings) is tall.
        height: '100dvh',
        maxHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* Phase 3: ambient smoke drifting across the table during play */}
      <SmokeLayer
        active={roomState?.phase === 'playing' || isSpinPendingPhase}
        intensity={isSpinPendingPhase ? 'high' : 'low'}
      />

      {/* Clinic progress - an IN-FLOW band at the very top: it reserves its own
          height so the HUD below is never obstructed (not a fixed overlay). */}
      {clinicProgressPct != null && (
        <div style={{
          flex: '0 0 auto', position: 'relative', height: 22, width: '100%',
          background: 'linear-gradient(180deg, rgba(8,6,4,0.96), rgba(14,10,6,0.96))',
          borderBottom: '1px solid var(--border-lit)', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0,
            width: `${Math.max(0, Math.min(100, clinicProgressPct))}%`,
            background: 'linear-gradient(90deg, rgba(240,181,74,0.32), rgba(74,255,128,0.32))',
            borderRight: '2px solid var(--accent)',
            boxShadow: '0 0 14px var(--accent)',
            transition: 'width 0.6s cubic-bezier(0.22,1,0.36,1)',
          }} />
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8, pointerEvents: 'none',
            fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--text)', textShadow: '0 1px 3px rgba(0,0,0,0.9)',
          }}>
            <span style={{ color: 'var(--accent)' }}>Progress</span>
            <span>· {clinicProgressLabel} ·</span>
            <span style={{ color: 'var(--alive)' }}>{Math.max(0, Math.min(100, clinicProgressPct))}%</span>
          </div>
        </div>
      )}

      <div style={{ flex: '0 0 auto' }}>
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
        isTutorial={isTutorial}
        onShowGuide={() => setGuideSignal((n) => n + 1)}
        tier={roomState?.tier || null}
      />

      {/* Speed Mode - a turn countdown visible to ALL players (#speedMode). */}
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
      </div>

      {/* (Module 7) Victory declaration floats cleanly ABOVE the table wrapper,
          separate from the felt (which keeps the closing line + host controls). */}
      {isGameOver && (
        <div style={{ flex: '0 0 auto', textAlign: 'center', padding: '4px 12px 2px' }}>
          <div style={{
            fontFamily: "'Cinzel Decorative', 'Cinzel', serif",
            // Smaller + tighter on mobile so "<Name> Prevails" stays on one line.
            fontSize: ui.isMobile ? 18 : 26,
            lineHeight: 1.1,
            color: 'var(--accent)',
            textShadow: '0 0 24px rgba(200,146,46,0.4)',
            letterSpacing: ui.isMobile ? '0.03em' : '0.08em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {lastAction?.dualWin
              ? ((lastAction.winnerIds || []).includes(myPlayer.id)
                  ? 'Shared Victory - The Pact Holds'
                  : `${(lastAction.winnerNames || []).join(' & ')} Prevail`)
              : (lastAction?.winnerId === myPlayer.id ? 'Victory' : `${lastAction?.winnerName ?? '?'} Prevails`)}
          </div>
          {/* #205 - this player's private XP gain for the finished game. */}
          <XpSummary xpAward={xpAward} isMobile={ui.isMobile} />
        </div>
      )}

      <TableScene
        tableCenterRef={ui.tableCenterRef}
        viewportRef={viewportRef}
        boardRef={boardRef}
        panControls={panControls}
        panConstraints={panConstraints}
        isMobile={ui.isMobile}
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
        revealFlipped={revealFlipped}
        dragDisabled={tourActive}
      />

      <div style={{ flex: '0 0 auto', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* (Module 3) The Pull-Trigger morph now lives INSIDE BottomSeat: when it's
          this client's spin, the dock's card hand is replaced by the high-contrast
          trigger panel (obscuring the cards so they can't be misclicked), and it
          tears back down to the exact hand layout once the spin resolves. */}
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
        endTurnLocked={!!endTurnClinicHint}
        endTurnLockHint={endTurnClinicHint || ''}
        isFirstTurn={isFirstTurn}
        bluffUsedThisTurn={bluffUsedThisTurn}
        cardPlayedThisTurn={cardPlayedThisTurn}
        bluffBlockedThisTurn={bluffBlockedThisTurn}
        bluffLocked={!!roomState?.tutorialScenario?.lockBluff}
        actionHint={actionHint}
        tickerText={tickerText}
        isMySpinTurn={isMySpinTurn}
        playerSpin={playerSpin}
        isMobile={ui.isMobile}
        bluffOutcomeText={bluffOutcomeText}
        bluffOutcomeColor={bluffOutcomeColor}
        showSpectatorView={showSpectatorView}
        alivePlayers={alivePlayers}
        spectatingId={ui.spectatingId}
        spectatedHand={ui.spectatedHand}
        handleSpectatePlayer={ui.handleSpectatePlayer}
        myHand={myHand}
        myPowerCardSlot={myPowerCardSlot}
        powerLocked={powerPreArmLocked}
        selectedCardId={ui.selectedCardId}
        handleCardClick={ui.handleCardClick}
        handlePowerCardClick={ui.handlePowerCardClick}
        phase={phase}
        leaveGame={leaveGame}
        reshuffling={reshuffling}
      />
      </div>

      {/* (Module 7) Detached standings hint - a standalone strip at the absolute
          bottom of the layout, OUTSIDE the table, shown only at game over. */}
      {isGameOver && roomState?.groupId && (
        <div style={{
          flex: '0 0 auto',
          textAlign: 'center',
          padding: '6px 12px calc(env(safe-area-inset-bottom, 0px) + 8px)',
          fontFamily: "'Cinzel', serif",
          fontSize: 9,
          color: 'var(--text-dim)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}>
          View standings from the Controls menu
        </div>
      )}

      <CoreGameOverlays
        spinData={ui.spinData}
        spinComplete={ui.spinComplete}
        cylinderRotation={ui.cylinderRotation}
        cylinderAnimating={ui.cylinderAnimating}
        isSpinTarget={isSpinTarget}
        acknowledgeSpinResult={ui.handleSpinContinue}
        pendingCard={ui.pendingCard}
        setPendingCard={ui.setPendingCard}
        whotPickerCard={ui.whotPickerCard}
        setWhotPickerCard={ui.setWhotPickerCard}
        setSelectedCardId={ui.setSelectedCardId}
        playCardOnline={playCardOnline}
        launchCardFlight={launchCardFlight}
        justEliminated={ui.justEliminated}
        setJustEliminated={ui.setJustEliminated}
        onDismissEliminated={ui.dismissEliminated}
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
        isTutorial={isTutorial}
        suppressTurnNotice={suppressTurnNotice}
        spinGunSkinId={spinGunSkinId}
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
        holdForSpin={holdAnnouncements}
        isTutorial={isTutorial}
      />

      {phase === 'redemption_pending' && roomState?.redemption && (
        <RedemptionOverlay
          redemption={roomState.redemption}
          isMine={roomState.redemption.playerId === myPlayer?.id}
          onSpin={handleRedemptionSpin}
          busy={redemptionBusy}
        />
      )}

      {/* Covenant - Blood Debt target picker (private to the just-eliminated
          player). Gated to Covenant rooms; no Blood Debt UI elsewhere. */}
      {roomState?.tier === 'covenant' && bloodDebtPrompt && (
        <BloodDebtOverlay
          prompt={bloodDebtPrompt}
          onPick={(targetUserId) => bloodDebtTarget?.(targetUserId)}
          onDismiss={() => setBloodDebtPrompt?.(null)}
        />
      )}

      {/* Covenant - The Pact (all gated to Covenant rooms). Selector picks a
          partner during pre_game; the target accepts/denies once play begins;
          a partner can volunteer to take a spin. */}
      {roomState?.tier === 'covenant'
        && phase === 'pre_game'
        && roomState?.pact?.amSelector
        && !roomState?.pact?.active
        && !pactSelectorDismissed && (
        <PactSelectorOverlay
          players={(roomState?.players || []).filter(p => p.status === 'alive' && p.id !== myPlayer?.id).map(p => ({ id: p.id, username: p.username }))}
          onChoose={(targetUserId) => pactChoose?.(targetUserId)}
          onDismiss={() => setPactSelectorDismissed(true)}
        />
      )}

      {roomState?.tier === 'covenant'
        && roomState?.pact?.offerPending
        && phase === 'playing' && (
        <PactOfferOverlay
          selectorName={roomState.pact.selectorName}
          onRespond={(accepted) => pactRespond?.(accepted)}
        />
      )}

      {roomState?.tier === 'covenant' && pactVolunteer && (
        <PactVolunteerOverlay
          prompt={pactVolunteer}
          onVolunteer={() => volunteerForPact?.()}
          onDismiss={() => setPactVolunteer?.(null)}
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
        holdForSpin={holdForSpin}
      />

      {/* §1.1 - bluff interception window (accused arms a defence in response). */}
      {phase === 'bluff_intercept_pending' && roomState?.pendingBluffIntercept && (
        <BluffInterceptOverlay
          pending={roomState.pendingBluffIntercept}
          bluffIntercept={bluffIntercept}
          tutorial={isTutorial && !!roomState?.tutorialScenario}
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

      <FlyingCardLayer flights={flights} />

      {/* Tutorial / Practice - guided intro + live coach, gated to tutorial rooms.
          Suppressed during the spotlight tour (OnlineTourLayer owns the screen
          then; the Basics/clinic coach must not compete with the spotlight). */}
      {isTutorial && !tourActive && (
        <TutorialLayer
          roomState={roomState}
          myPlayerId={myPlayer?.id || null}
          isHost={isHost}
          startGame={startGame}
          skipToPowers={skipToPowers}
          advanceTutorial={advanceTutorial}
          startTour={startTour}
          finishTour={finishTour}
          restartRoom={restartRoom}
          leaveGame={leaveGame}
          isMobile={ui.isMobile}
          isMyTurn={isMyTurn}
          spinActive={!!ui.spinData}
          holdClinic={ui.eliminationHold}
          reopenSignal={guideSignal}
          preArmLockSignal={ui.preArmLockSignal}
          clinicActionHint={ui.clinicActionHint}
          lesson={roomState?.tutorialLesson || 'basics'}
        />
      )}

      {/* Spotlight "Show me around" tour - runs over the live table during the
          'tour' practice lesson. The congrats card is gated on the CLIENT
          finishing the final beat (tourDone), NOT on the server's tourComplete:
          the server flags complete the instant the last power is used, but the
          learner still has the result beat to read - showing congrats then would
          cut it off. */}
      {tourActive && !tourDone && (
        <OnlineTourLayer
          isGuest={isGuest}
          partBSignals={tourSignals}
          onComplete={() => setTourDone(true)}
          onSkip={() => { if (typeof finishTour === 'function') finishTour(); }}
        />
      )}
      {tourActive && tourDone && (
        <TourCongrats onBeginPractice={() => { if (typeof finishTour === 'function') finishTour(); }} />
      )}

      <style>{GAME_UI_STYLE}</style>
    </div>
  );
}
