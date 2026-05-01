# Bluff Game — Active Plan

> Branch flow per engineering bible: `main ← staging ← feature/*`. Feature branches cut from `staging`.

## Phase 1 — Foundation fixes (`feature/foundation-fixes`)

Server + client fixes. No DB changes.

- [ ] **P0** Game-over spin overwrite — `server/socketHandlers.js:324-328`. The eliminating spin overwrites `lastAction.type='spin_result'` with `'game_over'` in the same broadcast, so clients never see the spin animation. Emit two phases: spin_result first, then game_over after acknowledgement.
- [ ] **P0** `host_reconnect` has no auth check — `server/socketHandlers.js:158-177`. Anyone with a 6-char room code can hijack host. Add `socket.userId === room.hostUserId` check.
- [ ] **P0** `eliminateFromTurnOrder` off-by-one — `server/gameEngine.js:349-358`. When the eliminated player IS the current actor, the index should stay (splice already advances). Change `idx <= currentTurnIndex` to `idx < currentTurnIndex`.
- [ ] **P0** Disconnect timers per-connection — `server/socketHandlers.js:55`. `disconnectTimers` is declared inside `registerSocketHandlers`, so each socket gets a fresh empty map and `player_reconnect` can never clear the old socket's elimination timer. Lift to module scope, key by `playerId`.
- [ ] **P1** Auth race on reconnect — `client/src/hooks/useGame.js:47-55, 80-111`. `authenticateSocket` doesn't await the server's auth callback before emitting reconnect. Make it return a Promise that resolves on the callback.
- [ ] **P1** `notify` timer race — `client/src/hooks/useGame.js:25-28`. Each call schedules an unconditional `setNotification(null)` after 3.5s. Back-to-back notifications wipe each other. Use a `useRef` and clear before setting.
- [ ] **P1** `spin_acknowledged` dismisses overlay on every client — `server/socketHandlers.js:539-542`. One client clicking Continue hides the animation on slow clients before they render. Either gate per-client, or require local animation completion before the dismiss takes effect.

## Phase 2 — Auth username friction (`feature/auth-username-autoload`)

DB migration + UI changes.

- [ ] Confirm `handle_new_user` trigger handles all three signup paths (email/password, Google OAuth, future providers) — already does via COALESCE. No DB change needed.
- [ ] Remove the "DISPLAY NAME" field from `AuthScreen.js` sign-up form. Username derived from email prefix on email signup, from `full_name` on Google.
- [ ] Update `useAuth.js` `signUp()` to not pass `username` in metadata.
- [ ] Verify `UserProfile` modal still allows editing the username after signup.
- [ ] **Tech debt note**: 2 unused tables (`rooms`, `room_players`) exist in the DB schema but are never touched by the code (state is in-memory). Decide: drop them, or actually persist room state. **Block on user decision.**

## Phase 3 — LiveKit voice chat (`feature/livekit-voice`)

10-person rooms → full-mesh WebRTC is out, LiveKit SFU is right.

- [ ] Add LiveKit env vars to `server/.env.example` + `client/.env.local.example`: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`, `NEXT_PUBLIC_LIVEKIT_URL`.
- [ ] Server: `POST /livekit/token` route (or a `livekit_token` socket event) that mints a short-lived JWT with the room code as the LiveKit room. Authenticate via existing Supabase JWT.
- [ ] Client: `useVoice` hook wrapping `livekit-client`. Mute/unmute, push-to-talk option, mic-active indicator on each player row.
- [ ] UI: voice controls in `HostUI`/`PlayerUI`/`OnlinePlayerUI` (next to the player list).
- [ ] Acceptance: 10 clients in one room, voice works on a single LiveKit room, no audio loops, latency acceptable.

## Phase 4 — Polish (`feature/polish-pass`)

- [ ] `play_card_online` whot validation — reject (or default-fallback) if `nominatedShape` missing. `server/socketHandlers.js:442-444`.
- [ ] Standardise spin-animation kickoff. `OnlinePlayerUI` uses 80ms setTimeout, others use double rAF. Pick the timeout approach; rAF is occasionally swallowed by React batching.
- [ ] Online-mode chamber reset between rounds — `server/gameEngine.js:306-330`. Decide: reset (fair restart) vs persist (escalating tension). Document in README either way.
- [ ] `next_turn` mode/phase guard — `server/socketHandlers.js:224-244`. Reject if not `playing`/`round_end`.
- [ ] Lobby disconnect grace period (5-10s) — current behaviour spliceses player immediately, refresh = lose seat.
- [ ] CORS `*` fallback hard-fail in production — `server/index.js:14,29`.
- [ ] README sync: `localStorage` → `sessionStorage`, old `riskLevel +=1` → chamber array mechanic, port mismatch in env examples.

## Phase 5 — Engineering bible alignment (separate sprints)

Out of scope for this push, tracked here so we don't lose them:

- [ ] **Tests** — bible mandates tests for every endpoint and DB mutation. Currently zero. Pick a stack (Vitest for client + node:test or Vitest for server) and add test scaffolding + CI gate.
- [ ] **FORGE / vibe2prod** — install + run scan before each push.
- [ ] **GitHub Actions** — block merges on test failures, run FORGE in CI.
- [ ] **Doppler** — migrate secrets out of `.env` files, document the `doppler run --` workflow.
- [ ] **Coolify deploy target for server** — bible specifies Coolify on Oracle VM. Set up if/when staging deploy needs a real server.

## Open questions (need user input)

1. **Server deploy target**: README mentions Railway/Render/Fly.io. Bible says Coolify on Oracle VM. Which are we using for staging?
2. **Unused `rooms`/`room_players` tables**: drop in Phase 4, or wire up persistence as a future feature?
3. **Chamber reset between rounds**: design preference — reset (fair) or persist (escalating)?
