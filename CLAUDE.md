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
```

There are **no tests, no linter, and no typechecker** configured. Don't claim verification by running `npm test` — it won't exist. Verify changes by running both processes and exercising the flow in a browser.

## Environment variables

Required for anything beyond the landing page to work:

**`server/.env`**
- `PORT` — server port (defaults to `3001` in code; `.env.example` suggests `4000`)
- `CLIENT_URL` — CORS origin (defaults to `*`)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — used to verify Supabase JWTs on the `authenticate` socket event

**`client/.env.local`**
- `NEXT_PUBLIC_SERVER_URL` — where the socket connects (falls back to `http://localhost:3001` in `lib/socket.js`)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — browser Supabase client

⚠️ **Port mismatch in the examples:** `server/.env.example` ships `PORT=4000` and `client/.env.local.example` ships `NEXT_PUBLIC_SERVER_URL=http://localhost:4000`, but the code defaults are `3001`. Pick one and keep both `.env` files aligned, or the client won't connect.

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
