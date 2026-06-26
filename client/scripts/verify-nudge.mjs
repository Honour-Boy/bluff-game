// ============================================================
// Playwright - idle "tap a card" nudge alignment check (large screen)
// ============================================================
// Verifies that the tutorial idle nudge is centred over the real hand fan on a
// wide viewport (the bug this fixes: it used to sit at a fixed offset and drift
// off the cards). Drives the guest → Practice vs Bot → Basics → Begin flow,
// waits for the idle nudge, then asserts its centre-x matches the hand
// ([data-tour-id="my-hand"]) within a tolerance and saves a screenshot.
//
// PREREQUISITES (this needs the real app + env - it can't run headless without
// Supabase credentials):
//   1. server running:  (cd server && node index.js)
//   2. client running:  (cd client && npm run dev)   with client/.env.local set
//   3. chromium installed for Playwright:  npx playwright install chromium
//
// RUN:  node client/scripts/verify-nudge.mjs            (uses http://localhost:3000)
//       NUDGE_URL=http://localhost:3000 node client/scripts/verify-nudge.mjs
//
// Exit code 0 = aligned within tolerance; 1 = misaligned or flow failed.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BASE = process.env.NUDGE_URL || 'http://localhost:3000';
const TOLERANCE_PX = 24; // nudge centre must be within this of the hand centre
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../.tmp');

async function clickByText(page, text, timeout = 8000) {
  const el = page.getByText(text, { exact: false }).first();
  await el.waitFor({ state: 'visible', timeout });
  await el.click();
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('[page error]', m.text()); });

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    // ── Guest sign-in (the practice table is guest-friendly). ──
    // The AuthScreen offers a guest path; fill a name and enter. Selectors are
    // best-effort - adjust the text if the copy changes.
    try {
      await clickByText(page, /continue as guest|guest/i, 6000);
    } catch { /* maybe already past auth */ }
    const nameInput = page.locator('input[type="text"], input:not([type])').first();
    if (await nameInput.count()) {
      await nameInput.fill('NudgeBot').catch(() => {});
      await clickByText(page, /enter|continue|play/i, 6000).catch(() => {});
    }

    // ── Practice vs Bot → Basics ──
    await clickByText(page, 'Practice vs Bot');
    await clickByText(page, /basics/i);

    // ── Intro walkthrough → Begin practice (click Next until Begin appears). ──
    for (let i = 0; i < 8; i++) {
      const begin = page.getByText(/begin practice/i).first();
      if (await begin.isVisible().catch(() => false)) { await begin.click(); break; }
      const next = page.getByText(/next/i).first();
      if (await next.isVisible().catch(() => false)) { await next.click(); }
      await page.waitForTimeout(250);
    }

    // ── Wait for the table + the idle nudge (~3.5s idle threshold). ──
    await page.locator('[data-tour-id="my-hand"]').waitFor({ state: 'visible', timeout: 15000 });
    const nudge = page.getByText(/tap a card/i).first();
    await nudge.waitFor({ state: 'visible', timeout: 8000 });

    const handBox = await page.locator('[data-tour-id="my-hand"]').boundingBox();
    const nudgeBox = await nudge.boundingBox();
    if (!handBox || !nudgeBox) throw new Error('could not measure hand / nudge');

    const handCx = handBox.x + handBox.width / 2;
    const nudgeCx = nudgeBox.x + nudgeBox.width / 2;
    const delta = Math.abs(handCx - nudgeCx);

    await page.screenshot({ path: resolve(OUT_DIR, 'nudge-large.png') });

    console.log(`hand centre-x  = ${handCx.toFixed(1)}`);
    console.log(`nudge centre-x = ${nudgeCx.toFixed(1)}`);
    console.log(`Δ = ${delta.toFixed(1)}px (tolerance ${TOLERANCE_PX}px)`);
    console.log(`screenshot → ${resolve(OUT_DIR, 'nudge-large.png')}`);

    if (delta > TOLERANCE_PX) {
      console.error('✗ nudge is NOT aligned with the hand');
      process.exitCode = 1;
    } else {
      console.log('✓ nudge is centred over the hand');
    }
  } catch (err) {
    console.error('verify-nudge failed:', err.message);
    await page.screenshot({ path: resolve(OUT_DIR, 'nudge-failure.png') }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
