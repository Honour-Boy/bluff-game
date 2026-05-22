const CYL = 200;
const CX = 100;
const CY = 100;
const ORBIT = 58;
const CHAM_R = 20;

function CylinderSVG({ bulletChambers, landingChamberIndex, rotation, animating, spinComplete }) {
  const chambers = [0, 1, 2, 3, 4, 5].map((index) => {
    const angleRad = ((index * 60 - 90) * Math.PI) / 180;
    return {
      x: CX + ORBIT * Math.cos(angleRad),
      y: CY + ORBIT * Math.sin(angleRad),
      isBullet: bulletChambers.has(index),
      isLanding: spinComplete && index === landingChamberIndex,
    };
  });

  return (
    <div style={{ position: 'relative', width: CYL, height: CYL }}>
      <svg width={CYL} height={CYL} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 2 }}>
        <polygon
          points={`${CX},${CY - ORBIT - CHAM_R + 2} ${CX - 9},${CY - ORBIT - CHAM_R - 14} ${CX + 9},${CY - ORBIT - CHAM_R - 14}`}
          fill="var(--accent)"
        />
      </svg>
      <svg
        width={CYL}
        height={CYL}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transform: `rotate(${rotation}deg)`,
          transformOrigin: `${CX}px ${CY}px`,
          transition: animating ? 'transform 8s cubic-bezier(0.1, 0, 0.15, 1)' : 'none',
        }}
      >
        <circle cx={CX} cy={CY} r={ORBIT + CHAM_R + 8} fill="#111118" stroke="#2a2a35" strokeWidth={2} />
        {chambers.map((chamber, index) => (
          <g key={index}>
            {chamber.isLanding && (
              <circle
                cx={chamber.x}
                cy={chamber.y}
                r={CHAM_R + 5}
                fill="none"
                stroke={chamber.isBullet ? 'var(--accent2)' : 'var(--alive)'}
                strokeWidth={3}
                opacity={0.8}
              />
            )}
            <circle
              cx={chamber.x}
              cy={chamber.y}
              r={CHAM_R}
              fill={chamber.isBullet ? '#3a0808' : '#0d0d18'}
              stroke={chamber.isLanding ? (chamber.isBullet ? 'var(--accent2)' : 'var(--alive)') : '#333'}
              strokeWidth={chamber.isLanding ? 2.5 : 1.5}
            />
            {chamber.isBullet && (
              <circle
                cx={chamber.x}
                cy={chamber.y}
                r={CHAM_R * 0.42}
                fill={chamber.isLanding ? '#ff3344' : '#882222'}
              />
            )}
          </g>
        ))}
        <circle cx={CX} cy={CY} r={9} fill="#222230" stroke="#444" strokeWidth={1.5} />
      </svg>
    </div>
  );
}

export function SpinOverlay({
  spinData,
  spinComplete,
  cylinderRotation,
  cylinderAnimating,
  isSpinTarget,
  acknowledgeSpinResult,
}) {
  if (!spinData) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.95)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9000,
        padding: 24,
      }}
    >
      <div
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 22,
          letterSpacing: '0.15em',
          color: 'var(--text-dim)',
          marginBottom: 32,
          textAlign: 'center',
        }}
      >
        {spinData.spinTargetName} pulls the trigger...
      </div>

      <CylinderSVG
        bulletChambers={spinData.bulletChambers}
        landingChamberIndex={spinData.landingChamberIndex}
        rotation={cylinderRotation}
        animating={cylinderAnimating}
        spinComplete={spinComplete}
      />

      {spinComplete && (
        <div style={{ marginTop: 36, textAlign: 'center' }}>
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 56,
              letterSpacing: '0.05em',
              lineHeight: 1,
              color: spinData.eliminated ? 'var(--accent2)' : 'var(--alive)',
              textShadow: spinData.eliminated
                ? '0 0 30px rgba(255,74,110,0.7)'
                : '0 0 30px rgba(74,255,128,0.7)',
              marginBottom: 14,
            }}
          >
            {spinData.eliminated ? '💀 ELIMINATED' : '😮‍💨 SURVIVED'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 28 }}>
            Chamber {spinData.landingChamberIndex + 1} · {spinData.eliminated ? 'bullet found' : 'empty'}
          </div>
          {isSpinTarget ? (
            <button className="primary" onClick={acknowledgeSpinResult} style={{ padding: '10px 32px', fontSize: 14 }}>
              Continue
            </button>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
              Waiting for {spinData.spinTargetName} to continue...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
