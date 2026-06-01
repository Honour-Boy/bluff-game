'use client';

import { useState } from 'react';

function formatJoinedDate(value) {
  if (!value) return 'Joined recently';
  try {
    return `Joined ${new Date(value).toLocaleDateString()}`;
  } catch (_) {
    return 'Joined recently';
  }
}

const panelStyle = {
  background: 'linear-gradient(160deg, rgba(22,17,11,0.95) 0%, rgba(13,10,7,0.97) 100%)',
  border: '1px solid var(--border-lit)',
  borderRadius: 'var(--radius-lg)',
  padding: 20,
  boxShadow: '0 16px 48px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.03)',
};

// ─── Refresh button ───────────────────────────────────────────────────────────
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

// ─── GroupDetailScreen — the guild ledger page ────────────────────────────────
export function GroupDetailScreen({
  group,
  currentUserId,
  loading,
  error,
  onBack,
  onEnterRoom,
  onInvite,
  onTransferHost,
  onReclaimHost,
  onHandBackHost,
  onRemoveMember,
  onDeleteGroup,
  onLeaveGroup,
  onRevokeInvite,
  onResetRoom,
  onRefresh,
}) {
  const [inviteIdentifier, setInviteIdentifier] = useState('');
  const [busyAction, setBusyAction] = useState(null);
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetMsg, setResetMsg] = useState('');

  const isHost = group?.role === 'host';
  const ownerUserId = group?.ownerUserId || null;
  const actingHostId = group?.hostUserId || null;
  const isOwner = !!ownerUserId && currentUserId === ownerUserId;
  const isActingHost = !!actingHostId && currentUserId === actingHostId;
  const standInActive = !!ownerUserId && !!actingHostId && ownerUserId !== actingHostId;

  if (!group) {
    return (
      <div style={{
        maxWidth: 880, margin: '0 auto',
        fontFamily: "'Crimson Text', serif",
        color: 'var(--text-dim)',
        fontStyle: 'italic',
        fontSize: 16,
      }}>
        Consulting the ledger…
      </div>
    );
  }

  const handleCopyCode = async () => {
    if (!group.code || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(group.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (_) {
      setCopied(false);
    }
  };

  const handleInvite = async (event) => {
    event.preventDefault();
    const trimmed = inviteIdentifier.trim();
    if (!trimmed) return;
    setBusyAction('invite');
    const res = await onInvite(trimmed);
    if (res?.success) setInviteIdentifier('');
    setBusyAction(null);
  };

  const handleTransferHost = async (userId) => {
    setBusyAction(`transfer:${userId}`);
    await onTransferHost(userId);
    setBusyAction(null);
  };

  const handleReclaimHost = async () => {
    setBusyAction('reclaim');
    await onReclaimHost?.();
    setBusyAction(null);
  };

  const handleHandBackHost = async () => {
    setBusyAction('handback');
    await onHandBackHost?.();
    setBusyAction(null);
  };

  const handleRemoveMember = async (userId) => {
    setBusyAction(`remove:${userId}`);
    await onRemoveMember(userId);
    setBusyAction(null);
  };

  const handleRevokeInvite = async (inviteId) => {
    setBusyAction(`revoke:${inviteId}`);
    await onRevokeInvite(inviteId);
    setBusyAction(null);
  };

  const handleDeleteGroup = async () => {
    setBusyAction('delete');
    await onDeleteGroup();
    setBusyAction(null);
  };

  const handleLeaveGroup = async () => {
    setBusyAction('leave');
    await onLeaveGroup();
    setBusyAction(null);
  };

  const handleResetRoom = async () => {
    if (resetting || !onResetRoom) return;
    setResetting(true);
    setResetMsg('');
    const res = await onResetRoom();
    setResetting(false);
    setConfirmReset(false);
    setResetMsg(res?.success
      ? 'Room reset — everyone was returned to the lobby.'
      : (res?.error || 'Could not reset the room.'));
    setTimeout(() => setResetMsg(''), 4000);
  };

  return (
    <div
      className="fade-in group-detail"
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
      {/* Header */}
      <div
        className="group-detail__header"
        style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
      >
        <div className="group-detail__header-text">
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 9,
            color: 'var(--text-dim)',
            letterSpacing: '0.26em',
            marginBottom: 10,
            textTransform: 'uppercase',
          }}>
            Guild Registry
          </div>
          <h1
            className="group-detail__title"
            style={{
              margin: 0,
              fontFamily: "'Cinzel Decorative', 'Cinzel', serif",
              fontSize: 52,
              letterSpacing: '0.08em',
              color: 'var(--accent)',
              lineHeight: 0.92,
              overflowWrap: 'anywhere',
              textShadow: '0 0 30px rgba(200,146,46,0.25)',
            }}
          >
            {group.name}
          </h1>
          <div style={{
            marginTop: 10,
            fontFamily: "'Crimson Text', serif",
            fontSize: 15,
            color: 'var(--text-dim)',
            lineHeight: 1.65,
            fontStyle: 'italic',
          }}>
            Permanent cipher <strong style={{ color: 'var(--text-mid)', fontStyle: 'normal', letterSpacing: '0.1em' }}>{group.code}</strong>.{' '}
            {isHost
              ? 'You govern access to this chamber.'
              : 'You may enter whenever the guild convenes.'}
          </div>
        </div>
        <div
          className="group-detail__header-actions"
          style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}
        >
          <button type="button" onClick={onBack}>
            ← Back to Guilds
          </button>
          <button type="button" className="primary" onClick={onEnterRoom}>
            Enter the Room →
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

      {/* Stand-in host notice */}
      {standInActive && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          padding: '12px 16px',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border-glow)',
          background: 'rgba(200,146,46,0.07)',
          fontFamily: "'Crimson Text', serif",
          fontSize: 14,
          color: 'var(--text)',
          fontStyle: 'italic',
        }}>
          <span>
            <strong style={{ fontStyle: 'normal', color: 'var(--accent)' }}>
              {(group.members || []).find((m) => m.userId === actingHostId)?.username || 'A stand-in'}
            </strong>
            {' '}is acting Guildmaster (temporary).{' '}
            <strong style={{ fontStyle: 'normal' }}>
              {(group.members || []).find((m) => m.userId === ownerUserId)?.username || 'The owner'}
            </strong>
            {' '}remains the true proprietor.
          </span>
          {isOwner && (
            <button type="button" className="primary" onClick={handleReclaimHost} disabled={busyAction === 'reclaim'}>
              {busyAction === 'reclaim' ? 'Reclaiming…' : 'Reclaim Command'}
            </button>
          )}
          {isActingHost && !isOwner && (
            <button type="button" onClick={handleHandBackHost} disabled={busyAction === 'handback'}>
              {busyAction === 'handback' ? 'Returning…' : 'Return Command'}
            </button>
          )}
        </div>
      )}

      <div
        className="group-detail__grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.45fr) minmax(300px, 0.9fr)',
          gap: 20,
        }}
      >
        {/* Members — the guild roll */}
        <section
          className="group-detail__panel"
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
                Guild Roll
              </div>
              <div style={{
                marginTop: 5,
                fontFamily: "'Crimson Text', serif",
                fontSize: 15,
                color: 'var(--text)',
              }}>
                {(group.members || []).length} {(group.members || []).length === 1 ? 'patron' : 'patrons'} registered
              </div>
            </div>
            <RefreshButton onRefresh={onRefresh} loading={loading} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(group.members || []).map((member) => {
              const isMe = member.userId === currentUserId;
              const isMemberOwner = !!ownerUserId && member.userId === ownerUserId;
              const isMemberActingHost = !!actingHostId && member.userId === actingHostId;
              // eslint-disable-next-line no-nested-ternary
              const roleLabel = isMemberActingHost
                ? (isMemberOwner ? 'Guildmaster' : 'Stand-in Master')
                : (isMemberOwner ? 'Proprietor' : 'Patron');
              const canManageMember = !isMemberActingHost && !isMemberOwner;
              return (
                <div
                  key={member.userId}
                  style={{
                    padding: '14px 14px',
                    borderRadius: 'var(--radius)',
                    border: isMe ? '1px solid var(--border-glow)' : '1px solid var(--border)',
                    background: isMe ? 'rgba(200,146,46,0.04)' : 'rgba(255,255,255,0.025)',
                  }}
                >
                  <div
                    className="group-detail__member-row"
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
                  >
                    <div>
                      <div style={{
                        fontFamily: "'Cinzel', serif",
                        fontSize: 20,
                        letterSpacing: '0.08em',
                        color: isMe ? 'var(--accent)' : 'var(--text)',
                        lineHeight: 1.1,
                      }}>
                        {member.username}
                        {isMe && (
                          <span style={{
                            marginLeft: 8,
                            fontFamily: "'Cinzel', serif",
                            fontSize: 9,
                            color: 'var(--text-dim)',
                            letterSpacing: '0.16em',
                            textTransform: 'uppercase',
                          }}>
                            (you)
                          </span>
                        )}
                      </div>
                      <div style={{
                        marginTop: 6,
                        fontFamily: "'Cinzel', serif",
                        fontSize: 9,
                        color: isMemberOwner || isMemberActingHost ? 'var(--accent)' : 'var(--text-dim)',
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                      }}>
                        {roleLabel} · {formatJoinedDate(member.joinedAt)}
                      </div>
                    </div>

                    {isHost && !isMe && canManageMember && (
                      <div
                        className="group-detail__member-actions"
                        style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
                      >
                        <button
                          type="button"
                          title="Appoint as a temporary stand-in Guildmaster. You can reclaim command at any time."
                          onClick={() => handleTransferHost(member.userId)}
                          disabled={busyAction === `transfer:${member.userId}` || busyAction === `remove:${member.userId}`}
                        >
                          {busyAction === `transfer:${member.userId}` ? 'Appointing…' : 'Appoint Stand-in'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(member.userId)}
                          disabled={busyAction === `transfer:${member.userId}` || busyAction === `remove:${member.userId}`}
                        >
                          {busyAction === `remove:${member.userId}` ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Room cipher — wax seal panel */}
          <section className="group-detail__panel" style={panelStyle}>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 9,
              color: 'var(--text-dim)',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginBottom: 12,
            }}>
              Chamber Cipher
            </div>
            <div
              className="group-detail__room-code"
              style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 40,
                fontWeight: 700,
                letterSpacing: '0.22em',
                color: 'var(--accent)',
                textShadow: '0 0 20px rgba(200,146,46,0.3)',
                overflowWrap: 'anywhere',
              }}
            >
              {group.code}
            </div>
            <div style={{
              marginTop: 10,
              fontFamily: "'Crimson Text', serif",
              fontSize: 13,
              color: 'var(--text-dim)',
              lineHeight: 1.65,
              fontStyle: 'italic',
            }}>
              Share only with approved patrons. The server will bar non-members even if they carry the cipher.
            </div>
            <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <button type="button" onClick={handleCopyCode}>
                {copied ? 'Cipher Copied' : 'Copy Cipher'}
              </button>

              {/* Host-only: wipe the live table without changing the cipher. */}
              {isHost && !confirmReset && (
                <button
                  type="button"
                  className="danger"
                  onClick={() => { setResetMsg(''); setConfirmReset(true); }}
                  disabled={resetting}
                  title="Boot everyone and start the room fresh — the cipher stays the same"
                >
                  Reset Room
                </button>
              )}
              {isHost && confirmReset && (
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <button type="button" className="danger" onClick={handleResetRoom} disabled={resetting}>
                    {resetting ? 'Resetting…' : 'Confirm reset'}
                  </button>
                  <button type="button" onClick={() => setConfirmReset(false)} disabled={resetting}>
                    Cancel
                  </button>
                </span>
              )}
            </div>

            {isHost && (
              <div style={{
                marginTop: 8,
                fontFamily: "'Crimson Text', serif",
                fontSize: 12,
                fontStyle: 'italic',
                color: resetMsg
                  ? 'var(--accent)'
                  : 'var(--text-dim)',
                lineHeight: 1.5,
              }}>
                {resetMsg
                  || (confirmReset
                    ? 'This boots every player back to the lobby and clears the table. The cipher stays the same.'
                    : 'Reset boots everyone and starts a fresh table — same cipher.')}
              </div>
            )}
          </section>

          {/* Invite member */}
          {isHost && (
            <section className="group-detail__panel" style={panelStyle}>
              <div style={{
                fontFamily: "'Cinzel', serif",
                fontSize: 9,
                color: 'var(--text-dim)',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}>
                Dispatch an Invitation
              </div>
              <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                    Name or Post Address
                  </label>
                  <input
                    value={inviteIdentifier}
                    onChange={(event) => setInviteIdentifier(event.target.value)}
                    placeholder="username or player@example.com"
                  />
                </div>
                <button
                  type="submit"
                  className="primary"
                  disabled={busyAction === 'invite' || !inviteIdentifier.trim()}
                >
                  {busyAction === 'invite' ? 'Dispatching…' : 'Send Invitation'}
                </button>
              </form>
            </section>
          )}

          {/* Pending invites (host only) */}
          {isHost && (
            <section className="group-detail__panel" style={panelStyle}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                alignItems: 'center',
                marginBottom: 12,
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
                  <div style={{
                    fontFamily: "'Cinzel', serif",
                    fontSize: 9,
                    color: 'var(--text-dim)',
                  }}>
                    {group.pendingInvites?.length || 0}
                  </div>
                </div>
                <RefreshButton onRefresh={onRefresh} loading={loading} />
              </div>

              {(!group.pendingInvites || group.pendingInvites.length === 0) && (
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
                  No dispatched invitations for this guild.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(group.pendingInvites || []).map((invite) => (
                  <div
                    key={invite.id}
                    style={{
                      padding: '13px 12px',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                      background: 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div style={{
                      fontFamily: "'Cinzel', serif",
                      fontSize: 18,
                      letterSpacing: '0.08em',
                      color: 'var(--text)',
                    }}>
                      {invite.inviteeUsername}
                    </div>
                    <div style={{
                      marginTop: 7,
                      fontFamily: "'Crimson Text', serif",
                      fontSize: 13,
                      color: 'var(--text-dim)',
                      lineHeight: 1.6,
                      fontStyle: 'italic',
                    }}>
                      Dispatched by {invite.invitedByUsername} · Awaiting reply
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevokeInvite(invite.id)}
                      disabled={busyAction === `revoke:${invite.id}`}
                      style={{ marginTop: 12 }}
                    >
                      {busyAction === `revoke:${invite.id}` ? 'Revoking…' : 'Revoke Invitation'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Danger zone */}
          <section className="group-detail__panel" style={{
            ...panelStyle,
            border: '1px solid rgba(155,28,28,0.4)',
            background: 'linear-gradient(160deg, rgba(30,10,10,0.97) 0%, rgba(13,7,7,0.97) 100%)',
          }}>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 9,
              color: 'var(--accent2)',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginBottom: 12,
              opacity: 0.8,
            }}>
              Forbidden Actions
            </div>
            {isOwner ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{
                  fontFamily: "'Crimson Text', serif",
                  fontSize: 13,
                  color: 'var(--text-dim)',
                  lineHeight: 1.65,
                  fontStyle: 'italic',
                }}>
                  Dissolving the guild strips all patrons of access to this cipher. The code becomes available again.
                </div>
                <button
                  type="button"
                  className="danger group-detail__danger-btn"
                  onClick={handleDeleteGroup}
                  disabled={busyAction === 'delete'}
                >
                  {busyAction === 'delete' ? 'Dissolving…' : 'Dissolve Guild'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {isActingHost && (
                  <div style={{
                    fontFamily: "'Crimson Text', serif",
                    fontSize: 13,
                    color: 'var(--text-dim)',
                    lineHeight: 1.65,
                    fontStyle: 'italic',
                  }}>
                    You are a temporary stand-in. Only the true proprietor may dissolve this guild.
                  </div>
                )}
                <div style={{
                  fontFamily: "'Crimson Text', serif",
                  fontSize: 13,
                  color: 'var(--text-dim)',
                  lineHeight: 1.65,
                  fontStyle: 'italic',
                }}>
                  Departing removes your membership. You may be re-invited by the proprietor if needed.
                </div>
                <button
                  type="button"
                  className="danger group-detail__danger-btn"
                  onClick={handleLeaveGroup}
                  disabled={busyAction === 'leave'}
                >
                  {busyAction === 'leave' ? 'Departing…' : 'Depart Guild'}
                </button>
              </div>
            )}
          </section>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .group-detail__header { flex-direction: column !important; align-items: stretch !important; }
          .group-detail__header-actions { width: 100% !important; }
          .group-detail__header-actions button { flex: 1 1 auto !important; }
          .group-detail__title { font-size: clamp(28px, 10vw, 48px) !important; }
          .group-detail__grid { grid-template-columns: 1fr !important; }
          .group-detail__panel { padding: 14px !important; transform: none !important; }
          .group-detail__room-code { font-size: clamp(26px, 8vw, 40px) !important; letter-spacing: 0.14em !important; }
          .group-detail__member-row { flex-direction: column !important; align-items: stretch !important; }
          .group-detail__member-actions { width: 100% !important; }
          .group-detail__member-actions button { flex: 1 1 auto !important; }
          .group-detail__danger-btn { width: 100% !important; }
        }
      `}</style>
    </div>
  );
}
