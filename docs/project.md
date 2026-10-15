# KRYPTVAULT — project notes

An 8-bit roguelite survival game in the browser: pick a class, survive waves of
crypt monsters, draft upgrades on level-up, and push the global leaderboard.

## How it's built

- **The game** is one file, `index.html` (canvas + plain JavaScript, no build step).
  Everything is drawn on a canvas laid out in a 480x270 "logical" space.
- **Leaderboard, accounts, cross-device saves**: Vercel functions in `api/`
  backed by a Neon Postgres database (`DATABASE_URL`). Schema: `db/schema.sql`.
- **Hosting**: Vercel. Every push to a branch gets a preview URL; `main` is live.
- **Dev tools** (not deployed): `tools/headless-test.js` runs the real game in
  Node and plays through the bosses, `tools/balance-sim.js` for tuning.
- **Version archive**: `versions/` holds a zip of every shipped `index.html`.

## Map of `index.html`

Search for these section headers:

| Section | What lives there |
|---|---|
| `CANVAS & RESOLUTION` | Logical 480x270 space, render scale `RS` (see below) |
| `WEB AUDIO` / `MUSIC` | Synth sound effects and the chiptune tracks |
| `UPGRADE DEFINITIONS`, `VAULT SHOP`, `HERO SKINS`, `ASCENDANCIES` | Game data |
| `GLOBAL LEADERBOARD`, `PLAYER ACCOUNTS` | Calls to `/api/...` |
| `UPDATE` | Game logic per frame |
| `HUD` | In-run overlay (HP, wave, kills, coins, ability, XP) |
| `UI KIT` | Shared menu look: palette, panels, buttons, icons, key hints |
| `SCREENS` | Every menu screen, the level-up / ascendancy drafts, pause, game over |

### Rendering and text sharpness

The canvas backing store is `RS` times 480x270 (`RS` = 1-4, picked from the
window size and pixel density), and every frame starts with `setTransform(RS…)`.
Layout code still works in 480x270 coordinates, but text and shapes are drawn at
the screen's real resolution, so they're sharp. Pixel art stays nearest-neighbour.

### How menus work (UI kit)

Menus are "immediate mode": each screen's render function calls `uiButton({...})`
for every button as it draws it. Clicks, taps, arrow keys/WASD and Enter all
resolve against exactly the buttons drawn last frame, so hit-boxes always match
what's on screen. Focus is remembered per screen (back out of The Vault and the
cursor is still on The Vault).

To add a button to a screen: call `uiButton({ id, x, y, w, h, label, icon, onClick })`
inside that screen's `render…` function. Use `kind: 'primary'` for the main
action and `isDefault: true` for the button focused when the screen opens.

## What's been built (latest first)

### v1.1 — UI/UX overhaul
- Sharp text everywhere (the old 6px text was drawn at 480x270 and smeared).
- New shared look for every menu: panels, focus highlight, pixel icons,
  keycap hints (hidden for touch players), dungeon backdrop behind all menus.
- Title: left-hand menu now includes **SKINS** (moved off the floating icon) with
  a NEW badge when you can afford one, a player card (tag + best run, opens the
  account screen), a cleaner leaderboard (medal colours, your row highlighted).
- Full keyboard control of every menu (arrows/WASD + Enter, Esc = back).
- Class select: detail strip with real stats and a description; SKINS and
  START RUN buttons; cards show your equipped skin.
- The Vault: equipped-slot row, clearer equip / buy buttons, tells you why a
  purchase failed.
- Skins: class tabs with portraits, bigger cards, Q/E to switch class.
- Codex: built from the real recipe data, focus a recipe for details, rotating tips.
- Settings: toggle switches; new **screen shake**, **scanlines** and
  **fullscreen** options; account row.
- Pause is now a real menu: resume, music, sound, **end run** (asks to confirm).
- Game over: stat tiles, **PLAY AGAIN** and **MAIN MENU** buttons (the old
  "press enter to restart" actually went to the title screen).
- Level-up / ascendancy: pick with 1-3 / arrows + Enter, number badges on the
  cards, card text no longer overlaps on long descriptions.
- HUD: HP number under the bar, low-HP pulse, clearer level label.
- Bugs fixed: skins tab clicks hit the wrong class; two levels from one XP burst
  only gave one upgrade; a mid-fight tap could pick a draft card you never saw
  (short input lock added); dying while tapping skipped the game-over screen;
  stray clicks on menus kicked you back to the title; menu critters and the
  boss white-flash ran faster on high-refresh monitors; text fell back to a
  serif font if the pixel font failed to load.

### v1.0a and earlier
Cross-device progress sync, accounts with vault keys, 5 classes (2 coin-unlocked),
ascendancies, evolutions, biomes, the Vault Keeper at wave 50, endless mode.

## Ideas not built yet
See the end-of-session notes in the PR / chat: balance pass, new content ideas.
