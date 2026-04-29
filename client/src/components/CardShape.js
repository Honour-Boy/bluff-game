'use client';

const SHAPES = {
  square: { emoji: '⬛', label: 'Square', color: '#e8ff4a' },
  circle: { emoji: '⭕', label: 'Circle', color: '#4affdb' },
  triangle: { emoji: '🔺', label: 'Triangle', color: '#ff4a6e' },
  cross: { emoji: '✖️', label: 'Cross', color: '#ffaa4a' },
  star: { emoji: '⭐', label: 'Star', color: '#c44aff' },
};

export function CardShape({ type, size = 'md' }) {
  const shape = SHAPES[type] || SHAPES.square;
  const sizes = { sm: 24, md: 48, lg: 80 };
  const px = sizes[size] || 48;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{
        width: px,
        height: px,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: px * 0.6,
        border: `2px solid ${shape.color}`,
        borderRadius: 4,
        background: `${shape.color}11`,
        boxShadow: `0 0 16px ${shape.color}33`,
      }}>
        {shape.emoji}
      </div>
      {size !== 'sm' && (
        <span style={{
          color: shape.color,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}>
          {shape.label}
        </span>
      )}
    </div>
  );
}

export { SHAPES };
