# BLUFF — Real-Time Multiplayer Card Game

A real-time multiplayer bluff card game built with Next.js, Node.js, Express, and Socket.IO.
Game state is held in-memory on the server (room state dies on restart). Supabase is used for auth + user profiles only. LiveKit handles voice chat (online mode).

---

## v2 features (online mode)

The host configures these per-room from the pre-game settings panel before creating the room.

**Power cards** — six wild cards mixed into the deck, activated at turn start, hidden until they trigger:
- 🛡️ **Shield** — blocks the next bluff call against you
- 🪞 **Mirror** — redirects bluff consequences back to the source
- 🔄 **Swap** — exchange your played card with one from the round's pile (anonymous pick)
- 👁️ **Peek** — see the last card played before your move
- ❄️ **Freeze** — skip the next player's turn entirely
- 💀 **Assassin** — eliminate anyone who dares call your bluff

**Secret roles** (auto-activated at 9+ players):
- **Barehand** — no special ability
- **The Gambler** — risk level frozen on survivals; jumps to 4 if you're caught bluffing
- **The Sheriff** — risk drops on every correct call you make; immune to Assassin
- **The Medic** — once per game, save any player from elimination (+2 cards cost)
- **The Saboteur** — once per game, secretly slip a card into someone else's hand
- **The Sniper** — once per game, redirect a pending spin to anyone but the Mirror holder
- **The Collector** — hold up to 3 power cards instead of 1

**Risk modifiers** (host toggles):
- **Double Barrel** — every spin uses two dice, takes the higher
- **Russian Roulette** — everyone starts with 3 bullets loaded
- **Hot Potato** — risk increases by 2 instead of 1 on survival
- **Redemption Spin** — eliminated players get a second chance each round

**Room modifiers**:
- **Speed Mode** — 15-second turn timer, auto-spin penalty
- **Sudden Death** — every 4 elim-free turns, all alive players +1 bullet
- **Mirror Match** — when one player spins, the player opposite them spins too

**Special systems**:
- **Bounty** — survive 3 spins in a row, become a target; collecting a bounty drops your risk
- **Betting** — 10-second window before each spin; predict the outcome, 3-streak = -1 risk
- **Dead Man's Hand** — eliminated players form a ghost council, vote on round disruptions
- **Last Stand** — final two players auto-enter a stripped-down duel: spin or pass, no cards

**Other**:
- LiveKit voice chat (opt-in, mute toggle)
- Per-room text chat (Socket.IO, 50-message rolling cap)
- Magic-link email auth (passwordless) + Google OAuth via Supabase

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
│   ├── bluffPipeline.js    — Bluff resolution stages: Shield → Assassin →
│   │                          correctness → Mirror → Swap → default → roles
│   ├── socketHandlers.js   — Socket event handlers, in-memory room store
│   └── tests/              — Vitest suite — engine + pipeline + clash sweep
│
└── client/
    └── src/
        ├── app/
        │   ├── page.js         — Root page (routes between views)
        │   ├── layout.js       — HTML shell
        │   └── globals.css     — Design system (dark industrial theme)
        ├── hooks/
        │   ├── useGame.js      — All socket state + actions (single hook)
        │   └── useAuth.js      — Supabase auth wrapper
        ├── components/
        │   ├── LandingScreen.js        — Create / join room UI
        │   ├── HostUI.js               — Game master panel (physical mode)
        │   ├── PlayerUI.js             — Player panel (physical mode)
        │   ├── OnlinePlayerUI.js       — Online-mode top-down table view
        │   ├── PreGameSettingsPanel.js — Host v2 toggles before start
        │   ├── PowerCard.js            — Power card visual (front)
        │   ├── PowerCardBack.js        — Power card back
        │   ├── RoleRevealOverlay.js    — Once-per-game secret role card
        │   ├── AnnouncementBanner.js   — Power-card / role event banner
        │   ├── SystemsOverlays.js      — Bounty / Betting / DMH / Last Stand
        │   ├── PlayerList.js           — Turn-ordered player rows with risk
        │   ├── CardShape.js            — Shape icon display
        │   ├── RiskMeter.js            — 6-chamber gun risk display
        │   ├── ActionLog.js            — Last event display
        │   ├── ChatPanel.js            — Per-room text chat
        │   ├── VoicePanel.js           — LiveKit voice controls
        │   └── Notification.js         — Toast notification
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

## v2 Features (Online Mode)

Online mode adds a layered "deck of consequences" on top of the base spin-the-gun game. Every layer is host-toggleable from the pre-game settings panel — defaults are all OFF, so a vanilla room behaves exactly like physical mode.

### Power Cards
Six abilities that arm at the start of a turn and trigger inside the bluff resolution pipeline:
- **Shield** — block one incoming bluff penalty (the bluff "never officially registers")
- **Mirror** — reflect a bluff back at the caller
- **Swap** — anonymously swap the played card with one from the played pile, re-judging the bluff
- **Peek** — privately see the previous player's card
- **Freeze** — skip a target player's next turn
- **Assassin** — multi-turn arming; eliminates whoever calls bluff on you (Shield blocks; Sheriff is immune)

Players hold at most **one** power card at a time (Collector role lifts to three). Drawing a second auto-discards and replaces with a shape card.

### Secret Roles
Activate automatically at 9+ alive players (not host-toggleable). Each role has either a passive ability or a once-per-game prompt:
- **Barehand** — vanilla, no special abilities
- **Gambler** — risk doesn't grow on survival; getting caught bluffing jumps chamber to 4 bullets
- **Sheriff** — every correct bluff call drops your risk by one; immune to Assassin
- **Medic** — once per game, save anyone (or yourself) from elimination at the cost of +2 cards
- **Saboteur** — once per game, silently move a random card from your hand into another player's
- **Sniper** — once per game, after a bluff resolves, redirect the spin to anyone (Mirror holders off-limits)
- **Collector** — hold up to three power cards instead of one

Roles reveal privately at game start via an overlay; only the role's owner ever sees their card.

### Risk Modifiers
- **Double Barrel** — spin index = max of two rolls (deadlier)
- **Russian Roulette** — every chamber starts with 3 bullets
- **Hot Potato** — surviving a spin adds two bullets instead of one
- **Redemption Spin** — eliminated players get one more chance per round (suspended once Last Stand begins)

### Room Modifiers
- **Speed Mode** — 15s turn timer, auto-spin penalty on miss
- **Sudden Death** — every 4 elimination-free turns, all alive chambers gain a bullet
- **Mirror Match** — when one player spins, the player opposite them in turn order spins too (eligibility check: even alive count at game start; falls back to next-alive-in-opposite-direction if the exact opposite is dead)

### Special Systems
- **Bounty** — survive 3 spins in a row → bounty placed; getting bluffed correctly while bountied drops the accuser's risk by one
- **Betting** — 10s window after `spin_pending` for non-targets to wager; 3-correct streak rewards a risk drop
- **Dead Man's Hand** — when 3+ players are eliminated, ghost council vote on a global twist (re-deal cards / change required shape / activate a random risk modifier)
- **Last Stand** — at alive=2, the final two enter a cinematic spin-vs-spin duel: hands cleared, chambers reset, no power cards or roles in play

### Clash Resolution Priorities
The bluff pipeline enforces nine spec-locked priorities:
1. **Assassin > Mirror** — Mirror cannot deflect an Assassin elimination
2. **Shield > Assassin** — Shield blocks before Assassin can fire
3. **Mirror > Sniper** — Sniper redirect refuses Mirror holders
4. **Medic > Assassin** — Medic save can revert an Assassin elimination
5. **Swap > Mirror** — Swap re-runs the bluff check; Mirror still applies to the post-swap world
6. **Sudden Death > Gambler** — external modifiers still affect Gambler (only spin-survival is frozen)
7. **Last Stand > Redemption Spin** — entering Last Stand suspends Redemption Spin
8. **Mirror Match > eliminated opposite** — falls back to next alive in opposite direction
9. **Sheriff > Assassin** — Sheriff is immune; pipeline emits `sheriff_protected` banner

Tests for each priority live in `server/tests/clashResolution.test.js`.

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
