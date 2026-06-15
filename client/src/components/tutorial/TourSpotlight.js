'use client';

// ─── TourSpotlight — the dumb spotlight renderer ──────────────────────────────
// Given a measured target `rect` it darkens the whole screen EXCEPT a cutout
// over the rect, and renders an explanation popup beside the hole. The darkening
// is FOUR absolutely-positioned blocking strips (top/bottom/left/right of the
// hole) so the hole itself is genuinely empty DOM — the live element underneath
// receives real clicks. For read-only ('next') beats a transparent hole-blocker
// pane is added over the hole so the target is visible-but-inert.
//
// Purely presentational: all advance logic lives in TourLayer. The geometry
// helpers below are exported pure for unit testing.

const SHAPE_PAD = { square: 8, rect: 6, 'big-rect': 14 };
const STRIP_Z = 9600;
const POPUP_Z = 9650;
const POPUP_W = 300;       // popup width used for side-fit math
const POPUP_MIN_SIDE = 280; // need at least this much room beside the hole
const GAP = 14;            // gap between hole and popup

// Inflate the raw target rect by the shape's padding and clamp to the viewport.
export function computeHole(rect, shape, vw, vh) {
  const pad = SHAPE_PAD[shape] ?? SHAPE_PAD.rect;
  const top = Math.max(0, rect.top - pad);
  const left = Math.max(0, rect.left - pad);
  const right = Math.min(vw, rect.left + rect.width + pad);
  const bottom = Math.min(vh, rect.top + rect.height + pad);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top), right, bottom };
}

// The four blocking strips that fill everything outside the hole.
export function computeStrips(hole, vw, vh) {
  return {
    top:    { top: 0, left: 0, width: vw, height: hole.top },
    bottom: { top: hole.bottom, left: 0, width: vw, height: Math.max(0, vh - hole.bottom) },
    left:   { top: hole.top, left: 0, width: hole.left, height: hole.height },
    right:  { top: hole.top, left: hole.right, width: Math.max(0, vw - hole.right), height: hole.height },
  };
}

// Decide where the popup sits relative to the hole. Quadrant logic: hole in the
// right half → popup LEFT; left half → RIGHT; if neither side has room → BELOW,
// else ABOVE. Returns { side, top, left } fully clamped on-screen.
export function computePopupPosition(hole, vw, vh, popupW = POPUP_W, popupH = 160) {
  const roomLeft = hole.left;
  const roomRight = vw - hole.right;
  const holeCenterX = hole.left + hole.width / 2;

  let side;
  if (holeCenterX > vw / 2 && roomLeft >= POPUP_MIN_SIDE) side = 'left';
  else if (roomRight >= POPUP_MIN_SIDE) side = 'right';
  else if (roomLeft >= POPUP_MIN_SIDE) side = 'left';
  else side = (hole.bottom + popupH + GAP <= vh) ? 'below' : 'above';

  let top;
  let left;
  if (side === 'left') {
    left = hole.left - GAP - popupW;
    top = hole.top;
  } else if (side === 'right') {
    left = hole.right + GAP;
    top = hole.top;
  } else if (side === 'below') {
    left = holeCenterX - popupW / 2;
    top = hole.bottom + GAP;
  } else { // above
    left = holeCenterX - popupW / 2;
    top = hole.top - GAP - popupH;
  }

  // Clamp fully on-screen.
  left = Math.max(8, Math.min(left, vw - popupW - 8));
  top = Math.max(8, Math.min(top, vh - popupH - 8));
  return { side, top, left };
}

const stripStyle = (s) => ({
  position: 'fixed', top: s.top, left: s.left, width: s.width, height: s.height,
  background: 'rgba(0,0,0,0.78)', zIndex: STRIP_Z, pointerEvents: 'auto',
});

export function TourSpotlight({
  rect,
  shape = 'rect',
  interactive = false,   // false → read-only beat → add the inert hole-blocker
  copy,
  instruction,
  stepLabel,             // e.g. "3 / 14"
  showNext = false,
  onNext,
  onSkip,
}) {
  if (!rect) return null;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;

  const hole = computeHole(rect, shape, vw, vh);
  const strips = computeStrips(hole, vw, vh);
  const popup = computePopupPosition(hole, vw, vh);

  return (
    <div role="dialog" aria-modal="true" aria-label={copy || 'Guided tour'}>
      {/* Four blocking strips around the hole */}
      <div style={stripStyle(strips.top)} aria-hidden="true" />
      <div style={stripStyle(strips.bottom)} aria-hidden="true" />
      <div style={stripStyle(strips.left)} aria-hidden="true" />
      <div style={stripStyle(strips.right)} aria-hidden="true" />

      {/* Glow border drawn around the hole (non-blocking) */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed', top: hole.top, left: hole.left, width: hole.width, height: hole.height,
          border: '2px solid var(--accent)', borderRadius: 8,
          boxShadow: '0 0 0 2px rgba(240,181,74,0.25), 0 0 22px rgba(240,181,74,0.55)',
          zIndex: STRIP_Z, pointerEvents: 'none',
        }}
      />

      {/* Read-only ('next') beats: a transparent pane over the hole so the
          target is visible but cannot be clicked. Omitted for action beats so
          the real element receives the click. */}
      {!interactive && (
        <div
          aria-hidden="true"
          data-tour-hole-blocker="true"
          style={{
            position: 'fixed', top: hole.top, left: hole.left, width: hole.width, height: hole.height,
            background: 'transparent', zIndex: STRIP_Z + 1, pointerEvents: 'auto',
          }}
        />
      )}

      {/* Explanation popup */}
      <div
        style={{
          position: 'fixed', top: popup.top, left: popup.left, width: POPUP_W,
          zIndex: POPUP_Z,
          background: 'var(--surface)',
          border: '1px solid var(--accent-dim)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 16px 44px rgba(0,0,0,0.7)',
          padding: '16px 16px 14px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        {stepLabel && (
          <div style={{
            fontFamily: "'Space Mono', monospace", fontSize: 9,
            color: 'var(--text-dim)', letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>
            {stepLabel}
          </div>
        )}
        <div style={{
          fontFamily: "'Crimson Text', serif", fontSize: 15, lineHeight: 1.5,
          color: 'var(--text)',
        }}>
          {copy}
        </div>
        {instruction && (
          <div style={{
            fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: '0.08em',
            color: 'var(--accent)',
          }}>
            {instruction}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <button
            type="button"
            onClick={onSkip}
            style={{
              background: 'none', border: 'none', padding: 0,
              fontFamily: "'Space Mono', monospace", fontSize: 10,
              color: 'var(--text-dim)', letterSpacing: '0.1em', cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Skip tour
          </button>
          {showNext && (
            <button type="button" className="primary" onClick={onNext} style={{ padding: '8px 22px', fontSize: 12 }}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
