# Section-based background music

Each part of the app plays its **own** track. Moving to a new section stops the
old track and starts the new one. The mapping lives in
`client/src/hooks/useAtmosphere.js` → `MUSIC_SECTIONS`.

## Sections → file (current mapping)

| Section    | When it plays                                   | File(s)                                  |
|------------|-------------------------------------------------|------------------------------------------|
| `lobby`    | Landing, host setup, and the in-room lobby      | `BLUFF Tavern.mp3`                        |
| `game`     | Active game at the table                        | `Nordic Hums.mp3` → `Call It Bluff.mp3`  |
| `groups`   | The whole Groups area                           | `Click_Clack_Spin.mp3`                   |
| `gameover` | After a game ends (results / recap screen)      | `Gutter-Candle Dread.mp3`                |

The `game` section has **two** tracks: they play in sequence (Nordic Hums →
Call It Bluff) and the pair loops. Every other section has one track that loops.
To change a track, drop a file here and update its path in `MUSIC_SECTIONS`.

## Looping vs. two tracks per section
- **One track** in a section → it **loops** (replays if it ends while you're
  still there).
- **Two (or more) tracks** in a section → they play **in sequence** and the
  sequence loops (so a single track never just repeats). Example:
  ```js
  lobby: ['/audio/BLUFF Tavern.mp3', '/audio/Nordic Hums.mp3'],
  ```

## Notes
- Plays at ~28% volume and auto-ducks when a sound cue fires. Tune
  `MUSIC_BASE_VOL` in `useAtmosphere.js`.
- Muteable from the settings gear (landing) and the in-game menu.
- Starts on the first tap/click (browser autoplay rules); on iOS the hardware
  silent switch still mutes it (OS-level).
- The revolver spin keeps its synthesized clicks (not an MP3).
