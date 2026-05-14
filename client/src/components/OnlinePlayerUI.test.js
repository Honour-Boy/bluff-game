import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { distributePlayers, orderClockwiseFromLocal, CardHand } from './OnlinePlayerUI';

// Compact fixture helper — only the fields seating cares about.
const mkPlayers = (...ids) => ids.map((id) => ({ id, username: id.toUpperCase(), status: 'alive' }));

// Compact card factory — only the fields CardHand looks at.
const card = (id, overrides = {}) => ({
  id,
  shape: overrides.shape ?? 'circle',
  number: overrides.number ?? 5,
  ...overrides,
});

describe('orderClockwiseFromLocal — issue #82', () => {
  it('returns the input unchanged when turnOrder is missing or empty', () => {
    const others = mkPlayers('a', 'b', 'c');
    expect(orderClockwiseFromLocal(others, undefined, 'me')).toEqual(others);
    expect(orderClockwiseFromLocal(others, [], 'me')).toEqual(others);
    expect(orderClockwiseFromLocal(others, null, 'me')).toEqual(others);
  });

  it('returns the input unchanged when the local user is not in turnOrder', () => {
    const others = mkPlayers('a', 'b', 'c');
    // 'me' missing from turnOrder — bail out, don't crash
    expect(orderClockwiseFromLocal(others, ['a', 'b', 'c'], 'me')).toEqual(others);
  });

  it('starts with the next-in-turn player and walks clockwise', () => {
    // Turn order: me → a → b → c → d → me. Others reordered:
    //   first = a (next), then b, c, d (previous).
    const others = mkPlayers('c', 'a', 'd', 'b'); // input order intentionally scrambled
    const ordered = orderClockwiseFromLocal(others, ['me', 'a', 'b', 'c', 'd'], 'me');
    expect(ordered.map(p => p.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('wraps around when the local user is mid-turnOrder', () => {
    // Turn order: a → b → me → c → d. Clockwise from me: c, d, a, b.
    const others = mkPlayers('a', 'b', 'c', 'd');
    const ordered = orderClockwiseFromLocal(others, ['a', 'b', 'me', 'c', 'd'], 'me');
    expect(ordered.map(p => p.id)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('appends players present in others but missing from turnOrder', () => {
    // Spectator/eliminated player 'ghost' lives in others but is no
    // longer in turnOrder — must still appear in the seating list.
    const others = mkPlayers('a', 'ghost', 'b');
    const ordered = orderClockwiseFromLocal(others, ['me', 'a', 'b'], 'me');
    expect(ordered.map(p => p.id)).toEqual(['a', 'b', 'ghost']);
  });
});

describe('distributePlayers — clockwise seating (issue #82)', () => {
  it('returns empty seats when no other players', () => {
    expect(distributePlayers([])).toEqual({ top: [], left: [], right: [] });
  });

  it('places the lone other player on top (2-player Last Stand, no regression)', () => {
    const others = mkPlayers('a');
    const seats = distributePlayers(others);
    expect(seats.top.map(p => p.id)).toEqual(['a']);
    expect(seats.left).toEqual([]);
    expect(seats.right).toEqual([]);
  });

  it('with 4 others: next-in-turn sits on the right, previous on the left', () => {
    // Clockwise input: a (next) → b → c → d (previous)
    const others = mkPlayers('a', 'b', 'c', 'd');
    const seats = distributePlayers(others);
    // n=4: topCount=2, remaining=2 → rightCount=1, leftCount=1
    expect(seats.right.map(p => p.id)).toEqual(['a']);
    expect(seats.left.map(p => p.id)).toEqual(['d']);
    // top is the middle of clockwise list, rendered left-to-right
    // (which is right-to-left in clockwise sweep): so JSX leftmost is
    // clockwise[2] = 'c', JSX rightmost is clockwise[1] = 'b'.
    expect(seats.top.map(p => p.id)).toEqual(['c', 'b']);
  });

  it('right column reads bottom→top in clockwise order (last array entry is closest to local)', () => {
    // 7 others — enough to fill right with multiple chips.
    // n=7: topCount=ceil(7/3)=3, remaining=4, rightCount=2, leftCount=2
    const others = mkPlayers('a', 'b', 'c', 'd', 'e', 'f', 'g');
    const seats = distributePlayers(others);
    expect(seats.right.map(p => p.id)).toEqual(['b', 'a']);
    expect(seats.top.map(p => p.id)).toEqual(['e', 'd', 'c']);
    expect(seats.left.map(p => p.id)).toEqual(['f', 'g']);
    // The chip rendered at the bottom of the right column (last entry)
    // is the player closest in clockwise order — i.e. the next-in-turn.
    expect(seats.right[seats.right.length - 1].id).toBe('a');
  });

  it('odd remainder favours the right column (next-in-turn keeps a right seat)', () => {
    // 5 others — n=5: topCount=2, remaining=3, rightCount=2, leftCount=1.
    const others = mkPlayers('a', 'b', 'c', 'd', 'e');
    const seats = distributePlayers(others);
    expect(seats.right.map(p => p.id)).toEqual(['b', 'a']);
    expect(seats.left.map(p => p.id)).toEqual(['e']);
    expect(seats.top.map(p => p.id)).toEqual(['d', 'c']);
  });

  it('caps each side at 6 chips and pushes overflow to the top (large lobby)', () => {
    // 14 others — n=14, n>10 so topCount = max(0, 14 - 12) = 2,
    // remaining=12, rightCount=6, leftCount=6.
    const others = mkPlayers(...Array.from({ length: 14 }, (_, i) => `p${i}`));
    const seats = distributePlayers(others);
    expect(seats.right).toHaveLength(6);
    expect(seats.left).toHaveLength(6);
    expect(seats.top).toHaveLength(2);
    // Sum equals input length — no chip dropped.
    expect(seats.right.length + seats.top.length + seats.left.length).toBe(14);
    // No duplicates across seats.
    const allIds = [...seats.right, ...seats.top, ...seats.left].map(p => p.id);
    expect(new Set(allIds).size).toBe(14);
  });

  it('handles non-array input defensively', () => {
    expect(distributePlayers(null)).toEqual({ top: [], left: [], right: [] });
    expect(distributePlayers(undefined)).toEqual({ top: [], left: [], right: [] });
  });

  it('does not mutate the input list', () => {
    const others = mkPlayers('a', 'b', 'c', 'd');
    const snapshot = others.map(p => p.id);
    distributePlayers(others);
    expect(others.map(p => p.id)).toEqual(snapshot);
  });
});

describe('clockwise seating reflows on elimination (issue #82)', () => {
  it('removed player drops out and the remaining seating stays clockwise', () => {
    // Before elimination: me → a → b → c → d. Clockwise others = [a,b,c,d].
    const before = orderClockwiseFromLocal(
      mkPlayers('a', 'b', 'c', 'd'),
      ['me', 'a', 'b', 'c', 'd'],
      'me',
    );
    expect(before.map(p => p.id)).toEqual(['a', 'b', 'c', 'd']);

    // 'b' eliminated → turnOrder loses 'b'. 'b' may also be filtered
    // out of `others` if the consumer hides eliminated players, but
    // typically it stays (status='eliminated'). Either way the
    // surviving order must remain clockwise.
    const after = orderClockwiseFromLocal(
      mkPlayers('a', 'c', 'd'),
      ['me', 'a', 'c', 'd'],
      'me',
    );
    expect(after.map(p => p.id)).toEqual(['a', 'c', 'd']);
  });
});

describe('CardHand — armed power-card visual state (issue #64)', () => {
  it('renders the placeholder when the hand is empty', () => {
    render(<CardHand hand={[]} />);
    expect(screen.getByText(/No cards in hand/i)).toBeInTheDocument();
  });

  it('does NOT mark a normal (un-armed) card with the lock badge', () => {
    const onCardClick = vi.fn();
    render(<CardHand hand={[card('c1')]} onCardClick={onCardClick} />);
    expect(screen.queryByLabelText(/Activated — awaiting trigger/i)).toBeNull();
    // Clicks on a normal card go through.
    fireEvent.click(screen.getByText('5'));
    expect(onCardClick).toHaveBeenCalledWith('c1');
  });

  it('shows the lock badge for an armed card', () => {
    render(
      <CardHand hand={[card('p1', { type: 'power', power: 'assassin', armed: true })]} />,
    );
    expect(screen.getByLabelText(/Activated — awaiting trigger/i)).toBeInTheDocument();
  });

  it('halves the inner-card opacity when armed', () => {
    render(
      <CardHand
        hand={[
          card('plain'),
          card('armed-card', { type: 'power', power: 'shield', armed: true }),
        ]}
      />,
    );
    const lock = screen.getByLabelText(/Activated — awaiting trigger/i);
    // The lock badge is a sibling of the dimmed inner. The dimmed
    // inner is its previousElementSibling — assert opacity ~0.5.
    const inner = lock.previousElementSibling;
    expect(inner).not.toBeNull();
    expect(inner.style.opacity).toBe('0.5');
  });

  it('disables pointer events on the armed card so it cannot be re-clicked', () => {
    const onCardClick = vi.fn();
    render(
      <CardHand
        hand={[card('p1', { type: 'power', power: 'assassin', armed: true })]}
        onCardClick={onCardClick}
        interactive
      />,
    );
    const lock = screen.getByLabelText(/Activated — awaiting trigger/i);
    const outer = lock.parentElement; // the per-card wrapper
    expect(outer.style.pointerEvents).toBe('none');

    // Defence in depth — even if the test fires click directly,
    // the onClick guard (`cardInteractive && onCardClick`) ignores it.
    fireEvent.click(outer);
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it('exposes a hover tooltip via the title attribute on the armed card', () => {
    render(
      <CardHand hand={[card('p1', { type: 'power', power: 'shield', armed: true })]} />,
    );
    const lock = screen.getByLabelText(/Activated — awaiting trigger/i);
    const outer = lock.parentElement;
    expect(outer.getAttribute('title')).toBe('Activated — awaiting trigger');
  });

  it('non-armed cards in the same hand stay clickable when one card is armed', () => {
    const onCardClick = vi.fn();
    render(
      <CardHand
        hand={[
          card('normal', { shape: 'square', number: 7 }),
          card('armed-card', { type: 'power', power: 'assassin', armed: true }),
        ]}
        onCardClick={onCardClick}
        interactive
      />,
    );
    fireEvent.click(screen.getByText('7'));
    expect(onCardClick).toHaveBeenCalledWith('normal');
  });

  it('does not invoke onCardClick when the hand is non-interactive even for normal cards', () => {
    const onCardClick = vi.fn();
    render(
      <CardHand
        hand={[card('c1')]}
        onCardClick={onCardClick}
        interactive={false}
      />,
    );
    fireEvent.click(screen.getByText('5'));
    expect(onCardClick).not.toHaveBeenCalled();
  });
});
