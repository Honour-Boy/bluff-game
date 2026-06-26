// ============================================================
// #205 — Rasterize the deck-skin SVGs to PNGs (paint performance)
// ============================================================
// The frame deck skins are committed as self-contained SVGs (built by
// build-cosmetic-decks.mjs from the owner traces). Painting those SVGs as
// CSS backgrounds turned out to be the table's biggest paint cost: every
// card in the fan / pile / flights re-rasterizes the vector art per unique
// element size, and deck_kente.svg alone carries ~0.5 MB of trace paths.
//
// This script renders each deck SVG ONCE to a 480×720 PNG (the largest
// in-game card is 220×320 CSS px, so 480 wide stays sharp past 2× DPR) —
// the client then paints a cached bitmap instead of vector art. The SVGs
// stay in the repo as this script's input; only the PNGs ship to players
// (lib/cosmetics.js points at deck_*.png).
//
// Rasterization uses headless Edge via the client's playwright-core (same
// run-on-demand pattern as build-chamber-skins.mjs — not part of any build).
// Re-run after any build-cosmetic-decks.mjs change.
//
// Usage: node scripts/build-deck-rasters.mjs

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '..', 'public', 'cosmetics');
const require = createRequire(join(here, '..', 'package.json'));
const { chromium } = require('playwright-core');

const W = 480;
const H = 720;

const decks = readdirSync(dir).filter((f) => /^deck_.*\.svg$/.test(f));
if (decks.length === 0) throw new Error(`No deck_*.svg found in ${dir}`);

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: W + 40, height: H + 40 } });

for (const f of decks) {
  // Force the render size onto the SVG (the sources carry
  // preserveAspectRatio="none", so any aspect drift is intentional —
  // in-game the art is stretched 100% 100% over the card too).
  const svg = readFileSync(join(dir, f), 'utf8')
    .replace('<svg ', `<svg width="${W}" height="${H}" `);
  await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
  const png = await page.locator('svg').first().screenshot({ omitBackground: true });
  const out = f.replace(/\.svg$/, '.png');
  writeFileSync(join(dir, out), png);
  console.log(`${out}: ${(png.length / 1024).toFixed(0)} KB`);
}

await browser.close();
