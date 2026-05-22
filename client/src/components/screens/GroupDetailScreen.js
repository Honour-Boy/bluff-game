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
  background: 'rgba(7, 9, 18, 0.88)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 18,
  boxShadow: '0 18px 48px rgba(0, 0, 0, 0.28)',
};

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
}) {
  const [inviteIdentifier, setInviteIdentifier] = useState('');
  const [busyAction, setBusyAction] = useState(null);
  const [copied, setCopied] = useState(false);

  const isHost = group?.role === 'host';
  // #145 — the permanent owner is tracked separately from the current acting
  // host. "Make Host" appoints a temporary stand-in; the owner can reclaim and
  // the stand-in can hand back.
  const ownerUserId = group?.ownerUserId || null;
  const actingHostId = group?.hostUserId || null;
  const isOwner = !!ownerUserId && currentUserId === ownerUserId;
  const isActingHost = !!actingHostId && currentUserId === actingHostId;
  const standInActive = !!ownerUserId && !!actingHostId && ownerUserId !== actingHostId;

  if (!group) {
    return (
      <div style={{ maxWidth: 880, margin: '0 auto', color: 'var(--text-dim)' }}>
        Loading group...
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

  return (
    <div
      className="fade-in group-detail"
      style={{
        width: '100%',
        maxWidth: 980,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <div
        className="group-detail__header"
        style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
      >
        <div className="group-detail__header-text">
          <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.18em', marginBottom: 8 }}>
            GROUP DETAIL
          </div>
          <h1
            className="group-detail__title"
            style={{
              margin: 0,
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 56,
              letterSpacing: '0.08em',
              color: 'var(--accent)',
              lineHeight: 0.92,
              overflowWrap: 'anywhere',
            }}
          >
            {group.name}
          </h1>
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Permanent code {group.code}. {isHost ? 'You manage access for this room.' : 'You can enter the room whenever the group is gathering.'}
          </div>
        </div>
        <div
          className="group-detail__header-actions"
          style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}
        >
          <button type="button" onClick={onBack}>
            Back to Groups
          </button>
          <button type="button" className="primary" onClick={onEnterRoom}>
            Enter Room
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--accent2)',
            color: 'var(--accent2)',
            background: 'rgba(255, 74, 110, 0.08)',
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {standInActive && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            padding: '12px 14px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--accent)',
            background: 'rgba(124, 92, 255, 0.08)',
            fontSize: 12,
            color: 'var(--text)',
          }}
        >
          <span>
            {(group.members || []).find((m) => m.userId === actingHostId)?.username || 'A stand-in'}
            {' '}is acting host (temporary).{' '}
            {(group.members || []).find((m) => m.userId === ownerUserId)?.username || 'The owner'}
            {' '}remains the group owner.
          </span>
          {isOwner && (
            <button type="button" className="primary" onClick={handleReclaimHost} disabled={busyAction === 'reclaim'}>
              {busyAction === 'reclaim' ? 'Reclaiming...' : 'Reclaim Host'}
            </button>
          )}
          {isActingHost && !isOwner && (
            <button type="button" onClick={handleHandBackHost} disabled={busyAction === 'handback'}>
              {busyAction === 'handback' ? 'Handing back...' : 'Hand Back Host'}
            </button>
          )}
        </div>
      )}

      <div
        className="group-detail__grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.45fr) minmax(300px, 0.9fr)',
          gap: 18,
        }}
      >
        <section className="group-detail__panel" style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.14em' }}>MEMBERS</div>
              <div style={{ marginTop: 4, fontSize: 14, color: 'var(--text)' }}>
                {(group.members || []).length} {(group.members || []).length === 1 ? 'person' : 'people'}
              </div>
            </div>
            {loading && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Refreshing...</div>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(group.members || []).map((member) => {
              const isMe = member.userId === currentUserId;
              const isMemberOwner = !!ownerUserId && member.userId === ownerUserId;
              const isMemberActingHost = !!actingHostId && member.userId === actingHostId;
              // eslint-disable-next-line no-nested-ternary
              const roleLabel = isMemberActingHost
                ? (isMemberOwner ? 'HOST' : 'STAND-IN HOST')
                : (isMemberOwner ? 'OWNER' : 'MEMBER');
              // Host-management actions don't apply to the acting host or the
              // permanent owner.
              const canManageMember = !isMemberActingHost && !isMemberOwner;
              return (
                <div
                  key={member.userId}
                  style={{
                    padding: '15px 14px',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    background: 'rgba(255, 255, 255, 0.03)',
                  }}
                >
                  <div
                    className="group-detail__member-row"
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: "'Bebas Neue', sans-serif",
                          fontSize: 26,
                          letterSpacing: '0.08em',
                          color: 'var(--text)',
                        }}
                      >
                        {member.username}
                        {isMe ? ' (you)' : ''}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.12em' }}>
                        {roleLabel} . {formatJoinedDate(member.joinedAt)}
                      </div>
                    </div>

                    {isHost && !isMe && canManageMember && (
                      <div
                        className="group-detail__member-actions"
                        style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
                      >
                        <button
                          type="button"
                          title="Hand host to this member as a temporary stand-in. You can reclaim it at any time."
                          onClick={() => handleTransferHost(member.userId)}
                          disabled={busyAction === `transfer:${member.userId}` || busyAction === `remove:${member.userId}`}
                        >
                          {busyAction === `transfer:${member.userId}` ? 'Handing over...' : 'Make Stand-in Host'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(member.userId)}
                          disabled={busyAction === `transfer:${member.userId}` || busyAction === `remove:${member.userId}`}
                        >
                          {busyAction === `remove:${member.userId}` ? 'Removing...' : 'Remove'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section className="group-detail__panel" style={panelStyle}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.14em', marginBottom: 12 }}>
              ROOM CODE
            </div>
            <div
              className="group-detail__room-code"
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 42,
                letterSpacing: '0.18em',
                color: 'var(--text)',
                overflowWrap: 'anywhere',
              }}
            >
              {group.code}
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              Share this code only with approved members. The server will block non-members even if they know it.
            </div>
            <button type="button" onClick={handleCopyCode} style={{ marginTop: 14 }}>
              {copied ? 'Copied' : 'Copy Code'}
            </button>
          </section>

          {isHost && (
            <section className="group-detail__panel" style={panelStyle}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.14em', marginBottom: 12 }}>
                INVITE MEMBER
              </div>
              <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
                    USERNAME OR EMAIL
                  </label>
                  <input
                    value={inviteIdentifier}
                    onChange={(event) => setInviteIdentifier(event.target.value)}
                    placeholder="username or player@example.com"
                  />
                </div>
                <button type="submit" className="primary" disabled={busyAction === 'invite' || !inviteIdentifier.trim()}>
                  {busyAction === 'invite' ? 'Sending...' : 'Send Invite'}
                </button>
              </form>
            </section>
          )}

          {isHost && (
            <section className="group-detail__panel" style={panelStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.14em' }}>PENDING INVITES</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{group.pendingInvites?.length || 0}</div>
              </div>

              {(!group.pendingInvites || group.pendingInvites.length === 0) && (
                <div
                  style={{
                    padding: '14px 12px',
                    borderRadius: 'var(--radius)',
                    border: '1px dashed var(--border)',
                    color: 'var(--text-dim)',
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  No pending invites for this group.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(group.pendingInvites || []).map((invite) => (
                  <div
                    key={invite.id}
                    style={{
                      padding: '14px 12px',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                      background: 'rgba(255, 255, 255, 0.03)',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 24,
                        letterSpacing: '0.08em',
                        color: 'var(--text)',
                      }}
                    >
                      {invite.inviteeUsername}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                      Invited by {invite.invitedByUsername} . Pending
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevokeInvite(invite.id)}
                      disabled={busyAction === `revoke:${invite.id}`}
                      style={{ marginTop: 12 }}
                    >
                      {busyAction === `revoke:${invite.id}` ? 'Revoking...' : 'Revoke Invite'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="group-detail__panel" style={panelStyle}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.14em', marginBottom: 12 }}>
              DANGER ZONE
            </div>
            {isHost ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                  Deleting the group removes access to this permanent room code for everyone. The code becomes reusable after deletion.
                </div>
                <button
                  type="button"
                  onClick={handleDeleteGroup}
                  disabled={busyAction === 'delete'}
                  className="group-detail__danger-btn"
                >
                  {busyAction === 'delete' ? 'Deleting...' : 'Delete Group'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                  Leaving removes your membership. You can be invited back later if needed.
                </div>
                <button
                  type="button"
                  onClick={handleLeaveGroup}
                  disabled={busyAction === 'leave'}
                  className="group-detail__danger-btn"
                >
                  {busyAction === 'leave' ? 'Leaving...' : 'Leave Group'}
                </button>
              </div>
            )}
          </section>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .group-detail__header {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .group-detail__header-actions {
            width: 100% !important;
          }
          .group-detail__header-actions button {
            flex: 1 1 auto !important;
          }
          .group-detail__title {
            font-size: clamp(32px, 11vw, 52px) !important;
          }
          .group-detail__grid {
            grid-template-columns: 1fr !important;
          }
          .group-detail__panel {
            padding: 12px !important;
          }
          .group-detail__room-code {
            font-size: clamp(28px, 9vw, 42px) !important;
            letter-spacing: 0.12em !important;
          }
          .group-detail__member-row {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .group-detail__member-actions {
            width: 100% !important;
          }
          .group-detail__member-actions button {
            flex: 1 1 auto !important;
          }
          .group-detail__danger-btn {
            width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}
