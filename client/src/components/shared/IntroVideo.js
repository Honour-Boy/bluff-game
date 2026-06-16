'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================
// IntroVideo — full-screen brand splash on a genuine game open
// ============================================================
//
// Plays the revolver-blast crimson-paint splash edge-to-edge, IN FULL, then
// calls `onDone`. The 16:9 landscape clip (`/videos/intro.mp4`) gets heavily
// cropped under `objectFit: cover` on a portrait phone, so phones play the
// purpose-cut vertical clip (`/videos/intro_mobile.mp4`) instead. The source is
// chosen ONCE at mount (lazy initializer) so it never swaps mid-playback —
// IntroVideo only ever mounts client-side (the intro phase is set in an effect),
// so reading matchMedia at first render is hydration-safe. Dismissal paths, all
// routed through the same guarded `finish` so it fires once:
//   • the clip ends (`onEnded`),
//   • the player taps Skip, or
//   • Escape.
//
// Full-playback guarantee: browsers may START an unmuted autoplay and then
// quietly PAUSE it a beat later (the "video plays half then stops" bug). We
// attempt sound first, but a `pause` before the real end mutes and resumes
// so the clip always reaches its end. The safety timeout is derived from the
// actual duration (+buffer) once metadata loads — never a guess that could
// cut an 8s clip short — with a generous fallback only if metadata never
// arrives, so the splash can't trap the player either.

const FALLBACK_SAFETY_MS = 15_000; // only used if loadedmetadata never fires

export function IntroVideo({ onDone }) {
  const videoRef = useRef(null);
  const doneRef = useRef(false);
  const safetyRef = useRef(null);
  const [leaving, setLeaving] = useState(false);
  // Pick the source once, at mount: phones (portrait, ≤640px — the project's
  // mobile breakpoint) get the vertical cut so the 16:9 clip isn't cropped.
  const [src] = useState(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(max-width: 640px)').matches) {
      return '/videos/intro_mobile.mp4';
    }
    return '/videos/intro.mp4';
  });

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (safetyRef.current) clearTimeout(safetyRef.current);
    setLeaving(true);
    setTimeout(() => onDone?.(), 320); // let the fade-out play before unmounting
  }, [onDone]);

  const armSafety = useCallback((ms) => {
    if (safetyRef.current) clearTimeout(safetyRef.current);
    safetyRef.current = setTimeout(finish, ms);
  }, [finish]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;

    // Try sound-on; fall back to a muted autoplay if the browser blocks it.
    el.play().catch(() => {
      el.muted = true;
      el.play().catch(() => { /* give up silently — onEnded / safety still dismiss */ });
    });

    // If an unmuted autoplay gets paused before the clip ends, mute and resume
    // so the full video always plays (the "plays half" fix).
    const onPause = () => {
      if (doneRef.current || el.ended) return;
      el.muted = true;
      el.play().catch(() => {});
    };
    // Once we know the real length, size the safety net to it (+buffer).
    const onMeta = () => {
      const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
      armSafety(dur ? dur * 1000 + 3000 : FALLBACK_SAFETY_MS);
    };

    el.addEventListener('pause', onPause);
    el.addEventListener('loadedmetadata', onMeta);
    armSafety(FALLBACK_SAFETY_MS); // until metadata loads
    if (el.readyState >= 1) onMeta(); // metadata already available

    return () => {
      el.removeEventListener('pause', onPause);
      el.removeEventListener('loadedmetadata', onMeta);
      if (safetyRef.current) clearTimeout(safetyRef.current);
    };
  }, [armSafety]);

  // Esc to skip.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
        src={src}
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
