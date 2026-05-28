# UI Redesign Headlines

## 2026-05-28 — Phase 2: Online Game Board & Active Table (Deployed to Staging)

**Branch:** `feature/ui-redesign-phase-2`  
**PR:** Design: UI Redesign — Game Board & Active Table (Phase 2)  
**Scope:** OnlinePlayerUI table, chips, cards, center panel, BottomSeat, RoomHeader, CylinderSVG

---

### What Changed

The entire active game board has been transformed into a first-person dark-wood poker table environment:

| Component | Before | After |
|---|---|---|
| **TableScene** | Flat dark surface | Radial felt-green table oval fading to mahogany rail; `tableEntrance` fade-in animation |
| **RoomHeader** | Flat yellow BLUFF + border box | Cinzel header with wax-seal room code, candlelight glow on hover, tavern panel background |
| **PlayerChip** | Flat surface2 box, neon border | Dark oak gradient chip, amber chipTurnPulse, blood-red spinTargetPulse, Cinzel labels |
| **CenterTablePanel** | Flat card panel | Dark felt-green radial background, carved frame for required card, leather-back deck stacks, revolver trigger button for spin |
| **CardHand** | Flat cards in a scrollable row | Physically fanned cards with rotation angle + vertical stagger; selected card lifts 22px with gold glow; wooden cardholder trough border |
| **BottomSeat** | Flat bottom bar | First-person wooden table-rail (dark gradient + border-top), Cinzel nameplate, blood-red chamber dots, bell SVG "Call Bluff" button with `[B]` hotkey label |
| **CylinderSVG** (Host+Player) | Blue-grey cyberpunk fill | Dark iron `#1a1208` body, copper `#4a3520` ring, tarnished brass centre pin, blood-red bullets |
| **GAME_UI_STYLE** | Basic animations | + `cardPlayPhysics`, `spinTargetPulse`, `tableEntrance`, `cardDealIn`, `spinResultFlash` |

### Files Modified

```
client/src/components/OnlinePlayerUI/helpers.js        — New GAME_UI_STYLE animations
client/src/components/OnlinePlayerUI/RoomHeader.js     — Tavern header + wax-seal room code
client/src/components/OnlinePlayerUI/PlayerChip.js     — Carved wood seat chips
client/src/components/OnlinePlayerUI/TableScene.js     — Felt-green table surface
client/src/components/OnlinePlayerUI/CenterTablePanel.js — Leather decks, carved frame, revolver trigger
client/src/components/OnlinePlayerUI/CardHand.js       — Physical fan hand in wooden trough
client/src/components/OnlinePlayerUI/BottomSeat.js     — First-person rail, bell Bluff button, [B] hotkey
client/src/components/HostUI/shared.js                 — CylinderSVG: iron/brass palette
client/src/components/PlayerUI/shared.js               — CylinderSVG: iron/brass palette
```

### Keyboard Additions (Phase 2)

| Key | Location | Action |
|---|---|---|
| `B` | BottomSeat (active turn) | Call Bluff (dispatches event + shown as kbd hint on button) |
| `P` | Global (via useKeyboardNav) | Power card hotkey — dispatches `power-hotkey` event |
| `W`/`S` | Action button row | Navigate between Call Bluff / End Turn |
| `Enter`/`Space` | Action button row | Confirm focused action button |

### QA Checklist (Phase 2)

- [ ] Online mode lobby: table loads with `tableEntrance` fade, felt-green centre visible
- [ ] Player chips: active turn chip shows amber glow pulse; spin target shows blood-red pulse
- [ ] Room header: room code styled as wax seal, glows gold on hover, click copies
- [ ] Card hand: 3+ cards fan out with angle/stagger; selected card lifts with gold glow
- [ ] Selected card plays on click; hand updates
- [ ] Center panel deck stacks show leather-back card texture + filigree SVG
- [ ] Required card type shown in carved frame with gold border glow
- [ ] Spin pending: "Pull the Trigger" button appears with cylinder icon + blood-red styling
- [ ] Game over: "Victory" / "[Name] Prevails" in Cinzel Decorative with gold text shadow
- [ ] Cylinder (spin animation): dark iron body, copper ring, blood-red bullets land in crimson
- [ ] `[B]` hotkey label visible on Call Bluff button when it's your turn
- [ ] Mobile (≤640px): chip sizes shrink, hand still scrollable, action buttons full-width

---

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
