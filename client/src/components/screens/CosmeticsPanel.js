'use client';

import { useEffect, useMemo, useState } from 'react';
import { CloseIcon } from '../shared/CloseIcon';
import { TierBadge } from '../shared/TierBadge';
import { tierForLevel, tierMeta } from '../../lib/tiers';
import {
  DEFAULT_EQUIPPED,
  cardBackFor,
  gunSkinFor,
  tableFeltFor,
} from '../../lib/cosmetics';

const MAX_LEVEL = 20;

// ─── CosmeticsPanel — XP, level, and the cosmetic locker (#205) ───────────────
// Opened from the global SettingsGear (signed-in, non-guest only). The server
// is the authority on XP / unlocks / what's equipped: this panel fetches via
// get_progression and equips via set_cosmetics (which re-validates ownership
// server-side). Previews are pure CSS — same render maps the table uses.

const SLOT_ORDER = [
  { slot: 'tableFelt', title: 'Table Felt' },
  // Deck skins theme the card backs AND your own hand's card faces.
  { slot: 'cardBack', title: 'Deck Skin' },
  { slot: 'gunSkin', title: 'Gun Skin' },
];

// Per-category confirmation so the save line names what was actually equipped.
const SAVE_MSG = {
  tableFelt: 'Table felt saved — your table is dressed.',
  cardBack: 'Deck skin saved — your cards are dressed.',
  gunSkin: 'Chamber skin saved — your iron is dressed.',
};

function FeltSwatch({ id }) {
  const felt = tableFeltFor(id);
  // Art felts (frame SVG underlays) show their actual rim ornament; the
  // CSS-only felts keep the plain colour-gradient ellipse.
  const background = felt.frame
    ? `url("${felt.frame}") center / 100% 100% no-repeat`
    : `radial-gradient(ellipse at 50% 45%, ${felt.hi} 0%, ${felt.mid1} 40%, ${felt.mid2} 70%, ${felt.edge} 100%)`;
  return (
    <div style={{
      width: 52, height: 38, borderRadius: '50%',
      background,
      boxShadow: 'inset 0 0 10px rgba(0,0,0,0.55)',
      border: '2px solid rgba(120,80,40,0.6)',
    }} />
  );
}

function CardBackSwatch({ id }) {
  const back = cardBackFor(id);
  // Frame deck skins show their actual artwork; the CSS-only leather keeps
  // the original gradient + filigree.
  if (back.frame) {
    return (
      <div style={{
        width: 34, height: 48, borderRadius: 4,
        backgroundImage: `url("${back.frame}")`,
        backgroundSize: '100% 100%',
        border: '1px solid var(--border-lit)',
      }} />
    );
  }
  return (
    <div style={{
      width: 34, height: 48, borderRadius: 4,
      background: `linear-gradient(135deg, ${back.a} 0%, ${back.b} 50%, ${back.c} 100%)`,
      border: '1px solid var(--border-lit)',
      position: 'relative', overflow: 'hidden',
    }}>
      <svg width="100%" height="100%" viewBox="0 0 34 48" style={{ position: 'absolute', inset: 0, opacity: 0.45 }} aria-hidden>
        <rect x="3" y="3" width="28" height="42" rx="2" fill="none" stroke={back.accent} strokeWidth="0.8" />
        <polygon points="17,12 22,19 17,26 12,19" fill="none" stroke={back.accent} strokeWidth="0.7" />
      </svg>
    </div>
  );
}

function GunSwatch({ id }) {
  const skin = gunSkinFor(id);
  // Art chamber skins show the actual disc artwork (transparent corners,
  // so no rounding needed); flat skins keep the mini cylinder mock.
  if (skin.art) {
    return <img src={skin.art} alt="" width={46} height={46} draggable={false} />;
  }
  return (
    <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden>
      <circle cx="23" cy="23" r="21" fill={skin.body} stroke={skin.bodyStroke} strokeWidth="2" />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = ((i * 60 - 90) * Math.PI) / 180;
        return (
          <circle
            key={i}
            cx={23 + 13 * Math.cos(a)}
            cy={23 + 13 * Math.sin(a)}
            r="4.4"
            fill={skin.chamber}
            stroke={skin.chamberStroke}
            strokeWidth="1"
          />
        );
      })}
      <circle cx="23" cy="23" r="3.4" fill={skin.hub} stroke={skin.hubStroke} strokeWidth="1" />
    </svg>
  );
}

function SwatchFor({ slot, id }) {
  if (slot === 'tableFelt') return <FeltSwatch id={id} />;
  if (slot === 'cardBack') return <CardBackSwatch id={id} />;
  return <GunSwatch id={id} />;
}

export function CosmeticsPanel({ getProgression, setCosmetics, onClose }) {
  const [progression, setProgression] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [equipped, setEquipped] = useState(null);
  const [saveMsg, setSaveMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    getProgression().then((res) => {
      if (!alive) return;
      if (res?.success && res.progression) {
        setProgression(res.progression);
        setEquipped({ ...DEFAULT_EQUIPPED, ...(res.progression.equipped || {}) });
      } else {
        setLoadError(res?.error || 'Could not load progression');
      }
    });
    return () => { alive = false; };
  }, [getProgression]);

  const level = progression?.level || 1;
  const catalog = progression?.catalog || [];
  const bySlot = useMemo(() => {
    const map = { gunSkin: [], cardBack: [], tableFelt: [] };
    for (const item of catalog) {
      if (map[item.slot]) map[item.slot].push(item);
    }
    return map;
  }, [catalog]);

  const tier = tierForLevel(level);
  const tierStyle = tierMeta(tier);
  const isMaxLevel = level >= MAX_LEVEL;
  const span = (progression?.nextLevelXp ?? 0) - (progression?.levelFloorXp ?? 0);
  const progressPct = isMaxLevel
    ? 100
    : progression && span > 0
      ? Math.max(0, Math.min(100, Math.round(((progression.xp - progression.levelFloorXp) / span) * 100)))
      : 0;

  const handleEquip = async (item) => {
    if (item.unlockLevel > level) return;
    const next = { ...equipped, [item.slot]: item.id };
    setEquipped(next); // optimistic — the server re-validates
    setSaveMsg(null);
    const res = await setCosmetics(next);
    if (res?.success && res.equipped) {
      setEquipped({ ...DEFAULT_EQUIPPED, ...res.equipped });
      setSaveMsg({ ok: true, text: SAVE_MSG[item.slot] || 'Saved.' });
    } else {
      setSaveMsg({ ok: false, text: res?.error || 'Could not save' });
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9500,
      padding: 24,
    }}>
      <div
        className="fade-in"
        style={{
          maxWidth: 440,
          width: '100%',
          maxHeight: '86dvh',
          overflowY: 'auto',
          position: 'relative',
          background: 'linear-gradient(160deg, var(--surface2) 0%, var(--surface) 100%)',
          border: '1px solid var(--border-lit)',
          borderRadius: 'var(--radius-lg)',
          padding: '26px 22px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 14,
            background: 'none', border: 'none',
            color: 'var(--text-dim)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label="Close"
        >
          <CloseIcon size={18} />
        </button>

        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '0.1em',
          color: 'var(--accent)',
          marginBottom: 6,
          textShadow: '0 0 12px rgba(200,146,46,0.25)',
        }}>
          Cosmetics
        </div>

        {loadError && (
          <div style={{
            fontFamily: "'Crimson Text', serif",
            fontSize: 14,
            fontStyle: 'italic',
            color: '#c85050',
          }}>
            {loadError}
          </div>
        )}

        {!progression && !loadError && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
            Loading…
          </div>
        )}

        {progression && (
          <>
            {/* ── Level + tier + XP bar ── */}
            <div style={{ marginBottom: 18 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontFamily: "'Space Mono', monospace", fontSize: 10,
                color: 'var(--text-dim)', letterSpacing: '0.12em',
                textTransform: 'uppercase', marginBottom: 6,
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--accent)' }}>Level {level}</span>
                  <TierBadge tier={tier} />
                </span>
                <span>
                  {isMaxLevel
                    ? `${progression.xp} XP`
                    : `${progression.xp} XP${span > 0 ? ` · ${progression.nextLevelXp - progression.xp} to next` : ''}`}
                </span>
              </div>
              <div style={{
                height: 7, borderRadius: 4,
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid var(--border)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${progressPct}%`,
                  // Bar fill is tinted by the current tier so crossing a boundary
                  // is visible at a glance (Streets amber → Covenant gold).
                  background: `linear-gradient(90deg, ${tierStyle.fill}, var(--accent))`,
                  boxShadow: tierStyle.glow ? `0 0 8px ${tierStyle.glow}` : 'none',
                }} />
              </div>
              <div style={{
                fontFamily: "'Crimson Text', serif",
                fontSize: 12,
                fontStyle: 'italic',
                color: 'var(--text-dim)',
                marginTop: 6,
              }}>
                {isMaxLevel
                  ? 'Max level — The Covenant. You’ve reached the top of the ladder.'
                  : 'Earn XP by finishing online games — surviving spins, calling bluffs right, defending bluffs, eliminating players, resolving power cards, and winning.'}
              </div>
            </div>

            {/* ── Slots ── */}
            {SLOT_ORDER.map(({ slot, title }) => (
              <div key={slot} style={{ marginBottom: 16 }}>
                <div style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: 10,
                  color: 'var(--text-dim)',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}>
                  {title}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {(bySlot[slot] || []).map((item) => {
                    const locked = item.unlockLevel > level;
                    const selected = equipped?.[slot] === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleEquip(item)}
                        disabled={locked}
                        title={locked ? `Unlocks at level ${item.unlockLevel}` : item.label}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                          padding: '9px 10px 7px',
                          background: selected ? 'rgba(200,146,46,0.08)' : 'var(--surface2)',
                          border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                          borderRadius: 'var(--radius)',
                          cursor: locked ? 'not-allowed' : 'pointer',
                          opacity: locked ? 0.45 : 1,
                          boxShadow: selected ? '0 0 12px rgba(200,146,46,0.25)' : 'none',
                        }}
                      >
                        <SwatchFor slot={slot} id={item.id} />
                        <span style={{
                          fontFamily: "'Cinzel', serif",
                          fontSize: 9,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: selected ? 'var(--accent)' : 'var(--text-mid)',
                        }}>
                          {item.label}
                        </span>
                        <span style={{
                          fontFamily: "'Space Mono', monospace",
                          fontSize: 8,
                          letterSpacing: '0.1em',
                          color: locked ? 'var(--warning)' : 'var(--text-dim)',
                        }}>
                          {locked ? `Lv ${item.unlockLevel}` : (selected ? 'Equipped' : `Lv ${item.unlockLevel}`)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {saveMsg && (
              <div style={{
                padding: '9px 12px',
                background: saveMsg.ok ? 'rgba(58,122,82,0.1)' : 'rgba(155,28,28,0.1)',
                border: `1px solid ${saveMsg.ok ? 'var(--alive)' : 'var(--accent2)'}`,
                borderRadius: 'var(--radius)',
                fontFamily: "'Crimson Text', serif",
                fontSize: 13,
                color: saveMsg.ok ? 'var(--alive)' : '#c85050',
                fontStyle: 'italic',
              }}>
                {saveMsg.text}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
