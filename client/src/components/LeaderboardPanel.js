'use client';

import { useEffect, useState } from 'react';

function formatWinRate(wins, gamesPlayed) {
  if (!gamesPlayed) return '—';
  return `${Math.round((wins / gamesPlayed) * 100)}%`;
}

export function LeaderboardPanel({
  groupId,
  currentUserId = null,
  highlightUserId = null,
  getGroupLeaderboard,
  leaderboardUpdateNonce = 0,
}) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      if (!groupId || typeof getGroupLeaderboard !== 'function') {
        if (!cancelled) {
          setLeaderboard([]);
          setLoading(false);
          setLoadError(null);
        }
        return;
      }

      setLoading(true);
      setLoadError(null);
      const res = await getGroupLeaderboard(groupId);
      if (cancelled) return;

      if (res?.success) {
        setLeaderboard(Array.isArray(res.leaderboard) ? res.leaderboard : []);
        setLoadError(null);
      } else {
        setLeaderboard([]);
        setLoadError(res?.error || 'Could not load leaderboard');
      }
      setLoading(false);
    }

    loadLeaderboard();
    return () => {
      cancelled = true;
    };
  }, [getGroupLeaderboard, groupId, leaderboardUpdateNonce]);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 4 }}>
          GROUP LEADERBOARD
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          Ranked by wins, then fewer games played.
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading leaderboard...</div>
      ) : loadError ? (
        <div style={{ fontSize: 12, color: 'var(--accent2)' }}>{loadError}</div>
      ) : leaderboard.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          No games played yet — start one to begin tracking.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '40px minmax(0, 1fr) 56px 60px 54px',
            gap: 8,
            fontSize: 10,
            color: 'var(--text-dim)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            <div>Rank</div>
            <div>Player</div>
            <div style={{ textAlign: 'right' }}>Wins</div>
            <div style={{ textAlign: 'right' }}>Games</div>
            <div style={{ textAlign: 'right' }}>Win %</div>
          </div>

          {leaderboard.map((row, index) => {
            const isSelf = row.userId === currentUserId;
            const isHighlighted = !!highlightUserId && row.userId === highlightUserId;
            return (
              <div
                key={row.userId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px minmax(0, 1fr) 56px 60px 54px',
                  gap: 8,
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${
                    isHighlighted ? 'var(--accent)' : isSelf ? 'var(--alive)' : 'var(--border)'
                  }`,
                  background: isHighlighted
                    ? 'rgba(232,255,74,0.08)'
                    : isSelf
                      ? 'rgba(74,255,128,0.06)'
                      : 'var(--surface2)',
                  fontSize: 12,
                }}
              >
                <div style={{ color: 'var(--text-dim)' }}>#{index + 1}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontWeight: isSelf || isHighlighted ? 700 : 600,
                    color: 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    @{row.username}
                    {isSelf ? ' (you)' : ''}
                    {isHighlighted ? ' winner' : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontWeight: 700 }}>{row.wins}</div>
                <div style={{ textAlign: 'right' }}>{row.gamesPlayed}</div>
                <div style={{ textAlign: 'right' }}>{formatWinRate(row.wins, row.gamesPlayed)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
