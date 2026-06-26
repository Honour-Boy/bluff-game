'use client';

import { useEffect } from 'react';

// ─── TourCongrats - the spotlight tour's celebration card ─────────────────────
// Shown when the "Show me around" walk finishes. Reuses the clinic-complete card
// styling (gold), with a lightweight CSS shimmer + falling-spark confetti (no new
// deps). Persists `bluff_tour_done` so a returning player isn't forced through the
// tour again. "Begin Practice" hands off to the existing Basics coaching
// (tutorial_finish_tour → fresh dealt game).

const SPARKS = Array.from({ length: 14 }, (_, i) => i);

export function TourCongrats({ onBeginPractice }) {
  useEffect(() => {
    try { window.localStorage.setItem('bluff_tour_done', '1'); } catch (_) { /* ignore */ }
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tour complete"
      style={{
        position: 'fixed', inset: 0, zIndex: 9400,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes tourSpark { 0% { transform: translateY(-12vh) rotate(0deg); opacity: 0; }
          10% { opacity: 1; } 100% { transform: translateY(112vh) rotate(420deg); opacity: 0; } }
        @keyframes tourSheen { from { transform: translateX(-130%); } to { transform: translateX(130%); } }
      `}</style>

      {/* Falling sparks (purely decorative) */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {SPARKS.map((i) => {
          const left = (i * 7 + (i % 3) * 4) % 100;
          const delay = (i % 7) * 0.4;
          const dur = 2.8 + (i % 5) * 0.5;
          const size = 5 + (i % 3) * 3;
          return (
            <span
              key={i}
              style={{
                position: 'absolute', top: 0, left: `${left}%`,
                width: size, height: size, borderRadius: i % 2 ? '50%' : 1,
                background: i % 2 ? 'var(--accent)' : 'var(--accent2)',
                boxShadow: '0 0 8px var(--accent)',
                animation: `tourSpark ${dur}s linear ${delay}s infinite`,
              }}
            />
          );
        })}
      </div>

      <div
        className="card fade-in"
        style={{ maxWidth: 460, width: '100%', textAlign: 'center', position: 'relative', overflow: 'hidden' }}
      >
        {/* Travelling sheen across the card */}
        <div aria-hidden="true" style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, width: '45%',
          background: 'linear-gradient(90deg, transparent, rgba(240,181,74,0.16), transparent)',
          animation: 'tourSheen 2.6s ease-in-out infinite', pointerEvents: 'none',
        }} />

        <div style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, lineHeight: 1.05,
          letterSpacing: '0.05em', color: 'var(--accent)', marginBottom: 12,
          textShadow: '0 0 24px rgba(240,181,74,0.4)',
        }}>
          YOU KNOW THE TABLE
        </div>
        <div style={{
          fontFamily: "'Crimson Text', serif", fontSize: 15, lineHeight: 1.7,
          color: 'var(--text)', marginBottom: 24,
        }}>
          That’s every control and every move - settings, your hand, calling a
          bluff, the chamber, and power cards. Time to put it into practice against
          the bot.
        </div>
        <button
          onClick={onBeginPractice}
          className="primary"
          style={{ width: '100%', minHeight: 48, fontSize: 14 }}
        >
          Begin Practice
        </button>
      </div>
    </div>
  );
}
