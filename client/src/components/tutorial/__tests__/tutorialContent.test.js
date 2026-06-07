import { describe, it, expect } from 'vitest';
import {
  INTRO_SLIDES,
  BOT_NAME,
  coachFor,
  coachContextFromRoom,
} from '../tutorialContent';

describe('INTRO_SLIDES', () => {
  it('every slide has a unique id, a title and a body', () => {
    const ids = new Set();
    for (const s of INTRO_SLIDES) {
      expect(typeof s.id).toBe('string');
      expect(s.title).toBeTruthy();
      expect(s.body).toBeTruthy();
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
    }
    expect(INTRO_SLIDES.length).toBeGreaterThanOrEqual(4);
  });

  it('the final slide carries a Begin CTA', () => {
    expect(INTRO_SLIDES[INTRO_SLIDES.length - 1].cta).toBeTruthy();
  });
});

describe('coachFor', () => {
  it('returns null in the lobby (intro modal owns that screen)', () => {
    expect(coachFor({ phase: 'lobby' })).toBeNull();
    expect(coachFor({})).toBeNull();
  });

  it('explains the deal during pre_game', () => {
    const c = coachFor({ phase: 'pre_game' });
    expect(c.key).toBe('dealing');
    expect(c.tone).toBe('info');
  });

  it('prompts a play-or-bluff on the player turn before a card is played', () => {
    const c = coachFor({ phase: 'playing', isMyTurn: true, cardPlayedThisTurn: false });
    expect(c.key).toBe('play-or-bluff');
    expect(c.tone).toBe('action');
    expect(c.body).toContain(BOT_NAME);
  });

  it('does NOT offer a bluff on the very first play of the round', () => {
    const c = coachFor({ phase: 'playing', isMyTurn: true, cardPlayedThisTurn: false, isFirstTurn: true });
    expect(c.key).toBe('first-play');
    expect(c.body.toLowerCase()).not.toContain('call bluff');
  });

  it('tells the player to end their turn after a card is played', () => {
    const c = coachFor({ phase: 'playing', isMyTurn: true, cardPlayedThisTurn: true });
    expect(c.key).toBe('end-turn');
  });

  it('narrates the bot turn when it is not the player turn', () => {
    const c = coachFor({ phase: 'playing', isMyTurn: false });
    expect(c.key).toBe('bot-turn');
    expect(c.tone).toBe('info');
  });

  it('distinguishes my spin from the bot spin', () => {
    expect(coachFor({ phase: 'spin_pending', spinTargetIsMe: true }).key).toBe('spin-me');
    const botSpin = coachFor({ phase: 'spin_pending', spinTargetIsMe: false, spinTargetName: 'Dealer Bot' });
    expect(botSpin.key).toBe('spin-bot');
    expect(botSpin.tone).toBe('danger');
  });

  it('celebrates a win and consoles a loss at game over', () => {
    expect(coachFor({ phase: 'game_over', amWinner: true }).title.toLowerCase()).toContain('win');
    const loss = coachFor({ phase: 'game_over', amWinner: false, winnerName: 'Dealer Bot' });
    expect(loss.tone).toBe('win');
    expect(loss.title).toContain('Dealer Bot');
  });

  it('switches to a spectator tip once the player is eliminated', () => {
    const c = coachFor({ phase: 'playing', isMyTurn: false, eliminated: true });
    expect(c.key).toBe('spectating');
  });
});

describe('coachContextFromRoom', () => {
  const room = {
    phase: 'playing',
    currentPlayerId: 'me',
    spinTargetId: 'bot:1',
    cardPlayedThisTurn: true,
    isFirstTurn: false,
    bluffBlockedThisTurn: false,
    lastAction: { winnerId: 'bot:1', winnerName: 'Dealer Bot' },
    players: [
      { id: 'me', username: 'You', status: 'alive' },
      { id: 'bot:1', username: 'Dealer Bot', status: 'alive' },
    ],
  };

  it('derives turn / spin / winner flags relative to the local player', () => {
    const ctx = coachContextFromRoom(room, 'me');
    expect(ctx.isMyTurn).toBe(true);
    expect(ctx.cardPlayedThisTurn).toBe(true);
    expect(ctx.spinTargetIsMe).toBe(false);
    expect(ctx.spinTargetName).toBe('Dealer Bot');
    expect(ctx.amWinner).toBe(false);
    expect(ctx.eliminated).toBe(false);
  });

  it('feeds straight into coachFor', () => {
    const c = coachFor(coachContextFromRoom(room, 'me'));
    expect(c.key).toBe('end-turn'); // my turn, card already played
  });

  it('is safe on a null room', () => {
    expect(coachContextFromRoom(null, 'me')).toEqual({});
  });
});
