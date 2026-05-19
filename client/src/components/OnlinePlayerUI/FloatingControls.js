import { ActiveConfigPanel } from '../ActiveConfigPanel';
import { MobileFabMenu } from '../MobileFabMenu';

export function FloatingControls({
  isMobile,
  config,
  voice,
  speechEnabled,
  onCentralize,
  onToggleSpeech,
  onOpenChat,
  chatUnread,
}) {
  return (
    <>
      {!isMobile && <ActiveConfigPanel config={config} />}

      {!isMobile && (
        <button
          type="button"
          onClick={onCentralize}
          title="Centre on the table"
          aria-label="Centre on the table"
          style={{
            position: 'fixed',
            left: 16,
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'var(--surface2)',
            border: '1px solid var(--accent)',
            color: 'var(--accent)',
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
            zIndex: 7900,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          C
        </button>
      )}

      {!isMobile && (
        <button
          type="button"
          onClick={onToggleSpeech}
          title={speechEnabled ? 'Mute spoken announcements' : 'Unmute spoken announcements'}
          aria-label={speechEnabled ? 'Mute spoken announcements' : 'Unmute spoken announcements'}
          aria-pressed={speechEnabled}
          style={{
            position: 'fixed',
            right: 'max(22px, env(safe-area-inset-right))',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'var(--surface2)',
            border: `1px solid ${speechEnabled ? 'var(--accent)' : 'var(--border)'}`,
            color: speechEnabled ? 'var(--accent)' : 'var(--text-dim)',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
            zIndex: 7900,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {speechEnabled ? 'ON' : 'OFF'}
        </button>
      )}

      {isMobile && (
        <MobileFabMenu
          config={config}
          voice={voice}
          speechEnabled={speechEnabled}
          onCentralize={onCentralize}
          onToggleSpeech={onToggleSpeech}
          onOpenChat={onOpenChat}
          chatUnread={chatUnread}
        />
      )}
    </>
  );
}
