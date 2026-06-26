// ============================================================
// #205 - Build chamber (cylinder) skin art from the owner traces
// ============================================================
// Inputs: cosmetic-previews/chamber{1..5}.svg at the repo root - full-color
// auto-traced vectorizations of the owner's chamber art (1.3–4.1 MB each,
// LOCAL-ONLY / gitignored). 1=noir 2=neon 3=crimson 4=cosmos 5=kente.
//
// Each trace's disc is measured (centre + radius, hardcoded below from a
// pixel scan) and mapped onto CylinderSVG's exact geometry - body disc r 86
// at (100,100) in a 200×200 box - then clipped to the disc and rasterized
// ONCE to a transparent 640×640 PNG (the in-game cylinder is 200 CSS px, so
// 640 stays sharp up to 3× DPR; shipping the raw traces as SVG would mean
// 1–4 MB per skin). Output: client/public/cosmetics/chamber_<name>.png
// (committed).
//
// Rasterization uses headless Edge via the client's playwright-core, so this
// script needs a desktop with Edge installed (it's a run-on-demand design
// tool, not part of any build).
//
// Usage: node scripts/build-chamber-skins.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, '..', '..', 'cosmetic-previews');
const outDir = resolve(here, '..', 'public', 'cosmetics');
const require = createRequire(join(here, '..', 'package.json'));
const { chromium } = require('playwright-core');

// Disc centre + radius measured from each 1024×1024 trace (brightness scan
// against the near-black background).
//
// `sectors`: the kente art has EIGHT recesses at 45° spacing - a six-shot
// cylinder needs six at 60°. The disc is recomposed from the art itself:
// six 60° wedges, each holding a copy of the artwork re-clocked by the
// given rotation so a real recess lands in each game position (45°→60°,
// 135°→120°, etc.). Leather body, gold trim ring and centred hub are
// rotation-tolerant, so the wedge seams disappear.
const CHAMBER_SKINS = [
  { src: 'chamber1.svg', out: 'chamber_noir.png', cx: 514, cy: 507, r: 338.5 },
  { src: 'chamber2.svg', out: 'chamber_neon.png', cx: 514, cy: 527, r: 333.5 },
  { src: 'chamber3.svg', out: 'chamber_crimson.png', cx: 510, cy: 506, r: 367 },
  { src: 'chamber4.svg', out: 'chamber_cosmos.png', cx: 509, cy: 506, r: 347.5 },
  { src: 'chamber5.svg', out: 'chamber_kente.png', cx: 510, cy: 522, r: 320, sectors: [0, 15, -15, 0, 15, -15] },
];

const SIZE = 640;

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: SIZE + 40, height: SIZE + 40 } });

for (const d of CHAMBER_SKINS) {
  const raw = readFileSync(join(srcDir, d.src), 'utf8');
  const open = raw.indexOf('>', raw.indexOf('<svg'));
  const close = raw.lastIndexOf('</svg>');
  if (open === -1 || close === -1) throw new Error(`No <svg> wrapper in ${d.src}`);
  const inner = raw.slice(open + 1, close);
  const s = (86 / d.r).toFixed(6);

  // The clip must sit on an UNTRANSFORMED group - clip-path on the same
  // element as the transform gets mapped into the trace's coordinate space.
  let body;
  let sectorDefs = '';
  if (d.sectors) {
    // Six 60° pie wedges (game hole k is centred at k·60−90°), each showing
    // the art re-clocked by sectors[k] around the disc centre.
    const pt = (r, a) => `${(100 + r * Math.cos(a)).toFixed(2)},${(100 + r * Math.sin(a)).toFixed(2)}`;
    sectorDefs = d.sectors
      .map((_, k) => {
        const a0 = ((k * 60 - 90 - 30) * Math.PI) / 180;
        const a1 = ((k * 60 - 90 + 30) * Math.PI) / 180;
        return `<clipPath id="sec${k}"><path d="M100,100 L${pt(120, a0)} A120,120 0 0 1 ${pt(120, a1)} Z"/></clipPath>`;
      })
      .join('\n');
    body = d.sectors
      .map((rot, k) => `<g clip-path="url(#sec${k})"><use href="#art" transform="rotate(${rot} 100 100)"/></g>`)
      .join('\n');
    // The art's neighbouring recesses (45° apart, ~±20° wide) poke slivers
    // across the wedge seams. Hide each seam under an annular patch of the
    // art's own recess-free inner leather, scaled outward about the centre
    // (source radius ≈18–38 → patch 39–81 stays below the outer trim ring),
    // rotated per-seam so the grain doesn't repeat, with a whisper of
    // darkening to match the dimmer rim lighting.
    for (let k = 0; k < 6; k++) {
      const bDeg = k * 60 - 90 + 30;
      const a0 = ((bDeg - 6) * Math.PI) / 180;
      const a1 = ((bDeg + 6) * Math.PI) / 180;
      sectorDefs += `\n<clipPath id="seam${k}"><path d="M${pt(39, a0)} A39,39 0 0 1 ${pt(39, a1)} L${pt(81, a1)} A81,81 0 0 0 ${pt(81, a0)} Z"/></clipPath>`;
      body += `\n<g clip-path="url(#seam${k})">
<use href="#art" transform="rotate(${bDeg + 97} 100 100) translate(100 100) scale(2.15) translate(-100 -100)"/>
<rect width="200" height="200" fill="#000" opacity="0.08"/>
</g>`;
    }
  } else {
    body = '<use href="#art"/>';
  }

  const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${SIZE}" height="${SIZE}">
<defs>
<clipPath id="disc"><circle cx="100" cy="100" r="86.5"/></clipPath>
${sectorDefs}
<g id="art" transform="translate(100 100) scale(${s}) translate(${-d.cx} ${-d.cy})">
${inner}
</g>
</defs>
<g clip-path="url(#disc)">
${body}
</g>
</svg>`;

  await page.setContent(`<body style="margin:0;background:transparent">${wrapped}</body>`);
  const png = await page.locator('svg').first().screenshot({ omitBackground: true });
  writeFileSync(join(outDir, d.out), png);
  console.log(`${d.out}: ${(png.length / 1024).toFixed(0)} KB`);
}

await browser.close();
