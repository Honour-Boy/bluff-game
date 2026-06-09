'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  COSMETICS, getTierForXp, getNextTier,
  gunSkinStyle, cardBackAccent, feltVars,
} from '../../lib/cosmetics';

// ─── XP progress bar ─────────────────────────────────────────────────────────

function XpBar({ totalXp, tier, nextTier }) {
  const pct = nextTier
    ? Math.min(100, Math.round(((totalXp - tier.minXp) / (nextTier.minXp - tier.minXp)) * 100))
    : 100;

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 6,
      }}>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 14,
          color: 'var(--accent)',
          letterSpacing: '0.08em',
        }}>
          {tier.label}
        </div>
        <div style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 9,
          color: 'var(--text-dim)',
          letterSpacing: '0.12em',
        }}>
          {totalXp} XP
        </div>
      </div>
      <div style={{
        height: 6,
        background: 'var(--surface2)',
        borderRadius: 3,
        overflow: 'hidden',
        border: '1px solid var(--border)',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: 'linear-gradient(90deg, var(--accent-dim), var(--accent))',
          borderRadius: 3,
          transition: 'width 0.6s ease',
        }} />
      </div>
      {nextTier ? (
        <div style={{
          marginTop: 5, textAlign: 'right',
          fontFamily: "'Space Mono', monospace",
          fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em',
        }}>
          {nextTier.minXp - totalXp} XP to <span style={{ color: 'var(--text-mid)' }}>{nextTier.label}</span>
        </div>
      ) : (
        <div style={{
          marginTop: 5, textAlign: 'right',
          fontFamily: "'Space Mono', monospace",
          fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em',
        }}>
          MAX RANK
        </div>
      )}
    </div>
  );
}

// ─── Individual cosmetic item cell ────────────────────────────────────────────

function CosmeticItem({ item, slot, unlocked, selected, onSelect }) {
  const locked = !unlocked;
  const isSelected = selected === item.id;

  // Visual preview swatch per slot type
  const swatch = (() => {
    if (slot === 'gunSkin') {
      const s = gunSkinStyle(item.id);
      return (
        <div style={{
          width: 28, height: 28,
          borderRadius: '50%',
          background: s.color || '#555',
          filter: s.filter || undefined,
          border: '2px solid var(--border-lit)',
          flexShrink: 0,
        }} />
      );
    }
    if (slot === 'cardBack') {
      const accent = cardBackAccent(item.id);
      return (
        <div style={{
          width: 20, height: 28,
          borderRadius: 3,
          background: `linear-gradient(160deg, ${accent}33, ${accent}88)`,
          border: `2px solid ${accent}`,
          flexShrink: 0,
        }} />
      );
    }
    if (slot === 'tableFelt') {
      const vars = feltVars(item.id);
      return (
        <div style={{
          width: 28, height: 18,
          borderRadius: 3,
          background: vars['--felt-bg'],
          border: `2px solid ${vars['--felt-edge']}`,
          flexShrink: 0,
        }} />
      );
    }
    return null;
  })();

  return (
    <button
      type="button"
      onClick={() => !locked && onSelect(slot, item.id)}
      disabled={locked}
      title={locked ? `Unlocks at ${item.xpRequired} XP` : item.description}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 10px',
        background: isSelected
          ? 'rgba(200,146,46,0.1)'
          : 'var(--surface2)',
        border: `1px solid ${isSelected ? 'var(--accent)' : locked ? 'var(--border)' : 'var(--border-lit)'}`,
        borderRadius: 'var(--radius)',
        color: locked ? 'var(--text-dim)' : 'var(--text)',
        cursor: locked ? 'not-allowed' : 'pointer',
        opacity: locked ? 0.5 : 1,
        textAlign: 'left',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!locked && !isSelected) e.currentTarget.style.borderColor = 'var(--accent-dim)';
      }}
      onMouseLeave={(e) => {
        if (!locked && !isSelected) e.currentTarget.style.borderColor = 'var(--border-lit)';
      }}
    >
      {swatch}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 11,
          letterSpacing: '0.06em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.label}
        </div>
        <div style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 8,
          color: 'var(--text-dim)',
          letterSpacing: '0.1em',
          marginTop: 2,
        }}>
          {locked ? `🔒 ${item.xpRequired} XP` : item.xpRequired === 0 ? 'FREE' : `${item.xpRequired}+ XP`}
        </div>
      </div>
      {isSelected && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path d="M5 12l5 5L20 7" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

// ─── Cosmetics section (one slot) ─────────────────────────────────────────────

function CosmeticsSection({ title, slot, items, unlocked, selections, onSelect }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: 8,
        color: 'var(--text-dim)',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        marginBottom: 8,
        paddingBottom: 5,
        borderBottom: '1px solid var(--border)',
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map(item => (
          <CosmeticItem
            key={item.id}
            item={item}
            slot={slot}
            unlocked={unlocked.includes(item.id)}
            selected={selections[slot]}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

// ─── CosmeticsPanel — main export ─────────────────────────────────────────────
// Receives the already-fetched profile data and the setCosmetic callback.

export function CosmeticsPanel({ profileData, onSetCosmetic, savingSlot }) {
  if (!profileData) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 100,
        fontFamily: "'Space Mono', monospace",
        fontSize: 10,
        color: 'var(--text-dim)',
        letterSpacing: '0.1em',
      }}>
        Loading…
      </div>
    );
  }

  const { totalXp, tier, unlocked, selections } = profileData;
  const nextTier = getNextTier(totalXp);

  return (
    <div>
      <XpBar totalXp={totalXp} tier={tier} nextTier={nextTier} />

      {savingSlot && (
        <div style={{
          marginBottom: 12,
          padding: '7px 10px',
          background: 'rgba(200,146,46,0.07)',
          border: '1px solid var(--accent-dim)',
          borderRadius: 'var(--radius)',
          fontFamily: "'Space Mono', monospace",
          fontSize: 9,
          color: 'var(--accent)',
          letterSpacing: '0.1em',
        }}>
          Saving…
        </div>
      )}

      <CosmeticsSection
        title="Gun Skin"
        slot="gunSkin"
        items={COSMETICS.gunSkins}
        unlocked={unlocked}
        selections={selections}
        onSelect={onSetCosmetic}
      />
      <CosmeticsSection
        title="Card Back"
        slot="cardBack"
        items={COSMETICS.cardBacks}
        unlocked={unlocked}
        selections={selections}
        onSelect={onSetCosmetic}
      />
      <CosmeticsSection
        title="Table Felt"
        slot="tableFelt"
        items={COSMETICS.tableFelts}
        unlocked={unlocked}
        selections={selections}
        onSelect={onSetCosmetic}
      />
    </div>
  );
}
