// ============================================================
// GAME ENGINE — Re-export shim (issue #105 PR A)
// ============================================================
// The engine has been split into focused modules under ./engine/.
// This file exists ONLY to preserve the historical `require('./gameEngine')`
// and `import from '../gameEngine.js'` surface — every symbol that used
// to live in this file is re-exported here, so no consumer needs to
// change its imports.
//
// When adding new engine helpers, add them to the appropriate sub-module
// in ./engine/ and re-export from this shim ONLY if external callers
// (socketHandlers.js, tests) need them.

const constants = require('./engine/constants');
const chamber = require('./engine/chamber');
const deck = require('./engine/deck');
const cards = require('./engine/cards');
const handHelpers = require('./engine/handHelpers');
const powerCards = require('./engine/powerCards');
const players = require('./engine/players');
const roles = require('./engine/roles');
const pregame = require('./engine/pregame');
const spin = require('./engine/spin');
const bluff = require('./engine/bluff');
const modifiers = require('./engine/modifiers');
const betting = require('./engine/betting');
const room = require('./engine/room');
const serialize = require('./engine/serialize');

module.exports = {
  // ─── Constants & config ──────────────────────────────────
  MODES: constants.MODES,
  CARD_TYPES: constants.CARD_TYPES,
  SHAPES: constants.SHAPES,
  POWER_TYPES: constants.POWER_TYPES,
  INTERCEPTABLE_POWERS: constants.INTERCEPTABLE_POWERS,
  BLUFF_INTERCEPT_WINDOW_MS: constants.BLUFF_INTERCEPT_WINDOW_MS,
  ROLES: constants.ROLES,
  ROLE_TYPES: constants.ROLE_TYPES,
  ROLES_AT_MIN_ALIVE: constants.ROLES_AT_MIN_ALIVE,
  COLLECTOR_POWER_CARD_CAP: constants.COLLECTOR_POWER_CARD_CAP,
  MEDIC_MAX_SAVES: constants.MEDIC_MAX_SAVES,
  MEDIC_SAVE_HAND_CAP: constants.MEDIC_SAVE_HAND_CAP,
  ROLE_REVEAL_DISPLAY_MS: constants.ROLE_REVEAL_DISPLAY_MS,
  PRE_GAME_SELECTION_TIMEOUT_MS: constants.PRE_GAME_SELECTION_TIMEOUT_MS,
  PRE_GAME_LATE_THRESHOLD_MS: constants.PRE_GAME_LATE_THRESHOLD_MS,
  PRE_GAME_LATE_REVIEW_MS: constants.PRE_GAME_LATE_REVIEW_MS,
  RESOLUTION_TIERS: constants.RESOLUTION_TIERS,
  GAME_EVENT_TYPES: constants.GAME_EVENT_TYPES,
  MAX_PLAYERS: constants.MAX_PLAYERS,
  CHAMBER_SIZE: constants.CHAMBER_SIZE,
  CHAT_TEXT_MAX: constants.CHAT_TEXT_MAX,
  BOUNTY_THRESHOLD: constants.BOUNTY_THRESHOLD,
  BETTING_WINDOW_MS: constants.BETTING_WINDOW_MS,
  BETTING_STREAK_REWARD: constants.BETTING_STREAK_REWARD,
  DMH_VOTE_WINDOW_MS: constants.DMH_VOTE_WINDOW_MS,
  DMH_THRESHOLD_MARGIN: constants.DMH_THRESHOLD_MARGIN,
  SUDDEN_DEATH_THRESHOLD: constants.SUDDEN_DEATH_THRESHOLD,
  SPIN_PENDING_TIMEOUT_MS: constants.SPIN_PENDING_TIMEOUT_MS,
  PENDING_GAME_OVER_TIMEOUT_MS: constants.PENDING_GAME_OVER_TIMEOUT_MS,
  REDEMPTION_PENDING_TIMEOUT_MS: constants.REDEMPTION_PENDING_TIMEOUT_MS,
  defaultRoomConfig: constants.defaultRoomConfig,
  normalizeRoomConfig: constants.normalizeRoomConfig,

  // ─── Chamber ─────────────────────────────────────────────
  DEATH_CURVE: chamber.DEATH_CURVE,
  deathProbability: chamber.deathProbability,
  initChamber: chamber.initChamber,
  addBulletToChamber: chamber.addBulletToChamber,
  pullTrigger: chamber.pullTrigger,

  // ─── Deck ────────────────────────────────────────────────
  generateDeck: deck.generateDeck,
  shuffleDeck: deck.shuffleDeck,
  buildDeck: deck.buildDeck,
  buildPowerCards: deck.buildPowerCards,
  dealCards: deck.dealCards,
  _appendExtraCards: deck._appendExtraCards,

  // ─── Card-type helpers + online card play ────────────────
  randomCardType: cards.randomCardType,
  randomShape: cards.randomShape,
  newCardType: cards.newCardType,
  validateAndPlayCard: cards.validateAndPlayCard,
  ensureDrawPile: cards.ensureDrawPile,
  drawCardForPlayer: cards.drawCardForPlayer,

  // ─── Power cards ─────────────────────────────────────────
  activatePowerCard: powerCards.activatePowerCard,
  applyAssassinBackfirePenalty: powerCards.applyAssassinBackfirePenalty,
  consumeFreezeOnTurnEnd: powerCards.consumeFreezeOnTurnEnd,
  isSwapActivatable: powerCards.isSwapActivatable,
  listInterceptCards: powerCards.listInterceptCards,
  canInterceptBluff: powerCards.canInterceptBluff,
  armInterceptCard: powerCards.armInterceptCard,

  // ─── Players / turn lifecycle ────────────────────────────
  createPlayer: players.createPlayer,
  getCurrentPlayer: players.getCurrentPlayer,
  advanceTurn: players.advanceTurn,
  getPreviousTurnPlayerId: players.getPreviousTurnPlayerId,
  eliminateFromTurnOrder: players.eliminateFromTurnOrder,
  eliminatePlayer: players.eliminatePlayer,
  handleDisconnect: players.handleDisconnect,
  checkGameOver: players.checkGameOver,
  declareRoundWinner: players.declareRoundWinner,
  reconnectPlayer: players.reconnectPlayer,
  pickReplacementHost: players.pickReplacementHost,
  reconcileHostSocket: players.reconcileHostSocket,

  // ─── Roles ───────────────────────────────────────────────
  assignRoles: roles.assignRoles,
  getRole: roles.getRole,
  isBarehandVisible: roles.isBarehandVisible,
  findAvailableMedic: roles.findAvailableMedic,
  findAvailableSniper: roles.findAvailableSniper,
  applyMedicSave: roles.applyMedicSave,
  applySaboteurTransfer: roles.applySaboteurTransfer,
  applySniperRedirect: roles.applySniperRedirect,

  // ─── Pre-game selection & role reveal (#116) ─────────────
  generateSelectionPool: pregame.generateSelectionPool,
  beginPreGame: pregame.beginPreGame,
  startPreGameSelection: pregame.startPreGameSelection,
  applyPreGameSelection: pregame.applyPreGameSelection,
  finalizePreGame: pregame.finalizePreGame,

  // ─── Spin + Bounty + Survival hand reset ─────────────────
  spinGun: spin.spinGun,
  getSpinModifiers: spin.getSpinModifiers,
  resetHandOnSurvival: spin.resetHandOnSurvival,
  applyGlobalBluffReshuffle: spin.applyGlobalBluffReshuffle,
  onSurvivalForBounty: spin.onSurvivalForBounty,
  onEliminationForBounty: spin.onEliminationForBounty,
  collectBounty: spin.collectBounty,

  // ─── Bluff resolution + round reset ──────────────────────
  resolveBluff: bluff.resolveBluff,
  resolveBluffOnline: bluff.resolveBluffOnline,
  resetRoundOnline: bluff.resetRoundOnline,

  // ─── Risk/Room modifiers + Ghost vote + Last Stand ───────
  tickSuddenDeath: modifiers.tickSuddenDeath,
  resetSuddenDeath: modifiers.resetSuddenDeath,
  getMirrorMatchOpposite: modifiers.getMirrorMatchOpposite,
  isMirrorMatchEligibleAtStart: modifiers.isMirrorMatchEligibleAtStart,
  pickRedemptionCandidates: modifiers.pickRedemptionCandidates,
  runRedemptionSpin: modifiers.runRedemptionSpin,
  resetRedemptionFlags: modifiers.resetRedemptionFlags,
  shouldEnterLastStand: modifiers.shouldEnterLastStand,
  enterLastStand: modifiers.enterLastStand,
  lastStandSpin: modifiers.lastStandSpin,
  lastStandEndTurn: modifiers.lastStandEndTurn,
  shouldOpenGhostVote: modifiers.shouldOpenGhostVote,
  startGhostVote: modifiers.startGhostVote,
  castGhostVote: modifiers.castGhostVote,
  resolveGhostVote: modifiers.resolveGhostVote,

  // ─── Betting ─────────────────────────────────────────────
  startBettingWindow: betting.startBettingWindow,
  placeBet: betting.placeBet,
  closeBettingWindow: betting.closeBettingWindow,
  evaluateBets: betting.evaluateBets,

  // ─── Room / chat / replay ────────────────────────────────
  generateRoomCode: room.generateRoomCode,
  createRoom: room.createRoom,
  startGame: room.startGame,
  appendChatMessage: room.appendChatMessage,
  resetRoomForReplay: room.resetRoomForReplay,

  // ─── Serialisation ───────────────────────────────────────
  serializeRoom: serialize.serializeRoom,
};
