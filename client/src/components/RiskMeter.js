'use client';

export function RiskMeter({ riskLevel, size = 'md' }) {
  const chambers = Array.from({ length: 6 }, (_, i) => i + 1);
  const isSmall = size === 'sm';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: isSmall ? 4 : 6 }}>
      {chambers.map((n) => {
        const isLoaded = n <= riskLevel;
        const isDanger = isLoaded && riskLevel >= 5;
        return (
          <div
            key={n}
            title={`Chamber ${n}`}
            style={{
              width: isSmall ? 10 : 14,
              height: isSmall ? 10 : 14,
              borderRadius: '50%',
              border: `1px solid ${isLoaded ? (isDanger ? 'var(--accent2)' : 'var(--warning)') : 'var(--border)'}`,
              background: isLoaded
                ? isDanger
                  ? 'var(--accent2)'
                  : 'var(--warning)'
                : 'transparent',
              boxShadow: isLoaded && !isDanger ? '0 0 6px rgba(255,170,74,0.4)' : isLoaded ? '0 0 6px rgba(255,74,110,0.5)' : 'none',
              transition: 'all 0.3s ease',
            }}
          />
        );
      })}
      {!isSmall && (
        <span style={{
          color: riskLevel >= 5 ? 'var(--accent2)' : 'var(--warning)',
          fontSize: 11,
          fontWeight: 700,
          marginLeft: 4,
          letterSpacing: '0.05em',
        }}>
          {riskLevel}/6
        </span>
      )}
    </div>
  );
}
