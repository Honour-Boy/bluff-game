export const SHAPES = ['circle', 'triangle', 'cross', 'square', 'star'];

export const GAME_UI_STYLE = `
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  @keyframes cardFlipIn {
    0% { transform: rotateY(90deg) scaleX(0.4); opacity: 0; }
    60% { transform: rotateY(-8deg) scaleX(1.02); opacity: 1; }
    100% { transform: rotateY(0deg) scaleX(1); opacity: 1; }
  }
  @keyframes chipTurnPulse {
    0%, 100% { box-shadow: 0 0 8px rgba(255,170,74,0.25); }
    50% { box-shadow: 0 0 18px rgba(255,170,74,0.55); }
  }
  @media (max-width: 640px) {
    .topdown-middle { gap: 6px !important; }
    .topdown-side { max-height: 48vh !important; }
    .topdown-chip {
      width: 64px !important;
      height: 88px !important;
      padding: 5px !important;
    }
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
