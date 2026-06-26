# 🎴 BLUFF — Real-Time Multiplayer Card Game

**Lie convincingly. Call it when you smell a bluff. Spin the gun if you're wrong.**

BLUFF is a fast-paced, real-time party card game of deception, nerve, and survival.
Play it with cards in the room, or fully online with friends across the world — same
high-stakes mind games either way. The catch? Every time you're caught (or you call
wrong), you spin a six-chamber gun. Survive long enough and your odds only get worse.

> 🤖 **New to it?** Hit **Practice vs Bot** on the home screen for a guided solo round.
> A live coach walks you through every move — no friends or room code required.

---

## 🎮 How to play

1. **Create a room** and share the 6-character code with your friends (2–15 players).
2. Each turn, the game calls a **required card type** (square, circle, triangle, cross, star).
3. The current player lays a card claiming it matches — **truth or bluff, your call.**
4. Smell a lie? **Call Bluff** on the player before you.
5. **The loser spins the gun.** A wrong call, or a bluff that gets exposed, means you
   spin a 6-slot chamber. Land on a bullet and you're out.
6. **Survive and your chamber gets more loaded** — the longer you last, the deadlier
   each spin becomes. Last player standing wins.

Two ways to play:

- **🃏 Physical mode** — everyone holds real cards; the app is the referee, tracking
  turns and running the gun spins.
- **🌐 Online mode** — the app deals the cards and runs everything automatically, with
  voice chat and table chat built in.

---

## ✨ What's inside

Online mode layers a whole "deck of consequences" on top of the core game. The host
flips these on per room — leave them off for a clean, classic round.

### 🛡️ Power Cards
Secret wild cards mixed into the deck, armed at the start of your turn:

- 🛡️ **Shield** — blocks the next bluff call against you
- 🪞 **Mirror** — bounces a bluff's consequences back at whoever called it
- 🔄 **Swap** — quietly swap your played card with one from the pile
- 👁️ **Peek** — sneak a look at the last card played
- ❄️ **Freeze** — skip the next player's turn entirely
- 💀 **Assassin** — eliminate anyone bold enough to call your bluff

### 🎭 Secret Roles
At 9+ players, everyone is dealt a hidden role with its own edge — **The Gambler**,
**The Sheriff**, **The Medic**, **The Saboteur**, **The Sniper**, **The Collector**,
or plain **Barehand**. Only you ever see your own role.

### 🔥 Twists & modifiers
Crank up the chaos with host-toggleable rules:

- **Double Barrel · Russian Roulette · Hot Potato · Redemption Spin** — change how
  deadly each spin is.
- **Speed Mode · Sudden Death · Mirror Match** — change the pace and the pressure.
- **Bounty · Betting · Dead Man's Hand · Last Stand** — side-games, comebacks, and a
  cinematic final-two duel.

### 🗣️ Built for playing together
- Voice chat and per-room text chat in online mode
- Passwordless email magic-link sign-in + Google login
- One-tap **Practice vs Bot** tutorial with a guided coach

---

## 🚀 Run it yourself

You'll need [Node.js](https://nodejs.org) (version 20.19+ or 22.12+).

```bash
# 1. Start the server
cd server && npm install && npm start      # runs on http://localhost:3001

# 2. Start the app (in a second terminal)
cd client && npm install && npm run dev     # open http://localhost:3000
```

Both sides ship `.env.example` files with working local defaults. Copy them to
`.env` (server) and `.env.local` (client) and fill in your own Supabase / LiveKit
keys to enable accounts and voice chat.

---

## 🛠️ For developers

The deep technical documentation lives alongside the code:

- **[`CLAUDE.md`](./CLAUDE.md)** — architecture, game modes, the server-authoritative
  engine, tutorial system, and the conventions to follow.
- **[`ENGINEERING_BIBLE.md`](./ENGINEERING_BIBLE.md)** — engineering standards and
  deeper system notes.
- **`server/`** — Node.js + Express + Socket.IO; pure game logic in `gameEngine.js`,
  with a Vitest suite under `server/tests/`.
- **`client/`** — Next.js 14 (App Router) with Supabase auth; all socket state flows
  through a single `useGame` hook.

---

## 📜 License

**All rights reserved.** BLUFF is proprietary software owned by IndyWebstars. It is
**not** open source — you may not use, copy, download, distribute, or modify it
without prior written permission. See [`LICENSE`](./LICENSE) for full terms and how
to request a license.
