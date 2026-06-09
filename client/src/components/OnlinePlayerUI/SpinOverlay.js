const CYL = 200;
const CX = 100;
const CY = 100;
const ORBIT = 58;
const CHAM_R = 20;

function CylinderSVG({ bulletChambers, bulletChambersAfter, eliminated, landingChamberIndex, rotation, animating, spinComplete }) {
  // While the cylinder is spinning we show the PRE-spin bullets (you watch the
  // round come up). Once it stops, swap to the POST-spin chamber so any bullets
  // a survival just added (always +1, +2 under Hot Potato) visibly pop in (#238).
  const activeBullets = spinComplete && bulletChambersAfter ? bulletChambersAfter : bulletChambers;
  const chambers = [0, 1, 2, 3, 4, 5].map((index) => {
    const angleRad = ((index * 60 - 90) * Math.PI) / 180;
    // The landing slot always reflects the actual outcome: empty on a survival,
    // bullet on an elimination — never contradicted by a freshly-added bullet.
    const isLanding = spinComplete && index === landingChamberIndex;
    const isBullet = isLanding ? !!eliminated : activeBullets.has(index);
    return {
      x: CX + ORBIT * Math.cos(angleRad),
      y: CY + ORBIT * Math.sin(angleRad),
      isBullet,
      isLanding,
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
  isTutorial = false,
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
          fontFamily: "'Crimson Text', serif",
          fontSize: 20,
          fontStyle: 'italic',
          letterSpacing: '0.04em',
          color: 'var(--text-dim)',
          marginBottom: 32,
          textAlign: 'center',
        }}
      >
        {spinData.spinTargetName} pulls the trigger…
      </div>

      <CylinderSVG
        bulletChambers={spinData.bulletChambers}
        bulletChambersAfter={spinData.bulletChambersAfter}
        eliminated={spinData.eliminated}
        landingChamberIndex={spinData.landingChamberIndex}
        rotation={cylinderRotation}
        animating={cylinderAnimating}
        spinComplete={spinComplete}
      />

      {spinComplete && (
        <div style={{ marginTop: 36, textAlign: 'center' }}>
          <div
            style={{
              fontFamily: "'Cinzel Decorative', 'Cinzel', serif",
              fontSize: 42,
              letterSpacing: '0.08em',
              lineHeight: 1,
              color: spinData.eliminated ? 'var(--accent2)' : 'var(--alive)',
              textShadow: spinData.eliminated
                ? '0 0 30px rgba(155,28,28,0.7)'
                : '0 0 30px rgba(74,255,128,0.7)',
              marginBottom: 14,
            }}
          >
            {spinData.eliminated ? 'ELIMINATED' : 'SURVIVED'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: isTutorial && !spinData.eliminated ? 14 : 28 }}>
            Chamber {spinData.landingChamberIndex + 1} · {spinData.eliminated ? 'bullet found' : 'empty'}
            {/* Only show a bullet count when the chamber actually carries one - the
                clinic bot stays empty (bulletCountAfter === 0). */}
            {!spinData.eliminated && spinData.bulletCountAfter > 0 && (
              <> · now {spinData.bulletCountAfter}/6 loaded</>
            )}
          </div>
          {/* Tutorial: explain the chamber. A CLEAN survival (no bullet - the
              clinic bot) gets a "still clear" line; a normal survival explains the
              added bullet. */}
          {isTutorial && !spinData.eliminated && (
            <div style={{
              fontSize: 13,
              color: 'var(--alive)',
              fontStyle: 'italic',
              lineHeight: 1.55,
              maxWidth: 300,
              margin: '0 auto 26px',
            }}>
              {spinData.bulletCountAfter === 0
                ? `${spinData.spinTargetName} survives - its chamber is still clear.`
                : 'Survived - so a fresh bullet just clicked into the chamber. Every spin you live through loads the gun a little more.'}
            </div>
          )}
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
