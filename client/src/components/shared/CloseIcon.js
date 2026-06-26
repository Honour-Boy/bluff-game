// ─── CloseIcon — a raw literal "X" for dismiss buttons (Module 6) ─────────────
// Per the design brief, every dismissal control renders a raw, literal uppercase
// "X" text character — NOT an SVG path or a font-icon glyph. A plain Latin "X"
// (U+0058) always renders in the app's display fonts (unlike the ✕/× dingbats,
// which silently fail). It renders flat and on-surface — a dim "X" with no
// filled background (`.bluff-close-x` in globals.css), brightening on hover.
// The `size`/`strokeWidth` props are accepted for backwards compatibility with
// existing call sites but the glyph is a fixed, legible size.
export function CloseIcon() {
  return (
    <span className="bluff-close-x" aria-hidden="true">X</span>
  );
}
