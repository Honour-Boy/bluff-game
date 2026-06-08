# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

Two-process app, no monorepo tooling — each side has its own `package.json`:

- `server/` — Node.js + Express + Socket.IO. In-memory state only (no DB for game state).
- `client/` — Next.js 14 App Router (JS, not TS), Supabase for auth.

Game state lives in a `Map` in the server process — restarting the server wipes all rooms.

## Common commands

```bash
# Server (run from server/)
npm install
node index.js          # or: npm start

# Client (run from client/)
npm install
npm run dev            # Next.js dev on :3000
npm run build && npm start

# Tests
cd server && npx vitest run   # server suite (runs on any Node 20.x+)
cd client && npm test         # client suite — REQUIRES Node ^20.19.0 || >=22.12.0
```

**Node baseline:** the client test toolchain (Vite 8 via Vitest) requires Node `^20.19.0 || >=22.12.0` — pinned in `client/package.json` `engines` and `.nvmrc`. On an older 20.x LTS the client runner dies at config load with `ERR_REQUIRE_ESM` in `std-env` (see issue #196). The server suite has no such requirement. There is no linter or typechecker configured.

## Environment variables

Required for anything beyond the landing page to work:

**`server/.env`**
- `PORT` — server port (defaults to `3001` in code; `.env.example` also uses `3001`)
- `CLIENT_URL` — CORS origin (defaults to `*`)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — used to verify Supabase JWTs on the `authenticate` socket event

**`client/.env.local`**
- `NEXT_PUBLIC_SERVER_URL` — where the socket connects (falls back to `http://localhost:3001` in `lib/socket.js`)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — browser Supabase client

ℹ️ **Ports are aligned on `3001`:** both `.env.example` files and the code defaults (`server/index.js`, `lib/socket.js`) use `3001`, so a fresh clone connects out of the box. If you change the server `PORT`, update `client` `NEXT_PUBLIC_SERVER_URL` to match.

## Architecture

### Authoritative state lives on the server

`server/gameEngine.js` is the single source of truth. It's a collection of **pure functions** (mutations happen on plain objects passed in, but no I/O, no socket access). Treat it as the only place to add or change game rules. `socketHandlers.js` is a thin orchestration layer that calls the engine and broadcasts state.

When changing rules, edit `gameEngine.js` first — adding logic in `socketHandlers.js` will create drift between the two modes (see below) and is the wrong layer.

### Backend-authoritative randomness

The chamber/gun-spin system is fully deterministic from the server's perspective:

- Each player has a 6-slot `chamber` array (`null | 'bullet'`), initialized server-side with one bullet at a random index.
- `pullTrigger()` picks the spin index server-side, decides elimination, and on survival adds a new bullet.
- The full chamber **and** the chosen `spinIndex` are emitted to clients in `lastAction`. **The client never rolls dice.** Frontend animation must use the values from `lastAction` (`chamber` for pre-spin state, `chamberAfter` for post-spin, `spinIndex` for the slot to land on).

Don't reintroduce client-side RNG for spins — it'll desync clients.

### Two game modes share most code paths

Rooms have `mode: 'physical' | 'online'`:

- **Physical** — players hold real cards. Host clicks "Next Turn", "Bluff Correct/Wrong", "Win". Server tracks turn order and chamber only.
- **Online** — server deals a Whot-style deck (`generateDeck()` + optional doubled deck for >10 players), players play `cardId` from their hand via `play_card_online`. Bluff resolution is automatic (`resolveBluffOnline` checks the actual revealed card).

Many handlers branch on `room.mode`. When adding behavior, decide whether it applies to one mode or both, and gate it explicitly. `serializeRoom()` already does mode-aware filtering (e.g. `myHand` only sent in online mode, only to its owner).

### Tutorial / Practice mode (bot opponent)

"Practice vs Bot" (landing screen) creates a normal **online** room via `create_tutorial_room`, flagged `room.isTutorial`, seated with the human (a **non-host player**) + one bot player (`id 'bot:1'`, `isBot: true`, `socketId: null`). The **bot is host-of-record** (`hostUserId = 'bot:1'`, `hostSocketId = null`) so a newbie never inherits Kick/Reset/config — `serializeRoom`'s `amHost` is false for the human and host controls disappear. The learner still starts/replays their own game via the **tutorial bypass** in `start_game` / `restart_room` (allow the sole non-bot human). Leaving OR disconnecting destroys the room (tutorial teardown in `leave_room` + `disconnect`), so a dropped human never strands a bot-only room.

- The bot has no socket, so it can't emit events. It's driven **server-side** by `lib/bots.js` (`armBotTurn` / `_onBotActExpire`), modeled on the idle-turn auto-resolver: armed at the end of `broadcastRoomState` (next to `armIdleTurnTimer`), it runs the bot's beats (play a card → end turn; spin when it's the bluff-called target; **clinic-scripted** challenge / arm-defence) by calling the engine + shared `applySpinAndBroadcast` / `_resolveOnlineBluff` directly, then broadcasting. Decisions live in pure `engine/botStrategy.js`. **`armBotTurn` is a no-op without bots, so normal rooms are untouched** — gate any new bot/tutorial behavior on `isTutorial` / `isBot` the same way.
- `lib/bots.js` is required at the top of `lib/broadcast.js`, so it must use **deferred requires** for `./broadcast` and `./orchestration` (inside the expiry fn) to avoid the cycle — same trick `lib/idleTurn.js` uses. Tutorial rooms are never group rooms, so pass an inert stub leaderboard repo (don't `require('./supabaseClient')`, which throws without env).
- Basics: the bot is tuned (`engine/botStrategy.js`) to call bluff **≥2 times per game** (`room.botBluffCallsThisGame` counter) so the learner experiences being challenged.
- **Progression director** (`lib/tutorialDirector.js`, same deferred-require + timer pattern, armed next to `armBotTurn`): when a Basics game ends it hands the learner into the **Power Clinic** (set `tutorialLesson='powers'`, enable powers, stage drill 0); inside the clinic it steps through the scripted drills (intro → wait for the player → "resolved" beat → next) and finishes on a clinic-complete `game_over`.
- **Power Clinic** (`engine/tutorialScenarios.js`, pure): an ordered list of staged "instances", one per power (peek/freeze/shield/mirror/swap/assassin) + a bot-uses-Shield demo. `stageScenario(room, i)` deterministically writes hands / power slot / turn / `challengeableCard` / phase (defensive drills stage straight into `bluff_intercept_pending`); `scenarioComplete(room, i)` is the director's poll. The clinic bot gets an **empty chamber** so a reflected spin can't kill it before the (intentionally last) Assassin drill. `room.tutorialScenario` ({ power, actor, step, lockBluff }) is serialized for the client coach.
- Tutorial rooms opt out of the 40s idle auto-play (`_idleTurnActive`) and skip the `pre_game` role-reveal (`start_game`), so a learner is paced by the guided UI, not by timers.
- Client guided layer: `components/tutorial/` (`TutorialLayer` intro modal + state-driven coach bar + clinic before/after coach + clinic-complete card, pure copy in `tutorialContent.js`), mounted in `OnlinePlayerUI` only when `roomState.isTutorial`. The idle "tap a card" nudge anchors to the real hand (`data-tour-id="my-hand"`). No DOM spotlights (deliberately — too fragile over the pannable/responsive table).

### Phase state machine

`room.phase` flows: `lobby` → `playing` → (`bluff_resolution` for physical | `spin_pending`) → `playing` → ... → `round_end` (online round win) → `playing` → `game_over`.

Most handlers gate on `phase`. New events should validate `phase` before mutating state, or callers will be able to drive the room into invalid combinations.

### Auth flow

1. Client signs in via Supabase (`useAuth`), gets an access token.
2. Client opens a socket and emits `authenticate` with the token **before any other event**. The server verifies via `supabase.auth.getUser(token)` and stamps `socket.userId` + `socket.username` (looked up from the `profiles` table).
3. All subsequent room/game events check `socket.userId`. `playerId` on the server is the Supabase user id — same identity across reconnects.

When adding a new socket event that touches game state, follow the existing pattern: check `socket.userId`, fetch the room, validate phase + ownership (host vs current-turn player), mutate via the engine, `saveRoom` + `broadcastRoomState`, then `callback`.

### Reconnection & disconnect timers

- Session is persisted in `sessionStorage` under `bluff_session` (room code, isHost, playerId). On `connect`, `useGame` re-emits `host_reconnect` or `player_reconnect`.
- Server has two grace-period timers (`socketHandlers.js`): **30s for players** mid-game (then auto-eliminate) and **10s for host** (then `game_ended` and the room is deleted). Don't shorten these without coordinating with the client UX — the host-leaving toast assumes 10s.
- A wake-lock is acquired in `useGame` while in a room — keep that in mind when changing the in-room lifecycle.

### Client structure

- `app/page.js` is the only route. It picks a screen based on `(user, roomCode, isHost, gameMode)`: `AuthScreen` → `LandingScreen` → (`HostUI` | `PlayerUI` | `OnlinePlayerUI`).
- All socket state and actions live in **one** hook: `hooks/useGame.js`. Don't add a second socket consumer — pass actions down as props (this is how every screen gets them today).
- `hooks/useAuth.js` owns Supabase. Pass `getAccessToken` from it into `useGame` so the socket can re-authenticate on reconnect.
- Styling: plain CSS via `app/globals.css` with CSS custom properties (`--bg`, `--accent`, `--alive`, `--eliminated`, etc.). No Tailwind, no CSS-in-JS library — components use inline `style={{...}}` referencing the CSS variables. Keep that consistent; don't introduce a new styling system for one component.

## Conventions worth preserving

- Server files use ASCII box-drawing section comments (`// ─── ... ───`). Match the style when editing.
- Socket events all use the `(payload, callback) => callback({ success, ... })` shape. Keep new events the same so the client can rely on a single response pattern.
- `serializeRoom` is the only thing that goes over the wire — if you add server-side fields, decide explicitly whether to expose them, and never leak other players' hands.
