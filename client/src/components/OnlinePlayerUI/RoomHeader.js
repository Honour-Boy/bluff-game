import { useState } from 'react';

// ─── Share dropdown — tavern-styled ──────────────────────────────────────────
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
    setShowFallback((c) => !c);
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
          fontFamily: "'Cinzel', serif",
          fontSize: 9,
          color: 'var(--accent)',
          border: '1px solid var(--accent-dim)',
          background: 'rgba(200,146,46,0.06)',
          padding: '5px 12px',
          borderRadius: 3,
          cursor: 'pointer',
          letterSpacing: '0.12em',
        }}
      >
        Share Table
      </button>
      {showFallback && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          background: 'linear-gradient(160deg, var(--surface3) 0%, var(--surface2) 100%)',
          border: '1px solid var(--border-lit)',
          borderRadius: 4,
          padding: 8,
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          minWidth: 150,
          boxShadow: '0 8px 28px rgba(0,0,0,0.6)',
        }}>
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
                fontFamily: "'Cinzel', serif",
                fontSize: 10,
                letterSpacing: '0.1em',
                color: 'var(--text)',
                textDecoration: 'none',
                borderRadius: 3,
                background: 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(200,146,46,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {label}
            </a>
          ))}
          <button
            onClick={() => setShowFallback(false)}
            style={{ marginTop: 2, padding: '5px', fontFamily: "'Cinzel', serif", fontSize: 9, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', letterSpacing: '0.1em' }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ─── RoomHeader — the tavern table's nameplate ────────────────────────────────
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
    <div style={{
      display: 'grid',
      // Three zones: BLUFF + code (left), status + Rules (centre), and a
      // spacer (right) that the fixed global settings gear floats over.
      gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'start',
      gap: 8,
      padding: '8px 10px 10px',
      borderBottom: '1px solid var(--border)',
      background: 'linear-gradient(180deg, rgba(16,12,8,0.96) 0%, rgba(10,8,5,0.8) 100%)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
    }}>
      {/* Left: title + room code wax seal */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        <h1 style={{
          fontFamily: "'Cinzel Decorative', 'Cinzel', serif",
          fontSize: 20,
          color: isEliminated ? 'var(--accent2)' : 'var(--accent)',
          lineHeight: 1,
          margin: 0,
          textShadow: isEliminated
            ? '0 0 14px rgba(155,28,28,0.5)'
            : '0 0 18px rgba(200,146,46,0.4)',
          letterSpacing: '0.1em',
        }}>
          BLUFF
        </h1>
        {/* Room code — wax seal style */}
        <div
          title="Tap to copy cipher"
          onClick={() => navigator.clipboard?.writeText(roomCode)}
          style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: '0.22em',
            color: 'var(--accent)',
            border: '1px solid var(--accent-dim)',
            padding: '3px 10px',
            borderRadius: 3,
            background: 'rgba(200,146,46,0.07)',
            cursor: 'pointer',
            display: 'inline-block',
            lineHeight: 1.3,
            alignSelf: 'flex-start',
            boxShadow: '0 0 8px rgba(200,146,46,0.1)',
            transition: 'box-shadow 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 16px rgba(200,146,46,0.28)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 8px rgba(200,146,46,0.1)'; }}
        >
          {roomCode}
        </div>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 8,
          color: 'var(--text-dim)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}>
          Round {roundNumber} · tap to copy
        </div>
        {isLobby && myPlayer && (
          <ShareButton roomCode={roomCode} senderName={myPlayer.username} />
        )}
      </div>

      {/* Centre: the player lifecycle indicator (Module 4.3) sits prominently in
          the top-middle, directly ABOVE the Rules control. It is the single
          home for Alive/Eliminated status (removed from the profile/nameplate). */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, justifySelf: 'center', paddingTop: 2 }}>
        {myPlayer && !isLobby && (
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            padding: '3px 12px',
            borderRadius: 3,
            color: isEliminated ? 'var(--accent2)' : 'var(--alive)',
            border: `1px solid ${isEliminated ? 'var(--accent2)' : 'var(--alive)'}`,
            background: isEliminated ? 'rgba(155,28,28,0.12)' : 'rgba(74,155,74,0.12)',
            boxShadow: isEliminated ? '0 0 10px rgba(155,28,28,0.25)' : '0 0 10px rgba(74,155,74,0.25)',
          }}>
            {isEliminated ? 'Eliminated' : 'Alive'}
          </div>
        )}
        <button
          onClick={onShowHowToPlay}
          style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 9,
            color: 'var(--text-dim)',
            border: '1px solid var(--border)',
            background: 'none',
            padding: '4px 10px',
            borderRadius: 3,
            cursor: 'pointer',
            letterSpacing: '0.1em',
          }}
        >
          Rules
        </button>
      </div>

      {/* Right: spacer reserved for the fixed global settings gear (name + menu) */}
      <div aria-hidden="true" />
    </div>
  );
}
