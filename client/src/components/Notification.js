'use client';

export function Notification({ notification }) {
  if (!notification) return null;

  const colors = {
    info: 'var(--accent3)',
    warning: 'var(--warning)',
    error: 'var(--accent2)',
    success: 'var(--alive)',
  };

  const color = colors[notification.type] || colors.info;

  return (
    <div
      className="notification"
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 9000,
        background: 'var(--surface)',
        border: `1px solid ${color}`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 'var(--radius)',
        padding: '12px 16px',
        maxWidth: 320,
        color: color,
        fontSize: 12,
        fontFamily: "'Space Mono', monospace",
        letterSpacing: '0.05em',
        boxShadow: `0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px ${color}22`,
      }}
    >
      {notification.msg}
    </div>
  );
}
