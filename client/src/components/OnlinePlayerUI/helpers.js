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

export function buildAnnouncementBannerProps(evt) {
  if (!evt) return null;

  const kind = (() => {
    switch (evt.kind) {
      case 'shield_blocked':
        return 'bluff_blocked';
      case 'mirror_reflected':
        return 'bluff_reflected';
      case 'assassin_strike':
        return 'assassin';
      case 'assassin_backfire':
        return 'bluff_blocked';
      case 'swap_resolved':
        return 'bluff_blocked';
      case 'freeze_skip':
        return 'sudden_death';
      case 'gambler_caught':
        return 'assassin';
      case 'sheriff_relief':
        return 'bluff_blocked';
      case 'sheriff_protected':
        return 'bluff_blocked';
      case 'medic_save':
        return 'sudden_death';
      case 'sniper_redirect':
        return 'assassin';
      default:
        return 'bluff_blocked';
    }
  })();

  const titleByKind = {
    shield_blocked: 'BLUFF BLOCKED',
    mirror_reflected: 'BLUFF REFLECTED',
    assassin_strike: 'ASSASSIN STRIKE',
    assassin_backfire: 'ASSASSIN BACKFIRES',
    swap_resolved: 'SWAP RESOLVED',
    freeze_skip: 'FREEZE',
    gambler_caught: 'GAMBLER CAUGHT',
    sheriff_relief: 'SHERIFF RELIEVED',
    sheriff_protected: 'SHERIFF PROTECTED',
    medic_save: 'MEDIC SAVE',
    sniper_redirect: 'SNIPER REDIRECT',
  };

  const subtitle = (() => {
    if (evt.kind === 'mirror_reflected') {
      return evt.redirectedToName ? `â†’ ${evt.redirectedToName}` : '';
    }
    if (evt.kind === 'assassin_strike') {
      return evt.eliminatedName ? `${evt.eliminatedName} eliminated` : '';
    }
    if (evt.kind === 'assassin_backfire') {
      const drawn = evt.cardsDrawn || 3;
      return `${evt.holderName || 'Holder'} draws +${drawn}`;
    }
    if (evt.kind === 'swap_resolved') return 'card swapped';
    if (evt.kind === 'freeze_skip') {
      return evt.skippedName ? `${evt.skippedName} is skipped` : 'turn skipped';
    }
    if (evt.kind === 'gambler_caught') return 'risk jumps to 4';
    if (evt.kind === 'sheriff_relief') return 'one bullet removed';
    if (evt.kind === 'sheriff_protected') return 'assassin held back';
    if (evt.kind === 'medic_save') {
      return evt.revivedPlayerName ? `${evt.revivedPlayerName} revived` : 'player revived';
    }
    if (evt.kind === 'sniper_redirect') {
      return evt.toName ? `â†’ ${evt.toName}` : 'spin redirected';
    }
    return '';
  })();

  return {
    kind,
    title: titleByKind[evt.kind],
    subtitle,
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
