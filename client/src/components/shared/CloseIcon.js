// ─── CloseIcon — an SVG "X" for dismiss buttons ──────────────────────────────
// Replaces the old `✕` / `×` text glyphs, which silently fail to render in the
// serif/display fonts the app uses (the dingbat is missing from many fonts, so
// the close button showed up blank). An SVG stroke always renders. Inherits the
// button's text colour via currentColor.
export function CloseIcon({ size = 16, strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}
