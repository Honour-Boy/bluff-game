# Bluff v2 — Power Cards, Roles, Systems

> Captured from the spec dropped 2026-05-01. Online-mode only unless otherwise stated; physical mode unchanged.

## Cross-cutting decisions (LOCKED 2026-05-02)

1. ✅ **Tests first.** Phase A1 = Vitest + golden-path tests on the existing engine before any v2 feature work.
2. ✅ **Hand reset on survival** in online mode: clear hand, deal 6 fresh from deck. Redemption Spin survivors get only 3.
3. ✅ **Chamber persistence stays.** Normal spin survival keeps the accumulated chamber. Only Redemption Spin survivors get a reset chamber (1 bullet).
4. ✅ **Online-only for v2.** Physical mode unchanged. Future-proof the engine so a physical equivalent can be added later without rework, but ship online-only.
5. **Single Supabase project still** — staging/prod share. Blast radius on redeploys is real; the in-memory architecture means active rooms die on deploy. Migrate to persistence as a separate later effort if usage demands.

## Spec ambiguity decisions (LOCKED — based on close read of the spec)

- **Armed power card on elimination** → card vanishes silently with the player. No transfer, no banner.
- **Assassin penalty stacking** → penalty's +4 cards apply at the activation prompt where the holder declines to re-arm. If a spin survival happens later, Section 7 hand reset still clears to 6 — penalty cards are cleared with the rest. Penalty consequence is the *immediate* hand bloat, not a permanent disadvantage; if you survive a spin you "wash" the penalty.
- **Swap "full round elapsed"** → per-Swap-card tracking. When the Swap enters a player's hand, snapshot the alive playerIds. Each turn a snapshotted player takes is removed from the set. When the set empties, Swap is activatable. Eliminations remove players from the set without granting credit (so Swap activation doesn't accidentally unlock from people dying).
- **Bounty 3-in-a-row counter** → consecutive surviving spins, persists across rounds. Resets to 0 when:
  - bounty is placed at 3 (counter "collected" into the bounty itself)
  - bounty is collected by a successful bluff call
  - holder is eliminated
- **Dead Man's Hand cadence** → vote fires *each time* the alive-count drops further once threshold crossed. So eliminations 3, 4, 5… each open a fresh 15s vote. Game flow pauses for the vote.
- **Mirror Match if alive count goes odd** → modifier stays active. Use the spec's "skip to next alive in opposite direction" fallback. Setup-only even-count constraint means the *initial* table is even.
- **Sudden Death cadence** → counter resets to 0 on any elimination. So 4 elimination-free turns trigger the bump; one elimination resets the clock.
- **Last Stand + armed power cards/roles** → entering Last Stand silently consumes any armed power cards on the finalists. Roles' passive abilities (Sheriff risk-drop, etc.) are suspended for the duration. The duel is pure spin-vs-spin.
- **Medic 6-card cap** → check happens at the moment of intervention. Medic at 6 (fresh hand) intervenes → goes to 8. Medic at 6 *who has already gone over previously* is fine; only the at-or-above-6-now check blocks.

## Phased plan

Each phase is its own branch + PR + deploy. No phase blocks the previous; clean rollback at every boundary.

### Phase A — Foundation (2 PRs)
- **A1** Test framework: Vitest, a few golden-path tests on existing engine behaviour to lock current truth. No new features.
- **A2** Pre-game settings panel UI (host-only). Toggles for power cards / roles / risk mods / room mods / systems all wire to a `room.config` object. Nothing reads them yet — pure plumbing.

### Phase B — Power card foundation (1 PR)
- Card data model (`type: 'power' | 'shape'`, `power: 'shield' | ...`)
- Deck distribution honors host config (1 or 2 copies based on single/double deck)
- Hand cap rule: drawing a power card while already holding one auto-discards + draws shape replacement
- Activation prompt UI (start-of-turn modal: "Activate Shield?" / "Skip")
- Server `power_card_activate` event with armed-state tracking
- **No actual power effects yet.** Just plumbing.

### Phase C — Power cards, simple-to-complex (6 PRs)
- C1 **Shield** — single trigger, no role interactions yet. Establishes announce-banner pattern.
- C2 **Peek** — private info reveal at activation prompt.
- C3 **Freeze** — turn-skip mechanic. Adds `pendingSkipPlayerId` to room state.
- C4 **Mirror** — bluff-redirect logic. Two triggering scenarios per spec.
- C5 **Swap** — anonymous played-pile selection UI + swap-then-judge resolution.
- C6 **Assassin** — most complex (multi-turn arming, penalty cards, Sheriff/Mirror/Shield clash priority).

### Phase D — Roles (4 PRs, grouped)
- D1 **Barehand + Gambler + Sheriff** — passive abilities, no UI prompts.
- D2 **Medic + Saboteur** — once-per-game with private prompt UI.
- D3 **Sniper** — target-selection popup with greyed-out Mirror holder + self.
- D4 **Collector** — multi-card hand limit relaxation.
- Role reveal animation lands with D1.

### Phase E — Risk + room modifiers (2 PRs)
- E1 Risk: Double Barrel, Russian Roulette, Hot Potato, Redemption Spin (last is the most complex; needs eliminated-player UI for the second-chance spin).
- E2 Room: Speed Mode (15s turn timer + auto-spin penalty), Sudden Death (every-4-turn risk bump), Mirror Match (opposite-position spin).

### Phase F — Systems (3 PRs)
- F1 Bounty (3-survival counter + banner + chip icon + reward).
- F2 Betting (10s window + popup + tally + 3-streak reward).
- F3 Dead Man's Hand (ghost council vote when eliminated > 2) + Last Stand (final-2 cinematic mode).

### Phase G — UI rewrite (3+ PRs)
- G1 Top-down table view layout (the big visual refactor of `OnlinePlayerUI.js`).
- G2 Power card visual treatment (dark + colored border + icon, distinct back).
- G3 Whot card refresh + announcement banner styling.

### Phase H — Polish + clash resolution sweep
- Verify all 9 clash priority rules from the spec.
- Stress-test the announcement queue (multiple banners back-to-back).
- Mobile pass.

## Estimate

- Phase A: 2-3 days
- Phase B: 2 days
- Phase C: 1-2 days per power card → 6-12 days
- Phase D: 4-6 days
- Phase E: 4-5 days
- Phase F: 5-7 days
- Phase G: 5-8 days (UI rewrite is the wildcard)
- Phase H: 3-5 days

**Total: ~6-10 weeks of focused work**, depending on how much testing and iteration each phase needs. Ship-able demos at end of every phase.

## What to do this session vs next

Right move: **don't start coding yet.** Get the cross-cutting answers + spec clarifications above, then I open Phase A1 (test framework). Without tests, Phase B onward will regress.

If you want to start with feature work anyway, the natural skip is straight to **Phase A2** (the settings panel) — pure UI, no engine touched, nothing to break.
