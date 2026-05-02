# Phase H — Clash Resolution Sweep + Polish

> Branch: `feature/v2-phase-h-polish`. Cut from `staging` then merged G1.

## Clash priorities — verification + tests

For each, read code path → confirm enforcement → add integration test → fix gap if any.

1. **Assassin > Mirror** — bluffPipeline runs `_stageAssassin` BEFORE `_stageMirror`. Pipeline-only test exists; add an integration test confirming Mirror stays armed when Assassin fires.
2. **Shield > Assassin** — `_stageShield` runs first and short-circuits. Spec note: bluff "never officially registers" → add a test confirming an armed Assassin on the same player would NOT be consumed.
3. **Mirror > Sniper Role** — Sniper redirect rejects Mirror holders (`server/gameEngine.js:1126`). Server-side validation exists. Add test that Sniper redirect to Mirror holder is rejected.
4. **Medic > Assassin** — `call_bluff` handler defers Assassin elimination through `maybeStartMedicPause`. Already covered. Add an integration-shape test verifying the deferred outcome's eliminatedPlayerId hooks into the Medic save.
5. **Swap > Mirror** — `resumeAfterSwap` skips Shield/Assassin stages but re-runs Mirror. Add a Sheriff-Sniper-Swap-Mirror crossbreed test for completeness.
6. **Sudden Death vs Gambler** — Sudden Death must affect Gambler (external modifier rule). Currently `tickSuddenDeath` adds bullet to every alive chamber regardless of role. Verified — add a test.
7. **Redemption Spin vs Last Stand** — `pickRedemptionCandidates` checks `room.lastStandActive` (server/gameEngine.js:2078), but `enterLastStand` never sets the flag. **BUG — fix by setting `room.lastStandActive = true` in `enterLastStand`.**
8. **Mirror Match vs eliminated opposite** — `getMirrorMatchOpposite` walks forward to next alive on fallback. Already tested.
9. **Sheriff > Assassin** — pipeline returns when accuser is Sheriff but does NOT emit a banner event. **BUG — add `sheriff_protected` event so the table sees the immunity fire.**

## Loose-end audit

- `lastStandActive` set fix above.
- Sheriff-protected banner above.
- Swap holder disconnect — currently no auto-resolve when swap_pending holder disconnects. Add cleanup in disconnect handler.
- Ghost vote auto-resolves via timer; medic/sniper auto-resolve in disconnect handler — confirm symmetric.

## Mobile polish

- Settings panel — already 44px touch targets, 60vh scroll.
- Role reveal — already maxWidth 90%, 280px.
- SystemsOverlays — backdrop padding 20px, content maxWidth 460 + width 100%. OK.
- Confirm AnnouncementBanner mobile.

## Tests

- New file `server/tests/clashResolution.test.js` — ~15-25 integration tests covering all 9 priorities + edge cases.

## README

Update Architecture + add v2 features section.
