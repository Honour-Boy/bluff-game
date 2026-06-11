// ============================================================
// #205 — Build colored deck-skin SVGs from monochrome traces
// ============================================================
// Inputs: potrace-style monochrome SVGs (cosmetic-previews/img{1..5}.svg at
// the repo root — black paths = the card FIELD, the ornament shows through
// as holes). For each design we emit a self-contained colored SVG:
//
//   <svg viewBox>
//     <defs>gradient/pattern for the ornament</defs>
//     <rect fill=ornament/>            ← shows through the trace's holes
//     <g fill=field>trace paths</g>    ← the card field on top
//   </svg>
//
// Palettes are sampled from the matching cosmetic-previews/img{N}-color.jpg.
// Output: client/public/cosmetics/deck_<name>.svg (committed; the traces and
// JPG references stay untracked design sources).
//
// The CHAMBER (cylinder) skins are NOT built here — they come straight from
// the owner's traced art via scripts/build-chamber-skins.mjs.
//
// Usage: node scripts/build-cosmetic-decks.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, '..', '..', 'cosmetic-previews');
const outDir = resolve(here, '..', 'public', 'cosmetics');
mkdirSync(outDir, { recursive: true });

const DESIGNS = [
  {
    src: 'img1.svg', out: 'deck_noir.svg', w: 768, h: 1152,
    // Black card, gold-foil filigree.
    ornament: `<linearGradient id="orn" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ecd28c"/><stop offset="0.45" stop-color="#c8a35a"/>
      <stop offset="0.75" stop-color="#9a7438"/><stop offset="1" stop-color="#d8b86a"/>
    </linearGradient>`,
    field: `<linearGradient id="field" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0" stop-color="#15131a"/><stop offset="0.5" stop-color="#0c0b0f"/><stop offset="1" stop-color="#080709"/>
    </linearGradient>`,
  },
  {
    src: 'img2.svg', out: 'deck_neon.svg', w: 768, h: 1152,
    // Cyberpunk circuit: deep indigo field, cyan→magenta neon.
    ornament: `<linearGradient id="orn" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#45e6e6"/><stop offset="0.45" stop-color="#6a8af0"/>
      <stop offset="0.75" stop-color="#b45ae8"/><stop offset="1" stop-color="#e84dd0"/>
    </linearGradient>`,
    field: `<linearGradient id="field" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b1b42"/><stop offset="0.5" stop-color="#141436"/><stop offset="1" stop-color="#10102c"/>
    </linearGradient>`,
  },
  {
    src: 'img3.svg', out: 'deck_crimson.svg', w: 768, h: 1152,
    // Burgundy with ornate antique-gold corners.
    ornament: `<linearGradient id="orn" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e6cd8e"/><stop offset="0.5" stop-color="#c4a060"/><stop offset="1" stop-color="#9c7a40"/>
    </linearGradient>`,
    field: `<linearGradient id="field" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#7c2535"/><stop offset="0.55" stop-color="#691d2b"/><stop offset="1" stop-color="#511420"/>
    </linearGradient>`,
  },
  {
    src: 'img4.svg', out: 'deck_cosmos.svg', w: 768, h: 1152,
    // Galaxy: black starfield, purple/blue/pink nebula swirl border.
    ornament: `<linearGradient id="orn" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9a6ae8"/><stop offset="0.35" stop-color="#4a8ae0"/>
      <stop offset="0.65" stop-color="#e88ad8"/><stop offset="1" stop-color="#6a4ae0"/>
    </linearGradient>`,
    field: `<linearGradient id="field" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a0a14"/><stop offset="0.5" stop-color="#060609"/><stop offset="1" stop-color="#0a0a14"/>
    </linearGradient>`,
  },
  {
    src: 'img5.svg', out: 'deck_kente.svg', w: 1664, h: 2496,
    // Kente: terracotta field; the border motifs pick their colors from a
    // vertical band pattern (gold / green / red / black) showing through.
    ornament: `<pattern id="orn" patternUnits="userSpaceOnUse" width="416" height="2496">
      <rect width="416" height="2496" fill="#e2a92e"/>
      <rect x="104" width="104" height="2496" fill="#2f6b3a"/>
      <rect x="208" width="52" height="2496" fill="#1c150d"/>
      <rect x="260" width="104" height="2496" fill="#bf3a20"/>
      <rect x="364" width="52" height="2496" fill="#2f6b3a"/>
    </pattern>`,
    field: `<linearGradient id="field" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#b85f33"/><stop offset="0.6" stop-color="#aa5229"/><stop offset="1" stop-color="#964521"/>
    </linearGradient>`,
  },
];

for (const d of DESIGNS) {
  const raw = readFileSync(join(srcDir, d.src), 'utf8');
  const gMatch = raw.match(/<g transform="([^"]+)"[^>]*>([\s\S]*?)<\/g>/);
  if (!gMatch) throw new Error(`No trace group found in ${d.src}`);
  const [, transform, paths] = gMatch;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.w} ${d.h}" preserveAspectRatio="none">
<defs>
${d.ornament}
${d.field}
</defs>
<rect width="${d.w}" height="${d.h}" fill="url(#orn)"/>
<g transform="${transform}" fill="url(#field)" stroke="none">
${paths}
</g>
</svg>
`;
  const outPath = join(outDir, d.out);
  writeFileSync(outPath, svg);
  console.log(`${d.out}: ${(svg.length / 1024).toFixed(0)} KB`);
}

// ============================================================
// Table-felt underlays — same five identities, procedural art
// ============================================================
// The felt element is an ellipse (border-radius:50% clips a rect), so each
// design is drawn full-bleed in a 1200×880 box and every ornament is kept
// inside the inscribed ellipse (cx 600, cy 440). The centre stays quiet —
// the dealer tray / reveal cards / lobby copy all live there. Each SVG is
// self-contained (base gradient included) and goes through the same
// `--felt-bg` CSS-var slot the deck skins use for `--cardback-bg`.

const FW = 1200, FH = 880, FCX = 600, FCY = 440;

const GOLD_GRAD = `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#ecd28c"/><stop offset="0.45" stop-color="#c8a35a"/>
  <stop offset="0.75" stop-color="#9a7438"/><stop offset="1" stop-color="#d8b86a"/>
</linearGradient>`;

function feltBase(id, stops) {
  return {
    def: `<radialGradient id="${id}" cx="0.5" cy="0.45" r="0.72">${stops
      .map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`)
      .join('')}</radialGradient>`,
    rect: `<rect width="${FW}" height="${FH}" fill="url(#${id})"/>`,
  };
}

function ring(rx, ry, attrs) {
  return `<ellipse cx="${FCX}" cy="${FCY}" rx="${rx}" ry="${ry}" fill="none" ${attrs}/>`;
}

// A ring built from individually-coloured elliptical arc segments
// (the kente band; also the neon node ring positions).
function arcPoint(rx, ry, a) {
  return [FCX + rx * Math.cos(a), FCY + ry * Math.sin(a)];
}
function segmentRing(rx, ry, segments, colors, width, fillRatio = 0.92) {
  let out = '';
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * 2 * Math.PI;
    const a1 = ((i + fillRatio) / segments) * 2 * Math.PI;
    const [x0, y0] = arcPoint(rx, ry, a0);
    const [x1, y1] = arcPoint(rx, ry, a1);
    out += `<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${rx} ${ry} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" stroke="${colors[i % colors.length]}" stroke-width="${width}" fill="none"/>`;
  }
  return out;
}

// Deterministic stars for the cosmos felt.
function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildNoirFelt() {
  const base = feltBase('base', [[0, '#211d29'], [0.45, '#14121a'], [0.8, '#0b0a0f'], [1, '#07060a']]);
  // Gold filigree rim: solid line, a tick ring, a pinline, compass diamonds.
  const diamonds = [[600, 50], [600, 830], [55, 440], [1145, 440]]
    .map(([x, y]) => `<path d="M ${x} ${y - 13} L ${x + 9} ${y} L ${x} ${y + 13} L ${x - 9} ${y} Z" fill="url(#gold)" opacity="0.9"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FW} ${FH}" preserveAspectRatio="none">
<defs>${GOLD_GRAD}${base.def}</defs>
${base.rect}
${ring(562, 405, 'stroke="url(#gold)" stroke-width="5" opacity="0.9"')}
${ring(545, 390, 'stroke="url(#gold)" stroke-width="12" stroke-dasharray="3 17" opacity="0.35"')}
${ring(528, 374, 'stroke="url(#gold)" stroke-width="1.5" opacity="0.6"')}
${diamonds}
</svg>
`;
}

function buildCrimsonFelt() {
  const base = feltBase('base', [[0, '#8a2a3c'], [0.5, '#6b1e2c'], [0.85, '#4c1320'], [1, '#3a0d18']]);
  // Antique-gold rim + four corner flourish arcs + a dotted stud ring.
  const flourishes = [45, 135, 225, 315]
    .map((deg) => {
      const c = (deg * Math.PI) / 180, half = (14 * Math.PI) / 180;
      const [x0, y0] = arcPoint(548, 393, c - half);
      const [x1, y1] = arcPoint(548, 393, c + half);
      return `<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} A 548 393 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" stroke="url(#gold)" stroke-width="9" stroke-linecap="round" fill="none" opacity="0.85"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FW} ${FH}" preserveAspectRatio="none">
<defs>${GOLD_GRAD}${base.def}</defs>
${base.rect}
${ring(560, 404, 'stroke="url(#gold)" stroke-width="5" opacity="0.9"')}
${ring(540, 386, 'stroke="url(#gold)" stroke-width="1.5" opacity="0.6"')}
${flourishes}
${ring(522, 370, 'stroke="url(#gold)" stroke-width="4" stroke-dasharray="0.1 28" stroke-linecap="round" opacity="0.5"')}
</svg>
`;
}

function buildNeonFelt() {
  const base = feltBase('base', [[0, '#20204c'], [0.5, '#17173c'], [0.85, '#101030'], [1, '#0c0c26']]);
  const neon = `<linearGradient id="neon" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#45e6e6"/><stop offset="0.5" stop-color="#6a8af0"/><stop offset="1" stop-color="#e84dd0"/>
  </linearGradient>`;
  // Circuit nodes sit on the dashed ring; alternate cyan/magenta with halos.
  const nodes = Array.from({ length: 8 }, (_, i) => {
    const [x, y] = arcPoint(540, 388, (i / 8) * 2 * Math.PI + Math.PI / 8);
    const c = i % 2 ? '#e84dd0' : '#45e6e6';
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10" fill="${c}" opacity="0.25" filter="url(#glow)"/>
<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${c}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FW} ${FH}" preserveAspectRatio="none">
<defs>${neon}${base.def}<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter></defs>
${base.rect}
${ring(560, 404, 'stroke="#45e6e6" stroke-width="6" opacity="0.55" filter="url(#glow)"')}
${ring(560, 404, 'stroke="#45e6e6" stroke-width="2.5" opacity="0.95"')}
${ring(540, 388, 'stroke="url(#neon)" stroke-width="3" stroke-dasharray="70 14 28 14 8 14" opacity="0.85"')}
${nodes}
${ring(518, 368, 'stroke="#e84dd0" stroke-width="1" opacity="0.35"')}
</svg>
`;
}

function buildKenteFelt() {
  const base = feltBase('base', [[0, '#c06636'], [0.55, '#a85128'], [0.85, '#8d4220'], [1, '#7a3719']]);
  // Woven band: colour cycle from the deck's vertical band pattern, with the
  // black backing ring showing through the segment gaps as weave separators.
  const bandColors = ['#e2a92e', '#2f6b3a', '#e2a92e', '#bf3a20', '#e2a92e', '#1c150d'];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FW} ${FH}" preserveAspectRatio="none">
<defs>${base.def}</defs>
${base.rect}
${ring(549, 396, 'stroke="#1c150d" stroke-width="42"')}
${segmentRing(549, 396, 48, bandColors, 34, 0.82)}
${ring(574, 418, 'stroke="#e2a92e" stroke-width="2" opacity="0.8"')}
${ring(524, 374, 'stroke="#e2a92e" stroke-width="2" opacity="0.8"')}
</svg>
`;
}

function buildCosmosFelt() {
  const base = feltBase('base', [[0, '#10101e'], [0.5, '#0a0a14'], [1, '#06060c']]);
  const orn = `<linearGradient id="orn" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#9a6ae8"/><stop offset="0.35" stop-color="#4a8ae0"/>
    <stop offset="0.65" stop-color="#e88ad8"/><stop offset="1" stop-color="#6a4ae0"/>
  </linearGradient>`;
  // Nebula wisps hug the rim; the playable centre stays near-black.
  const nebulae = [
    [260, 170, 190, 110, '#9a6ae8', 0.18], [950, 170, 200, 100, '#4a8ae0', 0.16],
    [180, 630, 170, 120, '#e88ad8', 0.14], [1010, 650, 190, 110, '#6a4ae0', 0.18],
    [600, 90, 230, 80, '#4a8ae0', 0.12], [600, 800, 230, 80, '#9a6ae8', 0.12],
  ]
    .map(([x, y, rx, ry, c, o]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${c}" opacity="${o}" filter="url(#neb)"/>`)
    .join('');
  const rand = mulberry32(205);
  let stars = '';
  for (let n = 0; n < 400 && stars.split('circle').length < 150; n++) {
    const x = rand() * FW, y = rand() * FH;
    const dx = (x - FCX) / FCX, dy = (y - FCY) / FCY;
    if (dx * dx + dy * dy > 0.9) continue;
    const r = 0.7 + rand() * 1.7, o = 0.25 + rand() * 0.75;
    const c = rand() < 0.85 ? '#cfd8ff' : rand() < 0.5 ? '#9a6ae8' : '#e88ad8';
    stars += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="${c}" opacity="${o.toFixed(2)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FW} ${FH}" preserveAspectRatio="none">
<defs>${orn}${base.def}<filter id="neb" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="30"/></filter></defs>
${base.rect}
${nebulae}
${stars}
${ring(558, 402, 'stroke="url(#orn)" stroke-width="3" opacity="0.85"')}
${ring(538, 386, 'stroke="url(#orn)" stroke-width="1" stroke-dasharray="4 10" opacity="0.35"')}
</svg>
`;
}

const FELTS = [
  ['felt_noir.svg', buildNoirFelt],
  ['felt_crimson.svg', buildCrimsonFelt],
  ['felt_neon.svg', buildNeonFelt],
  ['felt_kente.svg', buildKenteFelt],
  ['felt_cosmos.svg', buildCosmosFelt],
];

for (const [out, build] of FELTS) {
  const svg = build();
  writeFileSync(join(outDir, out), svg);
  console.log(`${out}: ${(svg.length / 1024).toFixed(0)} KB`);
}
