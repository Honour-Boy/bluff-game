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
