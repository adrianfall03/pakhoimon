// Canvas renderer: tile maps, player, NPCs, and procedurally-drawn monster sprites.
(function (MQ) {
  'use strict';
  const util = MQ.util;
  const TS = 32;          // tile size in px
  const VW = 17, VH = 13; // viewport in tiles

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

  // ---------- tile painting ----------
  function tileColor(t) {
    return ['#7cc65a', '#d8c089', '#2f6b34', '#4d90d5', '#5aab3e', '#9aa0a8', '#b8443c',
      '#9c6b3f', '#caa15a', '#86c25a', '#caa15a', '#3a3340', '#5b5560', '#8fd06a', '#a98b5a',
      '#c7b78b', '#e6d8a8', '#caa15a', '#5269ac', '#e88'][t] || '#000';
  }

  function paintTile(t, sx, sy) {
    const TILE = MQ.tileEnum;
    // base fill
    if (t === TILE.TREE) {
      ctx.fillStyle = '#5aab3e'; ctx.fillRect(sx, sy, TS, TS);
      ctx.fillStyle = '#2f6b34';
      ctx.beginPath(); ctx.arc(sx + TS / 2, sy + TS / 2, TS * 0.42, 0, 7); ctx.fill();
      ctx.fillStyle = '#23512a';
      ctx.beginPath(); ctx.arc(sx + TS * 0.36, sy + TS * 0.42, TS * 0.16, 0, 7); ctx.fill();
    } else if (t === TILE.WATER) {
      ctx.fillStyle = '#4d90d5'; ctx.fillRect(sx, sy, TS, TS);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(sx + 4, sy + 8, 10, 2); ctx.fillRect(sx + 16, sy + 20, 10, 2);
    } else if (t === TILE.TALL) {
      ctx.fillStyle = '#5aab3e'; ctx.fillRect(sx, sy, TS, TS);
      ctx.fillStyle = '#3f8a2c';
      for (let i = 0; i < 5; i++) { const bx = sx + 3 + i * 6; ctx.fillRect(bx, sy + 14, 3, 14); }
      ctx.fillStyle = '#2f6b34'; ctx.fillRect(sx, sy + TS - 4, TS, 4);
    } else if (t === TILE.WALL) {
      ctx.fillStyle = '#c9c2b6'; ctx.fillRect(sx, sy, TS, TS);
      ctx.strokeStyle = '#9aa0a8'; ctx.strokeRect(sx + 0.5, sy + 0.5, TS - 1, TS - 1);
    } else if (t === TILE.ROOF) {
      ctx.fillStyle = '#b8443c'; ctx.fillRect(sx, sy, TS, TS);
      ctx.fillStyle = '#9c322c'; ctx.fillRect(sx, sy, TS, 6);
    } else if (t === TILE.DOOR) {
      ctx.fillStyle = '#caa15a'; ctx.fillRect(sx, sy, TS, TS);
      ctx.fillStyle = '#6b431f'; ctx.fillRect(sx + 8, sy + 6, TS - 16, TS - 6);
    } else if (t === TILE.MAT) {
      ctx.fillStyle = '#caa15a'; ctx.fillRect(sx, sy, TS, TS);
      ctx.fillStyle = '#b8443c'; ctx.fillRect(sx + 6, sy + 18, TS - 12, TS - 22);
    } else if (t === TILE.SIGN) {
      ctx.fillStyle = '#7cc65a'; ctx.fillRect(sx, sy, TS, TS);
      ctx.fillStyle = '#8a5a2b'; ctx.fillRect(sx + 6, sy + 6, TS - 12, 14);
      ctx.fillStyle = '#5a3a1b'; ctx.fillRect(sx + 14, sy + 20, 4, 8);
    } else if (t === TILE.LEDGE) {
      ctx.fillStyle = '#7cc65a'; ctx.fillRect(sx, sy, TS, TS);
      ctx.fillStyle = '#b89b5a'; ctx.fillRect(sx, sy + TS - 8, TS, 8);
      ctx.fillStyle = '#8a6f3a'; ctx.fillRect(sx, sy + TS - 3, TS, 3);
    } else if (t === TILE.CAVEWALL) {
      ctx.fillStyle = '#3a3340'; ctx.fillRect(sx, sy, TS, TS);
      ctx.fillStyle = '#2a2530'; ctx.fillRect(sx + 4, sy + 4, TS - 8, TS - 8);
    } else if (t === TILE.CAVEFLOOR) {
      ctx.fillStyle = '#5b5560'; ctx.fillRect(sx, sy, TS, TS);
    } else if (t === TILE.FLOWER) {
      ctx.fillStyle = '#7cc65a'; ctx.fillRect(sx, sy, TS, TS);
      const cols = ['#ec5a5a', '#f3d23b', '#ec8fe6'];
      for (let i = 0; i < 3; i++) { ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.arc(sx + 8 + i * 9, sy + 16, 3, 0, 7); ctx.fill(); }
    } else if (t === TILE.FENCE) {
      ctx.fillStyle = '#7cc65a'; ctx.fillRect(sx, sy, TS, TS);
      ctx.fillStyle = '#8a6f3a'; ctx.fillRect(sx, sy + 12, TS, 4); ctx.fillRect(sx + 6, sy + 6, 4, 18); ctx.fillRect(sx + 22, sy + 6, 4, 18);
    } else if (t === TILE.COUNTER) {
      ctx.fillStyle = '#caa15a'; ctx.fillRect(sx, sy, TS, TS);
      ctx.fillStyle = '#8a5a2b'; ctx.fillRect(sx + 2, sy + 2, TS - 4, TS - 10);
    } else if (t === TILE.PC) {
      ctx.fillStyle = '#e6d8a8'; ctx.fillRect(sx, sy, TS, TS);
      ctx.fillStyle = '#3a3340'; ctx.fillRect(sx + 6, sy + 4, TS - 12, TS - 14);
      ctx.fillStyle = '#5aab3e'; ctx.fillRect(sx + 9, sy + 7, TS - 18, 8);
    } else if (t === TILE.HEAL) {
      ctx.fillStyle = '#e6d8a8'; ctx.fillRect(sx, sy, TS, TS);
      ctx.fillStyle = '#ec5a5a'; ctx.fillRect(sx + 12, sy + 4, 8, 22); ctx.fillRect(sx + 6, sy + 11, 20, 8);
    } else if (t === TILE.FLOOR) {
      ctx.fillStyle = '#e6d8a8'; ctx.fillRect(sx, sy, TS, TS);
      ctx.strokeStyle = '#d8c89a'; ctx.strokeRect(sx + 0.5, sy + 0.5, TS - 1, TS - 1);
    } else if (t === TILE.SAND) {
      ctx.fillStyle = '#e6d8a8'; ctx.fillRect(sx, sy, TS, TS);
    } else {
      ctx.fillStyle = tileColor(t); ctx.fillRect(sx, sy, TS, TS);
    }
  }

  Render.drawMap = function (map, cam) {
    const x0 = Math.floor(cam.x), y0 = Math.floor(cam.y);
    const ox = (cam.x - x0) * TS, oy = (cam.y - y0) * TS;
    for (let vy = -1; vy <= VH; vy++) {
      for (let vx = -1; vx <= VW; vx++) {
        const mx = x0 + vx, my = y0 + vy;
        const sx = vx * TS - ox, sy = vy * TS - oy;
        if (my < 0 || mx < 0 || my >= map.h || mx >= map.w) {
          ctx.fillStyle = map.kind === 'cave' ? '#1a1620' : '#1e3a1a'; ctx.fillRect(sx, sy, TS, TS);
          continue;
        }
        paintTile(map.tiles[my][mx], sx, sy);
      }
    }
  };

  // ---------- characters ----------
  function drawHuman(sx, sy, dir, palette) {
    const p = palette || { body: '#3d6fb4', skin: '#f0c89a', hair: '#3a2a1a' };
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(sx + TS / 2, sy + TS - 3, 10, 4, 0, 0, 7); ctx.fill();
    // body
    ctx.fillStyle = p.body; ctx.fillRect(sx + 9, sy + 16, 14, 12);
    // head
    ctx.fillStyle = p.skin; ctx.fillRect(sx + 10, sy + 6, 12, 12);
    // hair
    ctx.fillStyle = p.hair; ctx.fillRect(sx + 9, sy + 4, 14, 5);
    if (dir === 'down') { ctx.fillStyle = '#222'; ctx.fillRect(sx + 12, sy + 11, 2, 2); ctx.fillRect(sx + 18, sy + 11, 2, 2); }
    else if (dir === 'up') { ctx.fillStyle = p.hair; ctx.fillRect(sx + 9, sy + 6, 14, 8); }
    else { const ex = dir === 'left' ? 12 : 17; ctx.fillStyle = '#222'; ctx.fillRect(sx + ex, sy + 11, 2, 2); }
  }
  Render.drawHuman = drawHuman;

  const NPC_PAL = {
    flavor: { body: '#7a8a6a', skin: '#f0c89a', hair: '#5a4a3a' },
    trainer: { body: '#b4543d', skin: '#f0c89a', hair: '#2a2a2a' },
    gymleader: { body: '#7b3fb4', skin: '#f0c89a', hair: '#1a1a1a' },
    healer: { body: '#ec8a8a', skin: '#f0c89a', hair: '#d44' },
    shop: { body: '#4a90c4', skin: '#f0c89a', hair: '#333' },
    story: { body: '#d8c060', skin: '#f0c89a', hair: '#888' },
    rival: { body: '#3d8f5a', skin: '#f0c89a', hair: '#caa' },
    elite: { body: '#5a3a8f', skin: '#f0c89a', hair: '#222' },
    champion: { body: '#caa040', skin: '#f0c89a', hair: '#eee' },
  };
  Render.npcPalette = (kind) => NPC_PAL[kind] || NPC_PAL.flavor;

  // ---------- procedural monster sprites ----------
  const spriteCache = new Map();
  function rngFrom(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  Render.monsterSprite = function (dex, size = 96) {
    const key = dex + ':' + size;
    if (spriteCache.has(key)) return spriteCache.get(key);
    const sp = util.monByDex(dex);
    const off = document.createElement('canvas');
    off.width = size; off.height = size;
    const c = off.getContext('2d');
    const rnd = rngFrom(MQ.Species.spriteSeed(dex));
    const c1 = util.typeColor(sp.types[0]);
    const c2 = util.typeColor(sp.types[1] || sp.types[0]);
    const cx = size / 2, cy = size / 2 + size * 0.05;
    const bodyR = size * (0.26 + rnd() * 0.08);

    // shadow
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(cx, size * 0.9, bodyR * 1.1, bodyR * 0.3, 0, 0, 7); c.fill();
    // limbs / tail accents (secondary color)
    c.fillStyle = c2;
    const limbs = 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < limbs; i++) {
      const a = rnd() * Math.PI * 2, r = bodyR * (0.9 + rnd() * 0.5);
      const lx = cx + Math.cos(a) * r, ly = cy + Math.sin(a) * r * 0.8;
      c.beginPath(); c.arc(lx, ly, bodyR * (0.22 + rnd() * 0.18), 0, 7); c.fill();
    }
    // ears / spikes on top
    if (rnd() < 0.7) {
      c.fillStyle = c2;
      const earR = bodyR * 0.4;
      c.beginPath(); c.moveTo(cx - bodyR * 0.5, cy - bodyR * 0.6); c.lineTo(cx - bodyR * 0.7, cy - bodyR * 1.4); c.lineTo(cx - bodyR * 0.1, cy - bodyR * 0.8); c.fill();
      c.beginPath(); c.moveTo(cx + bodyR * 0.5, cy - bodyR * 0.6); c.lineTo(cx + bodyR * 0.7, cy - bodyR * 1.4); c.lineTo(cx + bodyR * 0.1, cy - bodyR * 0.8); c.fill();
    }
    // body
    const grad = c.createRadialGradient(cx - bodyR * 0.3, cy - bodyR * 0.3, bodyR * 0.2, cx, cy, bodyR * 1.2);
    grad.addColorStop(0, lighten(c1, 30)); grad.addColorStop(1, c1);
    c.fillStyle = grad;
    c.beginPath();
    if (rnd() < 0.4) { c.ellipse(cx, cy, bodyR * 1.05, bodyR * 1.15, 0, 0, 7); }
    else { c.arc(cx, cy, bodyR, 0, 7); }
    c.fill();
    // belly
    c.fillStyle = lighten(c1, 55);
    c.beginPath(); c.ellipse(cx, cy + bodyR * 0.35, bodyR * 0.5, bodyR * 0.55, 0, 0, 7); c.fill();
    // eyes
    const eyeY = cy - bodyR * 0.2, eyeDX = bodyR * 0.4, eyeR = bodyR * 0.18;
    c.fillStyle = '#fff'; c.beginPath(); c.arc(cx - eyeDX, eyeY, eyeR, 0, 7); c.arc(cx + eyeDX, eyeY, eyeR, 0, 7); c.fill();
    c.fillStyle = '#1a1a1a'; c.beginPath(); c.arc(cx - eyeDX, eyeY, eyeR * 0.55, 0, 7); c.arc(cx + eyeDX, eyeY, eyeR * 0.55, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(cx - eyeDX + 1, eyeY - 1, eyeR * 0.2, 0, 7); c.arc(cx + eyeDX + 1, eyeY - 1, eyeR * 0.2, 0, 7); c.fill();
    // mouth
    c.strokeStyle = '#1a1a1a'; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy + bodyR * 0.1, bodyR * 0.22, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();

    spriteCache.set(key, off);
    return off;
  };

  function lighten(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
    r = util.clamp(r, 0, 255); g = util.clamp(g, 0, 255); b = util.clamp(b, 0, 255);
    return `rgb(${r},${g},${b})`;
  }
  Render.lighten = lighten;

})(window.MQ);
