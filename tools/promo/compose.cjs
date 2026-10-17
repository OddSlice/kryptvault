// Frames the game scenes into the promo images: a Vault-brick border with a
// gold trim (like Land of Ascii's frame, in Kryptvault's own palette), the
// gold KRYPTVAULT logo and short hype lines. Reads the scenes.cjs output.
// usage: node compose.cjs <scenes-dir> <outdir> [image-name]
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs');
const path = require('path');
const SC = path.resolve(process.argv[2]), OUT = path.resolve(process.argv[3]);
fs.mkdirSync(OUT, { recursive: true });
// Text needs the real Press Start 2P. It loads from Google Fonts; with no network,
// set KV_FONT_DIR to a folder holding Google's ps2p.css and its .woff2 files.
const FONT = process.env.KV_FONT_DIR ? path.resolve(process.env.KV_FONT_DIR) + '/' : null;
const FONT_CSS = FONT ? fs.readFileSync(FONT + 'ps2p.css', 'utf8').replace(/https:\/\/fonts\.gstatic\.com\/[^)]*\/([^/)]+\.woff2)/g, (m, f) => 'file://' + FONT + f)
  : "@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');";
const img = f => 'file://' + path.join(SC, f);
const wideAt = (f, x, y) => `background-image:url(${img(f)}); background-position:${-x * 4}px ${-y * 4}px;`;

const CSS = (W, H, I) => `
${FONT_CSS}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #0b0812; }
body { font-family: 'Press Start 2P', monospace; color: #fff; -webkit-font-smoothing: none; }
#frame { position: absolute; left: 0; top: 0; }
#stage { position: absolute; left: ${I}px; top: ${I}px; width: ${W - 2 * I}px; height: ${H - 2 * I}px; overflow: hidden; background: #000; }
.scene { position: absolute; inset: 0; background-repeat: no-repeat; background-position: center; image-rendering: pixelated; }
.layer { position: absolute; inset: 0; }
.abs { position: absolute; }
/* the logo: gold face in three hard bands over a red-then-black pixel extrusion */
.logo { position: relative; display: inline-block; white-space: nowrap; line-height: 1; color: #FFD700; }
.logo::after { content: attr(data-t); position: absolute; left: 0; top: 0;
  background: linear-gradient(180deg, #fff6b0 0, #fff6b0 22%, #FFD700 22%, #FFD700 64%, #f0a800 64%, #f0a800 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: none; }
.t { white-space: nowrap; line-height: 1; }
.sh { text-shadow: 0.1em 0.1em 0 #000; }
.gold { color: #FFD700; }
.red { color: #ff3b3b; }
.muted { color: #d8d0e8; }
.badge { background: #c0141c; color: #fff; border: 0.2em solid #FFD700; outline: 0.14em solid #000; box-shadow: 0.36em 0.36em 0 #000; padding: 0.55em 0.7em 0.45em; }
.dot { display: inline-block; width: 0.5em; height: 0.5em; background: #FFD700; box-shadow: 0.12em 0.12em 0 #000; vertical-align: 0.15em; margin: 0 0.9em; }
`;
// stacked 3D shadow for a logo of size px
const logoShadow = px => {
  const d = Math.max(2, Math.round(px / 40)), n = Math.max(3, Math.round(px / 14 / d)), out = [];
  for (let k = 1; k <= n; k++) out.push(`${k * d}px ${k * d}px 0 #a00000`);
  out.push(`${(n + 1) * d}px ${(n + 1) * d}px 0 #000`, `${(n + 2) * d}px ${(n + 2) * d}px 0 #000`, `0 0 ${px * 0.45}px rgba(255,170,0,0.35)`);
  return out.join(', ');
};
const logo = (px, extra) => `<span class="logo" data-t="KRYPTVAULT" style="font-size:${px}px; text-shadow:${logoShadow(px)}; ${extra || ''}">KRYPTVAULT</span>`;

// Vault bricks (the game's Vault wall colours) and a riveted gold trim
const FRAME = (B, T) => `
(function () {
  var c = document.getElementById('frame'), x = c.getContext('2d'), W = c.width, H = c.height;
  var seed = 11; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  x.fillStyle = '#120c1a'; x.fillRect(0, 0, W, H);
  var bh = Math.round(${B} / 2), bw = bh * 2;
  for (var row = 0; row * bh < H; row++) {
    var off = row % 2 ? -bw / 2 : 0;
    for (var col = 0; col * bw + off < W; col++) {
      var bx = col * bw + off, by = row * bh, r = rnd();
      x.fillStyle = r < 0.45 ? '#2a2035' : (r < 0.9 ? '#332744' : '#3b2e50');
      x.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
      x.fillStyle = 'rgba(255,255,255,0.07)'; x.fillRect(bx + 2, by + 2, bw - 4, Math.max(2, bh / 8));
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(bx + 2, by + bh - 2 - Math.max(2, bh / 8), bw - 4, Math.max(2, bh / 8));
      if (rnd() < 0.35) { x.fillStyle = 'rgba(201,162,39,0.45)'; var s = Math.max(2, bh / 8); x.fillRect(Math.round(bx + 6 + rnd() * (bw - 14)), Math.round(by + 5 + rnd() * (bh - 12)), s, s); }
    }
  }
  var B = ${B}, T = ${T};
  x.fillStyle = '#000'; x.fillRect(B - 3, B - 3, W - 2 * B + 6, H - 2 * B + 6);
  x.fillStyle = '#6b520e'; x.fillRect(B, B, W - 2 * B, H - 2 * B);
  x.fillStyle = '#c9a227'; x.fillRect(B + 2, B + 2, W - 2 * B - 4, H - 2 * B - 4);
  x.fillStyle = '#ffe27a'; x.fillRect(B + 2, B + 2, W - 2 * B - 4, 2); x.fillRect(B + 2, B + 2, 2, H - 2 * B - 4);
  // rivets along the trim
  var rs = Math.max(4, Math.round(T * 0.6)), step = Math.round(W / 24);
  function rivet(px, py) { x.fillStyle = '#4a3808'; x.fillRect(px - rs / 2 + 1, py - rs / 2 + 1, rs, rs); x.fillStyle = '#fff1a8'; x.fillRect(px - rs / 2, py - rs / 2, rs - 1, rs - 1); }
  for (var px = B + step / 2; px < W - B; px += step) { rivet(px, B + T / 2); rivet(px, H - B - T / 2); }
  for (var py = B + step / 2; py < H - B; py += step) { rivet(B + T / 2, py); rivet(W - B - T / 2, py); }
})();`;

// a seamless tile: brick colours and specks repeat every 4 columns, so the
// half bricks on the left and right edges match up
const TILE = (W, H) => `<!doctype html><html><head><meta charset="utf-8"><style>html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }</style></head>
<body><canvas id="frame" width="${W}" height="${H}"></canvas><script>
(function () {
  var x = document.getElementById('frame').getContext('2d'), bw = 64, bh = 32, cols = ${W} / bw, rows = ${H} / bh;
  function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  x.fillStyle = '#0e0914'; x.fillRect(0, 0, ${W}, ${H});
  for (var row = 0; row < rows; row++) {
    var off = row % 2 ? -bw / 2 : 0;
    for (var col = 0; col <= cols; col++) {
      var c = col % cols, bx = col * bw + off, by = row * bh, r = hash(row, c);
      x.fillStyle = r < 0.45 ? '#1f1828' : (r < 0.9 ? '#261d33' : '#2d233c');
      x.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
      x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(bx + 2, by + 2, bw - 4, 4);
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(bx + 2, by + bh - 6, bw - 4, 4);
      if (hash(c, row + 99) < 0.35) { x.fillStyle = 'rgba(201,162,39,0.35)'; x.fillRect(Math.round(bx + 8 + hash(row, c + 7) * (bw - 20)), Math.round(by + 8 + hash(c + 3, row) * (bh - 18)), 4, 4); }
    }
  }
})();
</script></body></html>`;

const page = (W, H, B, T, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS(W, H, B + T)}</style></head>
<body><canvas id="frame" width="${W}" height="${H}"></canvas><div id="stage">${body}</div>${B ? `<script>${FRAME(B, T)}</script>` : ''}</body></html>`;

const vignette = (a) => `<div class="layer" style="background: radial-gradient(ellipse 75% 70% at 50% 45%, rgba(0,0,0,0) 55%, rgba(8,4,18,${a}) 100%);"></div>`;

const IMAGES = [
  // 1. key art
  { name: 'kryptvault-keyart-1920x1080', W: 1920, H: 1080, B: 40, T: 8, body: `
    <div class="scene" style="background-image:url(${img('scene-keyart.png')})"></div>
    ${vignette(0.7)}
    <div class="layer" style="background: linear-gradient(180deg, rgba(8,4,16,0) 52%, rgba(8,4,16,0.82) 72%, rgba(8,4,16,0.96) 100%);"></div>
    <div class="abs badge t" style="top:34px; right:34px; font-size:30px;">UPDATE 1.2.1 <span class="gold">LIVE!</span></div>
    <div class="abs" style="left:0; right:0; bottom:176px; text-align:center;">${logo(150)}</div>
    <div class="abs t sh" style="left:0; right:0; bottom:104px; text-align:center; font-size:40px;">EVERY POWER HAS A PRICE</div>
    <div class="abs t sh muted" style="left:0; right:0; bottom:44px; text-align:center; font-size:22px;">PLAY FREE IN YOUR BROWSER<span class="dot"></span><span class="gold">ODDSLICE.ITCH.IO</span></div>` },

  // 2. what's new in 1.2.1
  { name: 'kryptvault-update-1.2.1-1920x1080', W: 1920, H: 1080, B: 40, T: 8, body: `
    <div class="scene" style="background-image:url(${img('scene-warden.png')})"></div>
    ${vignette(0.6)}
    <div class="layer" style="background: linear-gradient(90deg, rgba(8,4,16,0.97) 0, rgba(8,4,16,0.95) 48%, rgba(8,4,16,0.6) 56%, rgba(8,4,16,0) 64%);"></div>
    <div class="abs" style="left:80px; top:70px;">${logo(52)}</div>
    <div class="abs t sh" style="left:80px; top:170px; font-size:76px;">UPDATE 1.2.1</div>
    <div class="abs t sh gold" style="left:80px; top:262px; font-size:76px;">IS LIVE!</div>
    ${[['NO MORE FREEZES', 'THE RANDOM FREEZE IS FIXED FOR GOOD'],
       ['BUILT FOR PHONES', 'TAPS LAND WHERE YOU AIM. TWO THUMBS WORK.'],
       ['A WHOLE NEW LOOK', 'SHARP TEXT, NEW MENUS, A HERO ROSTER'],
       ['A FAIR LEADERBOARD', 'EVERY HERO COUNTS. YOUR BEST RUN SHOWS.']].map((f, i) => `
      <div class="abs" style="left:80px; top:${404 + i * 112}px;">
        <div class="abs" style="left:0; top:2px; width:30px; height:30px; background:#FFD700; box-shadow:5px 5px 0 #a00000, 8px 8px 0 #000;"></div>
        <div class="abs t sh gold" style="left:58px; top:0; font-size:32px;">${f[0]}</div>
        <div class="abs t sh muted" style="left:58px; top:50px; font-size:18px;">${f[1]}</div>
      </div>`).join('')}
    <div class="abs t sh" style="left:80px; bottom:52px; font-size:24px;">PLAY FREE AT <span class="gold">ODDSLICE.ITCH.IO</span></div>` },

  // 3. the Vault Keeper
  { name: 'kryptvault-boss-1920x1080', W: 1920, H: 1080, B: 40, T: 8, body: `
    <div class="scene" style="background-image:url(${img('scene-boss.png')})"></div>
    ${vignette(0.7)}
    <div class="layer" style="background: radial-gradient(ellipse 62% 55% at 0% 0%, rgba(8,4,16,0.96) 0, rgba(8,4,16,0.9) 55%, rgba(8,4,16,0) 100%);"></div>
    <div class="layer" style="background: linear-gradient(0deg, rgba(8,4,16,0.9) 0, rgba(8,4,16,0) 26%);"></div>
    <div class="abs t sh red" style="left:80px; top:78px; font-size:30px;">WAVE 50</div>
    <div class="abs t sh" style="left:80px; top:140px; font-size:64px;">FACE THE</div>
    <div class="abs" style="left:80px; top:232px;">${logo(88).replace(/KRYPTVAULT/g, 'VAULT KEEPER')}</div>
    <div class="abs t sh muted" style="left:80px; top:372px; font-size:22px;">4 BOSSES STAND BETWEEN YOU AND THE VAULT</div>
    <div class="abs" style="right:64px; bottom:96px;">${logo(60)}</div>
    <div class="abs t sh muted" style="right:64px; bottom:44px; font-size:20px;">PLAY FREE IN YOUR BROWSER</div>` },

  // 4. the endgame horde
  { name: 'kryptvault-horde-1920x1080', W: 1920, H: 1080, B: 40, T: 8, body: `
    <div class="scene" style="background-image:url(${img('scene-horde.png')})"></div>
    ${vignette(0.65)}
    <div class="layer" style="background: linear-gradient(180deg, rgba(8,4,16,0.95) 0, rgba(8,4,16,0.85) 20%, rgba(8,4,16,0) 34%, rgba(8,4,16,0) 70%, rgba(8,4,16,0.9) 88%, rgba(8,4,16,0.97) 100%);"></div>
    <div class="abs" style="left:0; right:0; top:62px; text-align:center;">${logo(88).replace(/KRYPTVAULT/g, 'HOW FAR CAN YOU GO?')}</div>
    <div class="abs t sh muted" style="left:0; right:0; top:200px; text-align:center; font-size:24px;">ENDLESS WAVES AFTER 50. ONE GLOBAL LEADERBOARD.</div>
    <div class="abs" style="left:0; right:0; bottom:98px; text-align:center;">${logo(72)}</div>
    <div class="abs t sh muted" style="left:0; right:0; bottom:40px; text-align:center; font-size:22px;">PLAY FREE IN YOUR BROWSER<span class="dot"></span><span class="gold">ODDSLICE.ITCH.IO</span></div>` },

  // 5. the roster
  { name: 'kryptvault-heroes-1920x1080', W: 1920, H: 1080, B: 40, T: 8, body: `
    <div class="scene" style="background-image:url(${img('scene-frost.png')}); filter: blur(5px) brightness(0.32) saturate(0.8); transform: scale(1.03);"></div>
    ${vignette(0.8)}
    <div class="abs" style="left:0; right:0; top:64px; text-align:center;">${logo(92).replace(/KRYPTVAULT/g, '5 HEROES')}</div>
    <div class="abs t sh muted" style="left:0; right:0; top:192px; text-align:center; font-size:24px;">10 ASCENDANCIES<span class="dot"></span>23 UPGRADES<span class="dot"></span>5 EVOLUTIONS</div>
    ${[['warrior', 'WARRIOR', '#cc3333', 'JUGGERNAUT', 'BERSERKER'], ['rogue', 'ROGUE', '#33cc66', 'PHANTOM', 'ASSASSIN'],
       ['mage', 'MAGE', '#8a5cf0', 'FROST MAGE', 'LIGHT MAGE'], ['ranger', 'RANGER', '#c99a3a', 'SNIPER', 'TRAPPER'],
       ['bombardier', 'BOMBARDIER', '#ff8c1a', 'DEMOLITIONIST', 'CHAIN REACTOR']].map((h, i) => `
      <div class="abs" style="left:${64 + i * 344}px; top:290px; width:320px; height:520px; background:rgba(18,10,30,0.92); border:5px solid ${h[2]}; outline:4px solid #000; box-shadow:10px 10px 0 #000;">
        <div class="abs" style="left:27px; top:20px; width:256px; height:256px; background:rgba(255,255,255,0.04); border:3px solid rgba(255,255,255,0.08);"></div>
        <img class="abs" src="${img('hero-' + h[0] + '.png')}" style="left:27px; top:12px; width:256px; height:256px; image-rendering:pixelated;">
        <div class="abs t sh" style="left:0; right:0; top:306px; text-align:center; font-size:28px; color:${h[2]};">${h[1]}</div>
        <div class="abs" style="left:40px; right:40px; top:356px; height:4px; background:rgba(255,255,255,0.12);"></div>
        <div class="abs t sh muted" style="left:0; right:0; top:390px; text-align:center; font-size:16px;">${h[3]}</div>
        <div class="abs t sh muted" style="left:0; right:0; top:428px; text-align:center; font-size:16px;">${h[4]}</div>
      </div>`).join('')}
    <div class="abs t sh" style="left:0; right:0; bottom:50px; text-align:center; font-size:26px;">${logo(26)}<span class="dot"></span>PLAY FREE AT <span class="gold">ODDSLICE.ITCH.IO</span></div>` },

  // 6. link preview (og:image), drawn from a 1200x675 render so pixels stay square
  { name: 'og', W: 1200, H: 630, B: 24, T: 5, body: `
    <div class="scene" style="background-image:url(${img('og/scene-keyart.png')})"></div>
    ${vignette(0.7)}
    <div class="layer" style="background: linear-gradient(180deg, rgba(8,4,16,0) 50%, rgba(8,4,16,0.82) 70%, rgba(8,4,16,0.96) 100%);"></div>
    <div class="abs badge t" style="top:20px; right:20px; font-size:18px;">UPDATE 1.2.1 <span class="gold">LIVE!</span></div>
    <div class="abs" style="left:0; right:0; bottom:100px; text-align:center;">${logo(88)}</div>
    <div class="abs t sh" style="left:0; right:0; bottom:54px; text-align:center; font-size:24px;">EVERY POWER HAS A PRICE</div>
    <div class="abs t sh muted" style="left:0; right:0; bottom:22px; text-align:center; font-size:14px;">AN 8-BIT ROGUELITE YOU PLAY IN YOUR BROWSER</div>` },

  // itch.io page images. They stay up after this update, so no version badge.
  // The "-wide" scenes show the whole arena at 4px per game pixel; wideAt()
  // puts game point (x, y) at the stage's top-left corner.
  // 7. itch cover (what people see when browsing itch)
  { name: 'itch-cover-630x500', W: 630, H: 500, B: 12, T: 4, body: `
    <div class="scene" style="${wideAt('scene-keyart-wide.png', 165, 20)}"></div>
    ${vignette(0.7)}
    <div class="layer" style="background: linear-gradient(180deg, rgba(8,4,16,0) 48%, rgba(8,4,16,0.85) 72%, rgba(8,4,16,0.97) 100%);"></div>
    <div class="abs" style="left:0; right:0; bottom:58px; text-align:center;">${logo(52)}</div>
    <div class="abs t sh" style="left:0; right:0; bottom:22px; text-align:center; font-size:18px;">EVERY POWER HAS A PRICE</div>` },

  // 8. itch banner (replaces the game's title at the top of its page; 960 is the page width)
  { name: 'itch-banner-960x300', W: 960, H: 300, B: 14, T: 4, body: `
    <div class="scene" style="${wideAt('scene-horde-wide.png', 42, 103)}"></div>
    ${vignette(0.8)}
    <div class="layer" style="background: linear-gradient(90deg, rgba(8,4,16,0.94) 0, rgba(8,4,16,0.88) 50%, rgba(8,4,16,0.25) 70%, rgba(8,4,16,0.1) 100%);"></div>
    <div class="abs" style="left:40px; top:78px;">${logo(56)}</div>
    <div class="abs t sh" style="left:42px; top:168px; font-size:18px;">EVERY POWER HAS A PRICE</div>` },

  // 9. itch wide cover, 21:9 (used when itch features a game on its home page)
  { name: 'itch-wide-cover-1920x823', W: 1920, H: 823, B: 32, T: 7, body: `
    <div class="scene" style="${wideAt('scene-keyart-wide.png', 10, 10)}"></div>
    ${vignette(0.7)}
    <div class="layer" style="background: linear-gradient(180deg, rgba(8,4,16,0) 50%, rgba(8,4,16,0.85) 74%, rgba(8,4,16,0.97) 100%);"></div>
    <div class="abs" style="left:0; right:0; bottom:120px; text-align:center;">${logo(120)}</div>
    <div class="abs t sh" style="left:0; right:0; bottom:52px; text-align:center; font-size:34px;">EVERY POWER HAS A PRICE</div>` },

  // 10. 728x90 web banner (the standard "leaderboard" ad): logo, the horde at
  // exactly half the wide scene's size (2px per game pixel), and a play button
  { name: 'banner-728x90', W: 728, H: 90, B: 0, T: 0, body: `
    <div class="scene" style="background-image:url(${img('scene-keyart-wide.png')}); background-size:960px 540px; background-position:${-15 * 2}px ${-70 * 2}px;"></div>
    <div class="layer" style="background: linear-gradient(90deg, rgba(8,4,16,0.94) 0, rgba(8,4,16,0.86) 46%, rgba(8,4,16,0.15) 58%, rgba(8,4,16,0.15) 70%, rgba(8,4,16,0.9) 80%, rgba(8,4,16,0.96) 100%);"></div>
    <div class="layer" style="box-shadow: inset 0 0 0 1px #000, inset 0 0 0 3px #c9a227, inset 0 0 0 4px #000;"></div>
    <div class="abs" style="left:16px; top:17px;">${logo(32)}</div>
    <div class="abs t sh" style="left:18px; top:61px; font-size:8px; color:#e8d9a8;">EVERY POWER HAS A PRICE</div>
    <div class="abs t" style="right:16px; top:15px; font-size:16px; color:#fff; background:#c0141c; border:3px solid #FFD700; outline:2px solid #000; box-shadow:4px 4px 0 #000; padding:9px 12px 7px; text-shadow:2px 2px 0 #000;">PLAY FREE</div>
    <div class="abs t sh gold" style="right:14px; top:66px; font-size:8px;">ODDSLICE.ITCH.IO</div>` },

  // 11. itch page background: Vault bricks that tile seamlessly
  { name: 'itch-background-tile-256', W: 256, H: 256, tile: true },
];

(async () => {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const only = process.argv[4];
  for (const im of IMAGES) {
    if (only && im.name !== only) continue;
    const page2 = await (await browser.newContext({ viewport: { width: im.W, height: im.H } })).newPage();
    const file = path.join(OUT, im.name + '.html');
    fs.writeFileSync(file, im.tile ? TILE(im.W, im.H) : page(im.W, im.H, im.B, im.T, im.body));
    await page2.goto('file://' + file);
    await page2.evaluate(() => document.fonts.ready);
    await page2.waitForFunction(() => document.fonts.check('20px "Press Start 2P"') && Array.from(document.images).every(i => i.complete));
    await page2.waitForTimeout(150);
    await page2.screenshot({ path: path.join(OUT, im.name + '.png') });
    await page2.context().close();
    console.log('image', im.name);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
