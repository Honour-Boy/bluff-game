'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSocket } from '../../lib/socket';

function formatInviteDate(value) {
  if (!value) return 'Pending';
  try {
    return new Date(value).toLocaleString();
  } catch (_) {
    return 'Pending';
  }
}

// ─── Shared panel style — dark aged-oak surface ───────────────────────────────
const panelStyle = {
  background: 'linear-gradient(160deg, rgba(22,17,11,0.95) 0%, rgba(13,10,7,0.97) 100%)',
  border: '1px solid var(--border-lit)',
  borderRadius: 'var(--radius-lg)',
  padding: 20,
  boxShadow: '0 16px 48px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.03)',
};

// ─── Refresh icon button ──────────────────────────────────────────────────────
function RefreshButton({ onRefresh, loading, label = 'Refresh' }) {
  const [busy, setBusy] = useState(false);
  const active = busy || loading;
  const handleClick = async () => {
    if (active || !onRefresh) return;
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={active}
      title="Reload this section"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: "'Cinzel', serif",
        fontSize: 9,
        letterSpacing: '0.16em',
        padding: '6px 12px',
      }}
    >
      <span
        className={active ? 'groups-refresh-icon groups-refresh-icon--spin' : 'groups-refresh-icon'}
        aria-hidden
      >
        &#x21bb;
      </span>
      {active ? 'Consulting…' : label}
    </button>
  );
}

// ─── GroupsScreen — the tavern bulletin board ─────────────────────────────────
export function GroupsScreen({
  username,
  groups,
  invites,
  loading,
  error,
  onBack,
  onCreateGroup,
  onOpenGroup,
  onRespondToInvite,
  onRefresh,
}) {
  const [groupName, setGroupName] = useState('');
  const [busyAction, setBusyAction] = useState(null);
  const [liveOverrides, setLiveOverrides] = useState({});

  useEffect(() => {
    const socket = getSocket();
    const onStatus = (status) => {
      if (!status?.groupId) return;
      setLiveOverrides((prev) => ({ ...prev, [status.groupId]: status }));
    };
    socket.on('group_room_status', onStatus);
    return () => socket.off('group_room_status', onStatus);
  }, []);

  const sortedGroups = useMemo(
    () => [...(groups || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [groups],
  );

  const handleCreate = async (event) => {
    event.preventDefault();
    const trimmed = groupName.trim();
    if (!trimmed) return;
    setBusyAction('create');
    const res = await onCreateGroup(trimmed);
    if (res?.success) setGroupName('');
    setBusyAction(null);
  };

  const handleInviteResponse = async (inviteId, accept) => {
    setBusyAction(`${accept ? 'accept' : 'decline'}:${inviteId}`);
    await onRespondToInvite(inviteId, accept);
    setBusyAction(null);
  };

  return (
    <div
      className="fade-in groups-screen"
      style={{
        width: '100%',
        maxWidth: 980,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        position: 'relative',
        zIndex: 1,
      }}
    >
      {/* Header — inn noticeboard heading */}
      <div
        className="groups-screen__header"
        style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
      >
        <div>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 9,
            color: 'var(--text-dim)',
            letterSpacing: '0.26em',
            marginBottom: 10,
            textTransform: 'uppercase',
          }}>
            Persistent Guilds
          </div>
          <h1
            className="groups-screen__title"
            style={{
              margin: 0,
              fontFamily: "'Cinzel Decorative', 'Cinzel', serif",
              fontSize: 50,
              letterSpacing: '0.08em',
              color: 'var(--accent)',
              lineHeight: 0.92,
              textShadow: '0 0 30px rgba(200,146,46,0.3)',
            }}
          >
            My Groups
          </h1>
          <div style={{
            marginTop: 10,
            fontFamily: "'Crimson Text', serif",
            fontSize: 15,
            color: 'var(--text-dim)',
            maxWidth: 560,
            lineHeight: 1.65,
            fontStyle: 'italic',
          }}>
            Reusable room ciphers. Assemble your crew, manage invitations, and reopen the same table whenever the night calls.
          </div>
        </div>
        <div
          className="groups-screen__header-actions"
          style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}
        >
          <div style={{
            fontFamily: "'Crimson Text', serif",
            fontSize: 13,
            color: 'var(--text-dim)',
            fontStyle: 'italic',
          }}>
            Signed in as <strong style={{ color: 'var(--text)', fontStyle: 'normal' }}>{username}</strong>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="groups-screen__back-btn"
            style={{ minWidth: 140 }}
          >
            ← Back to Tavern
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px 14px',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--accent2)',
          color: '#c85050',
          background: 'rgba(155,28,28,0.1)',
          fontFamily: "'Crimson Text', serif",
          fontSize: 14,
        }}>
          {error}
        </div>
      )}

      <div
        className="groups-screen__grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.45fr) minmax(320px, 1fr)',
          gap: 20,
        }}
      >
        {/* Left — group list: the bulletin notices */}
        <section
          className="groups-screen__panel"
          style={{ ...panelStyle, transform: 'perspective(1000px) rotateY(-1.5deg)' }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
            marginBottom: 16,
          }}>
            <div>
              <div style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 9,
                color: 'var(--text-dim)',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
              }}>
                Posted Guilds
              </div>
              <div style={{
                marginTop: 5,
                fontFamily: "'Crimson Text', serif",
                fontSize: 15,
                color: 'var(--text)',
              }}>
                {sortedGroups.length} {sortedGroups.length === 1 ? 'guild' : 'guilds'} registered
              </div>
            </div>
            <RefreshButton onRefresh={onRefresh} loading={loading} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedGroups.length === 0 && !loading && (
              <div style={{
                padding: '18px 16px',
                borderRadius: 'var(--radius)',
                border: '1px dashed var(--border)',
                color: 'var(--text-dim)',
                background: 'rgba(255,255,255,0.015)',
                fontFamily: "'Crimson Text', serif",
                fontSize: 14,
                lineHeight: 1.65,
                fontStyle: 'italic',
              }}>
                No guilds yet. Found a new one to claim a permanent room cipher for your table.
              </div>
            )}

            {sortedGroups.map((group) => {
              const live = liveOverrides[group.id] || group.liveRoom || null;
              const liveCount = live && live.phase !== 'closed' ? (live.playerCount || 0) : 0;
              const liveLabel = liveCount > 0
                ? (live.inLobby ? `${liveCount} gathering in lobby` : `${liveCount} at the table`)
                : null;
              return (
                <button
                  key={group.id}
                  type="button"

                  onClick={() => onOpenGroup(group.id)}
                  style={{
                    textAlign: 'left',
                    padding: 16,
                    borderRadius: 'var(--radius)',
                    border: `1px solid ${liveCount > 0 ? 'var(--border-glow)' : 'var(--border)'}`,
                    background: liveCount > 0
                      ? 'linear-gradient(160deg, rgba(200,146,46,0.07) 0%, rgba(200,146,46,0.02) 100%)'
                      : 'rgba(255,255,255,0.025)',
                    cursor: 'pointer',
                    transition: 'all var(--transition)',
                    boxShadow: liveCount > 0 ? '0 0 14px var(--glow-gold)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div>
                      <div style={{
                        fontFamily: "'Cinzel', serif",
                        fontSize: 22,
                        letterSpacing: '0.08em',
                        color: 'var(--text)',
                        lineHeight: 1.1,
                      }}>
                        {group.name}
                      </div>
                      <div style={{
                        marginTop: 6,
                        fontFamily: "'Cinzel', serif",
                        fontSize: 9,
                        color: 'var(--text-dim)',
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                      }}>
                        Cipher: {group.code}
                      </div>
                      {liveLabel && (
                        <div style={{
                          marginTop: 8,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          fontFamily: "'Cinzel', serif",
                          fontSize: 9,
                          color: 'var(--accent)',
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                        }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: 'var(--accent)',
                            boxShadow: '0 0 6px var(--accent)',
                          }} aria-hidden />
                          {liveLabel}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{
                        fontFamily: "'Cinzel', serif",
                        fontSize: 9,
                        color: group.role === 'host' ? 'var(--accent)' : 'var(--text-dim)',
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                      }}>
                        {group.role === 'host' ? 'Guildmaster' : 'Member'}
                      </div>
                      <div style={{
                        marginTop: 6,
                        fontFamily: "'Crimson Text', serif",
                        fontSize: 13,
                        color: 'var(--text-dim)',
                        fontStyle: 'italic',
                      }}>
                        {group.memberCount} {group.memberCount === 1 ? 'patron' : 'patrons'}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

        </section>

        {/* Right column — create + invites */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Found a guild */}
          <section className="groups-screen__panel" style={panelStyle}>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 9,
              color: 'var(--text-dim)',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginBottom: 14,
            }}>
              Found a New Guild
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: 7,
                  fontFamily: "'Cinzel', serif",
                  fontSize: 9,
                  color: 'var(--text-dim)',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                }}>
                  Guild Name
                </label>
                <input
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  maxLength={64}
                  placeholder="Friday Night Bluff"

                />
              </div>
              <button
                type="submit"
                className="primary"

                disabled={busyAction === 'create' || !groupName.trim()}
              >
                {busyAction === 'create' ? 'Founding…' : 'Found Guild'}
              </button>
            </form>
          </section>

          {/* Pending invites */}
          <section className="groups-screen__panel" style={panelStyle}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
              marginBottom: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: 9,
                  color: 'var(--text-dim)',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                }}>
                  Pending Invitations
                </div>
                {(invites?.length || 0) > 0 && (
                  <div style={{
                    fontFamily: "'Cinzel', serif",
                    fontSize: 9,
                    color: 'var(--accent)',
                    padding: '2px 8px',
                    border: '1px solid var(--accent-dim)',
                    borderRadius: 2,
                  }}>
                    {invites.length}
                  </div>
                )}
              </div>
              <RefreshButton onRefresh={onRefresh} loading={loading} />
            </div>

            {(!invites || invites.length === 0) && (
              <div style={{
                padding: '14px 12px',
                borderRadius: 'var(--radius)',
                border: '1px dashed var(--border)',
                color: 'var(--text-dim)',
                fontFamily: "'Crimson Text', serif",
                fontSize: 14,
                lineHeight: 1.65,
                fontStyle: 'italic',
              }}>
                No invitations at the moment.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(invites || []).map((invite) => (
                <div
                  key={invite.id}
                  style={{
                    padding: '14px 14px',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border-lit)',
                    background: 'rgba(200,146,46,0.04)',
                  }}
                >
                  <div style={{
                    fontFamily: "'Cinzel', serif",
                    fontSize: 20,
                    letterSpacing: '0.08em',
                    color: 'var(--text)',
                  }}>
                    {invite.group?.name}
                  </div>
                  <div style={{
                    marginTop: 7,
                    fontFamily: "'Crimson Text', serif",
                    fontSize: 13,
                    color: 'var(--text-dim)',
                    lineHeight: 1.6,
                    fontStyle: 'italic',
                  }}>
                    Invited by <strong style={{ color: 'var(--text)', fontStyle: 'normal' }}>{invite.invitedByUsername}</strong>
                    <br />
                    Cipher {invite.group?.code} · {formatInviteDate(invite.createdAt)}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="primary"
    
                      onClick={() => handleInviteResponse(invite.id, true)}
                      disabled={busyAction === `accept:${invite.id}` || busyAction === `decline:${invite.id}`}
                    >
                      {busyAction === `accept:${invite.id}` ? 'Joining…' : 'Accept Invitation'}
                    </button>
                    <button
                      type="button"
    
                      onClick={() => handleInviteResponse(invite.id, false)}
                      disabled={busyAction === `accept:${invite.id}` || busyAction === `decline:${invite.id}`}
                    >
                      {busyAction === `decline:${invite.id}` ? 'Declining…' : 'Decline'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .groups-screen__header { flex-direction: column !important; align-items: stretch !important; }
          .groups-screen__header-actions {
            align-items: flex-start !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            width: 100% !important;
            flex-wrap: wrap !important;
          }
          .groups-screen__title { font-size: clamp(28px, 10vw, 46px) !important; }
          .groups-screen__back-btn { min-width: 0 !important; }
          .groups-screen__grid { grid-template-columns: 1fr !important; }
          .groups-screen__panel { padding: 14px !important; transform: none !important; }
        }
      `}</style>
    </div>
  );
}
