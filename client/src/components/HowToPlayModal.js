'use client';

const SECTIONS = [
  {
    title: 'The Setup',
    body: 'Each player has a physical deck of cards. The host manages the game digitally. Players join with a room code. No auth required.',
  },
  {
    title: 'Each Turn',
    body: 'The host generates a required card type (square, circle, triangle, cross, or star) displayed on screen. The current player must place one card face-down claiming it is that type — they may lie. Then they end their turn.',
  },
  {
    title: 'Calling a Bluff',
    body: "Before playing their card, the current player may call bluff on the previous player's card. The host physically reveals that card. If the previous player was lying — they spin the gun. If they were telling the truth — the caller spins.",
  },
  {
    title: 'The Gun',
    body: 'Each player starts at risk level 1 out of 6. When you spin, a random number 1–6 is rolled. If the roll is ≤ your risk level you are eliminated. If you survive your risk level increases by 1, making every future spin more dangerous. Maximum risk is 6 out of 6.',
  },
  {
    title: 'Winning a Round',
    body: 'When a player plays their last card they tell the host, who declares them the round winner on screen. All other players reshuffle their physical cards. The game continues.',
  },
  {
    title: 'Winning the Game',
    body: 'Last player alive wins.',
  },
];

export function HowToPlayModal({ onClose }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9500,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card fade-in"
        style={{ maxWidth: 520, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 28,
            color: 'var(--accent)',
            letterSpacing: '0.1em',
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

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {SECTIONS.map(({ title, body }) => (
            <div key={title}>
              <div style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.15em',
                color: 'var(--accent)',
                marginBottom: 6,
                textTransform: 'uppercase',
              }}>
                {title}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.7 }}>
                {body}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="primary"
          style={{ width: '100%', marginTop: 28 }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
