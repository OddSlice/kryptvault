# KRYPTVAULT project notes

KRYPTVAULT is an 8-bit roguelite you play in the browser. You pick a hero, hold
off waves of crypt monsters, take an upgrade every level and chase the global
leaderboard.

## How it's built

- **The game** is a single file, `index.html`: a canvas and plain JavaScript,
  no build step. All layout happens in a 480x270 "logical" space.
- **Leaderboard, accounts and cross-device saves** go through the Vercel
  functions in `api/`, which talk to a Neon Postgres database (`DATABASE_URL`).
  The schema is in `db/schema.sql`.
- **Hosting** is Vercel. `main` is live, and every other branch gets its own
  preview URL.
- **Dev tools** stay out of the deploy. `tools/headless-test.js` runs the real
  game in Node and plays through the bosses; `tools/balance-sim.js` is for tuning.
- **Old versions**: `versions/` keeps a zip of each shipped `index.html`.

## Map of `index.html`

Search for these section headers:

| Section | What lives there |
|---|---|
| `CANVAS & RESOLUTION` | Logical 480x270 space, canvas sized to the screen's real pixels (see below) |
| `WEB AUDIO` / `MUSIC` | Synth sound effects and the chiptune tracks |
| `UPGRADE DEFINITIONS`, `VAULT SHOP`, `HERO SKINS`, `ASCENDANCIES` | Game data |
| `GLOBAL LEADERBOARD`, `PLAYER ACCOUNTS` | Calls to `/api/...` |
| `UPDATE` | Game logic per frame |
| `HUD` | In-run overlay: XP bar, life orb, kills and gold, build, ability |
| `UI KIT` | Shared menu look: palette, panels, buttons, icons, key hints |
| `SCREENS` | Every menu, the level-up and ascendancy drafts, pause, game over |

### Why the text is sharp

The canvas matches the screen's real pixel size (capped at 2880x1620) and each
frame starts with `setTransform` scaled up from 480x270. Layout code keeps using
480x270 coordinates, but text and shapes get drawn at full resolution and
nothing is resampled afterwards. Pixel art still uses nearest-neighbour scaling,
and the floor is one cached image, so tiles can't seam.

### How menus work

Each screen's render function calls `uiButton({...})` for every button while it
draws it. Clicks, taps, arrows/WASD and Enter are all checked against the
buttons from the last frame, so a hit-box can't drift away from what's on
screen. Each screen remembers where your cursor was: back out of The Vault and
it's still on The Vault.

To add a button, call `uiButton({ id, x, y, w, h, label, icon, onClick })`
inside that screen's `render…` function. `kind: 'primary'` marks the main
action, and `isDefault: true` picks the button that has focus when the screen
opens.

## What's been built (newest first)

### v1.1: the random freeze
- **Cause:** a bomber's blast could kill the monsters next to it while the game
  was still stepping through its monster list. The list got shorter under the
  loop, the next step read a monster that wasn't there, and the error stopped
  the game loop for good. The picture froze, the music kept playing, and only a
  refresh helped. It needed a bomber (from wave 3) to blow up beside weak
  monsters at the right moment, so it looked random.
  Bomber blasts now go off after the loop, the same way the Bombardier's
  kill blasts already did.
- **Safety net:** the loop books its next frame before doing any work and
  catches errors, so a future bug costs one frame instead of the run. Errors
  show in the browser console as `KRYPTVAULT frame error`. The headless test
  still fails on them.
- **Phones:** a touch the phone cancels (home-bar swipe, back gesture, call
  banner) left the joystick held. The hero kept walking and every later tap
  was ignored, which also looked like a freeze. Cancelled and lost touches now
  let go of the stick.
- **Same-frame events:** the kill that cleared a wave used to throw away the
  level-up it also earned. Dying on that kill, or as a boss fell, replaced the
  game-over screen with a draft for a dead hero, and the run was later counted
  twice.

### v1.1: UI and UX overhaul
- Text is sharp everywhere. The old 6px text was drawn at 480x270 and stretched.
- Every menu shares one look: panels, a gold focus highlight, pixel icons, key
  hints (touch players don't see them) and the dungeon behind it all.
- Title screen: **SKINS** moved off the floating icon into the left menu and
  shows a NEW badge when you can afford one. A player card shows your tag and
  best run and opens the account screen. The leaderboard has medal colours and
  highlights your own row.
- Every menu works from the keyboard: arrows or WASD, Enter to pick, Esc to go back.
- In-run HUD (minimal layout): XP runs across the top with a LVL chip, life sits
  in a small orb with the exact numbers plus a bar under the hero, the build
  stacks down the left edge, kills and gold share a chip in the bottom-left
  corner, and the ability lives in the bottom-right thumb corner. The old sound
  button is gone (the pause menu has the toggles), and the pause button only
  shows for touch players.
- Hero select is a roster: the five portraits on the left, the chosen hero's
  sheet on the right (portrait, stat bars, the two ascendancies it can take at
  wave 10). The sheet always opens on the bars; the (i) button or the I key swaps
  them for exact numbers and adds the description. First click shows a hero,
  second click starts the run.
- The Vault has a row of equipped slots and clearer equip and buy buttons, and
  it tells you when you can't afford something.
- Skins: class tabs with portraits, bigger cards, Q and E switch class.
- Codex is built from the real recipe data. Focus a recipe to see what it does;
  tips rotate along the bottom.
- Settings uses toggle switches and adds **screen shake**, **scanlines** and
  **fullscreen**.
- Pause is a real menu: resume, music, sound and **end run** (asks first).
- Game over has stat tiles plus **PLAY AGAIN** and **MAIN MENU**. The old "press
  enter to restart" actually dropped you on the title screen.
- Level-up and ascendancy cards: pick with 1-3, or arrows and Enter. Long card
  text doesn't overlap any more.
- All game text went through a plain-language pass.
- Bugs fixed: skins tabs registered clicks on the wrong class; two levels from one
  XP burst only gave one upgrade; a tap mid-fight could pick a draft card before
  you saw it (there's a short input lock now); dying while tapping skipped the
  game-over screen; stray clicks on menus threw you back to the title; menu
  critters and the boss flash ran faster on high-refresh monitors; text fell back
  to a serif font if the pixel font didn't load.

### v1.0a and earlier
Cross-device progress sync, accounts with vault keys, 5 classes (2 unlocked with
coins), ascendancies, evolutions, biomes, the Vault Keeper at wave 50 and endless mode.

## Ideas not built yet
Balance pass (Rogue dominates the top of the leaderboard), gamepad support, a
weekly leaderboard next to the all-time one, and a run-history screen.
