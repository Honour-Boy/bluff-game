// ============================================================
// Tests for the chat append + cap behaviour.
// ============================================================

import { describe, it, expect } from 'vitest';
import { appendChatMessage, CHAT_TEXT_MAX, createRoom } from '../gameEngine.js';

describe('appendChatMessage', () => {
  it('appends a normal message with id + ts', () => {
    const room = createRoom('socket1');
    const msg = appendChatMessage(room, { userId: 'u1', username: 'Alice', text: 'hello' });
    expect(msg).toMatchObject({ userId: 'u1', username: 'Alice', text: 'hello' });
    expect(msg.id).toBeTypeOf('string');
    expect(typeof msg.ts).toBe('number');
    expect(room.chatLog).toHaveLength(1);
  });

  it('returns null + does not append when text is empty or whitespace only', () => {
    const room = createRoom('socket1');
    expect(appendChatMessage(room, { userId: 'u1', username: 'A', text: '' })).toBeNull();
    expect(appendChatMessage(room, { userId: 'u1', username: 'A', text: '   ' })).toBeNull();
    expect(room.chatLog).toHaveLength(0);
  });

  it(`truncates messages longer than CHAT_TEXT_MAX (${CHAT_TEXT_MAX}) chars`, () => {
    const room = createRoom('socket1');
    const long = 'x'.repeat(CHAT_TEXT_MAX + 100);
    const msg = appendChatMessage(room, { userId: 'u1', username: 'A', text: long });
    expect(msg.text).toHaveLength(CHAT_TEXT_MAX);
  });

  it('caps chatLog at 50 messages, dropping the oldest', () => {
    const room = createRoom('socket1');
    for (let i = 0; i < 60; i++) {
      appendChatMessage(room, { userId: 'u1', username: 'A', text: `msg ${i}` });
    }
    expect(room.chatLog).toHaveLength(50);
    expect(room.chatLog[0].text).toBe('msg 10'); // first 10 dropped
    expect(room.chatLog[49].text).toBe('msg 59');
  });
});
