// Turn-based battle engine: damage, type effectiveness, status, stat stages, catching,
// exp/level-up/evolution, foe AI, and the battle scene renderer.
//
// Model: a turn is *simulated synchronously* into an ordered event list. State mutations
// (HP, status, etc.) are applied immediately during simulation so branch logic always
// sees correct post-action state, while *display* updates (HP-bar targets, shake) are
// emitted as `do` events and replayed in order — keeping animations in sync with text.
(function (MQ) {
  'use strict';
  const util = MQ.util, Species = MQ.Species;
  const Battle = MQ.Battle = {};

  let B = null;

  function freshStages() { return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 }; }
  function stageMul(s) { return s >= 0 ? (2 + s) / 2 : 2 / (2 - s); }
  function me() { return MQ.Game.state.party[B.activeIdx]; }
  function foe() { return B.foeParty[B.foeIdx]; }
  function sideOf(who) { return who === 'me' ? B.stages.me : B.stages.foe; }
  function nick(inst) { return inst.nickname || util.monByDex(inst.dex).name; }

  function liveStat(inst, key, who) {
    const base = Species.stats(inst)[key];
    let v = base * stageMul(sideOf(who)[key] || 0);
    if (key === 'atk' && inst.status === 'burn') v *= 0.5;
    if (key === 'spe' && inst.status === 'paralyze') v *= 0.5;
    return Math.floor(v);
  }

  // ---------- event builders (called during synchronous simulation) ----------
  function say(text) { B.msgs.push({ t: 'say', text }); }
  function doEv(fn) { B.msgs.push({ t: 'do', fn }); }
  function showHp(inst, who) { const v = inst.curHp; doEv(() => { B.hpTarget[who] = v; B.shake = 0.28; B._lastHit = who; }); }

  // ---------- battle entry ----------
  Battle.startWild = function (wild) {
    setup('wild', null, [wild]);
    B.canRun = true;
    say(`野生的 ${nick(wild)} 出现了！`);
    doEv(() => { B.phase = 'menu'; });
    MQ.Game.battle = Battle;
    MQ.Game.setMode('battle');
  };

  Battle.startTrainer = function (npc) {
    const party = npc.team.map(t => Species.create(t.dex, t.level));
    setup('trainer', npc, party);
    B.canRun = false;
    say(`${npc.name} 发起了对战！`);
    say(`${npc.name} 派出了 ${nick(party[0])}！`);
    say(`去吧，${nick(me())}！`);
    doEv(() => { B.phase = 'menu'; });
    MQ.Game.battle = Battle;
    MQ.Game.setMode('battle');
  };

  function setup(type, npc, foeParty) {
    let idx = MQ.Game.state.party.findIndex(m => m.curHp > 0);
    if (idx < 0) idx = 0;
    B = {
      type, trainer: npc, foeParty, foeIdx: 0, activeIdx: idx,
      stages: { me: freshStages(), foe: freshStages() }, side: { me: {}, foe: {} },
      phase: 'msg', menuIdx: 0, moveIdx: 0, switchIdx: 0, bagIdx: 0, bagMode: null,
      msgs: [], msgTimer: 0, participants: new Set(), result: null, _ended: false,
      runAttempts: 0, anim: 0, shake: 0, hpTarget: {}, hpAnim: {}, _lastHit: null, shakeCount: 0,
    };
    B.participants.add(me().uid);
    B.hpTarget.me = me().curHp; B.hpTarget.foe = foe().curHp;
    B.hpAnim.me = me().curHp; B.hpAnim.foe = foe().curHp;
    MQ.Game.markSeen(foe().dex);
  }

  function sendOutPlayerSilent() {
    B.participants.add(me().uid);
    B.stages.me = freshStages(); B.side.me = {};
    B.hpTarget.me = me().curHp; B.hpAnim.me = me().curHp;
  }

  // ---------- update / playback ----------
  Battle.update = function (dt) {
    B.anim += dt;
    if (B.shake > 0) B.shake -= dt;
    for (const k of ['me', 'foe']) {
      const inst = k === 'me' ? me() : foe();
      const target = B.hpTarget[k] != null ? B.hpTarget[k] : inst.curHp;
      if (B.hpAnim[k] === undefined) B.hpAnim[k] = target;
      const rate = inst.maxHp * 1.6 + 20;
      if (B.hpAnim[k] < target) B.hpAnim[k] = Math.min(target, B.hpAnim[k] + dt * rate);
      else if (B.hpAnim[k] > target) B.hpAnim[k] = Math.max(target, B.hpAnim[k] - dt * rate);
    }

    // drain consecutive do-events in one frame; pause on say
    let guard = 0;
    while (B.msgs.length && B.msgs[0].t === 'do' && guard++ < 200) { const e = B.msgs.shift(); e.fn(); }
    if (B.msgs.length && B.msgs[0].t === 'say') {
      B.msgTimer += dt;
      // wait for HP animation to settle before allowing advance feels nicer, but keep simple
      if ((B.msgTimer > 0.45 && MQ.Input.consume('a')) || B.msgTimer > 2.4) { B.msgs.shift(); B.msgTimer = 0; }
      return;
    }
    if (B.msgs.length) return; // a leftover non-say (shouldn't happen)

    switch (B.phase) {
      case 'menu': updateMenu(); break;
      case 'fight': updateFight(); break;
      case 'switch': updateSwitch(false); break;
      case 'switchForced': updateSwitch(true); break;
      case 'bag': updateBag(); break;
      case 'end': break;
    }
  };

  // ---------- menus ----------
  const MENU = ['战斗', '精灵球', '怪兽', '逃跑'];
  function updateMenu() {
    if (MQ.Input.consume('up') || MQ.Input.consume('left')) B.menuIdx = (B.menuIdx + MENU.length - 1) % MENU.length;
    if (MQ.Input.consume('down') || MQ.Input.consume('right')) B.menuIdx = (B.menuIdx + 1) % MENU.length;
    if (MQ.Input.consume('a')) {
      if (B.menuIdx === 0) { B.phase = 'fight'; B.moveIdx = 0; }
      else if (B.menuIdx === 1) { B.bagMode = 'ball'; B.phase = 'bag'; B.bagIdx = 0; }
      else if (B.menuIdx === 2) { B.phase = 'switch'; B.switchIdx = B.activeIdx; }
      else if (B.menuIdx === 3) { B.phase = 'msg'; attemptRun(); }
    }
  }
  function updateFight() {
    const moves = me().moves;
    if (MQ.Input.consume('b')) { B.phase = 'menu'; return; }
    if (MQ.Input.consume('up') || MQ.Input.consume('left')) B.moveIdx = (B.moveIdx + moves.length - 1) % moves.length;
    if (MQ.Input.consume('down') || MQ.Input.consume('right')) B.moveIdx = (B.moveIdx + 1) % moves.length;
    if (MQ.Input.consume('a')) {
      const slot = moves[B.moveIdx];
      if (slot.pp <= 0) { B.phase = 'msg'; say('没有PP了！'); doEv(() => B.phase = 'fight'); return; }
      B.phase = 'msg'; resolveTurn({ kind: 'move', moveIdx: B.moveIdx });
    }
  }
  function updateSwitch(forced) {
    const party = MQ.Game.state.party;
    if (!forced && MQ.Input.consume('b')) { B.phase = 'menu'; return; }
    if (MQ.Input.consume('up') || MQ.Input.consume('left')) B.switchIdx = (B.switchIdx + party.length - 1) % party.length;
    if (MQ.Input.consume('down') || MQ.Input.consume('right')) B.switchIdx = (B.switchIdx + 1) % party.length;
    if (MQ.Input.consume('a')) {
      const i = B.switchIdx;
      if (party[i].curHp <= 0) { B.phase = 'msg'; say('这只怪兽无法战斗！'); doEv(() => B.phase = forced ? 'switchForced' : 'switch'); return; }
      if (i === B.activeIdx) { B.phase = 'msg'; say('它已经在场上了！'); doEv(() => B.phase = forced ? 'switchForced' : 'switch'); return; }
      if (forced) {
        B.phase = 'msg';
        B.activeIdx = i; sendOutPlayerSilent();
        say(`去吧，${nick(me())}！`);
        doEv(() => { B.phase = 'menu'; });
      } else {
        B.phase = 'msg'; resolveTurn({ kind: 'switch', index: i });
      }
    }
  }
  function updateBag() {
    const list = bagList();
    if (MQ.Input.consume('b')) { B.phase = 'menu'; return; }
    if (MQ.Input.consume('up')) B.bagIdx = (B.bagIdx + list.length - 1) % Math.max(1, list.length);
    if (MQ.Input.consume('down')) B.bagIdx = (B.bagIdx + 1) % Math.max(1, list.length);
    if (MQ.Input.consume('a')) {
      if (!list.length) return;
      const id = list[B.bagIdx];
      B.phase = 'msg';
      if (B.bagMode === 'ball') resolveTurn({ kind: 'ball', item: id });
      else resolveTurn({ kind: 'item', item: id });
    }
  }
  function bagList() {
    const cats = B.bagMode === 'ball' ? ['ball'] : ['heal', 'cure', 'revive'];
    return Object.keys(MQ.Game.state.bag).filter(id => cats.includes((util.item(id) || {}).cat));
  }

  // ---------- turn simulation ----------
  function resolveTurn(playerAction) {
    const foeAction = chooseFoeAction();
    const meActor = me(), foeActor = foe();

    if (playerAction.kind === 'ball') { simCatch(playerAction.item, foeAction, foeActor); finishTurnTail(); return; }
    if (playerAction.kind === 'item') { simItem(playerAction.item); if (!B._ended) foeMoveStep(foeAction, foeActor); residualAndTail(); return; }
    if (playerAction.kind === 'switch') {
      B.activeIdx = playerAction.index; sendOutPlayerSilent();
      say(`换上 ${nick(me())}！`);
      if (!B._ended) foeMoveStep(foeAction, foe());
      residualAndTail();
      return;
    }

    // both moves
    const pMove = util.move(meActor.moves[playerAction.moveIdx].id);
    const fMove = util.move(foeActor.moves[foeAction.moveIdx].id);
    const pPri = pMove.priority || 0, fPri = fMove.priority || 0;
    let meFirst;
    if (pPri !== fPri) meFirst = pPri > fPri;
    else {
      const ps = liveStat(meActor, 'spe', 'me'), fs = liveStat(foeActor, 'spe', 'foe');
      meFirst = ps > fs || (ps === fs && util.chance(0.5));
    }
    const seq = meFirst ? [['me', playerAction, meActor], ['foe', foeAction, foeActor]] : [['foe', foeAction, foeActor], ['me', playerAction, meActor]];
    for (const [who, act, actor] of seq) {
      if (B._ended) break;
      if (actor.curHp > 0 && (who === 'me' ? actor === me() : actor === foe())) {
        performMove(who, act.moveIdx);
        checkFaints();
      }
    }
    residualAndTail();
  }

  function foeMoveStep(foeAction, foeActor) {
    if (foeActor.curHp > 0 && foeActor === foe()) { performMove('foe', foeAction.moveIdx); checkFaints(); }
  }
  function residualAndTail() {
    if (!B._ended) { endOfTurn(); checkFaints(); }
    finishTurnTail();
  }
  function finishTurnTail() {
    if (B._ended) return;
    // decide post-turn control
    if (me().curHp <= 0) {
      if (MQ.Game.partyAlive()) doEv(() => { B.phase = 'switchForced'; B.switchIdx = MQ.Game.state.party.findIndex(m => m.curHp > 0); });
      else { lose(); }
    } else {
      doEv(() => { B.phase = 'menu'; });
    }
  }

  // ---------- move execution (mutates state, emits events) ----------
  function performMove(who, moveIdx) {
    const attacker = who === 'me' ? me() : foe();
    const defender = who === 'me' ? foe() : me();
    const defWho = who === 'me' ? 'foe' : 'me';
    if (attacker.curHp <= 0) return;

    if (attacker.status === 'sleep') {
      if (attacker.statusTurns > 0) { attacker.statusTurns--; say(`${nick(attacker)} 睡得正香。`); return; }
      attacker.status = null; say(`${nick(attacker)} 醒来了！`);
    }
    if (attacker.status === 'freeze') {
      if (util.chance(0.2)) { attacker.status = null; say(`${nick(attacker)} 解冻了！`); }
      else { say(`${nick(attacker)} 被冻住了，无法动弹！`); return; }
    }
    if (attacker._recharge) { attacker._recharge = false; say(`${nick(attacker)} 必须休息！`); return; }
    if (attacker.status === 'paralyze' && util.chance(0.25)) { say(`${nick(attacker)} 全身麻痹，无法行动！`); return; }

    const slot = attacker.moves[moveIdx];
    const mv = util.move(slot.id);
    slot.pp = Math.max(0, slot.pp - 1);
    say(`${nick(attacker)} 使用了 ${mv.name}！`);

    if (mv.accuracy != null) {
      const accMul = stageMul(sideOf(who).acc) / stageMul(sideOf(defWho).eva);
      if (!util.chance(util.clamp((mv.accuracy / 100) * accMul, 0.05, 1))) { say('但是没有命中！'); return; }
    }

    if (mv.category === 'status') { applyEffect(who, defWho, attacker, defender, mv, 0, true); return; }

    const crit = util.chance(0.0625);
    const eff = util.effectiveness(mv.type, util.monByDex(defender.dex).types);
    if (eff === 0) { say(`对 ${nick(defender)} 没有效果……`); return; }
    const dmg = calcDamage(attacker, defender, who, defWho, mv, crit, eff);
    defender.curHp = util.clamp(defender.curHp - dmg, 0, defender.maxHp);
    showHp(defender, defWho);
    if (crit) say('击中要害！');
    const lbl = util.effLabel(eff);
    if (lbl) say(lbl);

    if (mv.effect) applyEffect(who, defWho, attacker, defender, mv, dmg, false);
  }

  function calcDamage(attacker, defender, who, defWho, mv, crit, eff) {
    const L = attacker.level;
    const physical = mv.category === 'physical';
    let A = liveStat(attacker, physical ? 'atk' : 'spa', who);
    let D = liveStat(defender, physical ? 'def' : 'spd', defWho);
    if (crit) { A = Math.max(A, Species.stats(attacker)[physical ? 'atk' : 'spa']); D = Math.min(D, Species.stats(defender)[physical ? 'def' : 'spd']); }
    let dmg = Math.floor(Math.floor(Math.floor((2 * L / 5 + 2) * mv.power * A / D) / 50) + 2);
    const stab = util.monByDex(attacker.dex).types.includes(mv.type) ? 1.5 : 1;
    let mod = stab * eff * (crit ? 1.5 : 1) * (0.85 + Math.random() * 0.15);
    const dside = B.side[defWho];
    if (physical && dside.reflect > 0) mod *= 0.6;
    if (!physical && dside.lightscreen > 0) mod *= 0.6;
    return Math.max(1, Math.floor(dmg * mod));
  }

  function applyEffect(who, defWho, attacker, defender, mv, dmg, isStatusMove) {
    const e = mv.effect;
    if (!e) return;
    // secondary effects on damaging moves are chance-gated and skip if target fainted
    if (!isStatusMove) {
      if (defender.curHp <= 0 && e.kind !== 'recoil' && e.kind !== 'recharge' && e.kind !== 'drain') return;
      if (mv.effectChance && mv.effectChance < 1 && !util.chance(mv.effectChance)) return;
    }
    switch (e.kind) {
      case 'status': {
        const tgt = defender;
        if (tgt.status) { if (isStatusMove) say(`${nick(tgt)} 已经处于异常状态了。`); break; }
        if (canStatus(tgt, e.status)) {
          tgt.status = e.status; tgt.statusTurns = e.status === 'sleep' ? util.rand(1, 3) : 0; tgt._toxicCounter = e.status === 'toxic' ? 1 : 0;
          say(`${nick(tgt)} ${statusVerb(e.status)}`);
        } else if (isStatusMove) say('但是失败了！');
        break;
      }
      case 'statChange': {
        const self = e.target === 'self';
        const stages = self ? sideOf(who) : sideOf(defWho);
        const inst = self ? attacker : defender;
        changeStat(stages, e.stat, e.stages, inst);
        if (e.also) changeStat(stages, e.also, e.stages, inst);
        break;
      }
      case 'heal': {
        const before = attacker.curHp;
        attacker.curHp = util.clamp(attacker.curHp + Math.floor(attacker.maxHp * (e.fraction || 0.5)), 0, attacker.maxHp);
        if (attacker.curHp > before) { showHp(attacker, who); say(`${nick(attacker)} 回复了体力！`); }
        else if (isStatusMove) say('但是体力已满！');
        break;
      }
      case 'rest': {
        attacker.curHp = attacker.maxHp; attacker.status = 'sleep'; attacker.statusTurns = 2; showHp(attacker, who);
        say(`${nick(attacker)} 睡着并完全恢复了！`); break;
      }
      case 'recoil': { const r = Math.max(1, Math.floor(dmg * 0.33)); attacker.curHp = util.clamp(attacker.curHp - r, 0, attacker.maxHp); showHp(attacker, who); say(`${nick(attacker)} 受到了反作用力的伤害！`); break; }
      case 'drain': { const h = Math.max(1, Math.floor(dmg * 0.5)); const b = attacker.curHp; attacker.curHp = util.clamp(attacker.curHp + h, 0, attacker.maxHp); if (attacker.curHp > b) { showHp(attacker, who); say('吸取了对手的体力！'); } break; }
      case 'recharge': { attacker._recharge = true; break; }
      case 'screen': { const s = B.side[who]; if (e.screen === 'special') s.lightscreen = 5; else s.reflect = 5; s.lightscreen = s.lightscreen || 5; s.reflect = s.reflect || 5; say(`${nick(attacker)} 张开了防护屏障！`); break; }
      case 'hazard': { changeStat(sideOf(defWho), 'spe', -1, defender); break; }
      case 'curse': { const d = Math.floor(defender.maxHp * 0.25); defender.curHp = util.clamp(defender.curHp - d, 0, defender.maxHp); showHp(defender, defWho); say(`诅咒缠上了 ${nick(defender)}！`); break; }
      default: if (isStatusMove) say('但是什么都没有发生……');
    }
  }

  function changeStat(stages, stat, delta, inst) {
    const before = stages[stat] || 0;
    stages[stat] = util.clamp(before + delta, -6, 6);
    const real = stages[stat] - before;
    const names = { atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度', acc: '命中', eva: '闪避' };
    if (real === 0) { say(`${nick(inst)} 的${names[stat]}已经无法${delta > 0 ? '提升' : '降低'}了！`); return; }
    say(`${nick(inst)} 的${names[stat]}${Math.abs(delta) >= 2 ? '大幅' : ''}${delta > 0 ? '提升' : '下降'}了！`);
  }
  function canStatus(inst, status) {
    const types = util.monByDex(inst.dex).types;
    if (status === 'burn' && types.includes('fire')) return false;
    if ((status === 'poison' || status === 'toxic') && (types.includes('poison') || types.includes('steel'))) return false;
    if (status === 'paralyze' && types.includes('electric')) return false;
    if (status === 'freeze' && types.includes('ice')) return false;
    return true;
  }
  function statusVerb(s) { return { burn: '被灼伤了！', poison: '中毒了！', toxic: '陷入了剧毒！', paralyze: '麻痹了，可能无法行动！', sleep: '睡着了！', freeze: '被冰冻了！' }[s] || '陷入了异常状态！'; }

  function endOfTurn() {
    for (const s of ['me', 'foe']) { if (B.side[s].reflect > 0) B.side[s].reflect--; if (B.side[s].lightscreen > 0) B.side[s].lightscreen--; }
    for (const [who, inst] of [['me', me()], ['foe', foe()]]) {
      if (inst.curHp <= 0) continue;
      let dmg = 0, msg = null;
      if (inst.status === 'burn') { dmg = Math.max(1, Math.floor(inst.maxHp / 16)); msg = `${nick(inst)} 受到了灼伤的伤害！`; }
      else if (inst.status === 'poison') { dmg = Math.max(1, Math.floor(inst.maxHp / 8)); msg = `${nick(inst)} 受到了中毒的伤害！`; }
      else if (inst.status === 'toxic') { inst._toxicCounter = inst._toxicCounter || 1; dmg = Math.max(1, Math.floor(inst.maxHp * inst._toxicCounter / 16)); inst._toxicCounter++; msg = `${nick(inst)} 受到了剧毒的折磨！`; }
      if (dmg) { inst.curHp = util.clamp(inst.curHp - dmg, 0, inst.maxHp); showHp(inst, who); say(msg); }
      if (inst.heldItem === 'item_leftovers' && inst.curHp > 0 && inst.curHp < inst.maxHp) { inst.curHp = util.clamp(inst.curHp + Math.floor(inst.maxHp / 16), 0, inst.maxHp); showHp(inst, who); }
    }
  }

  // ---------- catching / items / run ----------
  function simCatch(itemId, foeAction, foeActor) {
    if (B.type === 'trainer') { say('不能捕捉别人的怪兽！'); return; }
    MQ.Game.removeItem(itemId, 1);
    const item = util.item(itemId), f = foe();
    say(`${MQ.Game.state.player.name} 投出了 ${item.name}！`);
    const sp = util.monByDex(f.dex);
    const ball = item.ballRate || 1;
    const statusMod = (f.status === 'sleep' || f.status === 'freeze') ? 2.5 : (f.status ? 1.5 : 1);
    const a = (((3 * f.maxHp - 2 * f.curHp) * sp.catchRate * ball) / (3 * f.maxHp)) * statusMod;
    let caught, shakes = 4;
    if (a >= 255 || ball >= 255) caught = true;
    else {
      const shakeProb = 65536 / Math.pow(255 / a, 0.1875);
      caught = true;
      for (let i = 0; i < 4; i++) if (util.rand(0, 65535) >= shakeProb) { caught = false; shakes = i; break; }
    }
    doEv(() => { B.shakeCount = shakes; });
    if (caught) {
      say(`太好了！成功捕获了 ${nick(f)}！`);
      const inst = Species.create(f.dex, f.level, { ivs: f.ivs, nature: f.nature, curHp: f.curHp });
      inst.status = f.status; inst.exp = f.exp;
      MQ.Game.giveMonster(inst); MQ.Game.state.stats.caught++; MQ.Game.markCaught(f.dex);
      say(`${nick(f)} 的数据已记录到图鉴。`);
      if (MQ.Game.state.party.length === 1 || MQ.Game.itemCount('item_dex')) { /* ok */ }
      end('caught');
    } else {
      say(['啊！差一点就抓到了！', '可恶！它挣脱了！', '怪兽跳了出来！', '就差那么一点点……'][util.clamp(shakes, 0, 3)]);
      if (!B._ended) foeMoveStep(foeAction, foeActor);
      if (!B._ended) { endOfTurn(); checkFaints(); }
    }
  }

  function simItem(itemId) {
    MQ.Game.removeItem(itemId, 1);
    const item = util.item(itemId), target = me();
    say(`使用了 ${item.name}。`);
    if (item.cat === 'heal') { target.curHp = util.clamp(target.curHp + item.heal, 0, target.maxHp); showHp(target, 'me'); say(`${nick(target)} 回复了体力。`); }
    else if (item.cat === 'cure') { if (item.cures.includes(target.status)) { target.status = null; say(`${nick(target)} 的状态恢复了。`); } else say('似乎没有效果。'); }
    else if (item.cat === 'revive') { if (target.curHp <= 0) { target.curHp = Math.floor(target.maxHp * item.reviveFraction); target.fainted = false; showHp(target, 'me'); say(`${nick(target)} 复活了。`); } }
  }

  function attemptRun() {
    if (B.type === 'trainer') { say('无法从对战中逃跑！'); doEv(() => B.phase = 'menu'); return; }
    B.runAttempts++;
    const ps = liveStat(me(), 'spe', 'me'), fs = liveStat(foe(), 'spe', 'foe');
    const odds = ps >= fs ? 1 : (((ps * 128 / Math.max(1, fs)) + 30 * B.runAttempts) / 256);
    if (util.chance(util.clamp(odds, 0.12, 1))) { say('成功逃走了！'); end('fled'); }
    else {
      say('没能逃掉！');
      const foeAction = chooseFoeAction(), foeActor = foe();
      foeMoveStep(foeAction, foeActor);
      if (!B._ended) { endOfTurn(); checkFaints(); }
      if (!B._ended) doEv(() => { B.phase = 'menu'; });
    }
  }

  // ---------- faints / exp / win-loss ----------
  function checkFaints() {
    if (B._ended) return;
    if (foe().curHp <= 0 && !foe().fainted) {
      foe().fainted = true;
      say(`${B.type === 'trainer' ? B.trainer.name + ' 的 ' : '野生的 '}${nick(foe())} 倒下了！`);
      awardExp(foe());
      const nextIdx = B.foeParty.findIndex((m, i) => i > B.foeIdx && m.curHp > 0);
      if (B.type === 'trainer' && nextIdx >= 0) {
        const ni = nextIdx;
        doEv(() => { B.foeIdx = ni; B.stages.foe = freshStages(); B.side.foe = {}; B.hpTarget.foe = foe().curHp; B.hpAnim.foe = foe().curHp; MQ.Game.markSeen(foe().dex); });
        say(`${B.trainer.name} 派出了 ${nick(B.foeParty[nextIdx])}！`);
      } else { win(); }
    }
    if (!B._ended && me().curHp <= 0 && !me().fainted) { me().fainted = true; say(`${nick(me())} 倒下了！`); }
  }

  function awardExp(fallen) {
    const base = Species.expYield(fallen, me().level, { trainer: B.type === 'trainer' });
    const alive = MQ.Game.state.party.filter(m => m.curHp > 0 && B.participants.has(m.uid));
    const recv = alive.length ? alive : [me()];
    const each = Math.max(1, Math.floor(base / recv.length));
    for (const mon of recv) {
      say(`${nick(mon)} 获得了 ${each} 点经验值！`);
      const events = Species.gainExp(mon, each);
      for (const ev of events) {
        if (ev.type !== 'levelup') continue;
        say(`${nick(mon)} 升到了 ${ev.to} 级！`);
        if (mon.uid === me().uid) { const v = mon.curHp; doEv(() => { B.hpTarget.me = v; }); }
        for (const mid of ev.learned) {
          const mvName = (util.move(mid) || {}).name || mid;
          if (mon.moves.length < 4) { Species.teachMove(mon, mid); say(`${nick(mon)} 学会了 ${mvName}！`); }
          else { say(`${nick(mon)} 似乎想学会 ${mvName}。（招式已满，可在菜单调整）`); }
        }
        const evoTo = Species.evolutionFor(mon);
        if (evoTo) mon._evolveTo = evoTo;
      }
    }
  }

  function win() {
    if (B._ended) return;
    if (B.type === 'trainer') {
      say(`战胜了 ${B.trainer.name}！`);
      if (B.trainer.postBattle) say(B.trainer.postBattle);
      MQ.Game.state.player.money += B.trainer.money || 0;
      say(`获得了 ${B.trainer.money || 0} 元奖金！`);
    }
    MQ.Game.state.stats.battlesWon++;
    end('win');
  }
  function lose() { say(`${MQ.Game.state.player.name} 没有可战斗的怪兽了……`); say('眼前一黑……'); end('lose'); }

  function end(result) {
    if (B._ended) return;
    B._ended = true; B.result = result;
    doEv(() => { B.phase = 'end'; finishBattle(result); });
  }

  function finishBattle(result) {
    const trainer = B.trainer;
    MQ.Transition.fade(() => {
      const evolved = [];
      for (const mon of MQ.Game.state.party) {
        if (mon._evolveTo) { const from = nick(mon); Species.evolve(mon, mon._evolveTo); MQ.Game.markCaught(mon.dex); evolved.push([from, nick(mon)]); delete mon._evolveTo; }
      }
      MQ.Game.battle = null;
      MQ.Game.setMode('overworld');
      if (trainer && result === 'win') { trainer.defeated = true; MQ.NPCs.onTrainerDefeated(trainer); }
      else if (result === 'lose') { MQ.NPCs.blackout(); return; }
      const lines = [];
      if (evolved.length) for (const [a, b] of evolved) lines.push(`恭喜！${a} 进化成了 ${b}！`);
      if (lines.length) MQ.Dialogue.open(lines, { onDone: () => MQ.Story && MQ.Story.check() });
      else MQ.Story && MQ.Story.check();
    });
  }

  Battle.peek = () => B; // debug/verification accessor

  // ---------- AI ----------
  function chooseFoeAction() {
    const f = foe();
    const usable = f.moves.map((m, i) => ({ i, mv: util.move(m.id), pp: m.pp })).filter(x => x.pp > 0);
    if (!usable.length) return { moveIdx: 0 };
    let best = usable[0], bestScore = -1;
    for (const u of usable) {
      let score;
      if (u.mv.category === 'status') score = util.chance(0.3) ? 30 : 6;
      else {
        const eff = util.effectiveness(u.mv.type, util.monByDex(me().dex).types);
        const stab = util.monByDex(f.dex).types.includes(u.mv.type) ? 1.5 : 1;
        score = (u.mv.power || 0) * eff * stab;
      }
      score *= (0.8 + Math.random() * 0.4);
      if (score > bestScore) { bestScore = score; best = u; }
    }
    if (util.chance(0.18)) best = util.pick(usable);
    return { moveIdx: best.i };
  }

  // ---------- rendering ----------
  Battle.render = function (ctx) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#aee3ff'); sky.addColorStop(0.58, '#dff3ff'); sky.addColorStop(0.58, '#cdeba0'); sky.addColorStop(1, '#a9d479');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(120,170,90,0.5)';
    ctx.beginPath(); ctx.ellipse(W * 0.74, H * 0.36, 100, 26, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W * 0.26, H * 0.64, 124, 30, 0, 0, 7); ctx.fill();

    const f = foe(), m = me();
    const foeSpr = MQ.Render.monsterSprite(f.dex, 112);
    const shakeX = (B.shake > 0 ? Math.sin(B.anim * 50) * 3 : 0);
    ctx.drawImage(foeSpr, W * 0.74 - 56 + (B._lastHit === 'foe' ? shakeX : 0), H * 0.36 - 98);
    const meSpr = MQ.Render.monsterSprite(m.dex, 140);
    ctx.drawImage(meSpr, W * 0.26 - 70 + (B._lastHit === 'me' ? shakeX : 0), H * 0.64 - 120);

    drawHpBox(ctx, 22, 22, f, false);
    drawHpBox(ctx, W - 22 - 252, H * 0.48, m, true);

    if (B.msgs.length && B.msgs[0].t === 'say') drawPanel(ctx, B.msgs[0].text);
    else if (B.phase === 'menu') { drawPanel(ctx, `要让 ${nick(m)} 做什么？`); drawActionMenu(ctx); }
    else if (B.phase === 'fight') drawMoveMenu(ctx);
    else if (B.phase === 'switch' || B.phase === 'switchForced') drawSwitchMenu(ctx);
    else if (B.phase === 'bag') drawBagMenu(ctx);
    else drawPanel(ctx, '');
  };

  function drawHpBox(ctx, x, y, inst, mine) {
    const w = 252, h = 58;
    ctx.fillStyle = 'rgba(250,250,252,0.93)'; MQ.roundRect(ctx, x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = '#3a4a5a'; ctx.lineWidth = 2; MQ.roundRect(ctx, x, y, w, h, 8); ctx.stroke();
    ctx.fillStyle = '#222'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(nick(inst), x + 10, y + 7);
    ctx.font = '12px sans-serif'; ctx.fillText('Lv' + inst.level, x + w - 44, y + 8);
    if (inst.status) {
      const sc = { burn: '#e36', poison: '#a4e', toxic: '#83b', paralyze: '#c93', sleep: '#789', freeze: '#5cf' }[inst.status] || '#888';
      ctx.fillStyle = sc; MQ.roundRect(ctx, x + 10, y + 26, 30, 14, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif';
      ctx.fillText({ burn: '灼伤', poison: '中毒', toxic: '剧毒', paralyze: '麻痹', sleep: '睡眠', freeze: '冰冻' }[inst.status] || '', x + 13, y + 29);
    }
    const barX = x + 46, barY = y + 30, barW = w - 58;
    ctx.fillStyle = '#444'; MQ.roundRect(ctx, barX, barY, barW, 9, 4); ctx.fill();
    const shown = B.hpAnim[mine ? 'me' : 'foe'] != null ? B.hpAnim[mine ? 'me' : 'foe'] : inst.curHp;
    const ratio = util.clamp(shown / inst.maxHp, 0, 1);
    ctx.fillStyle = ratio > 0.5 ? '#52d452' : ratio > 0.2 ? '#f3c43b' : '#e8503a';
    MQ.roundRect(ctx, barX, barY, Math.max(2, barW * ratio), 9, 4); ctx.fill();
    if (mine) {
      ctx.fillStyle = '#222'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(`${Math.ceil(shown)}/${inst.maxHp}`, x + w - 8, y + 41); ctx.textAlign = 'left';
      const e = Species.expToNext(inst);
      ctx.fillStyle = '#2a4a6a'; MQ.roundRect(ctx, x + 6, y + h - 5, w - 12, 3, 2); ctx.fill();
      ctx.fillStyle = '#4ad0e8'; MQ.roundRect(ctx, x + 6, y + h - 5, (w - 12) * util.clamp(e.cur / e.need, 0, 1), 3, 2); ctx.fill();
    }
  }
  function drawPanel(ctx, text) {
    const W = ctx.canvas.width, H = ctx.canvas.height, py = H - 116;
    ctx.fillStyle = 'rgba(15,18,28,0.94)'; MQ.roundRect(ctx, 8, py, W - 16, 108, 12); ctx.fill();
    ctx.strokeStyle = '#5aa0e0'; ctx.lineWidth = 3; MQ.roundRect(ctx, 8, py, W - 16, 108, 12); ctx.stroke();
    if (text) { ctx.fillStyle = '#fff'; ctx.font = '18px "PingFang SC", sans-serif'; ctx.textAlign = 'left'; ctx.fillText(text, 28, py + 22); }
  }
  function drawActionMenu(ctx) {
    const W = ctx.canvas.width, H = ctx.canvas.height, py = H - 116;
    const bx = W - 280, by = py + 22;
    for (let i = 0; i < MENU.length; i++) {
      const cx = bx + (i % 2) * 132, cy = by + Math.floor(i / 2) * 38;
      ctx.fillStyle = i === B.menuIdx ? '#ffd54a' : '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText((i === B.menuIdx ? '▶' : '  ') + MENU[i], cx, cy);
    }
  }
  function drawMoveMenu(ctx) {
    const H = ctx.canvas.height, py = H - 116; drawPanel(ctx, '');
    const moves = me().moves;
    for (let i = 0; i < 4; i++) {
      const slot = moves[i]; if (!slot) continue; const mv = util.move(slot.id);
      const x = 28 + (i % 2) * 250, y = py + 18 + Math.floor(i / 2) * 34;
      ctx.fillStyle = i === B.moveIdx ? '#ffd54a' : '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText((i === B.moveIdx ? '▶' : '  ') + mv.name, x, y);
    }
    const sel = util.move(moves[B.moveIdx].id);
    ctx.fillStyle = util.typeColor(sel.type); ctx.font = '13px sans-serif';
    ctx.fillText(`${util.typeName(sel.type)} · ${sel.category === 'status' ? '变化' : sel.category === 'physical' ? '物理' : '特殊'} · 威力${sel.power || '-'} · PP ${moves[B.moveIdx].pp}/${moves[B.moveIdx].maxpp}`, 28, py + 92);
  }
  function drawSwitchMenu(ctx) {
    const H = ctx.canvas.height, py = H - 116; drawPanel(ctx, '换上哪只怪兽？');
    MQ.Game.state.party.forEach((mon, i) => {
      const x = 28 + (i % 2) * 260, y = py + 30 + Math.floor(i / 2) * 26;
      const dead = mon.curHp <= 0;
      ctx.fillStyle = i === B.switchIdx ? '#ffd54a' : (dead ? '#888' : '#fff'); ctx.font = '14px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`${i === B.switchIdx ? '▶' : '  '}${nick(mon)} Lv${mon.level} ${Math.ceil(mon.curHp)}/${mon.maxHp}${i === B.activeIdx ? '（场上）' : ''}`, x, y);
    });
  }
  function drawBagMenu(ctx) {
    const H = ctx.canvas.height, py = H - 116; drawPanel(ctx, B.bagMode === 'ball' ? '使用哪种球？' : '使用哪种道具？');
    const list = bagList();
    if (!list.length) { ctx.fillStyle = '#bbb'; ctx.font = '14px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('（没有可用的道具）', 28, py + 40); return; }
    list.slice(0, 8).forEach((id, i) => {
      const it = util.item(id), y = py + 28 + i * 22;
      ctx.fillStyle = i === B.bagIdx ? '#ffd54a' : '#fff'; ctx.font = '14px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`${i === B.bagIdx ? '▶' : '  '}${it.name} ×${MQ.Game.state.bag[id]}`, 28, y);
    });
  }

})(window.MQ);
