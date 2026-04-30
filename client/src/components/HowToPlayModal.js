'use client';

import { useState } from 'react';

const PHYSICAL_SECTIONS = [
  {
    title: 'THE SETUP',
    body: 'Each player has a physical Whot card deck. One person is the Game Master — they run the app but do not play. Players join with a room code on their own devices.',
  },
  {
    title: 'EACH TURN',
    body: 'The Game Master announces a required card shape (Circle, Triangle, Cross, Square, or Star). The current player places one card face-down claiming it matches. They then end their turn.',
  },
  {
    title: 'CALLING A BLUFF',
    body: "Before playing their own card, the current player may call bluff on the previous player's card. The Game Master physically reveals that card. If the previous player was lying — they spin the gun. If they were telling the truth — the caller spins.\n\nNote: The first player of the game cannot call bluff since there is no previous card.",
  },
  {
    title: 'THE GUN 🔫',
    body: 'Each player has a risk level starting at 1/6. On a spin, a random number 1–6 is rolled. If the roll is ≤ your risk level you are eliminated. If you survive your risk level increases by 1. Maximum risk is 6/6.',
  },
  {
    title: 'CARD TYPE CHANGES',
    body: 'The required card shape only changes when a player is eliminated. It stays the same across all turns until then.',
  },
  {
    title: 'WINNING A ROUND',
    body: 'When a player plays their last card they tell the Game Master who declares them round winner. All other players reshuffle. The game continues.',
  },
  {
    title: 'WINNING THE GAME',
    body: 'Last player alive wins.',
  },
];

const ONLINE_SECTIONS = [
  {
    title: 'THE SETUP',
    body: 'Everything is digital. The host is a regular player. Cards are dealt automatically — 6 cards each. No physical cards needed.',
  },
  {
    title: 'EACH TURN',
    body: 'A required card shape is shown on screen. You must play one card from your hand that matches the shape — or play a Whot/20 card which matches any shape. Then end your turn.',
  },
  {
    title: 'CALLING A BLUFF',
    body: "Before playing your card, you may call bluff on the previous player's card. The game automatically reveals that card and decides if the bluff was correct.\n\nIf correct (they lied) → previous player spins.\nIf wrong (they told the truth) → you spin.\n\nNote: The first player cannot call bluff. Bluff can only be called once per turn.",
  },
  {
    title: 'THE GUN 🔫',
    body: 'Same as physical mode. Risk level starts at 1/6 and increases on survival.',
  },
  {
    title: 'DRAWING A CARD',
    body: 'If you survive a gun spin you draw one card from the central pile as a penalty.',
  },
  {
    title: 'CARD TYPE CHANGES',
    body: 'The required shape only changes when a player is eliminated.',
  },
  {
    title: 'WINNING A ROUND',
    body: 'First player to play all their cards wins the round. All players are redealt 6 cards. Game continues.',
  },
  {
    title: 'WINNING THE GAME',
    body: 'Last player alive wins.',
  },
  {
    title: 'SPECTATING',
    body: "Eliminated players can watch the game. Tap any player's name to see their hand. Switch between players freely.",
  },
];

export function HowToPlayModal({ onClose, initialTab = 'physical' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const sections = activeTab === 'physical' ? PHYSICAL_SECTIONS : ONLINE_SECTIONS;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9500, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card fade-in"
        style={{ maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Title + close */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 28, color: 'var(--accent)', letterSpacing: '0.1em',
          }}>
            HOW TO PLAY BLUFF
          </div>
          <button
            onClick={onClose}
            style={{ fontSize: 18, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
          {[['physical', 'PHYSICAL MODE'], ['online', 'ONLINE MODE']].map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '10px 0',
                fontSize: 11,
                letterSpacing: '0.12em',
                fontFamily: "'Space Mono', monospace",
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-dim)',
                cursor: 'pointer',
                transition: 'all 0.15s',
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {sections.map(({ title, body }) => (
            <div key={title}>
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 13, letterSpacing: '0.15em',
                color: 'var(--accent)', marginBottom: 6,
              }}>
                {title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>
                {body}
              </div>
            </div>
          ))}
        </div>

        <button onClick={onClose} className="primary" style={{ width: '100%', marginTop: 28 }}>
          Got it
        </button>
      </div>
    </div>
  );
}
