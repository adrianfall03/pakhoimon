// Shared utilities and the global game namespace bootstrap.
window.MQ = window.MQ || {};
(function (MQ) {
  'use strict';

  const util = MQ.util = {};

  // --- lookups built once data is loaded ---
  let _idx = null;
  util.buildIndexes = function () {
    _idx = {
      monByDex: new Map((MQ.monsters || []).map(m => [m.dex, m])),
      monById: new Map((MQ.monsters || []).map(m => [m.id, m])),
      moveById: new Map((MQ.moves || []).map(m => [m.id, m])),
      itemById: new Map((MQ.items || []).map(m => [m.id, m])),
      mapById: new Map((MQ.maps || []).map(m => [m.id, m])),
      npcById: new Map((MQ.npcs || []).map(m => [m.id, m])),
      typeById: new Map((MQ.types || []).map(t => [t.id, t])),
    };
    return _idx;
  };
  util.idx = function () { return _idx || util.buildIndexes(); };
  util.mon = (dex) => util.idx().monByDex.get(typeof dex === 'string' ? util.idx().monById.get(dex)?.dex : dex) || util.idx().monById.get(dex);
  util.monByDex = (dex) => util.idx().monByDex.get(dex);
  util.move = (id) => util.idx().moveById.get(id);
  util.item = (id) => util.idx().itemById.get(id);
  util.map = (id) => util.idx().mapById.get(id);
  util.npc = (id) => util.idx().npcById.get(id);
  util.type = (id) => util.idx().typeById.get(id);
  util.typeName = (id) => (util.type(id) ? util.type(id).zh : id);
  util.typeColor = (id) => (util.type(id) ? util.type(id).color : '#888');

  // --- math / rng ---
  util.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  util.rand = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
  util.chance = (p) => Math.random() < p;
  util.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  util.shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = util.rand(0, i);[a[i], a[j]] = [a[j], a[i]]; } return a; };
  util.uid = (() => { let n = 0; return () => 'u' + (Date.now().toString(36)) + (n++).toString(36); })();

  // type effectiveness multiplier of an attacking type vs a defender's type list
  util.effectiveness = function (atkType, defTypes) {
    const chart = MQ.typeChart || {};
    let mult = 1;
    for (const d of defTypes) {
      const row = chart[atkType];
      if (row && row[d] !== undefined) mult *= row[d];
    }
    return mult;
  };

  util.effLabel = function (mult) {
    if (mult === 0) return '没有效果……';
    if (mult >= 2) return '效果绝佳！';
    if (mult > 0 && mult < 1) return '效果不太好……';
    return '';
  };

  // simple event bus
  const handlers = {};
  util.on = (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); };
  util.emit = (ev, data) => { (handlers[ev] || []).forEach(fn => fn(data)); };

})(window.MQ);
