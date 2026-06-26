'use client';

// ─── SmokeLayer - ambient smoke wisps drifting across the table ───────────────
// Pure CSS animation. No canvas, no image assets.
// Renders two wispy radial-gradient blobs that drift upward and fade out on a
// staggered loop. Completely suppressed when prefers-reduced-motion is set.
//
// Props:
//   active (bool)   - when false the layer is invisible (save GPU during lobby)
//   intensity       - 'low' | 'medium' | 'high' (defaults 'low')

const INTENSITIES = {
  low:    { opacity: 0.28, count: 2 },
  medium: { opacity: 0.42, count: 3 },
  high:   { opacity: 0.6,  count: 4 },
};

export function SmokeLayer({ active = true, intensity = 'low' }) {
  if (!active) return null;
  const { opacity, count } = INTENSITIES[intensity] || INTENSITIES.low;

  const wisps = Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${15 + i * (70 / (count - 1 || 1))}%`,
    width: `${90 + i * 30}px`,
    height: `${110 + i * 20}px`,
    delay: `${i * 1.4}s`,
    duration: `${6 + i * 1.8}s`,
    animName: i % 2 === 0 ? 'smoke-drift' : 'smoke-drift-b',
    bottom: `${8 + i * 4}%`,
  }));

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9996,
        overflow: 'hidden',
      }}
    >
      {wisps.map((w) => (
        <div
          key={w.id}
          style={{
            position: 'absolute',
            bottom: w.bottom,
            left: w.left,
            width: w.width,
            height: w.height,
            borderRadius: '50%',
            background: `radial-gradient(
              ellipse at 50% 80%,
              rgba(180,140,80,${opacity}) 0%,
              rgba(140,110,60,${opacity * 0.5}) 40%,
              transparent 70%
            )`,
            filter: 'blur(18px)',
            animation: `${w.animName} ${w.duration} ease-in-out ${w.delay} infinite`,
          }}
        />
      ))}
    </div>
  );
}
