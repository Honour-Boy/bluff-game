import { MobileFabMenu } from '../MobileFabMenu';

// #146 — both mobile and desktop use the single consolidated menu so the
// in-game controls are grouped in one compact place. Voice join/leave lives in
// the menu on every screen size. Music lives in the global settings gear (not
// here); spoken announcements were removed. Centralize only appears when the
// table area is genuinely scrollable.
export function FloatingControls({
  voice,
  onCentralize,
  onOpenChat,
  chatUnread,
  onOpenSettings,
  onOpenLeaderboard,
  onLeaveTable,
  leaveDisabled = false,
  scrollable = false,
}) {
  return (
    <MobileFabMenu
      voice={voice}
      onCentralize={onCentralize}
      onOpenChat={onOpenChat}
      chatUnread={chatUnread}
      onOpenSettings={onOpenSettings}
      onOpenLeaderboard={onOpenLeaderboard}
      onLeaveTable={onLeaveTable}
      leaveDisabled={leaveDisabled}
      scrollable={scrollable}
      showVoice
    />
  );
}
