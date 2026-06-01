// ─── CloseIcon — a raw literal "X" for dismiss buttons (Module 6) ─────────────
// Per the design brief, every dismissal control renders a raw, literal uppercase
// "X" text character — NOT an SVG path or a font-icon glyph. A plain Latin "X"
// (U+0058) always renders in the app's display fonts (unlike the ✕/× dingbats,
// which silently fail). It sits in a high-contrast white-on-red badge
// (`.bluff-close-x` in globals.css) so it can never blend into a modal surface.
// The `size`/`strokeWidth` props are accepted for backwards compatibility with
// existing call sites but the badge is a fixed, legible size.
export function CloseIcon() {
  return (
    <span className="bluff-close-x" aria-hidden="true">X</span>
  );
}
