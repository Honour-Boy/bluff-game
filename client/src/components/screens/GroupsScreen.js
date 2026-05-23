'use client';

import { useMemo, useState } from 'react';

function formatInviteDate(value) {
  if (!value) return 'Pending';
  try {
    return new Date(value).toLocaleString();
  } catch (_) {
    return 'Pending';
  }
}

const panelStyle = {
  background: 'rgba(7, 9, 18, 0.88)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 18,
  boxShadow: '0 18px 48px rgba(0, 0, 0, 0.28)',
};

// #160 — per-section manual reload control. `loading` reflects the parent's
// in-flight fetch so the spinner stays in sync even when another section
// triggered the same combined refresh.
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
        fontSize: 11,
        letterSpacing: '0.08em',
        padding: '6px 11px',
      }}
    >
      <span className={active ? 'groups-refresh-icon groups-refresh-icon--spin' : 'groups-refresh-icon'} aria-hidden>
        &#x21bb;
      </span>
      {active ? 'Refreshing...' : label}
    </button>
  );
}

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
        maxWidth: 960,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <div
        className="groups-screen__header"
        style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
      >
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.18em', marginBottom: 8 }}>
            PERSISTENT GROUPS
          </div>
          <h1
            className="groups-screen__title"
            style={{
              margin: 0,
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 52,
              letterSpacing: '0.06em',
              color: 'var(--accent)',
              lineHeight: 0.92,
            }}
          >
            My Groups
          </h1>
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-dim)', maxWidth: 560, lineHeight: 1.6 }}>
            Reusable room codes live here. Create a group, manage invitations, and reopen the same room whenever your crew is ready.
          </div>
        </div>
        <div
          className="groups-screen__header-actions"
          style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Signed in as <strong style={{ color: 'var(--text)' }}>{username}</strong>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="groups-screen__back-btn"
            style={{ minWidth: 140 }}
          >
            Back to Home
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

      <div
        className="groups-screen__grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.45fr) minmax(320px, 1fr)',
          gap: 18,
        }}
      >
        <section className="groups-screen__panel" style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.14em' }}>GROUPS</div>
              <div style={{ marginTop: 4, fontSize: 14, color: 'var(--text)' }}>
                {sortedGroups.length} saved {sortedGroups.length === 1 ? 'group' : 'groups'}
              </div>
            </div>
            <RefreshButton onRefresh={onRefresh} loading={loading} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedGroups.length === 0 && !loading && (
              <div
                style={{
                  padding: '16px 14px',
                  borderRadius: 'var(--radius)',
                  border: '1px dashed var(--border)',
                  color: 'var(--text-dim)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  lineHeight: 1.6,
                  fontSize: 13,
                }}
              >
                No groups yet. Create one to get a permanent room code for your table.
              </div>
            )}

            {sortedGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => onOpenGroup(group.id)}
                style={{
                  textAlign: 'left',
                  padding: 16,
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <div>
                    <div
                      style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 26,
                        letterSpacing: '0.08em',
                        color: 'var(--text)',
                      }}
                    >
                      {group.name}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.12em' }}>
                      CODE {group.code}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontSize: 10,
                        color: group.role === 'host' ? 'var(--accent)' : 'var(--text-dim)',
                        letterSpacing: '0.12em',
                      }}
                    >
                      {group.role === 'host' ? 'HOST' : 'MEMBER'}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-dim)' }}>
                      {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section className="groups-screen__panel" style={panelStyle}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.14em', marginBottom: 12 }}>
              CREATE GROUP
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
                  GROUP NAME
                </label>
                <input
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  maxLength={64}
                  placeholder="Friday Night Bluff"
                />
              </div>
              <button type="submit" className="primary" disabled={busyAction === 'create' || !groupName.trim()}>
                {busyAction === 'create' ? 'Creating...' : 'Create Group'}
              </button>
            </form>
          </section>

          <section className="groups-screen__panel" style={panelStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.14em' }}>PENDING INVITES</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{invites?.length || 0}</div>
              </div>
              <RefreshButton onRefresh={onRefresh} loading={loading} />
            </div>

            {(!invites || invites.length === 0) && (
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
                No pending invites right now.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(invites || []).map((invite) => (
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
                    {invite.group?.name}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                    Invited by <strong style={{ color: 'var(--text)' }}>{invite.invitedByUsername}</strong>
                    <br />
                    Code {invite.group?.code} . {formatInviteDate(invite.createdAt)}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => handleInviteResponse(invite.id, true)}
                      disabled={busyAction === `accept:${invite.id}` || busyAction === `decline:${invite.id}`}
                    >
                      {busyAction === `accept:${invite.id}` ? 'Joining...' : 'Accept'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInviteResponse(invite.id, false)}
                      disabled={busyAction === `accept:${invite.id}` || busyAction === `decline:${invite.id}`}
                    >
                      {busyAction === `decline:${invite.id}` ? 'Declining...' : 'Decline'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <style>{`
        .groups-refresh-icon {
          display: inline-block;
          font-size: 13px;
          line-height: 1;
        }
        .groups-refresh-icon--spin {
          animation: groups-refresh-spin 0.8s linear infinite;
        }
        @keyframes groups-refresh-spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 640px) {
          .groups-screen__header {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .groups-screen__header-actions {
            align-items: flex-start !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            width: 100% !important;
            flex-wrap: wrap !important;
          }
          .groups-screen__title {
            font-size: clamp(32px, 11vw, 48px) !important;
          }
          .groups-screen__back-btn {
            min-width: 0 !important;
          }
          .groups-screen__grid {
            grid-template-columns: 1fr !important;
          }
          .groups-screen__panel {
            padding: 12px !important;
          }
        }
      `}</style>
    </div>
  );
}
