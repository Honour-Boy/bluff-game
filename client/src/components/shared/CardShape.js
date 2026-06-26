'use client';

import { ShapeIcon, SHAPE_META } from './ShapeIcon';

// ─── CardShape ────────────────────────────────────────────────
// The "regular" Whot/shape card visual. Refreshed in Phase G3 to
// feel premium and sit visually between plain shape chips and the
// dark power cards: subtle gradient backplate, double-rule edge,
// stronger shape glow, and refined uppercase label typography.
//
// API unchanged: props are { type, size } — same callers everywhere.
// ──────────────────────────────────────────────────────────────

export function CardShape({ type, size = 'md' }) {
  const meta = SHAPE_META[type] || SHAPE_META.square;
  const sizes = { sm: 24, md: 48, lg: 80 };
  const px = sizes[size] || 48;
  const iconPx = Math.round(px * 0.68);

  // Glow strength scales with size so the small variant doesn't bloom.
  const glow = size === 'lg' ? 22 : size === 'md' ? 14 : 8;
  const innerGlow = size === 'lg' ? 18 : size === 'md' ? 12 : 6;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          position: 'relative',
          width: px,
          height: px,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Soft top-down gradient — feels like cardstock catching light
          background: `
            linear-gradient(160deg,
              rgba(255,255,255,0.04) 0%,
              ${meta.color}14 45%,
              ${meta.color}08 100%
            ),
            radial-gradient(circle at 50% 35%,
              ${meta.color}22 0%,
              transparent 70%
            ),
            #0d0d10
          `,
          border: `2px solid ${meta.color}`,
          borderRadius: 'var(--radius)',
          boxShadow: `
            0 0 ${glow}px ${meta.color}55,
            0 0 ${glow * 2}px ${meta.color}1a,
            inset 0 0 ${innerGlow}px ${meta.color}26,
            inset 0 1px 0 rgba(255,255,255,0.06)
          `,
        }}
      >
        {/* Inner double-rule for that premium card-edge feel */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 3,
            border: `1px solid ${meta.color}33`,
            borderRadius: 2,
            pointerEvents: 'none',
          }}
        />
        <ShapeIcon
          shape={type}
          size={iconPx}
          style={{
            position: 'relative',
            zIndex: 1,
            filter: `drop-shadow(0 0 ${size === 'lg' ? 8 : 4}px ${meta.color}88)`,
          }}
        />
      </div>
      {size !== 'sm' && (
        <span
          style={{
            color: meta.color,
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: size === 'lg' ? 14 : 11,
            fontWeight: 400,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            textShadow: `0 0 6px ${meta.color}66`,
          }}
        >
          {meta.label}
        </span>
      )}
    </div>
  );
}

// Convenience export for components that need the shape key list
export const SHAPES = ['circle', 'triangle', 'cross', 'square', 'star'];
