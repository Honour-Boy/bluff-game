import { MobileFabMenu } from '../MobileFabMenu';

// #146 — both mobile and desktop now use the single consolidated menu so the
// in-game controls (centralize, active special cards, room chat, speech) are
// grouped in one compact place instead of being scattered around the screen.
// On desktop the standalone VoicePanel stays in the header, so the menu hides
// its own voice section (showVoice={isMobile}).
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
    <MobileFabMenu
      config={config}
      voice={voice}
      speechEnabled={speechEnabled}
      onCentralize={onCentralize}
      onToggleSpeech={onToggleSpeech}
      onOpenChat={onOpenChat}
      chatUnread={chatUnread}
      showVoice={isMobile}
    />
  );
}
