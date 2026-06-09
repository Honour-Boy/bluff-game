import { useState } from 'react';

const CYL = 200;
const CX = 100;
const CY = 100;
const ORBIT = 58;
const CHAM_R = 20;

export function CylinderSVG({ bulletChambers, landingChamberIndex, rotation, animating, spinComplete }) {
  const chambers = [0, 1, 2, 3, 4, 5].map((index) => {
    const angleRad = ((index * 60 - 90) * Math.PI) / 180;
    return {
      x: CX + ORBIT * Math.cos(angleRad),
      y: CY + ORBIT * Math.sin(angleRad),
      isBullet: bulletChambers.has(index),
      isLanding: spinComplete && index === landingChamberIndex,
    };
  });

  return (
    <div style={{ position: 'relative', width: CYL, height: CYL }}>
      <svg width={CYL} height={CYL} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 2 }}>
        <polygon
          points={`${CX},${CY - ORBIT - CHAM_R + 2} ${CX - 9},${CY - ORBIT - CHAM_R - 14} ${CX + 9},${CY - ORBIT - CHAM_R - 14}`}
          fill="#c8922e"
        />
      </svg>
      <svg
        width={CYL}
        height={CYL}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transform: `rotate(${rotation}deg)`,
          transformOrigin: `${CX}px ${CY}px`,
          transition: animating ? 'transform 8s cubic-bezier(0.1, 0, 0.2, 1)' : 'none',
        }}
      >
        {/* Cylinder body - dark iron/copper with tavern patina */}
        <circle cx={CX} cy={CY} r={ORBIT + CHAM_R + 8} fill="#1a1208" stroke="#4a3520" strokeWidth={2} />
        {chambers.map((chamber, index) => (
          <g key={index}>
            {chamber.isLanding && (
              <circle
                cx={chamber.x}
                cy={chamber.y}
                r={CHAM_R + 5}
                fill="none"
                stroke={chamber.isBullet ? 'var(--accent2)' : 'var(--alive)'}
                strokeWidth={3}
                opacity={0.85}
              />
            )}
            <circle
              cx={chamber.x}
              cy={chamber.y}
              r={CHAM_R}
              fill={chamber.isBullet ? '#2a0606' : '#100c08'}
              stroke={chamber.isLanding ? (chamber.isBullet ? 'var(--accent2)' : 'var(--alive)') : '#3a2c1c'}
              strokeWidth={chamber.isLanding ? 2.5 : 1.5}
            />
            {chamber.isBullet && (
              <circle
                cx={chamber.x}
                cy={chamber.y}
                r={CHAM_R * 0.42}
                fill={chamber.isLanding ? '#cc2233' : '#6a1818'}
              />
            )}
          </g>
        ))}
        {/* Centre pin - tarnished brass */}
        <circle cx={CX} cy={CY} r={9} fill="#2a1e0e" stroke="#5a4020" strokeWidth={1.5} />
      </svg>
    </div>
  );
}

export function ShareButton({ roomCode, senderName }) {
  const [showFallback, setShowFallback] = useState(false);
  const message = senderName
    ? `Join ${senderName}'s Bluff game! Room code: ${roomCode}`
    : `Join my Bluff game! Room code: ${roomCode}`;
  const url = typeof window !== 'undefined' ? `${window.location.origin}?join=${roomCode}` : '';
  const fullText = `${message}\n${url}`;

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Join my Bluff game!', text: message, url });
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }
    setShowFallback((value) => !value);
  };

  const enc = encodeURIComponent;
  const links = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${enc(fullText)}` },
    { label: 'Telegram', href: `https://t.me/share/url?url=${enc(url)}&text=${enc(message)}` },
    { label: 'SMS', href: `sms:?body=${enc(fullText)}` },
    { label: 'Email', href: `mailto:?subject=${enc('Join my Bluff game!')}&body=${enc(fullText)}` },
  ];

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={handleShare}
        style={{
          fontSize: 11,
          color: 'var(--accent)',
          border: '1px solid var(--accent)',
          background: 'rgba(232,255,74,0.04)',
          padding: '5px 12px',
          borderRadius: 4,
          cursor: 'pointer',
          letterSpacing: '0.06em',
        }}
      >
        Share Room
      </button>
      {showFallback && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 8,
            zIndex: 2000,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            minWidth: 170,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}
        >
          {links.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              onClick={() => setShowFallback(false)}
              style={{
                display: 'block',
                padding: '7px 10px',
                color: 'var(--text)',
                fontSize: 12,
                textDecoration: 'none',
                borderRadius: 4,
                background: 'transparent',
              }}
              onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--surface)'; }}
              onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; }}
            >
              {label}
            </a>
          ))}
          <button
            onClick={() => setShowFallback(false)}
            style={{
              marginTop: 2,
              padding: '5px',
              fontSize: 11,
              color: 'var(--text-dim)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export const PLAYER_UI_STYLE = `
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;
