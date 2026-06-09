// Monster instances: creation, stat computation, experience/leveling, evolution, movesets.
(function (MQ) {
  'use strict';
  const util = MQ.util;
  const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

  // 25 natures, each raising one stat 10% and lowering another (or neutral).
  const NATURES = [
    ['认真', null, null], ['勤奋', null, null], ['坦率', null, null], ['浮躁', null, null], ['害羞', null, null],
    ['固执', 'atk', 'spa'], ['勇敢', 'atk', 'spe'], ['顽皮', 'atk', 'spd'], ['孤独', 'atk', 'def'],
    ['大胆', 'def', 'atk'], ['悠闲', 'def', 'spe'], ['乐天', 'def', 'spa'], ['淘气', 'def', 'spd'],
    ['内敛', 'spa', 'atk'], ['马虎', 'spa', 'spd'], ['冷静', 'spa', 'spe'], ['沉着', 'spa', 'def'],
    ['温和', 'spd', 'atk'], ['温顺', 'spd', 'def'], ['自大', 'spd', 'spe'], ['慎重', 'spd', 'spa'],
    ['胆小', 'spe', 'atk'], ['急躁', 'spe', 'def'], ['天真', 'spe', 'spd'], ['爽朗', 'spe', 'spa'],
  ];

  const Species = MQ.Species = {};
  Species.STATS = STATS;

  Species.expForLevel = function (rate, n) {
    if (n <= 1) return 0;
    switch (rate) {
      case 'fast': return Math.floor(0.8 * n ** 3);
      case 'slow': return Math.floor(1.25 * n ** 3);
      case 'mediumslow': return Math.max(0, Math.floor(1.2 * n ** 3 - 15 * n ** 2 + 100 * n - 140));
      default: return n ** 3; // medium
    }
  };

  Species.levelFromExp = function (rate, exp) {
    let lvl = 1;
    while (lvl < 100 && Species.expForLevel(rate, lvl + 1) <= exp) lvl++;
    return lvl;
  };

  // moves the species knows by a given level (latest 4)
  Species.movesAtLevel = function (dex, level) {
    const sp = util.monByDex(dex);
    if (!sp) return [];
    const learned = sp.learnset.filter(e => e.level <= level).map(e => e.move);
    const uniq = [];
    for (const id of learned) if (!uniq.includes(id)) uniq.push(id);
    return uniq.slice(-4);
  };

  Species.makeMoveSlots = function (moveIds) {
    return moveIds.map(id => {
      const mv = util.move(id);
      const pp = mv ? mv.pp : 10;
      return { id, pp, maxpp: pp };
    });
  };

  Species.create = function (dex, level, opts = {}) {
    const sp = util.monByDex(dex);
    if (!sp) throw new Error('unknown dex ' + dex);
    const ivs = opts.ivs || {}; for (const s of STATS) if (ivs[s] === undefined) ivs[s] = util.rand(0, 31);
    const evs = opts.evs || {}; for (const s of STATS) if (evs[s] === undefined) evs[s] = 0;
    const nature = opts.nature || util.rand(0, NATURES.length - 1);
    const moves = Species.makeMoveSlots(opts.moves || Species.movesAtLevel(dex, level));
    const inst = {
      uid: util.uid(), dex, nickname: opts.nickname || sp.name, level,
      exp: Species.expForLevel(sp.growthRate, level),
      ivs, evs, nature, moves,
      status: null, statusTurns: 0, friendship: opts.friendship ?? 70,
      heldItem: opts.heldItem || null,
      gender: sp.genderless ? 'N' : (util.chance(0.5) ? 'M' : 'F'),
      origLevel: level, fainted: false,
    };
    const st = Species.stats(inst);
    inst.maxHp = st.maxHp;
    inst.curHp = opts.curHp != null ? opts.curHp : st.maxHp;
    return inst;
  };

  Species.stats = function (inst) {
    const sp = util.monByDex(inst.dex);
    const b = sp.baseStats, L = inst.level;
    const out = {};
    out.maxHp = Math.floor((2 * b.hp + inst.ivs.hp + Math.floor(inst.evs.hp / 4)) * L / 100) + L + 10;
    const nat = NATURES[inst.nature];
    for (const s of ['atk', 'def', 'spa', 'spd', 'spe']) {
      let v = Math.floor((2 * b[s] + inst.ivs[s] + Math.floor(inst.evs[s] / 4)) * L / 100) + 5;
      if (nat[1] === s) v = Math.floor(v * 1.1);
      if (nat[2] === s) v = Math.floor(v * 0.9);
      out[s] = v;
    }
    return out;
  };

  Species.natureName = (inst) => NATURES[inst.nature][0];

  // returns array of {level, learned:[moveId]} events from gaining exp
  Species.gainExp = function (inst, amount) {
    const sp = util.monByDex(inst.dex);
    const before = inst.level;
    inst.exp += amount;
    const cap = Species.expForLevel(sp.growthRate, 100);
    if (inst.exp > cap) inst.exp = cap;
    const after = Species.levelFromExp(sp.growthRate, inst.exp);
    const events = [];
    if (after > before) {
      const oldMax = inst.maxHp;
      inst.level = after;
      const st = Species.stats(inst);
      inst.maxHp = st.maxHp;
      if (!inst.fainted) inst.curHp += (inst.maxHp - oldMax); // heal the HP delta on level up
      // new moves learned between before+1 .. after
      const newMoves = [];
      for (const e of sp.learnset) if (e.level > before && e.level <= after) newMoves.push(e.move);
      events.push({ type: 'levelup', from: before, to: after, learned: newMoves });
    }
    return events;
  };

  Species.expToNext = function (inst) {
    const sp = util.monByDex(inst.dex);
    const cur = Species.expForLevel(sp.growthRate, inst.level);
    const next = Species.expForLevel(sp.growthRate, inst.level + 1);
    return { cur: inst.exp - cur, need: next - cur };
  };

  // experience yield for defeating `foe` with `winner` (a flat, friendly formula)
  Species.expYield = function (foe, winnerLevel, opts = {}) {
    const sp = util.monByDex(foe.dex);
    let exp = Math.floor((sp.baseExp * foe.level) / 6);
    if (opts.trainer) exp = Math.floor(exp * 1.5);
    return Math.max(1, exp);
  };

  // teach a move (replacing index if provided)
  Species.teachMove = function (inst, moveId, replaceIndex) {
    if (inst.moves.some(m => m.id === moveId)) return false;
    const slot = Species.makeMoveSlots([moveId])[0];
    if (inst.moves.length < 4 && replaceIndex == null) { inst.moves.push(slot); return true; }
    if (replaceIndex != null) { inst.moves[replaceIndex] = slot; return true; }
    return false;
  };

  // evolution check; ctx may carry {item, trade}
  Species.evolutionFor = function (inst, ctx = {}) {
    const sp = util.monByDex(inst.dex);
    const ev = sp.evolution;
    if (!ev) return null;
    if (ev.type === 'level' && inst.level >= ev.level) return ev.to;
    if (ev.type === 'friendship' && inst.friendship >= (ev.value || 200)) return ev.to;
    if (ev.type === 'stone' && ctx.item === ev.item) return ev.to;
    return null;
  };

  Species.evolve = function (inst, toId) {
    const target = util.mon(toId);
    if (!target) return false;
    const oldSp = util.monByDex(inst.dex);
    const wasDefaultName = oldSp && inst.nickname === oldSp.name; // not a custom nickname
    inst.dex = target.dex;
    if (wasDefaultName) inst.nickname = target.name;
    const oldMax = inst.maxHp;
    const st = Species.stats(inst);
    inst.maxHp = st.maxHp;
    inst.curHp += (inst.maxHp - oldMax);
    return true;
  };

  Species.fullHeal = function (inst) {
    const st = Species.stats(inst);
    inst.maxHp = st.maxHp;
    inst.curHp = st.maxHp;
    inst.status = null; inst.statusTurns = 0; inst.fainted = false;
    for (const m of inst.moves) m.pp = m.maxpp;
  };

  Species.spriteSeed = function (dex) { return dex * 2654435761 >>> 0; };

})(window.MQ);
