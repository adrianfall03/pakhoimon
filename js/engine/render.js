// Canvas renderer — GBA-style pixel art, all procedurally drawn (no image assets).
// Tiles are baked once to offscreen canvases (with positional variants) and blitted;
// characters are baked per direction/frame/palette; monsters are drawn per dex seed
// with outline + cel-shading. Public API kept stable for world/battle/ui/title.
(function (MQ) {
  'use strict';
  const util = MQ.util;
  const TS = 32, VW = 17, VH = 13;
  const Render = MQ.Render = { TS, VW, VH };

  let canvas, ctx;
  Render.init = function (cv) {
    canvas = cv; ctx = cv.getContext('2d');
    cv.width = VW * TS; cv.height = VH * TS;
    ctx.imageSmoothingEnabled = false;
    ctx.textBaseline = 'top';
  };
  Render.ctx = () => ctx;
  Render.canvas = () => canvas;

  // ---------- color helpers ----------
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function rgbToHex(r, g, b) { return '#' + ((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1); }
  function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }
  function shade(hex, amt) { const [r, g, b] = hexToRgb(hex); return rgbToHex(r + amt, g + amt, b + amt); }
  function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
  Render.lighten = (hex, amt) => `rgb(${hexToRgb(shade(hex, amt)).join(',')})`;

  // seeded rng for deterministic texture
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function vhash(x, y) { return ((x * 73856093) ^ (y * 19349663)) >>> 0; }

  function newTile() { const c = document.createElement('canvas'); c.width = TS; c.height = TS; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return { c, g }; }

  // ---------- tile palettes ----------
  const C = {
    grass: '#73b84a', grassD: '#579433', grassL: '#97d265', grassDD: '#3f7a28',
    sand: '#dcc38a', sandD: '#c6a868', sandL: '#ecdba6',
    treeMid: '#3f7e35', treeDk: '#27551f', treeHi: '#69ab3f',
    water: '#3f8fd6', waterD: '#2f6fb0', waterL: '#7fc2ee',
    roof: '#c75a3e', roofD: '#a3402b', roofHi: '#e28a64',
    wall: '#e6dcc6', wallD: '#c3b594', wallWin: '#8fc6e8',
    wood: '#9a6a36', woodD: '#6f4a24', woodHi: '#bb8a4e',
    rock: '#3a3442', rockD: '#272231', rockHi: '#5a5366',
    cfloor: '#615a6b', cfloorD: '#4b4555',
    floor: '#caa066', floorD: '#a8814a',
    outline: '#23202b',
  };

  // ---------- tile bakers ----------
  function bGrass(g, seed) {
    g.fillStyle = C.grass; g.fillRect(0, 0, TS, TS);
    const r = rng(seed);
    for (let i = 0; i < 5; i++) { g.fillStyle = C.grassD; const x = (r() * 28) | 0, y = (r() * 28) | 0; g.fillRect(x, y + 2, 2, 2); g.fillRect(x + 1, y, 1, 2); }
    for (let i = 0; i < 4; i++) { g.fillStyle = C.grassL; g.fillRect((r() * 30) | 0, (r() * 30) | 0, 2, 1); }
    for (let i = 0; i < 2; i++) { g.fillStyle = C.grassDD; const x = (r() * 26) | 0, y = (r() * 24) | 0; g.fillRect(x, y + 3, 1, 3); g.fillRect(x + 2, y + 2, 1, 4); g.fillRect(x + 4, y + 3, 1, 3); }
  }
  function bTall(g, seed) {
    g.fillStyle = C.grassD; g.fillRect(0, 0, TS, TS);
    const r = rng(seed);
    for (let cy = 2; cy < 30; cy += 8) for (let cx = 2; cx < 30; cx += 8) {
      const jx = (r() * 3) | 0, jy = (r() * 2) | 0;
      g.fillStyle = C.grass; g.fillRect(cx + jx, cy + jy + 2, 5, 4);
      g.fillStyle = C.grassL; g.fillRect(cx + jx + 1, cy + jy, 1, 4); g.fillRect(cx + jx + 3, cy + jy + 1, 1, 4);
      g.fillStyle = C.grassDD; g.fillRect(cx + jx, cy + jy + 6, 5, 1);
    }
    g.fillStyle = C.grassDD; g.fillRect(0, TS - 3, TS, 3);
  }
  function bTree(g, seed) {
    bGrass(g, seed ^ 0x9e3779b1);
    const r = rng(seed);
    // trunk shadow
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(11, 26, 10, 4);
    // canopy outline
    g.fillStyle = C.treeDk;
    circle(g, 16, 15, 15);
    // mid
    g.fillStyle = C.treeMid; circle(g, 16, 14, 13);
    // texture dabs
    for (let i = 0; i < 10; i++) { g.fillStyle = r() < 0.5 ? C.treeHi : C.treeDk; const a = r() * 6.28, rr = r() * 10; g.fillRect((16 + Math.cos(a) * rr) | 0, (13 + Math.sin(a) * rr) | 0, 3, 3); }
    // top highlight
    g.fillStyle = C.treeHi; circle(g, 12, 9, 4);
  }
  function bSand(g, seed) {
    g.fillStyle = C.sand; g.fillRect(0, 0, TS, TS);
    const r = rng(seed);
    for (let i = 0; i < 6; i++) { g.fillStyle = C.sandD; g.fillRect((r() * 30) | 0, (r() * 30) | 0, 2, 1); }
    for (let i = 0; i < 4; i++) { g.fillStyle = C.sandL; g.fillRect((r() * 30) | 0, (r() * 30) | 0, 2, 1); }
  }
  function bPath(g, seed) { bSand(g, seed); g.fillStyle = C.sandL; g.fillRect(0, 0, TS, 1); g.fillStyle = C.sandD; g.fillRect(0, TS - 1, TS, 1); }
  function bFlower(g, seed) {
    bGrass(g, seed);
    const r = rng(seed); const cols = ['#ec5a5a', '#f3d23b', '#ec8fe6', '#fff'];
    for (let i = 0; i < 3; i++) {
      const x = 4 + (r() * 22) | 0, y = 6 + (r() * 18) | 0, col = cols[(r() * 3) | 0];
      g.fillStyle = col; g.fillRect(x, y - 2, 2, 2); g.fillRect(x - 2, y, 2, 2); g.fillRect(x + 2, y, 2, 2); g.fillRect(x, y + 2, 2, 2);
      g.fillStyle = '#ffe'; g.fillRect(x, y, 2, 2);
    }
  }
  function bRoof(g) {
    g.fillStyle = C.roof; g.fillRect(0, 0, TS, TS);
    for (let y = 2; y < TS; y += 8) { g.fillStyle = C.roofD; g.fillRect(0, y + 6, TS, 2); for (let x = (y % 16 ? 0 : 4); x < TS; x += 8) { g.fillStyle = C.roofD; g.fillRect(x, y, 1, 6); } }
    g.fillStyle = C.roofHi; g.fillRect(0, 0, TS, 2);
  }
  function bWall(g, withWindow) {
    g.fillStyle = C.wall; g.fillRect(0, 0, TS, TS);
    g.fillStyle = C.wallD;
    for (let y = 6; y < TS; y += 8) g.fillRect(0, y, TS, 1);
    for (let y = 0; y < TS; y += 8) for (let x = (y % 16 ? 0 : 8); x < TS; x += 16) g.fillRect(x, y, 1, 8);
    if (withWindow) { g.fillStyle = C.outline; g.fillRect(8, 8, 16, 14); g.fillStyle = C.wallWin; g.fillRect(9, 9, 14, 12); g.fillStyle = '#cfeaff'; g.fillRect(10, 10, 5, 5); g.fillStyle = C.wallD; g.fillRect(15, 9, 1, 12); g.fillRect(9, 15, 14, 1); }
  }
  function bDoor(g) {
    g.fillStyle = C.wallD; g.fillRect(0, 0, TS, TS);
    g.fillStyle = C.outline; g.fillRect(6, 4, 20, 28);
    g.fillStyle = C.wood; g.fillRect(7, 5, 18, 27);
    g.fillStyle = C.woodD; g.fillRect(15, 5, 1, 27); g.fillRect(7, 18, 18, 1);
    g.fillStyle = C.woodHi; g.fillRect(8, 6, 6, 10); g.fillRect(17, 6, 6, 10);
    g.fillStyle = '#f5d24a'; g.fillRect(12, 20, 2, 2);
  }
  function bSign(g, seed) {
    bGrass(g, seed);
    g.fillStyle = C.woodD; g.fillRect(14, 16, 4, 14);
    g.fillStyle = C.outline; g.fillRect(4, 4, 24, 16);
    g.fillStyle = C.wood; g.fillRect(5, 5, 22, 14);
    g.fillStyle = C.woodHi; g.fillRect(5, 5, 22, 2);
    g.fillStyle = C.woodD; for (let i = 0; i < 3; i++) g.fillRect(8, 8 + i * 4, 16, 1);
  }
  function bCaveWall(g, seed) {
    g.fillStyle = C.rock; g.fillRect(0, 0, TS, TS);
    const r = rng(seed);
    g.fillStyle = C.rockD; for (let i = 0; i < 5; i++) g.fillRect((r() * 28) | 0, (r() * 28) | 0, 4, 3);
    g.fillStyle = C.rockHi; for (let i = 0; i < 4; i++) g.fillRect((r() * 28) | 0, (r() * 28) | 0, 3, 1);
    g.fillStyle = C.rockHi; g.fillRect(0, 0, TS, 1); g.fillStyle = '#16131c'; g.fillRect(0, TS - 2, TS, 2);
  }
  function bCaveFloor(g, seed) {
    g.fillStyle = C.cfloor; g.fillRect(0, 0, TS, TS);
    const r = rng(seed); g.fillStyle = C.cfloorD; for (let i = 0; i < 6; i++) g.fillRect((r() * 30) | 0, (r() * 30) | 0, 2, 2);
  }
  function bFloor(g) {
    g.fillStyle = C.floor; g.fillRect(0, 0, TS, TS);
    g.fillStyle = C.floorD; for (let y = 0; y < TS; y += 8) g.fillRect(0, y, TS, 1);
    g.fillStyle = C.woodHi; for (let y = 1; y < TS; y += 8) g.fillRect(0, y, TS, 1);
  }
  function bMat(g) { bFloor(g); g.fillStyle = C.roofD; g.fillRect(6, 8, 20, 18); g.fillStyle = C.roof; g.fillRect(8, 10, 16, 14); }
  function bCounter(g) { bFloor(g); g.fillStyle = C.outline; g.fillRect(0, 4, TS, 18); g.fillStyle = C.wood; g.fillRect(0, 5, TS, 16); g.fillStyle = C.woodHi; g.fillRect(0, 5, TS, 3); }
  function bFence(g, seed) { bGrass(g, seed); g.fillStyle = C.woodD; g.fillRect(0, 12, TS, 4); g.fillStyle = C.wood; g.fillRect(0, 13, TS, 2); g.fillStyle = C.woodD; g.fillRect(6, 6, 4, 20); g.fillRect(22, 6, 4, 20); g.fillStyle = C.woodHi; g.fillRect(6, 6, 1, 20); g.fillRect(22, 6, 1, 20); }
  function bLedge(g, seed) { bGrass(g, seed); g.fillStyle = '#caa15a'; g.fillRect(0, TS - 9, TS, 9); g.fillStyle = '#a8824a'; g.fillRect(0, TS - 9, TS, 2); g.fillStyle = C.outline; g.fillRect(0, TS - 2, TS, 2); for (let x = 4; x < TS; x += 8) { g.fillStyle = '#8a6a38'; g.fillRect(x, TS - 7, 1, 5); } }
  function bPC(g) { bFloor(g); g.fillStyle = C.outline; g.fillRect(6, 4, 20, 22); g.fillStyle = '#2a2a3a'; g.fillRect(7, 5, 18, 20); g.fillStyle = '#4ad06a'; g.fillRect(10, 8, 12, 9); g.fillStyle = '#8fffa8'; g.fillRect(11, 9, 4, 3); g.fillStyle = '#555'; g.fillRect(10, 19, 12, 3); }
  function bHeal(g) { bFloor(g); g.fillStyle = C.outline; g.fillRect(6, 4, 20, 22); g.fillStyle = '#e8e8ee'; g.fillRect(7, 5, 18, 20); g.fillStyle = '#e8503a'; g.fillRect(14, 8, 4, 12); g.fillRect(10, 12, 12, 4); g.fillStyle = '#bcd'; g.fillRect(8, 22, 16, 2); }

  function circle(g, cx, cy, r) { for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y)); g.fillRect(cx - w, cy + y, w * 2, 1); } }

  // ---------- tile cache ----------
  const TILE = MQ.tileEnum || {};
  const tileCache = new Map();
  const VARIANTS = 4;
  function getTile(type, variant) {
    const key = type + ':' + variant;
    if (tileCache.has(key)) return tileCache.get(key);
    const { c, g } = newTile();
    const seed = (typeof type === 'number' ? type : 0) * 999 + variant * 7331 + 1;
    switch (type) {
      case TILE.GRASS: bGrass(g, seed); break;
      case TILE.TALL: bTall(g, seed); break;
      case TILE.TREE: bTree(g, seed); break;
      case TILE.PATH: bPath(g, seed); break;
      case TILE.SAND: bSand(g, seed); break;
      case TILE.FLOWER: bFlower(g, seed); break;
      case TILE.ROOF: bRoof(g); break;
      case TILE.WALL: bWall(g, (variant & 1) === 0); break;
      case TILE.DOOR: bDoor(g); break;
      case TILE.SIGN: bSign(g, seed); break;
      case TILE.CAVEWALL: bCaveWall(g, seed); break;
      case TILE.CAVEFLOOR: bCaveFloor(g, seed); break;
      case TILE.FLOOR: bFloor(g); break;
      case TILE.MAT: bMat(g); break;
      case TILE.COUNTER: bCounter(g); break;
      case TILE.FENCE: bFence(g, seed); break;
      case TILE.LEDGE: bLedge(g, seed); break;
      case TILE.PC: bPC(g); break;
      case TILE.HEAL: bHeal(g); break;
      default: g.fillStyle = '#000'; g.fillRect(0, 0, TS, TS);
    }
    tileCache.set(key, c); return c;
  }

  // animated water drawn live
  function paintWater(sx, sy, t, wx, wy) {
    ctx.fillStyle = C.water; ctx.fillRect(sx, sy, TS, TS);
    const off = Math.sin(t * 1.5 + wx * 0.6 + wy * 0.3);
    ctx.fillStyle = C.waterD; ctx.fillRect(sx, sy + 10, TS, 2); ctx.fillRect(sx, sy + 24, TS, 2);
    ctx.fillStyle = C.waterL;
    const a = (off * 6) | 0, b = (Math.cos(t * 1.3 + wx) * 6) | 0;
    ctx.fillRect(sx + 4 + a, sy + 6, 8, 2); ctx.fillRect(sx + 18 + b, sy + 18, 8, 2); ctx.fillRect(sx + 2 + b, sy + 28, 6, 1);
  }

  Render.drawMap = function (map, cam) {
    const t = Date.now() / 1000;
    const x0 = Math.floor(cam.x), y0 = Math.floor(cam.y);
    const ox = (cam.x - x0) * TS, oy = (cam.y - y0) * TS;
    for (let vy = -1; vy <= VH; vy++) {
      for (let vx = -1; vx <= VW; vx++) {
        const mx = x0 + vx, my = y0 + vy;
        const sx = Math.round(vx * TS - ox), sy = Math.round(vy * TS - oy);
        if (my < 0 || mx < 0 || my >= map.h || mx >= map.w) {
          ctx.fillStyle = map.kind === 'cave' ? '#16131c' : (map.kind === 'interior' ? '#2a2230' : '#3f7a28');
          ctx.fillRect(sx, sy, TS, TS); continue;
        }
        const tt = map.tiles[my][mx];
        if (tt === TILE.WATER) { paintWater(sx, sy, t, mx, my); continue; }
        // grass underlay for structure tiles that should sit on terrain handled inside bakers
        const variant = vhash(mx, my) % VARIANTS;
        ctx.drawImage(getTile(tt, variant), sx, sy);
      }
    }
  };

  // ---------- characters ----------
  function normPal(pal) {
    pal = pal || {};
    const shirt = pal.shirt || pal.body || '#3d6fb4';
    return {
      cap: pal.cap || pal.hair || '#e23b3b',
      hair: pal.hair || '#4a3220',
      skin: pal.skin || '#f1c89a',
      shirt, shirtD: shade(shirt, -34),
      pants: pal.pants || '#34507a',
      shoe: pal.shoe || '#6a4a28',
    };
  }
  const CHAR_W = 32, CHAR_H = 40; // 16x20 art @2x
  const charCache = new Map();

  function P(g, ax, ay, aw, ah, col) { g.fillStyle = col; g.fillRect(ax * 2, ay * 2, aw * 2, ah * 2); }

  function buildChar(dir, frame, pal) {
    const sig = dir + frame + pal.cap + pal.shirt + pal.pants + pal.skin;
    if (charCache.has(sig)) return charCache.get(sig);
    const c = document.createElement('canvas'); c.width = CHAR_W; c.height = CHAR_H;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const O = C.outline;
    // leg animation offsets
    const lA = frame === 1 ? 1 : 0, lB = frame === 2 ? 1 : 0;

    if (dir === 'down' || dir === 'up') {
      // head silhouette
      P(g, 3, 2, 10, 11, O);
      P(g, 4, 3, 8, 3, pal.cap);            // cap crown
      P(g, 3, 5, 10, 1, shade(pal.cap, -30)); // brim
      if (dir === 'down') {
        P(g, 4, 6, 8, 1, pal.hair);
        P(g, 4, 7, 8, 5, pal.skin);         // face
        P(g, 5, 9, 1, 2, '#2a2438'); P(g, 10, 9, 1, 2, '#2a2438'); // eyes
        P(g, 6, 11, 4, 1, shade(pal.skin, -25)); // mouth shadow
      } else {
        P(g, 4, 6, 8, 6, pal.hair);         // back of head
      }
      // body
      P(g, 2, 12, 12, 6, O);
      P(g, 3, 12, 10, 5, pal.shirt);
      P(g, 3, 12, 10, 1, shade(pal.shirt, 22));
      P(g, 2, 13, 2, 3, pal.skin); P(g, 12, 13, 2, 3, pal.skin); // arms
      if (dir === 'up') { P(g, 6, 13, 4, 3, pal.shirtD); } // backpack
      // legs
      P(g, 3, 17, 10, 3, O);
      P(g, 4, 17, 3, 2 + lA, pal.pants); P(g, 9, 17, 3, 2 + lB, pal.pants);
      P(g, 4, 18 + lA, 3, 1, pal.shoe); P(g, 9, 18 + lB, 3, 1, pal.shoe);
    } else { // left (right is mirrored on blit)
      P(g, 4, 2, 9, 11, O);
      P(g, 4, 3, 8, 3, pal.cap);
      P(g, 3, 5, 8, 1, shade(pal.cap, -30)); // brim points left
      P(g, 5, 6, 7, 1, pal.hair);
      P(g, 5, 7, 6, 5, pal.skin);            // face profile
      P(g, 5, 9, 1, 2, '#2a2438');           // one eye
      P(g, 11, 6, 2, 4, pal.hair);           // back hair
      // body
      P(g, 4, 12, 9, 6, O);
      P(g, 5, 12, 7, 5, pal.shirt);
      P(g, 5, 12, 7, 1, shade(pal.shirt, 22));
      P(g, 6, 13, 2, 3, pal.skin);           // swinging arm
      // legs (front/back)
      P(g, 5, 17, 7, 3, O);
      P(g, 5, 17, 3, 2 + lA, pal.pants); P(g, 9, 17, 3, 2 + lB, pal.pants);
      P(g, 5, 18 + lA, 3, 1, pal.shoe); P(g, 9, 18 + lB, 3, 1, pal.shoe);
    }
    charCache.set(sig, c); return c;
  }

  // sx,sy = tile top-left; sprite is drawn 8px higher so the head overhangs upward.
  Render.drawHuman = function (sx, sy, dir, pal, frame) {
    const p = normPal(pal);
    frame = frame || 0;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(sx + 16, sy + 29, 9, 3.2, 0, 0, 7); ctx.fill();
    if (dir === 'right') {
      const spr = buildChar('left', frame, p);
      ctx.save(); ctx.translate(sx + CHAR_W, sy - 8); ctx.scale(-1, 1); ctx.drawImage(spr, 0, 0); ctx.restore();
    } else {
      ctx.drawImage(buildChar(dir, frame, p), sx, sy - 8);
    }
  };

  const NPC_PAL = {
    flavor: { cap: '#7a8a6a', hair: '#5a4a3a', shirt: '#9aa46a', pants: '#5a6048' },
    trainer: { cap: '#e0a838', hair: '#2a2a2a', shirt: '#b4543d', pants: '#3a3a44' }, // tan cap, distinct from the red-cap hero
    gymleader: { cap: '#7b3fb4', hair: '#1a1a1a', shirt: '#7b3fb4', pants: '#2a2440' },
    healer: { cap: '#ec8a8a', hair: '#d44', shirt: '#f4eaea', pants: '#e08a8a' },
    shop: { cap: '#4a90c4', hair: '#333', shirt: '#4a90c4', pants: '#2a3a4a' },
    story: { cap: '#d8c060', hair: '#888', shirt: '#e8e0cc', pants: '#7a6a4a' },
    rival: { cap: '#3d8f5a', hair: '#caa060', shirt: '#3d8f5a', pants: '#2a4a34' },
    elite: { cap: '#5a3a8f', hair: '#222', shirt: '#5a3a8f', pants: '#2a2440' },
    champion: { cap: '#caa040', hair: '#eee', shirt: '#caa040', pants: '#6a5a2a' },
  };
  Render.npcPalette = (kind) => NPC_PAL[kind] || NPC_PAL.flavor;

  // ---------- procedural monster sprites (outline + cel-shading + body-plan variety) ----------
  const spriteCache = new Map();
  Render.monsterSprite = function (dex, size = 96) {
    const key = dex + ':' + size;
    if (spriteCache.has(key)) return spriteCache.get(key);
    const sp = util.monByDex(dex);
    const off = document.createElement('canvas'); off.width = size; off.height = size;
    const c = off.getContext('2d');
    const r = rng((dex * 2654435761) >>> 0);
    const t1 = util.typeColor(sp.types[0]).replace(/^#?/, '#');
    const t2 = util.typeColor(sp.types[1] || sp.types[0]).replace(/^#?/, '#');
    const c1 = t1.startsWith('#') ? t1 : '#888';
    const c2 = t2.startsWith('#') ? t2 : c1;
    const dark = shade(c1, -55), darker = shade(c1, -90), litMid = shade(c1, 24), lite = shade(c1, 55);
    const OL = shade(c1, -110);
    const cx = size / 2, cy = size * 0.54;
    const bodyR = size * (0.24 + r() * 0.07);
    const plan = dex % 5;

    // ground shadow
    c.fillStyle = 'rgba(0,0,0,0.16)'; c.beginPath(); c.ellipse(cx, size * 0.9, bodyR * 1.15, bodyR * 0.32, 0, 0, 7); c.fill();

    function blob(x, y, rad, fill) { c.fillStyle = fill; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill(); }
    function outlined(x, y, rad, fill) { blob(x, y, rad + size * 0.018, OL); blob(x, y, rad, fill); }

    // back appendages (limbs / wings / tail) drawn behind body
    if (plan === 4) { // winged
      c.fillStyle = OL; wing(c, cx - bodyR, cy - bodyR * 0.3, -1, bodyR * 1.3); wing(c, cx + bodyR, cy - bodyR * 0.3, 1, bodyR * 1.3);
      c.fillStyle = c2; wing(c, cx - bodyR, cy - bodyR * 0.3, -1, bodyR * 1.15); wing(c, cx + bodyR, cy - bodyR * 0.3, 1, bodyR * 1.15);
    } else if (plan === 3) { // serpentine tail
      outlined(cx + bodyR * 0.9, cy + bodyR * 0.7, bodyR * 0.42, c2);
      outlined(cx + bodyR * 1.2, cy + bodyR * 0.2, bodyR * 0.3, c2);
    }
    // limbs
    const limbs = plan === 1 ? 4 : plan === 2 ? 2 : (2 + (r() * 2 | 0));
    for (let i = 0; i < limbs; i++) {
      const a = plan === 1 ? (Math.PI * 0.65 + i * 0.5) : (Math.PI * 0.5 + (i - limbs / 2) * 0.5);
      const lx = cx + Math.cos(a) * bodyR * 0.95, ly = cy + Math.abs(Math.sin(a)) * bodyR * 0.95 + bodyR * 0.2;
      outlined(lx, ly, bodyR * 0.26, c2);
    }
    // ears / horns on top
    if (r() < 0.7) { c.fillStyle = OL; tri(c, cx - bodyR * 0.55, cy - bodyR * 0.7, cx - bodyR * 0.85, cy - bodyR * 1.55, cx - bodyR * 0.1, cy - bodyR * 0.95); tri(c, cx + bodyR * 0.55, cy - bodyR * 0.7, cx + bodyR * 0.85, cy - bodyR * 1.55, cx + bodyR * 0.1, cy - bodyR * 0.95); c.fillStyle = c2; tri(c, cx - bodyR * 0.5, cy - bodyR * 0.75, cx - bodyR * 0.75, cy - bodyR * 1.4, cx - bodyR * 0.2, cy - bodyR * 0.95); tri(c, cx + bodyR * 0.5, cy - bodyR * 0.75, cx + bodyR * 0.75, cy - bodyR * 1.4, cx + bodyR * 0.2, cy - bodyR * 0.95); }

    // body with outline
    const bw = plan === 3 ? bodyR * 0.95 : bodyR * 1.05, bh = plan === 3 ? bodyR * 1.2 : bodyR * 1.12;
    c.fillStyle = OL; ellipse(c, cx, cy, bw + size * 0.02, bh + size * 0.02);
    c.fillStyle = c1; ellipse(c, cx, cy, bw, bh);
    // cel shading: shadow crescent lower-right, light upper-left
    c.save(); c.beginPath(); ellipse(c, cx, cy, bw, bh); c.clip();
    c.fillStyle = dark; ellipse(c, cx + bw * 0.5, cy + bh * 0.55, bw, bh);
    c.fillStyle = lite; ellipse(c, cx - bw * 0.45, cy - bh * 0.5, bw * 0.6, bh * 0.6);
    c.restore();
    // belly
    c.fillStyle = mix(c1, '#ffffff', 0.55); ellipse(c, cx, cy + bh * 0.32, bw * 0.5, bh * 0.5);

    // eyes
    const eyeY = cy - bh * 0.18, edx = bw * 0.42, eR = bodyR * 0.2;
    c.fillStyle = OL; blob(cx - edx, eyeY, eR + 1, OL); blob(cx + edx, eyeY, eR + 1, OL);
    c.fillStyle = '#fff'; blob(cx - edx, eyeY, eR, '#fff'); blob(cx + edx, eyeY, eR, '#fff');
    c.fillStyle = '#1a1a22'; blob(cx - edx + eR * 0.2, eyeY + eR * 0.1, eR * 0.55, '#1a1a22'); blob(cx + edx + eR * 0.2, eyeY + eR * 0.1, eR * 0.55, '#1a1a22');
    c.fillStyle = '#fff'; blob(cx - edx - eR * 0.2, eyeY - eR * 0.25, eR * 0.22, '#fff'); blob(cx + edx - eR * 0.2, eyeY - eR * 0.25, eR * 0.22, '#fff');
    // mouth
    c.strokeStyle = OL; c.lineWidth = Math.max(1.5, size * 0.02); c.beginPath(); c.arc(cx, cy + bh * 0.05, bw * 0.2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    // type accent spots
    if (r() < 0.5) { c.fillStyle = shade(c2, -10); for (let i = 0; i < 3; i++) blob(cx - bw * 0.3 + i * bw * 0.3, cy + bh * 0.2 + (i % 2) * 6, bodyR * 0.1, shade(c2, -10)); }

    spriteCache.set(key, off);
    return off;
  };

  function ellipse(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill(); }
  function tri(c, x1, y1, x2, y2, x3, y3) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.closePath(); c.fill(); }
  function wing(c, x, y, dir, len) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + dir * len, y - len * 0.5); c.lineTo(x + dir * len * 0.8, y + len * 0.3); c.lineTo(x, y + len * 0.2); c.closePath(); c.fill(); }

})(window.MQ);
