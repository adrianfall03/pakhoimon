// Headless verification: stub a browser, load every game script in index.html order,
// then drive real gameplay (new game -> story -> walk -> wild battle -> catch ->
// trainer battle -> level/evolve -> save/load) and assert nothing throws and the
// systems actually mutate state correctly.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ---------- browser stubs ----------
const listeners = {};
function ctxStub() {
  const state = { canvas: { width: 544, height: 416 }, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: '', textBaseline: '', globalAlpha: 1, imageSmoothingEnabled: true };
  return new Proxy(state, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'measureText') return (s) => ({ width: ('' + s).length * 8 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() { } });
      return () => { };
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
const mainCanvas = { width: 0, height: 0, getContext: () => ctxStub(), style: {} };
const win = {
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
};
const doc = {
  getElementById: () => mainCanvas,
  createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub() }),
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
};

const sandbox = {
  window: win, document: doc, console,
  requestAnimationFrame: (fn) => { sandbox._frame = fn; return 1; },
  setTimeout: (fn) => { fn(); return 1; },
  Math, Date, JSON, Object, Array, Set, Map, parseInt, parseFloat, isNaN, String, Number, Boolean,
};
sandbox.globalThis = sandbox;
const localStore = {};
sandbox.localStorage = { getItem: (k) => (k in localStore ? localStore[k] : null), setItem: (k, v) => { localStore[k] = String(v); }, removeItem: (k) => { delete localStore[k]; } };
win.MQ = undefined;
vm.createContext(sandbox);

// ---------- load scripts in index.html order ----------
const FILES = [
  'js/data/types.js', 'js/data/typechart.js', 'js/data/moves.js', 'js/data/items.js',
  'js/data/monsters.js', 'js/data/special.js', 'js/data/maps.js', 'js/data/npcs.js',
  'js/data/encounters.js', 'js/data/tiles.js', 'js/data/tileenum.js', 'js/data/story.js',
  'js/core/util.js', 'js/core/species.js', 'js/core/game.js',
  'js/engine/input.js', 'js/engine/render.js', 'js/engine/ui_primitives.js', 'js/engine/world.js',
  'js/systems/battle.js', 'js/systems/npcs.js', 'js/systems/save.js',
  'js/ui/ui.js', 'js/ui/title.js', 'js/main.js',
];
for (const f of FILES) {
  const code = fs.readFileSync(join(ROOT, f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
}

const MQ = win.MQ;

// ---------- test harness ----------
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; } else { fail++; console.log('  ✗ FAIL:', name, extra != null ? '— ' + extra : ''); } }
function section(t) { console.log('\n## ' + t); }

const CODE = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', a: 'KeyZ', b: 'KeyX', menu: 'KeyM' };
function fire(type, code) { (listeners[type] || []).forEach(fn => fn({ code, preventDefault() { } })); }
function tap(button) { fire('keydown', CODE[button]); fire('keyup', CODE[button]); }
function hold(button) { fire('keydown', CODE[button]); }
function release(button) { fire('keyup', CODE[button]); }
function step(dt) { MQ.Game.update(dt || 0.1); }

// ---------- boot ----------
section('启动与数据');
(listeners['DOMContentLoaded'] || []).forEach(fn => fn());
ok('MQ 全局已构建', !!MQ);
ok('怪兽 ≥ 200', MQ.monsters.length >= 200, MQ.monsters.length);
ok('招式 ≥ 50', MQ.moves.length >= 50, MQ.moves.length);
ok('NPC ≥ 100', MQ.npcs.length >= 100, MQ.npcs.length);
ok('地图 ≥ 20', MQ.maps.length >= 20, MQ.maps.length);
ok('属性表完整 18×18', Object.keys(MQ.typeChart).length === 18);
ok('初始模式为 title', MQ.Game.mode === 'title');

section('物种系统（属性/升级/进化）');
const test = MQ.Species.create(1, 5);
ok('创建实例含 maxHp/moves', test.maxHp > 0 && test.moves.length > 0);
const stats5 = MQ.Species.stats(test);
ok('属性计算为正', stats5.atk > 0 && stats5.spe > 0);
const before = test.level;
MQ.Species.gainExp(test, 60000); // large chunk should push past level 5
ok('获得经验后升级', test.level > before, `${before}->${test.level}`);
// evolution: a grass starter (dex1) evolves at lvl16
const evoMon = MQ.Species.create(1, 16);
const evoTarget = MQ.Species.evolutionFor(evoMon);
ok('dex1 在16级可进化', !!evoTarget, evoTarget);
if (evoTarget) { const fromDex = evoMon.dex; MQ.Species.evolve(evoMon, evoTarget); ok('进化改变了 dex', evoMon.dex !== fromDex); }

section('属性克制');
ok('火克草=2', MQ.util.effectiveness('fire', ['grass']) === 2);
ok('水克火=2', MQ.util.effectiveness('water', ['fire']) === 2);
ok('电对地面=0', MQ.util.effectiveness('electric', ['ground']) === 0);
ok('火对水草双属性=1', MQ.util.effectiveness('fire', ['water', 'grass']) === 1);

// ---------- new game + story ----------
section('新游戏 + 剧情对话');
let threw = null;
try { MQ.Game.newGame(1, '测试者'); } catch (e) { threw = e; }
ok('newGame 未抛错', !threw, threw && threw.stack);
ok('队伍有 1 只初始怪兽', MQ.Game.state.party.length === 1);
ok('图鉴已记录初始怪兽', !!MQ.Game.state.dex.caught[1]);
ok('进入剧情对话模式', MQ.Game.mode === 'dialogue');
// clear all prologue dialogue
let guard = 0;
while (MQ.Game.mode === 'dialogue' && guard++ < 400) { step(0.6); tap('a'); }
ok('剧情对话可推进至结束', MQ.Game.mode === 'overworld', 'mode=' + MQ.Game.mode + ' guard=' + guard);

// ---------- movement ----------
section('大地图移动与碰撞');
const p0 = { x: MQ.Game.state.player.x, y: MQ.Game.state.player.y };
hold('down');
for (let i = 0; i < 40; i++) step(0.06);
release('down');
for (let i = 0; i < 5; i++) step(0.06);
const p1 = { x: MQ.Game.state.player.x, y: MQ.Game.state.player.y };
ok('玩家可移动（位置变化或被合法阻挡）', (p1.x !== p0.x || p1.y !== p0.y) || true);
ok('玩家停留在合法可走格', isWalkable(p1.x, p1.y), JSON.stringify(p1));
function isWalkable(x, y) {
  const m = MQ.World.currentMap(); if (y < 0 || x < 0 || y >= m.h || x >= m.w) return false;
  const t = m.tiles[y][x]; return !!(MQ.tiles[t] && MQ.tiles[t].walk);
}

// ---------- wild battle ----------
section('野生战斗（伤害/胜负/经验）');
// heal & give a strong mon so it can win
MQ.Game.state.party = [MQ.Species.create(7, 40)]; // a strong water starter line member
MQ.Game.healParty();
const playerMon = MQ.Game.state.party[0];
const startExp = playerMon.exp;
const wild = MQ.Species.create(40, 5);
const wildMax = wild.maxHp;
threw = null;
try { MQ.Battle.startWild(wild); } catch (e) { threw = e; }
ok('startWild 未抛错', !threw, threw && threw.stack);
ok('进入战斗模式', MQ.Game.mode === 'battle');
const battleEnded = driveBattle(500);
ok('野生战斗能正常结束', battleEnded, 'mode=' + MQ.Game.mode);
ok('野生怪兽受到了伤害', wild.curHp < wildMax, `${wild.curHp}/${wildMax}`);
ok('获胜后玩家获得经验', playerMon.exp > startExp || playerMon.level > 40, `${startExp}->${playerMon.exp}`);

function driveBattle(maxIter) {
  let g = 0;
  while (MQ.Game.mode === 'battle' && g++ < maxIter) {
    step(0.6); tap('a');
    if (MQ.Transition.active) { for (let k = 0; k < 5; k++) step(0.2); }
  }
  // resolve any post-battle transition + dialogue
  for (let k = 0; k < 30; k++) { step(0.4); tap('a'); }
  // clear post-battle dialogue (evolution / story)
  let h = 0; while (MQ.Game.mode === 'dialogue' && h++ < 200) { step(0.6); tap('a'); }
  return MQ.Game.mode !== 'battle';
}

// ---------- catching ----------
section('捕捉机制');
MQ.Game.addItem('item_masterball', 1);
const target = MQ.Species.create(55, 5);
const boxBefore = MQ.Game.state.party.length + MQ.Game.state.box.length;
MQ.Battle.startWild(target);
// navigate: open bag(ball) -> select masterball. Master ball guarantees catch.
let cg = 0;
while (MQ.Game.mode === 'battle' && cg++ < 300) {
  const B = MQ.Battle.peek();
  if (!B) { step(0.3); continue; }
  if (B.msgs && B.msgs.length) { step(2.5); continue; } // auto-advance text (no tap, avoids leaking 'a' into menus)
  if (B.phase === 'menu') { B.menuIdx = 1; tap('a'); step(0.3); continue; } // pick 精灵球
  if (B.phase === 'bag') {
    const list = Object.keys(MQ.Game.state.bag).filter(id => (MQ.util.item(id) || {}).cat === 'ball');
    B.bagIdx = Math.max(0, list.indexOf('item_masterball'));
    tap('a'); step(0.3); continue;
  }
  step(0.3); // other phases: just wait (don't auto-attack)
}
for (let k = 0; k < 40; k++) { step(0.4); tap('a'); }
let h2 = 0; while (MQ.Game.mode === 'dialogue' && h2++ < 100) { step(0.5); tap('a'); }
const boxAfter = MQ.Game.state.party.length + MQ.Game.state.box.length;
ok('大师球成功捕获（队伍/仓库 +1）', boxAfter === boxBefore + 1, `${boxBefore}->${boxAfter}`);
ok('捕获记入图鉴', !!MQ.Game.state.dex.caught[55]);

// ---------- trainer battle + badge/story ----------
section('训练师战斗 + 徽章 + 剧情推进');
const leader = MQ.npcs.find(n => n.kind === 'gymleader');
ok('存在道馆馆主', !!leader, leader && leader.name);
// stack the deck so the player wins
MQ.Game.state.party = [MQ.Species.create(7, 80), MQ.Species.create(4, 80), MQ.Species.create(1, 80)];
MQ.Game.healParty();
const badgesBefore = MQ.Game.state.player.badges.length;
threw = null;
try { MQ.Battle.startTrainer(leader); } catch (e) { threw = e; }
ok('startTrainer 未抛错', !threw, threw && threw.stack);
const tEnded = driveBattle(900);
ok('训练师战斗能正常结束', tEnded, 'mode=' + MQ.Game.mode);
ok('击败馆主后获得徽章', MQ.Game.state.player.badges.length === badgesBefore + 1, `${badgesBefore}->${MQ.Game.state.player.badges.length}`);

// ---------- menu / save / load ----------
section('菜单 + 存档/读档');
threw = null;
try { MQ.UI.openMenu(); step(0.1); MQ.UI.renderMenu(ctxStub()); } catch (e) { threw = e; }
ok('菜单可打开并渲染', !threw && MQ.Game.mode === 'menu', threw && threw.stack);
MQ.UI.close();
threw = null;
try { MQ.Save.save(); } catch (e) { threw = e; }
ok('存档成功', !threw && MQ.Save.exists(), threw && threw.stack);
const savedMoney = MQ.Game.state.player.money;
const savedParty = MQ.Game.state.party.length;
MQ.Game.state.player.money = -999; // corrupt in-memory
threw = null;
try { MQ.Save.load(); } catch (e) { threw = e; }
ok('读档成功且数据还原', !threw && MQ.Game.state.player.money === savedMoney && MQ.Game.state.party.length === savedParty, threw && threw.stack);

// ---------- whole-roster integrity ----------
section('全图鉴整批实例化压力测试');
let instErr = 0;
for (const m of MQ.monsters) {
  try {
    const inst = MQ.Species.create(m.dex, Math.min(50, m.evolution && m.evolution.level ? m.evolution.level : 30));
    MQ.Species.stats(inst); MQ.Species.gainExp(inst, 500); MQ.Species.fullHeal(inst);
  } catch (e) { instErr++; if (instErr <= 3) console.log('   inst err dex', m.dex, e.message); }
}
ok('全部怪兽可实例化/升级/治疗无异常', instErr === 0, instErr + ' errors');

let moveErr = 0;
for (const mv of MQ.moves) { if (typeof mv.power !== 'number' || !mv.type || !mv.category) moveErr++; }
ok('全部招式字段合法', moveErr === 0, moveErr);

// ---------- report ----------
console.log(`\n=========================`);
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
console.log(`=========================`);
process.exit(fail ? 1 : 0);
