// Overworld: grid movement with smooth tweening, collision, warps, wild encounters,
// NPC interaction, and trainer line-of-sight detection.
(function (MQ) {
  'use strict';
  const util = MQ.util;
  const World = MQ.World = {};
  const TS = MQ.Render.TS;
  const STEP_TIME = 0.14; // seconds per tile
  // protagonist look: red cap, dark hair, light shirt, blue jeans (classic look)
  const PLAYER_PAL = { cap: '#e23b3b', hair: '#4a3220', skin: '#f1c89a', shirt: '#eceef2', pants: '#3a6ea5', shoe: '#caa14a' };

  let map = null;
  const cam = { x: 0, y: 0 };
  // movement tween
  let moving = false, mvFrom = null, mvTo = null, mvT = 0, pendingTurn = null;
  let stepLock = 0;

  World.currentMap = () => map;

  World.load = function (mapId, x, y, dir) {
    map = util.map(mapId);
    const p = MQ.Game.state.player;
    p.mapId = mapId; p.x = x; p.y = y; if (dir) p.dir = dir;
    moving = false; mvT = 0;
    centerCam(true);
    if (map.kind === 'town') MQ.Game.state.flags.lastCenter = { mapId, x, y };
    MQ.Toast && MQ.Toast.show(map.name, 1200);
  };

  function centerCam(snap) {
    const p = MQ.Game.state.player;
    const cx = p.x - (MQ.Render.VW - 1) / 2;
    const cy = p.y - (MQ.Render.VH - 1) / 2;
    const tx = util.clamp(cx, 0, Math.max(0, map.w - MQ.Render.VW));
    const ty = util.clamp(cy, 0, Math.max(0, map.h - MQ.Render.VH));
    if (snap) { cam.x = tx; cam.y = ty; }
    else { cam.x += (tx - cam.x) * 0.2; cam.y += (ty - cam.y) * 0.2; }
  }

  function tileAt(x, y) {
    if (y < 0 || x < 0 || y >= map.h || x >= map.w) return -1;
    return map.tiles[y][x];
  }
  function meta(t) { return (MQ.tiles && MQ.tiles[t]) || {}; }

  function npcAt(x, y) {
    for (const id of map.npcs) {
      const n = util.npc(id);
      if (!n) continue;
      if (n.defeated && n.removeOnDefeat) continue;
      if (n.x === x && n.y === y && n._gone !== true) return n;
    }
    return null;
  }

  function blocked(x, y) {
    const t = tileAt(x, y);
    if (t === -1) return true;
    if (!meta(t).walk) return true;
    if (npcAt(x, y)) return true;
    return false;
  }

  const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  World.update = function (dt) {
    const p = MQ.Game.state.player;
    if (stepLock > 0) stepLock -= dt;

    if (moving) {
      mvT += dt / STEP_TIME;
      if (mvT >= 1) {
        moving = false; mvT = 0;
        p.x = mvTo.x; p.y = mvTo.y;
        onStepComplete();
      }
    }

    if (!moving) {
      // menu open
      if (MQ.Input.consume('menu')) { MQ.UI.openMenu(); return; }
      // interact
      if (MQ.Input.consume('a')) { interact(); return; }
      // movement
      let dir = null;
      if (MQ.Input.isDown('up')) dir = 'up';
      else if (MQ.Input.isDown('down')) dir = 'down';
      else if (MQ.Input.isDown('left')) dir = 'left';
      else if (MQ.Input.isDown('right')) dir = 'right';
      if (dir) tryMove(dir, p);
    }
    centerCam(false);
  };

  function tryMove(dir, p) {
    p.dir = dir;
    const [dx, dy] = DIRV[dir];
    const nx = p.x + dx, ny = p.y + dy;
    // ledge: can hop down a ledge tile
    const tThere = tileAt(nx, ny);
    if (meta(tThere).ledge === 'down' && dir === 'down') {
      // hop two tiles
      const lx = nx, ly = ny + 1;
      if (!blocked(lx, ly)) { startMove(p, { x: lx, y: ly }, true); return; }
    }
    if (!blocked(nx, ny)) startMove(p, { x: nx, y: ny }, false);
  }

  function startMove(p, to, hop) {
    moving = true; mvT = 0; mvFrom = { x: p.x, y: p.y }; mvTo = to; mvTo.hop = hop;
  }

  function onStepComplete() {
    const p = MQ.Game.state.player;
    MQ.Game.state.stats.steps++;
    if (MQ.Game.state.repelSteps > 0) MQ.Game.state.repelSteps--;
    // warp?
    const w = map.warps.find(w => w.x === p.x && w.y === p.y);
    if (w) { doWarp(w); return; }
    // heal tile?
    const t = tileAt(p.x, p.y);
    if (MQ.tiles[t] && MQ.tiles[t].read && t === MQ.tileEnum.HEAL) { /* read on interact */ }
    // trainer sight
    if (checkTrainerSight()) return;
    // wild encounter
    const m = meta(t);
    if (m.encounter && map.encounter) maybeEncounter();
  }

  function doWarp(w) {
    MQ.Transition.fade(() => {
      World.load(w.to, w.toX, w.toY, MQ.Game.state.player.dir);
    });
  }

  function maybeEncounter() {
    if (MQ.Game.state.repelSteps > 0) return;
    const enc = MQ.encounters[map.encounter];
    if (!enc || !enc.table.length) return;
    const rate = enc.kind === 'cave' ? 0.12 : 0.10;
    if (!util.chance(rate)) return;
    // weighted pick
    const total = enc.table.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total, chosen = enc.table[0];
    for (const e of enc.table) { r -= e.weight; if (r <= 0) { chosen = e; break; } }
    const level = util.rand(chosen.min, chosen.max);
    const spawnDex = MQ.Species.dexForLevel(chosen.dex, level); // evolve to a level-appropriate form
    const wild = MQ.Species.create(spawnDex, level);
    MQ.Game.markSeen(spawnDex);
    MQ.Transition.fade(() => MQ.Battle.startWild(wild));
  }

  // ---------- interaction ----------
  function facingTile() {
    const p = MQ.Game.state.player;
    const [dx, dy] = DIRV[p.dir];
    return { x: p.x + dx, y: p.y + dy };
  }

  function interact() {
    const f = facingTile();
    const t = tileAt(f.x, f.y);
    // heal counter
    if (t === MQ.tileEnum.HEAL) { healPrompt(); return; }
    if (t === MQ.tileEnum.PC) { MQ.UI.openBox(); return; }
    // npc
    const n = npcAt(f.x, f.y);
    if (n) { faceToward(n); MQ.NPCs.talk(n); return; }
    // sign / object
    const obj = (map.objects || []).find(o => o.x === f.x && o.y === f.y && o.sign);
    if (obj) { MQ.Dialogue.open([obj.sign]); return; }
    if (t === MQ.tileEnum.SIGN) { MQ.Dialogue.open(['这是一块路牌。']); return; }
  }

  function faceToward(n) {
    const p = MQ.Game.state.player;
    if (n.x < p.x) n.dir = 'right'; else if (n.x > p.x) n.dir = 'left';
    else if (n.y < p.y) n.dir = 'down'; else n.dir = 'up';
  }

  function healPrompt() {
    MQ.Dialogue.open(['让你的怪兽们恢复活力吗？'], {
      choices: ['是', '否'],
      onChoice: (i) => {
        if (i === 0) { MQ.Game.healParty(); MQ.Dialogue.open(['你的怪兽们已经完全恢复了！谢谢光临！']); }
      },
    });
  }

  // ---------- trainer sight ----------
  function checkTrainerSight() {
    const p = MQ.Game.state.player;
    for (const id of map.npcs) {
      const n = util.npc(id);
      if (!n || n.kind === 'flavor' || n.kind === 'shop' || n.kind === 'healer') continue;
      if (n.defeated || !n.team || !n.team.length) continue;
      if (!n.sight || n.sight <= 0) continue;
      const [dx, dy] = DIRV[n.dir] || [0, 1];
      for (let d = 1; d <= n.sight; d++) {
        const sx = n.x + dx * d, sy = n.y + dy * d;
        if (blocked(sx, sy) && !(sx === p.x && sy === p.y)) break;
        if (sx === p.x && sy === p.y) {
          MQ.NPCs.trainerApproach(n);
          return true;
        }
      }
    }
    return false;
  }

  // ---------- rendering ----------
  World.render = function () {
    const ctx = MQ.Render.ctx();
    MQ.Render.drawMap(map, cam);
    const p = MQ.Game.state.player;
    // draw npcs
    for (const id of map.npcs) {
      const n = util.npc(id);
      if (!n || n._gone) continue;
      const sx = Math.round((n.x - cam.x) * TS), sy = Math.round((n.y - cam.y) * TS);
      if (sx < -TS || sy < -TS || sx > MQ.Render.canvas().width || sy > MQ.Render.canvas().height) continue;
      MQ.Render.drawHuman(sx, sy, n.dir || 'down', MQ.Render.npcPalette(n.kind), 0);
      if (n.kind === 'gymleader' || n.kind === 'story' || n.kind === 'champion' || n.kind === 'elite') {
        ctx.fillStyle = '#ffd54a'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('!', sx + TS / 2, sy - 10); ctx.textAlign = 'left';
      }
    }
    // draw player (with movement tween + walk frame)
    let px = (p.x - cam.x) * TS, py = (p.y - cam.y) * TS;
    let frame = 0;
    if (moving) {
      const ix = mvFrom.x + (mvTo.x - mvFrom.x) * mvT;
      const iy = mvFrom.y + (mvTo.y - mvFrom.y) * mvT;
      px = (ix - cam.x) * TS; py = (iy - cam.y) * TS;
      if (mvTo.hop) py -= Math.sin(mvT * Math.PI) * 14;
      frame = (Math.floor(p.x + p.y) % 2 === 0) ? (mvT < 0.5 ? 1 : 2) : (mvT < 0.5 ? 2 : 1);
    }
    px = Math.round(px); py = Math.round(py);
    MQ.Render.drawHuman(px, py, p.dir, PLAYER_PAL, frame);
    // map name banner handled by toast
  };

  // expose for story scripting
  World.removeNpc = function (id) { const n = util.npc(id); if (n) n._gone = true; };
  World.refresh = function () { /* re-evaluate visible npcs; noop placeholder */ };

})(window.MQ);
