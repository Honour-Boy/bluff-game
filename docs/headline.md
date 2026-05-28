# UI Redesign Headlines

## 2026-05-28 — Phase 1: Liar's Bar Tavern Aesthetic (Deployed to Staging)

**Branch:** `feature/ui-redesign-phase-1`  
**PR:** Design: UI Redesign & Keyboard Controls (Phase 1)  
**Scope:** Entry screens, Auth, Landing, Groups Hub, Group Detail

---

### What Changed

The full front-end for the Groups & Lobby system has been transformed from a flat cyberpunk aesthetic (neon yellow/pink on pure black) into an immersive, atmospheric tavern environment inspired by *Liar's Bar*:

| Layer | Before | After |
|---|---|---|
| **Color system** | Neon yellow `#e8ff4a`, pink `#ff4a6e`, cyan `#4affdb` on `#0a0a0b` | Tarnished gold `#c8922e`, deep crimson `#9b1c1c`, aged verdigris `#3a7a52` on dark mahogany `#090705` |
| **Typography** | Bebas Neue (display) + Space Mono (body) | Cinzel Decorative (display) + Cinzel (UI labels) + Crimson Text (body copy) |
| **Background** | Flat grid overlay | Layered wood-grain CSS gradients + radial candlelight bloom + vignette |
| **Buttons** | Flat CSS rectangles | Textured wooden plaque gradient with inner sheen + hover lift + gold box-shadow |
| **Panels** | Flat `var(--surface)` boxes | Dark lacquered oak gradient panels with `box-shadow` depth + inset edge highlight |
| **3D depth** | None | `perspective(1200px) rotateY(-2.5deg) rotateX(1deg)` tilt on main content panels |
| **Animations** | Glitch text, scanline overlay | Candle flicker (title), ember pulse (active player), title-emerge (3D reveal on load) |
| **Buttons (primary)** | Flat `#e8ff4a` fill | Gilded gold gradient with inset shine + lifted shadow |
| **Buttons (danger)** | Crimson border only | Dark blood-red with crimson hover glow |
| **Focus ring** | None | Amber glow `box-shadow: 0 0 0 2px rgba(200,146,46,0.35), 0 0 18px ...` |
| **Scrollbar** | Thin grey | Aged iron track + brown thumb |

---

### Files Modified

```
client/src/app/globals.css                       — New tavern design system
client/src/components/screens/AuthScreen.js     — Tavern gate / inn registry
client/src/components/screens/LandingScreen.js  — Common room notice board
client/src/components/screens/GroupsScreen.js   — Guild bulletin board
client/src/components/screens/GroupDetailScreen.js — Guild ledger page
```

### Files Added

```
client/src/hooks/useKeyboardNav.js   — Global keyboard navigation hook
docs/headline.md                     — This file
```

---

### Keyboard Navigation — Full Mapping for QA Testing

| Key | Screen | Action |
|---|---|---|
| `W` or `↑` | Any nav container | Move focus to previous item |
| `S` or `↓` | Any nav container | Move focus to next item |
| `A` or `←` | Mode cards (host flow) | Move focus to previous item |
| `D` or `→` | Mode cards (host flow) | Move focus to next item |
| `Enter` | Any nav container | Confirm / activate focused item |
| `Space` | Any nav container | Confirm / activate focused item |
| `Escape` | Any nav container | Clear error / go back |
| `B` | Global | Dispatches `bluff-hotkey` custom DOM event (Phase 2 will wire up) |
| `P` | Global | Dispatches `power-hotkey` custom DOM event (Phase 2 will wire up) |
| `Tab` | Any | Standard browser tab order (all nav items are focusable) |

**Focus visual:** Any element focused via keyboard shows an amber glow ring:
`box-shadow: 0 0 0 2px rgba(200,146,46,0.35), 0 0 18–22px rgba(200,146,46,0.22)`

The `useKeyboardNav` hook:
- Accepts an `itemCount` and optional `onConfirm` / `onEscape` callbacks
- Syncs with native browser focus (clicking also sets `focusedIndex`)
- All focusable items carry `data-nav-item` attribute
- `loop: true` by default — arrow keys wrap at the ends

---

### Testing Checklist (Phase 1)

- [ ] AuthScreen: `W`/`S` cycle through Google button → email input → Continue → Play as guest button
- [ ] AuthScreen: `Enter` submits focused form button
- [ ] AuthScreen: `Esc` clears error state
- [ ] LandingScreen: `W`/`S` cycle through Create Room → Join Room → My Groups → Rules
- [ ] LandingScreen: `Enter` on focused plaque button triggers action
- [ ] LandingScreen host flow: `A`/`D` switch between Physical/Online mode cards
- [ ] LandingScreen: `Esc` returns from host/join flow to main menu
- [ ] GroupsScreen: `W`/`S` cycle through guild list entries
- [ ] GroupsScreen: `Enter` on guild opens GroupDetailScreen
- [ ] GroupDetailScreen: `W`/`S` cycle header buttons (Back / Enter Room)
- [ ] All screens: focused elements show amber glow ring
- [ ] Mobile (≤640px): 3D tilts disabled, layouts collapse to single column
- [ ] `prefers-reduced-motion`: all animations and transitions suppressed
- [ ] Panel candle flicker does NOT run when reduced-motion is set

---

### Phase 2 — Awaiting Approval

Phase 2 (The Online Game Board & Active Table) is **deferred** until explicit sign-off on Phase 1.
Targets: `OnlinePlayerUI/`, `HostUI/`, `PlayerUI/`, `TableScene`, `CardHand`, `SpinOverlay`.
