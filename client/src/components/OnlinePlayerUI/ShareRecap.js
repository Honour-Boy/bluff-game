import { useState } from 'react';

// ─── ShareRecap — lean v1 of the shareable end-of-game recap (#207) ───────────
// Client-only: a small "Final Tally" card + a Share action that uses the Web
// Share API where available and falls back to copying the recap to the
// clipboard. No server state, no image generation — a foundation the full
// stylized/image version can grow from.
export function ShareRecap({ didWin, winnerName, totalPlayers, username }) {
  const [copied, setCopied] = useState(false);

  const headline = didWin
    ? '👑 Victory at the tavern!'
    : `${winnerName || 'Another rogue'} took the table.`;

  const recapText = didWin
    ? `👑 I won a hand of Bluff — outlasted ${Math.max(0, (totalPlayers || 1) - 1)} other ${totalPlayers === 2 ? 'rogue' : 'rogues'} at the chamber. Think you'd survive the spin?`
    : `🎲 I rolled the chamber in Bluff and ${winnerName || 'someone'} prevailed. Bet you can't outlast the table.`;

  const shareUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const fullText = `${recapText}${shareUrl ? `\n${shareUrl}` : ''}`;

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Bluff', text: recapText, url: shareUrl || undefined });
        return;
      } catch (_) {
        // user cancelled or unsupported payload — fall through to copy
      }
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(fullText);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch (_) {
      // clipboard blocked — last-resort no-op (button just won't confirm)
    }
  };

  return (
    <div style={{
      margin: '16px auto 4px',
      maxWidth: 320,
      background: 'linear-gradient(160deg, rgba(26,20,12,0.9) 0%, rgba(13,10,7,0.95) 100%)',
      border: '1px solid var(--border-lit)',
      borderRadius: 'var(--radius-lg)',
      padding: '14px 16px',
      boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
    }}>
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: 9,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color: 'var(--accent-dim)',
        marginBottom: 6,
      }}>
        Final Tally
      </div>
      <div style={{
        fontFamily: "'Crimson Text', serif",
        fontSize: 15,
        color: 'var(--text)',
        lineHeight: 1.4,
        marginBottom: 4,
      }}>
        {headline}
      </div>
      <div style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: 10,
        letterSpacing: '0.06em',
        color: 'var(--text-dim)',
        marginBottom: 12,
      }}>
        {username ? `${username} · ` : ''}{totalPlayers || 1} at the table
      </div>
      <button
        onClick={handleShare}
        className={didWin ? 'primary' : undefined}
        style={{
          width: '100%',
          padding: '11px',
          letterSpacing: '0.12em',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8.6 10.5 15.4 6.5M8.6 13.5 15.4 17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {copied ? 'Copied to clipboard' : 'Share result'}
      </button>
    </div>
  );
}
