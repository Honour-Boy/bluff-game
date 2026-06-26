'use client';

import { useEffect, useRef, useState } from 'react';

const TOTAL_MS = 15000;

/**
 * Speed Mode countdown - visible to EVERY player, not just the active one.
 * Shows whose turn it is and how long they have left before the server
 * auto-ends their turn (no spin - #79). The server stamps the deadline and
 * sends `speedModeMsRemaining` on every room_state; between pushes we tick the
 * remaining time down locally and re-sync whenever a fresh snapshot arrives.
 */
export default function SpeedModeTimer({ msRemaining, totalMs = TOTAL_MS, playerName, isMe }) {
  const [remaining, setRemaining] = useState(msRemaining);
  const deadlineRef = useRef(Date.now() + msRemaining);

  useEffect(() => {
    deadlineRef.current = Date.now() + msRemaining;
    setRemaining(msRemaining);
    const id = setInterval(() => {
      const left = Math.max(0, deadlineRef.current - Date.now());
      setRemaining(left);
      if (left <= 0) clearInterval(id);
    }, 200);
    return () => clearInterval(id);
  }, [msRemaining]);

  const secs = Math.max(0, Math.ceil(remaining / 1000));
  const pct = Math.max(0, Math.min(100, (remaining / totalMs) * 100));
  const urgent = remaining <= 5000;
  const barColor = urgent ? 'var(--danger, #9b1c1c)' : 'var(--accent, #c8922e)';

  return (
    <div
      role="timer"
      aria-live="off"
      style={{
        margin: '6px auto 0',
        maxWidth: 420,
        width: '92%',
        padding: '6px 10px',
        borderRadius: 8,
        background: 'rgba(9, 7, 5, 0.72)',
        border: `1px solid ${barColor}55`,
        boxShadow: urgent ? `0 0 12px ${barColor}55` : 'none',
        fontFamily: "'Cinzel', serif",
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--text-dim, #b9a98a)',
          marginBottom: 4,
        }}
      >
        <span>{isMe ? 'Your turn' : `${playerName || 'Player'}'s turn`}</span>
        <span style={{ color: barColor, fontWeight: 700 }}>{secs}s</span>
      </div>
      <div
        style={{
          height: 5,
          borderRadius: 3,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: barColor,
            transition: 'width 0.2s linear',
          }}
        />
      </div>
    </div>
  );
}
