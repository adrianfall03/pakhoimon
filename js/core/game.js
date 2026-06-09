// Central game controller: holds the save-able state, drives the mode machine and main loop.
(function (MQ) {
  'use strict';
  const util = MQ.util;
  const Game = MQ.Game = {};

  Game.state = null;
  Game.mode = 'title';      // title | overworld | battle | menu | dialogue
  Game.modeStack = [];
  Game.battle = null;       // active battle controller when in battle mode
  Game.dialogue = null;     // active dialogue when in dialogue mode
  Game.menu = null;

  // Mode switches clear the one-shot input queue so stale edge-presses (e.g. a held
  // movement key's keydown, which isDown-based walking never consumes) don't leak into
  // the next mode's menu navigation.
  Game.pushMode = function (m, payload) { Game.modeStack.push(Game.mode); Game.mode = m; MQ.Input && MQ.Input.clear(); Game._enter(m, payload); };
  Game.setMode = function (m, payload) { Game.mode = m; MQ.Input && MQ.Input.clear(); Game._enter(m, payload); };
  Game.popMode = function () { Game.mode = Game.modeStack.pop() || 'overworld'; MQ.Input && MQ.Input.clear(); };
  Game._enter = function (m, payload) { /* hook for transitions */ };

  Game.newGame = function (starterDex, playerName) {
    const starter = MQ.Species.create(starterDex, 5);
    Game.state = {
      version: 1,
      player: {
        name: playerName || '小遥', gender: 'M',
        mapId: 'town_newleaf', x: 13, y: 12, dir: 'up',
        money: 3000, badges: [],
      },
      party: [starter],
      box: [],
      bag: { item_ball: 5, item_potion: 5, item_dex: 1, item_townmap: 1 },
      dex: { seen: {}, caught: {} },
      flags: {},
      story: { chapter: 0, step: 0, log: [] },
      stats: { steps: 0, battlesWon: 0, caught: 0, playtimeMs: 0 },
      repelSteps: 0,
      createdAt: Date.now(),
    };
    Game.markCaught(starterDex);
    Game.setMode('overworld');
    MQ.World.load(Game.state.player.mapId, Game.state.player.x, Game.state.player.y, Game.state.player.dir);
    MQ.Story && MQ.Story.start(); // opens the prologue dialogue on top of the overworld
  };

  Game.markSeen = function (dex) { if (Game.state) Game.state.dex.seen[dex] = true; };
  Game.markCaught = function (dex) { if (Game.state) { Game.state.dex.seen[dex] = true; Game.state.dex.caught[dex] = true; } };
  Game.dexCounts = function () {
    const s = Game.state.dex;
    return { seen: Object.keys(s.seen).length, caught: Object.keys(s.caught).length, total: (MQ.monsters || []).length };
  };

  Game.hasBadge = (id) => Game.state.player.badges.includes(id);
  Game.addBadge = function (b) { if (!Game.hasBadge(b.id)) Game.state.player.badges.push(b.id); };
  Game.addItem = function (id, n = 1) { Game.state.bag[id] = (Game.state.bag[id] || 0) + n; };
  Game.removeItem = function (id, n = 1) { if (!Game.state.bag[id]) return false; Game.state.bag[id] -= n; if (Game.state.bag[id] <= 0) delete Game.state.bag[id]; return true; };
  Game.itemCount = (id) => Game.state.bag[id] || 0;

  Game.healParty = function () { for (const m of Game.state.party) MQ.Species.fullHeal(m); };
  Game.firstHealthy = function () { return Game.state.party.find(m => m.curHp > 0); };
  Game.partyAlive = function () { return Game.state.party.some(m => m.curHp > 0); };

  Game.giveMonster = function (inst) {
    if (Game.state.party.length < 6) Game.state.party.push(inst);
    else Game.state.box.push(inst);
    Game.markCaught(inst.dex);
  };

  // ---------- main loop ----------
  let last = 0, acc = 0;
  Game.start = function () {
    requestAnimationFrame(Game._frame);
  };
  Game._frame = function (ts) {
    if (!last) last = ts;
    let dt = (ts - last) / 1000; last = ts;
    if (dt > 0.1) dt = 0.1;
    if (Game.state) Game.state.stats.playtimeMs += dt * 1000;
    Game.update(dt);
    Game.render();
    requestAnimationFrame(Game._frame);
  };

  Game.update = function (dt) {
    MQ.Toast && MQ.Toast.update(dt);
    if (MQ.Transition && MQ.Transition.active) { MQ.Transition.update(dt); return; } // pause world during fades
    switch (Game.mode) {
      case 'title': MQ.Title && MQ.Title.update(dt); break;
      case 'overworld': MQ.World.update(dt); break;
      case 'battle': Game.battle && Game.battle.update(dt); break;
      case 'dialogue': MQ.Dialogue.update(dt); break;
      case 'menu': MQ.UI.updateMenu(dt); break;
    }
  };

  Game.render = function () {
    const ctx = MQ.Render.ctx();
    switch (Game.mode) {
      case 'title': MQ.Title && MQ.Title.render(ctx); break;
      case 'battle': Game.battle && Game.battle.render(ctx); break;
      default:
        MQ.World.render();
        if (Game.mode === 'dialogue') MQ.Dialogue.render(ctx);
        if (Game.mode === 'menu') MQ.UI.renderMenu(ctx);
        break;
    }
    // the map-name banner only belongs on the field, not over battle/title
    if (MQ.Toast && Game.mode !== 'battle' && Game.mode !== 'title') MQ.Toast.render(ctx);
    MQ.Transition && MQ.Transition.render(ctx);
  };

})(window.MQ);
