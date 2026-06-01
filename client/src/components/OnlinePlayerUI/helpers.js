export const SHAPES = ['circle', 'triangle', 'cross', 'square', 'star'];

export const GAME_UI_STYLE = `
  /* ── Tavern table animations ── */
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  /* Card flips in from face-down — physics slide */
  @keyframes cardFlipIn {
    0%   { transform: rotateY(90deg) scaleX(0.3) translateY(8px); opacity: 0; }
    55%  { transform: rotateY(-6deg) scaleX(1.03) translateY(-2px); opacity: 1; }
    100% { transform: rotateY(0deg) scaleX(1) translateY(0); opacity: 1; }
  }
  /* Card slides up + fades when played (kept within the cardholder trough so it
     never gets clipped by the row's overflow). */
  @keyframes cardPlayPhysics {
    0%   { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
    40%  { transform: translateY(-30px) rotate(-4deg) scale(1.08); opacity: 1; }
    100% { transform: translateY(-80px) rotate(var(--card-land-rot,2deg)) scale(0.92); opacity: 0.85; }
  }
  /* Card-fly: a fixed clone arcs from the hand to the centre pile, then fades.
     --fly-dx/--fly-dy are the centre-to-centre delta set inline per flight. */
  @keyframes cardFly {
    0%   { transform: translate(0,0) rotate(0deg) scale(1); opacity: 1; }
    18%  { transform: translate(calc(var(--fly-dx) * 0.12), calc(var(--fly-dy) * 0.12 - 34px)) rotate(-2deg) scale(1.06); opacity: 1; }
    100% { transform: translate(var(--fly-dx), var(--fly-dy)) rotate(var(--fly-rot, 8deg)) scale(0.46); opacity: 0; }
  }
  .card-fly { animation: cardFly 0.62s cubic-bezier(0.45, 0, 0.2, 1) forwards; will-change: transform, opacity; }
  /* Active-turn chip: warm amber candlelight pulse */
  @keyframes chipTurnPulse {
    0%, 100% { box-shadow: 0 0 8px rgba(200,146,46,0.3), 0 2px 8px rgba(0,0,0,0.6); }
    50%       { box-shadow: 0 0 22px rgba(200,146,46,0.65), 0 2px 8px rgba(0,0,0,0.6); }
  }
  /* Spin target: blood-red pulsing doom ring */
  @keyframes spinTargetPulse {
    0%, 100% { box-shadow: 0 0 8px rgba(155,28,28,0.4); }
    50%       { box-shadow: 0 0 24px rgba(155,28,28,0.8), 0 0 48px rgba(155,28,28,0.2); }
  }
  /* Table surface entrance */
  @keyframes tableEntrance {
    0%   { opacity: 0; transform: perspective(800px) translateZ(-20px); }
    100% { opacity: 1; transform: perspective(800px) translateZ(0); }
  }
  /* Dealt card fan-in */
  @keyframes cardDealIn {
    0%   { opacity: 0; transform: translateY(18px) rotate(var(--deal-rot,0deg)); }
    100% { opacity: 1; transform: translateY(0) rotate(var(--deal-rot,0deg)); }
  }
  /* Spin result flash */
  @keyframes spinResultFlash {
    0%, 100% { opacity: 1; }
    30%       { opacity: 0.3; }
    60%       { opacity: 1; }
  }

  .topdown-table-scene {
    animation: tableEntrance 0.5s ease-out forwards;
  }
  .card-play-physics {
    animation: cardPlayPhysics 0.45s cubic-bezier(0.22,1,0.36,1) forwards;
  }

  /* ── The real oval card table ────────────────────────────────────────────
     A dark plank floor (.tavern-floor) holds an elliptical table built from
     nested layers: a carved-wood RAIL, a ring of brass STUDS, the green FELT
     (recessed under the rail with an inner shadow), and a stitched edge. All
     decorative + pointer-events:none; the seats and play area render on top. */
  .tavern-floor {
    position: relative;
    background:
      radial-gradient(ellipse 92% 72% at 50% 42%, rgba(52,34,20,0.55) 0%, rgba(14,10,7,0.92) 66%, #090605 100%),
      repeating-linear-gradient(91deg, #16110c 0px, #16110c 46px, #110c08 46px, #110c08 48px);
  }
  .poker-table-oval {
    position: absolute;
    inset: 4.5% 3% 3% 3%;
    border-radius: 50%;
    background:
      radial-gradient(ellipse at 50% -8%, rgba(214,158,70,0.18) 0%, transparent 55%),
      linear-gradient(180deg, #3e2817 0%, #2b1910 44%, #1c0f09 100%);
    border: 1px solid rgba(120,80,40,0.5);
    box-shadow:
      0 40px 74px rgba(0,0,0,0.72),
      inset 0 2px 5px rgba(255,210,140,0.16),
      inset 0 -12px 34px rgba(0,0,0,0.6);
    pointer-events: none;
  }
  .poker-table-studs {
    position: absolute;
    inset: 7px;
    border-radius: 50%;
    border: 3px dotted rgba(198,152,76,0.5);
    box-shadow: 0 0 9px rgba(198,152,76,0.18);
    pointer-events: none;
  }
  .poker-table-felt {
    position: absolute;
    inset: 18px;
    border-radius: 50%;
    background:
      radial-gradient(ellipse 56% 44% at 50% 38%, rgba(220,164,76,0.18) 0%, rgba(220,164,76,0.05) 42%, transparent 72%),
      radial-gradient(ellipse 82% 72% at 50% 50%, #2f5e3f 0%, #245132 36%, #18391f 64%, #0e2415 84%, #0a1a10 100%);
    box-shadow: inset 0 0 56px rgba(0,0,0,0.55), inset 0 7px 24px rgba(0,0,0,0.45);
    pointer-events: none;
  }
  .poker-table-stitch {
    position: absolute;
    inset: 9px;
    border-radius: 50%;
    border: 1px dashed rgba(232,216,184,0.16);
    pointer-events: none;
  }

  @media (max-width: 640px) {
    .topdown-middle { gap: 6px !important; }
    .topdown-side { max-height: 48vh !important; }
    .topdown-chip {
      width: 64px !important;
      height: 88px !important;
      padding: 5px !important;
    }
    .poker-table-oval { inset: 2.5% 1% 1.5% 1%; }
    .poker-table-felt { inset: 14px; }
  }
`;

// ─── #121: Announcement accuracy ──────────────────────────────
// Single source of truth mapping a server `power_card_triggered`
// event `kind` to the banner it should render: which PRESETS entry
// to use (visual identity), the headline, and a subtitle builder.
//
// EVERY kind the server can emit as `power_card_triggered` MUST be
// listed here. A kind that is NOT listed is treated as unknown:
// `buildAnnouncementBannerProps` returns null and warns, so the
// banner renders nothing instead of silently impersonating another
// outcome (pre-#121 every unmapped kind fell through to
// "BLUFF BLOCKED").
//
// NOTE on Peek: `peek_used` is intentionally absent — Peek is private
// to its holder and is delivered via the activate_power_card callback,
// never broadcast as `power_card_triggered`, so it never reaches here.
const ANNOUNCEMENT_MAP = {
  // Bluff-pipeline outcomes
  shield_blocked: { preset: 'bluff_blocked', title: 'BLUFF BLOCKED', subtitle: (e) => (e.holderName ? `${e.holderName}'s Shield` : 'Shield held') },
  sheriff_protected: { preset: 'sheriff_protected', title: 'SHERIFF PROTECTED', subtitle: () => 'assassin held back' },
  assassin_backfire: { preset: 'assassin_backfire', title: 'ASSASSIN BACKFIRES', subtitle: (e) => `${e.holderName || 'Holder'} draws +${e.cardsDrawn || 3}` },
  mirror_reflected: { preset: 'bluff_reflected', title: 'BLUFF REFLECTED', subtitle: (e) => (e.redirectedToName ? `back to ${e.redirectedToName}` : 'reflected') },
  assassin_strike: { preset: 'assassin', title: 'ASSASSIN STRIKE', subtitle: (e) => (e.eliminatedName ? `${e.eliminatedName} eliminated` : '') },
  gambler_caught: { preset: 'gambler_caught', title: 'GAMBLER CAUGHT', subtitle: () => 'risk jumps to 4' },
  sheriff_relief: { preset: 'sheriff_relief', title: 'SHERIFF RELIEVED', subtitle: () => 'one bullet removed' },
  swap_resolved: { preset: 'swap_resolved', title: 'SWAP RESOLVED', subtitle: () => 'card swapped' },
  // Role abilities + role pauses
  medic_deciding: { preset: 'medic_deciding', title: 'MEDIC DECIDING', subtitle: (e) => (e.eliminatedPlayerName ? `${e.eliminatedPlayerName} on the line` : 'a save is pending') },
  medic_saved: { preset: 'medic_saved', title: 'MEDIC SAVE', subtitle: (e) => (e.revivedPlayerName ? `${e.revivedPlayerName} revived` : 'player revived') },
  medic_skipped: { preset: 'medic_skipped', title: 'NO SAVE', subtitle: (e) => (e.eliminatedPlayerName ? `${e.eliminatedPlayerName} eliminated` : 'elimination stands') },
  sniper_redirect: { preset: 'sniper_redirect', title: 'SNIPER REDIRECT', subtitle: (e) => (e.toName ? `to ${e.toName}` : 'spin redirected') },
  // Systems
  freeze_skip: { preset: 'freeze_applied', title: 'FROZEN', subtitle: (e) => (e.skippedName ? `${e.skippedName} is skipped` : 'turn skipped') },
  bounty_placed: { preset: 'bounty', title: 'BOUNTY PLACED', subtitle: (e) => (e.holderName ? `on ${e.holderName}` : '') },
  bounty_collected: { preset: 'bounty_collected', title: 'BOUNTY COLLECTED', subtitle: (e) => { const who = e.accuserName || e.collectorName; return who ? `${who} reduces risk` : ''; } },
  betting_open: { preset: 'betting_open', title: 'PLACE YOUR BETS', subtitle: () => '' },
  betting_streak_reward: { preset: 'betting_streak_reward', title: 'BETTING STREAK!', subtitle: (e) => (e.playerName ? `${e.playerName} predicts well` : '') },
  sudden_death: { preset: 'sudden_death', title: 'SUDDEN DEATH', subtitle: () => 'everyone gains a bullet' },
  ghost_vote_started: { preset: 'ghost_vote_started', title: 'GHOST COUNCIL CONVENES', subtitle: () => 'the dead are voting' },
  ghost_vote_result: { preset: 'ghost_vote_result', title: 'GHOST COUNCIL DECIDES', subtitle: (e) => e.result || e.winningOption || '' },
  last_stand_entered: { preset: 'last_stand_entered', title: 'LAST STAND', subtitle: () => 'two finalists remain' },
  system_notice: { preset: 'system_notice', title: 'NOTICE', subtitle: (e) => e.message || '' },
  // #6 — highlight callouts
  first_blood: { preset: 'first_blood', title: 'FIRST BLOOD', subtitle: (e) => (e.eliminatedName ? `${e.eliminatedName} falls first` : 'the first to fall') },
  survival_streak: { preset: 'survival_streak', title: 'NERVES OF STEEL', subtitle: (e) => `${e.holderName || 'Survivor'} — ${e.streak || 3} spins survived in a row` },
};

export function buildAnnouncementBannerProps(evt) {
  if (!evt || !evt.kind) return null;

  const entry = ANNOUNCEMENT_MAP[evt.kind];
  if (!entry) {
    if (typeof console !== 'undefined') {
      console.warn('[buildAnnouncementBannerProps] unknown event kind:', evt.kind);
    }
    return null;
  }

  return {
    kind: entry.preset,
    title: entry.title,
    subtitle: typeof entry.subtitle === 'function' ? entry.subtitle(evt) : (entry.subtitle || ''),
    playerName: evt.holderName,
  };
}

export function orderClockwiseFromLocal(others, turnOrder, localId) {
  const list = Array.isArray(others) ? others : [];
  if (list.length === 0) return list;
  if (!Array.isArray(turnOrder) || turnOrder.length === 0) return list;

  const myIdx = turnOrder.indexOf(localId);
  if (myIdx === -1) return list;

  const byId = new Map(list.map((player) => [player.id, player]));
  const ordered = [];
  const seen = new Set();

  for (let i = 1; i < turnOrder.length; i += 1) {
    const id = turnOrder[(myIdx + i) % turnOrder.length];
    const player = byId.get(id);
    if (player) {
      ordered.push(player);
      seen.add(id);
    }
  }

  for (const player of list) {
    if (!seen.has(player.id)) ordered.push(player);
  }

  return ordered;
}

export function distributePlayers(others) {
  const list = Array.isArray(others) ? others : [];
  const total = list.length;
  if (total === 0) return { top: [], left: [], right: [] };

  let topCount;
  if (total <= 3) {
    topCount = total;
  } else if (total <= 6) {
    topCount = 2;
  } else if (total <= 10) {
    topCount = Math.ceil(total / 3);
  } else {
    topCount = Math.max(0, total - 12);
  }

  const remaining = total - topCount;
  const rightCount = Math.ceil(remaining / 2);
  const leftCount = remaining - rightCount;

  const rightSlice = list.slice(0, rightCount);
  const topSlice = list.slice(rightCount, rightCount + topCount);
  const leftSlice = list.slice(rightCount + topCount, rightCount + topCount + leftCount);

  return {
    right: rightSlice.slice().reverse(),
    top: topSlice.slice().reverse(),
    left: leftSlice,
  };
}
