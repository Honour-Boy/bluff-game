# Background music — multi-track playlists w/ crossfade

Each view context plays its **own playlist** with its **own mode**. A dual-deck
crossfade engine swaps tracks smoothly. The mapping + modes live in
`client/src/hooks/useAtmosphere.js` → `MUSIC_SECTIONS` / `SECTION_MODE`.

## Sections → playlist + mode

| Section    | When it plays                              | Mode          | File(s) |
|------------|--------------------------------------------|---------------|---------|
| `lobby`    | Landing, host setup, in-room lobby         | `shuffle`     | `BLUFF Tavern.mp3`, `Click_Clack_Spin.mp3` |
| `game`     | Active game at the table                   | `progressive` | `Nordic Hums.mp3` → `Bluff Anthem (instrumental).mp3` → `Call It Bluff.mp3` |
| `groups`   | The whole Groups (Guild Registry) area     | `loop`        | `Bluff Anthem.mp3` |
| `gameover` | After a game ends (results / recap screen) | `once`        | `Gutter-Candle Dread.mp3` |

### Modes
- **`shuffle`** (lobby) — starts on a **random** track in the pool and loops; when
  a track ends it **crossfades** to the alternative.
- **`progressive`** (game) — starts at **stage 0** (`Nordic Hums`, quiet tension)
  and **crossfades up** (3 s) to higher-intensity tracks as the stakes rise. The
  stage is fed from live game state (player attrition) by `page.js` via
  `setGameStage()` / `gameMusicStage()`: early game = calm, the field thinning =
  building, the final two players = peak. Stage only escalates within a game.
- **`loop`** (groups) — a single track on a clean continuous loop.
- **`once`** (gameover) — a single atmospheric track, gently faded in over 2 s.

## Volume
Per the design, **songs play at 8%** of max and **instrumentals at 12%** (the
instrumentals sit a touch louder so the ambience reads under the table cues).
Classification + per-track levels live in the `TRACKS` map in `useAtmosphere.js`.

## Pre-fetching
All tracks are **pre-fetched on boot** (detached `<audio preload="auto">`
elements warm the HTTP cache) so crossfades never stream-stall.

## Group rooms
A group room's **lobby** stays on the `groups` track — it does **not** switch to
the normal `lobby` track. It only moves to `game` once the match starts, then
`gameover` at the end.

## Notes
- Muteable from the settings gear (landing) and the in-game menu; state is shared
  so they never drift apart.
- Starts on the first tap/click (browser autoplay rules); on iOS the hardware
  silent switch still mutes it (OS-level).
- The revolver spin keeps its synthesized Web Audio clicks (not an MP3); all
  one-shot cues are unaffected by this music layer.
