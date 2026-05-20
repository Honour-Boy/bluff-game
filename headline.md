# Bluff Game — Current State
> Last updated: 2026-05-20 (post #133)

---

## Maintenance rules

- **`headline.md` is updated locally only — never raise a PR for it.** After every completed task, fetch the current state of the repo (`git fetch`, `gh pr list`, `gh issue list`) and refresh this file in-place. Commit it straight to whatever branch is checked out (typically `staging`). It is a project journal, not an audit artefact — the PR-roundtrip ceremony that #131 and #134 used is retired.

---

## Repo topology

- `main` ← `staging` ← `feature/*` / `fix/*` / `refactor/*`

---

## Recently shipped (merged to staging)

| PR | Issue | What |
|----|-------|------|
| #133 | #116 | Feature: pre-game role reveal + bonus-card selection phase (lobby → `pre_game` → `playing`) |
| #132 | #117 | Feature: power cards moved to `room.powerCardSlot`; hand UI splits shape cards from a dedicated POWER side-column |
| #130 | #125 | Refactor: tests → `__tests__/` dirs; `test-utils/` barrel; `gameActions` unit tests |
| #128 | #123 | Refactor: primitive UI atoms → `components/shared/` |
| #127 | #122 | Refactor: screen-level components → `components/screens/` |
| #126 | #124 | Refactor: drop stub shims + relocate `useOnlinePlayerUiController` → `hooks/` |
| #115 | #107 | Security: session expiry, rate limiting, Supabase RLS hardening |
| #113 | #105 (PR D) | Refactor: `HostUI`, `PlayerUI`, `useGame` splits |
| #112 | #105 (PR C) | Refactor: `OnlinePlayerUI` split into modules |
| #111 | #105 (PR B) | Refactor: `socketHandlers.js` split into `handlers/*` + `lib/*` |
| #110 | #105 (PR A) | Refactor: `gameEngine.js` split into `server/engine/*` modules |
| #109 | #106 | Performance: client-side caching (groups, profile, leaderboard, HowToPlay lazy-load) |
| #108 | #104 | Mobile: Group screens responsive below 640px |
| #103 | #102 | Mobile: FAB menu + VoicePanel layout fix |
| #98–101 | FR1 epic | Persistent groups — P1 (schema + join), P2 (settings), P3 (leaderboard) |

---

## Open issues

| # | Title | Labels | Status |
|---|-------|--------|--------|
| **#118** | Feature: Pre-Emptive Manual Activation & Upkeep Phase | feature, enhancement | Not started |
| **#119** | Architecture: Unified Event Resolution Engine | feature, refactor | Not started — **implement before #120** |
| **#120** | Feature: Card Behaviors & Medic Role Integration | feature, enhancement, bug | Depends on #119 |
| **#121** | Bug: Public Announcement & Event Sync Accuracy | bug | Depends on #119 |

---

## client/ structure (post-refactor)

```
client/src/
  app/           — Next.js route (page.js is the only route)
  components/
    screens/     — Full-page screens (AuthScreen, LandingScreen, GroupsScreen, etc.)
    shared/      — Primitive UI atoms (ShapeIcon, CardShape, PowerCard, RiskMeter, etc.)
    HostUI/      — Host game UI modules
    PlayerUI/    — Physical-mode player UI modules
    OnlinePlayerUI/ — Online-mode player UI modules
    [root]       — Feature-specific components (AnnouncementBanner, TurnActionModal, etc.)
  hooks/
    useGame/     — Game socket hook (split into sub-modules)
    useAuth.js, useVoice.js, useIsMobile.js
    useOnlinePlayerUiController.js  ← moved here from OnlinePlayerUI/
  test-utils/            — shared test helpers (makeMockSocket); import from here
  lib/           — socket.js, supabase.js
```

---

## v2 roadmap — not yet started

Phases A–H defined in `tasks/v2-roadmap.md`. Phase A (test framework + settings panel UI) is the next entry point.

---

## Foundation fixes — not yet started

Seven bugs in `tasks/todo.md` Phase 1. Key P0s:
- `host_reconnect` has no auth check — anyone with a room code can hijack host
- `disconnectTimers` declared inside handler scope — reconnect timer can never be cleared
- Auth race on reconnect in `useGame.js`

---

## Active stashes

- `stash@{0}` — pre-merge WIP on `fix/issue-102-mobile-fab-menu` (safe to drop)
- `stash@{1}` — `fix/issue-80-betting-streak-badge` — LiveKit install WIP
