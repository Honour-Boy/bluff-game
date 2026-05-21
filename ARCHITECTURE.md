# Bluff Game Architecture

## Overview

This repository is a two-process web application for a real-time multiplayer bluff card game.

- `server/` hosts the authoritative game server using Node.js, Express, and Socket.IO.
- `client/` hosts the browser UI using Next.js 14 App Router.
- Game state is kept in memory on the server. There is no persistent game database.
- Supabase is used for authentication and user identity, not for game state.

## High-Level Architecture

```
bluff-game/
├── server/              # Backend process
│   ├── index.js         # Express + Socket.IO server entrypoint
│   ├── socketHandlers.js# Socket event orchestration and room lifecycle
│   └── gameEngine.js    # Pure game logic and rules engine
└── client/              # Frontend process
    └── src/
        ├── app/
        │   ├── page.js  # Root page and route selection
        │   ├── layout.js
        │   └── globals.css
        ├── hooks/
        │   ├── useAuth.js # Supabase auth and access token handling
        │   └── useGame.js # Socket state, events, and room lifecycle
        ├── components/   # UI screens and game controls
        └── lib/
            └── socket.js # Socket.IO client singleton
```

## Server

### Responsibilities

- Maintain authoritative game state in memory.
- Validate socket events, enforce turn order, enforce phase transitions.
- Execute all randomness and game logic on the server.
- Broadcast sanitized room state to connected clients.
- Handle reconnects and disconnect timers.

### Core files

- `server/index.js`
  - Starts Express and Socket.IO.
  - Configures CORS and environment-based defaults.
  - Loads `socketHandlers.js`.

- `server/socketHandlers.js`
  - Implements socket event handlers and room persistence.
  - Keeps room state in a `Map` keyed by room code.
  - Handles authentication, reconnection, host/player disconnect logic, and broadcasting state.

- `server/gameEngine.js`
  - Contains pure game functions with no socket or I/O side effects.
  - Responsible for creating rooms and players, advancing turns, resolving bluff/spin flow, and serializing room state.
  - The single source of truth for game rules.

### Game state model

- Rooms are stored in memory and reset when the server restarts.
- Each room includes:
  - `mode`: `physical` or `online`
  - `phase`: current game phase (e.g. `lobby`, `playing`, `bluff_resolution`, `spin_pending`, `round_end`, `game_over`)
  - Players, turn order, and host reference
  - Gun chambers and elimination state
  - Online-mode deck, hands, and round winners when applicable

### Randomness and determinism

- All chamber/bullet placement and spin resolution happens on the server.
- The client receives the exact chamber state, spin index, and result via `lastAction`.
- Clients do not generate RNG for game-critical flows.

## Client

### Responsibilities

- Authenticate the user via Supabase.
- Establish a Socket.IO connection to the server.
- Provide the host and player UI for room creation, joining, game control, and bluff actions.
- Render authoritative room state from the server.
- Handle session restoration after refresh or reconnect.

### Core files

- `client/src/app/page.js`
  - Single-page route selection logic.
  - Chooses between `AuthScreen`, `LandingScreen`, `HostUI`, `PlayerUI`, or `OnlinePlayerUI`.

- `client/src/hooks/useAuth.js`
  - Manages Supabase sign-in and access token retrieval.
  - Provides auth state to the rest of the app.

- `client/src/hooks/useGame.js`
  - Central socket hook for state, events, and callbacks.
  - Only socket state container in the app.
  - Sends all game actions through a standard `(payload, callback) => callback({ success, ... })` pattern.

- `client/src/lib/socket.js`
  - Singleton Socket.IO client instance.
  - Connects to `NEXT_PUBLIC_SERVER_URL` or `http://localhost:3001` by default.

- Components
  - `LandingScreen.js`: room creation and join flow.
  - `HostUI.js`: host controls, turn advancement, bluff resolution, and round control.
  - `PlayerUI.js`: player actions, bluff calls, and status.
  - `OnlinePlayerUI.js`: online-mode hand and play controls.
  - `RiskMeter.js`, `PlayerList.js`, `ActionLog.js`, `Notification.js`: game visualization.

### Styling

- Uses plain CSS in `app/globals.css`.
- UI components rely on CSS custom properties like `--bg`, `--accent`, `--alive`, and `--eliminated`.
- No Tailwind or CSS-in-JS.

## Auth and Session Flow

- Clients sign in via Supabase and receive an access token.
- The socket emits `authenticate` with that token before other game events.
- The server verifies the token with Supabase and attaches `socket.userId` and `socket.username`.
- `playerId` is the stable Supabase user ID, enabling reconnects across sessions.

## Reconnection and Disconnect Handling

- Client stores session metadata in `sessionStorage` under `bluff_session`.
- On reconnect, the client re-emits `host_reconnect` or `player_reconnect`.
- Server grace periods:
  - Lobby disconnects: short grace before removal.
  - In-game players: 30s grace before auto-elimination.
  - Host: 30s grace before the room is ended.

## Game Modes

### Physical mode

- Players hold real cards physically.
- Server tracks turn order, bluff calls, and gun chambers only.
- Host resolves bluff outcomes manually with buttons like `Bluff Correct` / `Bluff Wrong`.

### Online mode

- Server deals a digital Whot-style deck.
- Players play actual cards from their hand.
- Bluff resolution is automatic based on revealed card contents.
- `serializeRoom()` only exposes hand data to the owning player.

## Event Flow

- The server and client communicate via Socket.IO events.
- `serializeRoom()` is the only payload published as the room snapshot.
- New socket events should validate user identity, room existence, current phase, and ownership.

### Important socket event patterns

- `create_room`
- `join_room`
- `start_game`
- `next_turn`
- `resolve_bluff`
- `trigger_spin`
- `round_win`
- `call_bluff`
- `player_continue`

## Design Principles

- Keep game rules server-authoritative and isolated in `gameEngine.js`.
- Keep socket orchestration separate from game logic in `socketHandlers.js`.
- Keep UI state and socket actions centralized in `useGame.js`.
- Use server-side randomness and server-side validation for all core gameplay.
- Avoid exposing other players' private data (hands, hidden chambers) in serialized state.

## Notes

- The repo intentionally has no centralized test suite, linter, or typechecker.
- Verify behavior manually by running both server and client processes.
- Environment variable defaults are important: the server defaults to `3001`, and the client should use the same URL.
