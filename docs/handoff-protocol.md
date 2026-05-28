# Handoff Protocol

> Every project maintains a `handoff.md` in the project root. This file is the source of truth for current state.

---

## Why it exists

Claude Code starts each session with no memory of the last one. Without `handoff.md`, you re-explain the state of the project every time you open a new chat. With it, the agent (and you) pick up exactly where you left off.

It also captures **failed attempts**, which prevents repeating mistakes.

---

## Update rules

1. **Update after every implementation, major or minor.**
2. If multiple issues are resolved in one session, update the file **once per issue resolved** — not once at the end.
3. **Trim entries older than ~2 weeks** of completed/stable work. Keep only what's recent and relevant.
4. **Never delete the "Failed / Not Working" section.** Failed attempts are as important as successes — they prevent re-trying things that don't work.
5. Update the timestamp at the top of the file on every edit.

---

## Required sections

```markdown
# Handoff

_Last updated: YYYY-MM-DD_

## Goal
[One paragraph: what this project is trying to do and why.]

## Current State
[What is working right now, as of the last update.]

## Files in Flight
[Files actively being edited or with uncommitted changes.]
- `path/to/file.ts` — [why it's in flux]

## Recent Changes
[Bullet list, most recent first. Trim entries older than ~2 weeks.]
- YYYY-MM-DD — [what changed and why]

## Failed / Not Working
[Things tried that didn't work, or reported by the user as broken. Keep this section.]
- [what was tried] → [why it failed or what the symptom was]

## Next Steps
[Ordered list of what needs to happen next.]
1. [task]
2. [task]
```

---

## When NOT to update

- Reading code, exploring, or asking questions doesn't trigger an update.
- A pure refactor with no behavior change is one entry, not many.
- Aborted attempts that didn't get committed: log them in "Failed / Not Working", not "Recent Changes".

---

## Example

```markdown
# Handoff

_Last updated: 2026-05-25_

## Goal
A real-time multiplayer bluff card game. Hybrid physical/digital — phones display the
player's hand and the move log, but the bluffing happens face-to-face.

## Current State
- 2-6 player rooms working over Socket.IO.
- Card deal, claim, and challenge flow complete.
- Reconnect-on-disconnect partially working: rejoining the same room id restores hand
  but loses the in-flight challenge state.

## Files in Flight
- `server/socket/challenge.ts` — fixing the reconnect-during-challenge bug
- `app/(game)/room/[id]/page.tsx` — pulling challenge UI into its own component

## Recent Changes
- 2026-05-25 — Added skeleton loader for the room lobby (replaced spinner)
- 2026-05-24 — Migrated session storage to httpOnly cookies (was localStorage)
- 2026-05-22 — Added rate limiting on /api/rooms/create (5/min per IP)

## Failed / Not Working
- Tried using `localStorage` for room state on reconnect → fails on iOS Safari private mode.
  Switched to in-memory + Socket.IO `recovery` plugin.
- Tried `socket.io-redis` adapter for multi-instance support → overkill for current scale,
  single Coolify container is fine. Revisit if we exceed ~50 concurrent rooms.

## Next Steps
1. Fix reconnect-during-challenge bug in `server/socket/challenge.ts`
2. Add `handoff.md` link to repo README
3. Write integration test for full game round (deal → claim → challenge → resolve)
```

---

## Where it lives

- **Always at the project root**, alongside `CLAUDE.md` and `README.md`.
- **Committed to git.** This is shared state, not personal scratch.
- **Referenced in `CLAUDE.md`** via `@handoff.md` so Claude Code reads it on session start.

---

## Anti-patterns

- ❌ A 200-line `handoff.md` that's never been trimmed
- ❌ Vague entries: "fixed some bugs", "improved performance"
- ❌ Deleting the "Failed / Not Working" section because it feels negative
- ❌ Updating only at the end of a long session (you forget half of what changed)
- ❌ Tracking minute-by-minute progress — this is a state file, not a journal
