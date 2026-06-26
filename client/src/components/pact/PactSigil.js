// ============================================================
// Covenant - shared Pact visual language (occult wax-seal luxury)
// ============================================================
// A real inline-SVG covenant emblem (two interlocking oath-rings inside a
// ticked seal ring) replaces the old fallback-triangle emoji, plus the shared
// modal shell, ornate divider rule, and corner flourishes every Pact overlay
// uses. Pure presentational - no deps, inline styles, gold/crimson on charcoal.

let _sigilSeq = 0;

// The covenant sigil: two interlocking rings (the bond) struck inside a
// tick-marked seal ring (the oath). Gold foil gradient, optional crimson core
// + glow. Scales cleanly from a 14px seat badge to a 60px modal crest.
export function PactSigil({ size = 60, withSeal = true, glow = true, broken = false }) {
  const gid = `pactGold-${(_sigilSeq += 1)}`;
  const cid = `pactCore-${_sigilSeq}`;
  const gold = 'var(--accent, #f0b54a)';
  const goldDim = 'var(--accent-dim, #b8862f)';
  const crimson = 'var(--accent2, #a8261d)';
  // Seal ticks - short radial marks around the outer ring (wax-stamp feel).
  const ticks = withSeal
    ? Array.from({ length: 24 }).map((_, i) => {
        const a = (i / 24) * Math.PI * 2;
        const r1 = 29;
        const r2 = i % 2 === 0 ? 26.5 : 27.6;
        return (
          <line
            key={i}
            x1={32 + Math.cos(a) * r1}
            y1={32 + Math.sin(a) * r1}
            x2={32 + Math.cos(a) * r2}
            y2={32 + Math.sin(a) * r2}
            stroke={`url(#${gid})`}
            strokeWidth={i % 2 === 0 ? 1.4 : 0.8}
            strokeLinecap="round"
            opacity={0.85}
          />
        );
      })
    : null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block', filter: glow ? `drop-shadow(0 0 6px ${gold}66)` : 'none' }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe9b0" />
          <stop offset="48%" stopColor={gold} />
          <stop offset="100%" stopColor={goldDim} />
        </linearGradient>
        <radialGradient id={cid} cx="50%" cy="38%" r="65%">
          <stop offset="0%" stopColor={crimson} stopOpacity="0.55" />
          <stop offset="100%" stopColor={crimson} stopOpacity="0" />
        </radialGradient>
      </defs>

      {withSeal && (
        <>
          <circle cx="32" cy="32" r="30.5" stroke={`url(#${gid})`} strokeWidth="1" opacity="0.5" />
          <circle cx="32" cy="32" r="24.5" fill={`url(#${cid})`} />
          {ticks}
        </>
      )}

      {/* The two oath-rings, interlocked (left over-under right). */}
      <circle cx="26" cy="33" r="11" stroke={`url(#${gid})`} strokeWidth="2.4" />
      <circle cx="38" cy="33" r="11" stroke={`url(#${gid})`} strokeWidth="2.4" />

      {broken ? (
        // A jagged break across the bond for the broken-pact state.
        <path d="M32 18 L29 31 L35 35 L31 47" stroke={crimson} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        // A small crimson keystone where the rings meet - the sealed bond.
        <path d="M32 26.5 L35.4 33 L32 39.5 L28.6 33 Z" fill={crimson} stroke={`url(#${gid})`} strokeWidth="0.8" />
      )}
    </svg>
  );
}

// A thin gold divider with a centred diamond - the ornate rule between a Pact
// modal's crest and its body copy.
export function OrnateRule({ maxWidth = 220 }) {
  const gold = 'var(--accent, #f0b54a)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', maxWidth, margin: '0 auto' }}>
      <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${gold}88)` }} />
      <span style={{ width: 5, height: 5, transform: 'rotate(45deg)', background: gold, boxShadow: `0 0 6px ${gold}aa` }} />
      <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${gold}88, transparent)` }} />
    </div>
  );
}

// Gilded corner brackets - drop one into each corner of a Pact card for the
// "sealed document" frame.
export function CornerFlourishes() {
  const gold = 'var(--accent, #f0b54a)';
  const base = { position: 'absolute', width: 14, height: 14, pointerEvents: 'none' };
  const L = `1px solid ${gold}99`;
  return (
    <>
      <span style={{ ...base, top: 7, left: 7, borderTop: L, borderLeft: L }} />
      <span style={{ ...base, top: 7, right: 7, borderTop: L, borderRight: L }} />
      <span style={{ ...base, bottom: 7, left: 7, borderBottom: L, borderLeft: L }} />
      <span style={{ ...base, bottom: 7, right: 7, borderBottom: L, borderRight: L }} />
    </>
  );
}

// The shared Pact modal shell: dimmed vignette backdrop + a layered charcoal
// card with a gold hairline, corner flourishes, the crest sigil, a Cinzel
// title, the ornate rule, then the caller's body. Keeps all three overlays
// visually identical.
export function PactModalShell({ title, subtitle, children, zIndex = 9150, sigilProps }) {
  const gold = 'var(--accent, #f0b54a)';
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(ellipse at center, rgba(40,20,8,0.55) 0%, rgba(0,0,0,0.92) 70%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex,
        padding: 24,
      }}
    >
      <div
        className="fade-in"
        style={{
          position: 'relative',
          maxWidth: 430,
          width: '100%',
          textAlign: 'center',
          padding: '30px 26px 24px',
          borderRadius: 12,
          background:
            'radial-gradient(120% 80% at 50% 0%, rgba(240,181,74,0.10) 0%, transparent 55%),'
            + ' linear-gradient(165deg, #211a10 0%, #16110a 60%, #120d07 100%)',
          border: `1px solid ${gold}55`,
          boxShadow: `0 0 0 1px rgba(0,0,0,0.6), 0 24px 60px rgba(0,0,0,0.7), 0 0 40px ${gold}22, inset 0 1px 0 rgba(255,255,255,0.05)`,
        }}
      >
        <CornerFlourishes />

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <PactSigil size={58} {...sigilProps} />
        </div>

        <div
          style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 21,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            background: 'linear-gradient(180deg, #ffe9b0 0%, var(--accent, #f0b54a) 55%, var(--accent-dim, #b8862f) 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: gold,
            marginBottom: subtitle ? 4 : 14,
          }}
        >
          {title}
        </div>

        {subtitle && (
          <div style={{ fontFamily: "'Crimson Text', serif", fontSize: 14, color: 'var(--text-mid, #c4ab82)', marginBottom: 14, lineHeight: 1.5 }}>
            {subtitle}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <OrnateRule />
        </div>

        {children}
      </div>
    </div>
  );
}

// Shared button styles for Pact modals.
export function pactPrimaryBtnStyle(busy) {
  const gold = 'var(--accent, #f0b54a)';
  return {
    padding: '13px 10px',
    minHeight: 48,
    background: 'linear-gradient(180deg, #ffd980 0%, #f0b54a 48%, #c8902f 100%)',
    border: `1px solid ${gold}`,
    borderRadius: 7,
    color: '#1a1206',
    cursor: busy ? 'wait' : 'pointer',
    fontFamily: "'Cinzel', serif",
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), 0 4px 14px rgba(240,181,74,0.25)',
    transition: 'filter 0.18s, box-shadow 0.18s',
  };
}

export function pactGhostBtnStyle(busy, { danger = false } = {}) {
  const edge = danger ? 'var(--accent2, #a8261d)' : 'var(--text-dim, #998660)';
  return {
    padding: '13px 10px',
    minHeight: 48,
    background: 'rgba(255,255,255,0.02)',
    border: `1px solid ${edge}88`,
    borderRadius: 7,
    color: danger ? '#e0857c' : 'var(--text, #ece0c8)',
    cursor: busy ? 'wait' : 'pointer',
    fontFamily: "'Cinzel', serif",
    fontWeight: 600,
    fontSize: 13,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    transition: 'background 0.18s, border-color 0.18s, color 0.18s',
  };
}
