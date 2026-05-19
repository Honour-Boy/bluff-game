import { useState } from 'react';
import { VoicePanel } from '../VoicePanel';

function ShareButton({ roomCode, senderName }) {
  const [showFallback, setShowFallback] = useState(false);

  const message = `Join ${senderName}'s Bluff game! Room code: ${roomCode}`;
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
    setShowFallback((current) => !current);
  };

  const encode = encodeURIComponent;
  const links = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${encode(fullText)}` },
    { label: 'Telegram', href: `https://t.me/share/url?url=${encode(url)}&text=${encode(message)}` },
    { label: 'SMS', href: `sms:?body=${encode(fullText)}` },
    { label: 'Email', href: `mailto:?subject=${encode('Join my Bluff game!')}&body=${encode(fullText)}` },
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

export function RoomHeader({
  roomCode,
  roundNumber,
  isEliminated,
  isHost,
  isLobby,
  myPlayer,
  voice,
  isMobile,
  onShowHowToPlay,
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        padding: '4px 4px 12px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1
          style={{
            fontSize: 24,
            color: isEliminated ? 'var(--accent2)' : 'var(--accent)',
            lineHeight: 1,
            fontFamily: "'Bebas Neue', sans-serif",
            margin: 0,
          }}
        >
          BLUFF
        </h1>
        <div
          title="Click to copy"
          onClick={() => navigator.clipboard?.writeText(roomCode)}
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 18,
            letterSpacing: '0.18em',
            color: 'var(--accent)',
            border: '1px solid var(--accent)',
            padding: '2px 10px',
            borderRadius: 'var(--radius)',
            background: 'rgba(232,255,74,0.04)',
            cursor: 'pointer',
            display: 'inline-block',
            lineHeight: 1.2,
            alignSelf: 'flex-start',
          }}
        >
          {roomCode}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
          Round {roundNumber} · tap to copy
        </div>
        {isLobby && myPlayer && (
          <ShareButton roomCode={roomCode} senderName={myPlayer.username} />
        )}
        {voice && !isMobile && <VoicePanel {...voice} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
        <span className={`tag ${isEliminated ? 'eliminated' : 'alive'}`}>
          {isEliminated ? 'Eliminated' : isHost ? 'Host · Alive' : 'Alive'}
        </span>
        <button
          onClick={onShowHowToPlay}
          style={{
            fontSize: 10,
            color: 'var(--text-dim)',
            border: '1px solid var(--border)',
            background: 'none',
            padding: '3px 8px',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          ? How to Play
        </button>
      </div>
    </div>
  );
}
