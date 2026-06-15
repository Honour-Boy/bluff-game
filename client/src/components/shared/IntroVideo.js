'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================
// IntroVideo — full-screen brand splash on a genuine game open
// ============================================================
//
// Plays `/videos/intro.mp4` (the revolver-blast crimson-paint splash)
// edge-to-edge, then calls `onDone`. Dismissal paths, all routed through
// the same guarded `finish` so it can only fire once:
//   • the clip ends (`onEnded`),
//   • the player taps Skip, or
//   • Escape.
//
// Audio: browsers block autoplay-with-sound without a prior gesture, so
// we attempt sound first and silently fall back to a muted autoplay if
// the play() promise rejects — the splash always renders, never a frozen
// black frame. A hard safety timeout dismisses the overlay if `onEnded`
// never arrives (codec / decode failure) so the intro can never trap the
// player out of the app.

const SAFETY_TIMEOUT_MS = 12_000;

export function IntroVideo({ onDone }) {
  const videoRef = useRef(null);
  const doneRef = useRef(false);
  const [leaving, setLeaving] = useState(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setLeaving(true);
    // Let the fade-out play before unmounting.
    setTimeout(() => onDone?.(), 320);
  }, [onDone]);

  // Attempt sound-on playback; fall back to muted autoplay if blocked.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;
    el.play().catch(() => {
      el.muted = true;
      el.play().catch(() => { /* give up silently; onEnded / timeout still dismiss */ });
    });
    return undefined;
  }, []);

  // Esc to skip.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  // Safety net: never strand the player on the splash.
  useEffect(() => {
    const t = setTimeout(finish, SAFETY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [finish]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: leaving ? 0 : 1,
        transition: 'opacity 0.3s ease',
      }}
    >
      <video
        ref={videoRef}
        src="/videos/intro.mp4"
        autoPlay
        playsInline
        preload="auto"
        onEnded={finish}
        onError={finish}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
      <button
        type="button"
        onClick={finish}
        aria-label="Skip intro"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          padding: '8px 18px',
          borderRadius: 999,
          background: 'rgba(16,12,8,0.7)',
          border: '1px solid rgba(240,181,74,0.5)',
          color: 'var(--accent)',
          fontSize: 12,
          fontFamily: "'Space Mono', monospace",
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          backdropFilter: 'blur(4px)',
        }}
      >
        Skip ›
      </button>
    </div>
  );
}
