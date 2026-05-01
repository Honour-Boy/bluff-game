# BLUFF — Real-Time Multiplayer Card Game

A real-time multiplayer bluff card game built with Next.js, Node.js, Express, and Socket.IO.
All state is held in-memory. No database required.

---

## Quick Start

### 1. Start the Server

```bash
cd server
npm install
node index.js
# Server runs on http://localhost:3001
```

### 2. Start the Client

```bash
cd client
npm install
npm run dev
# Client runs on http://localhost:3000
```

Open `http://localhost:3000` in your browser. One person opens it as **Host**, others as **Players**.

---

## Environment Variables

**Server** — create `server/.env`:
```
PORT=3001
CLIENT_URL=http://localhost:3000          # Required in production; comma-separated allowed
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role>  # NEVER expose to the browser
LIVEKIT_URL=wss://<project>.livekit.cloud # Voice chat
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
NODE_ENV=production                        # Hard-fails boot if CLIENT_URL is unset in prod
```

**Client** — create `client/.env.local`:
```
NEXT_PUBLIC_SERVER_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_LIVEKIT_URL=wss://<project>.livekit.cloud
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The `.env.example` files in each directory ship default values for local dev — defaults assume the server on `:3001` and the client on `:3000`. Keep both files aligned.

---

## Architecture

```
bluff-game/
├── server/
│   ├── index.js            — Express + Socket.IO entry point
│   ├── gameEngine.js       — Pure game logic (no I/O, fully testable)
│   └── socketHandlers.js   — Socket event handlers, in-memory room store
│
└── client/
    └── src/
        ├── app/
        │   ├── page.js         — Root page (routes between views)
        │   ├── layout.js       — HTML shell
        │   └── globals.css     — Design system (dark industrial theme)
        ├── hooks/
        │   └── useGame.js      — All socket state + actions (single hook)
        ├── components/
        │   ├── LandingScreen.js — Create / join room UI
        │   ├── HostUI.js        — Game master panel
        │   ├── PlayerUI.js      — Player panel
        │   ├── PlayerList.js    — Turn-ordered player rows with risk
        │   ├── CardShape.js     — Shape icon display (square/circle/etc.)
        │   ├── RiskMeter.js     — 6-chamber gun risk display
        │   ├── ActionLog.js     — Last event display
        │   └── Notification.js  — Toast notification
        └── lib/
            └── socket.js        — Socket.IO singleton
```

---

## How the Game Works

### Setup
1. **Host** opens the app → clicks "Create Room" → gets a 6-character room code
2. Host shares the code physically (or via any message channel)
3. **Players** open the app → click "Join Room" → enter username + room code
4. Host clicks **Start Game** (minimum 2 players, max 15)

### Turn Flow
1. Server picks a random required card type (square, circle, triangle, cross, star)
2. **Host announces** the card type aloud to the room
3. **Current player** must physically play a card face-down, claiming it's the required type (they may bluff)
4. Current player either:
   - Clicks **Continue** — pass the turn
   - Clicks **Call Bluff** — challenge the previous player's card
5. Host clicks **Next Turn** to advance

### Bluff Resolution
1. Player calls bluff → host UI shows resolution panel
2. Host physically reveals the last 3 played cards
3. Host clicks:
   - **Bluff Correct** — previous player (the bluffer) spins the gun
   - **Bluff Wrong** — the accuser spins the gun

### Gun Spin Mechanic
Each player has a 6-slot revolver chamber. The chamber starts with **1 bullet** placed at a random position. Bullets are placed by the backend only — the frontend renders exactly what the backend returns.

- On spin: server picks a random slot index (0–5)
- If that slot has a bullet → **ELIMINATED**
- Otherwise → **SURVIVE**, and a new bullet is added to a random empty slot for next time

So the more spins you survive, the more loaded your chamber gets. After 5 survivals you're at 5 bullets / 6 slots — basically guaranteed dead next spin.

### Round End
- When a player plays their last card (online: empties their hand; physical: host clicks **🏆 Win** on their row), they're the round winner.
- The deck reshuffles and a new round begins with all surviving players.
- **Chamber state persists across rounds.** A player who survived 4 spins in round 1 enters round 2 with 5 bullets in their chamber. This is intentional — tension is supposed to escalate as the game runs long.
- Host clicks **Next Turn** (physical) or **Start Next Round** (online) to continue.

### Winning
- Players are eliminated one by one via gun spins
- Last player standing wins the game

---

## Reconnection

Session data is stored in `sessionStorage` under a single key `bluff_session`:
```json
{ "roomCode": "ABCDEF", "isHost": false, "playerId": "<supabase-user-id>" }
```

On page refresh, the client emits `host_reconnect` or `player_reconnect` once the socket has been authenticated with Supabase. If the room no longer exists (server restarted, host left for >30s), the failure callback clears the saved session and the user lands back at the lobby.

`sessionStorage` clears when the tab closes — restore-after-tab-close is intentionally not supported.

Server-side disconnect timers (in `socketHandlers.js`):
- **Lobby** — 10s grace before a disconnected player is removed from the room
- **In-game player** — 30s grace before auto-elimination
- **Host** — 30s grace before the room is killed and `game_ended` broadcasts to all players

Timers are keyed by `${roomCode}:${playerId}` and cleared on reconnect.

---

## Socket Events Reference

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `create_room` | `{}` | Host creates a room |
| `join_room` | `{ roomCode, username, playerId? }` | Player joins |
| `host_reconnect` | `{ roomCode }` | Host restores session |
| `player_reconnect` | `{ roomCode, playerId }` | Player restores session |
| `start_game` | `{ roomCode }` | Host starts game |
| `next_turn` | `{ roomCode }` | Host advances turn |
| `resolve_bluff` | `{ roomCode, bluffIsCorrect }` | Host resolves bluff |
| `trigger_spin` | `{ roomCode, playerId }` | Host spins for a player |
| `round_win` | `{ roomCode, playerId }` | Host declares round winner |
| `call_bluff` | `{ roomCode, playerId }` | Player calls bluff |
| `player_continue` | `{ roomCode, playerId }` | Player continues turn |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `room_state` | Full room snapshot | Broadcast on every state change |
| `bluff_called` | `{ callerId }` | Notify host of bluff |
| `host_disconnected` | `{}` | Notify players if host drops |

---

## Game Engine API (server/gameEngine.js)

All pure functions — no side effects, fully testable:

```js
createRoom(hostSocketId)         → room
createPlayer(id, username, socketId) → player
startGame(room)                  → room (mutates)
advanceTurn(room)                → room (mutates)
spinGun(player)                  → { eliminated, roll, riskLevel }
resolveBluff(room, bluffIsCorrect) → { spinTarget, spinResult }
eliminateFromTurnOrder(room, playerId)
handleDisconnect(room, socketId) → player | null
checkGameOver(room)              → player | false
declareRoundWinner(room, playerId) → player
reconnectPlayer(room, playerId, newSocketId) → player
serializeRoom(room)              → sanitized state object
```

---

## Production Deployment

### Server (e.g. Railway, Render, Fly.io)
```bash
cd server && npm install && node index.js
```
Set `PORT` env var if needed.

### Client (e.g. Vercel)
```bash
cd client && npm run build && npm start
```
Set `NEXT_PUBLIC_SERVER_URL` to your server's public URL.

### CORS
Server currently allows `*`. For production, restrict to your client's domain in `server/index.js`:
```js
cors({ origin: 'https://your-client-domain.com' })
```
