// Balance simulator. Loads the real data + Species system, then:
//  (1) measures win rates at even / ±2 level gaps (answers "does a 2-level deficit get crushed?")
//  (2) simulates a full critical-path playthrough: a starter team gains EXP from the real
//      route trainers + estimated wild kills, evolving as it levels, and faces each gym —
//      reporting the player's level vs the gym ace and the win rate there.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { window: {}, document: { createElement: () => ({ getContext: () => ({}) }) }, console, Math, Date, JSON, Object, Array, Set, Map, parseInt, parseFloat, isNaN, String, Number, Boolean };
sandbox.globalThis = sandbox; sandbox.window.MQ = undefined;
vm.createContext(sandbox);
for (const f of ['js/data/types.js', 'js/data/typechart.js', 'js/data/moves.js', 'js/data/items.js',
  'js/data/monsters.js', 'js/data/special.js', 'js/data/maps.js', 'js/data/npcs.js', 'js/data/encounters.js',
  'js/core/util.js', 'js/core/species.js']) {
  vm.runInContext(fs.readFileSync(join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
const MQ = sandbox.window.MQ;
MQ.util.buildIndexes();
const { util, Species } = MQ;

// ---------- lightweight battle simulator (real damage formula + type chart) ----------
function stageless(inst, key) { return Species.stats(inst)[key]; }
function dmg(att, def, mv) {
  const L = att.level, phys = mv.category === 'physical';
  const A = stageless(att, phys ? 'atk' : 'spa'), D = stageless(def, phys ? 'def' : 'spd');
  const crit = Math.random() < 0.0625;
  let base = Math.floor(Math.floor(Math.floor((2 * L / 5 + 2) * mv.power * A / D) / 50) + 2);
  const stab = util.monByDex(att.dex).types.includes(mv.type) ? 1.5 : 1;
  const eff = util.effectiveness(mv.type, util.monByDex(def.dex).types);
  if (eff === 0) return 0;
  let mod = stab * eff * (crit ? 1.5 : 1) * (0.85 + Math.random() * 0.15);
  return Math.max(1, Math.floor(base * mod));
}
function bestMove(att, def) {
  let best = null, score = -1;
  for (const slot of att.moves) {
    const mv = util.move(slot.id); if (!mv) continue;
    let s;
    if (mv.category === 'status') s = 8;
    else {
      const eff = util.effectiveness(mv.type, util.monByDex(def.dex).types);
      const stab = util.monByDex(att.dex).types.includes(mv.type) ? 1.5 : 1;
      s = (mv.power || 0) * eff * stab;
    }
    if (s > score) { score = s; best = mv; }
  }
  return best || util.move(att.moves[0].id);
}
function freshTeam(team) { return team.map(t => Species.create(t.dex, t.level)); }
function runBattle(teamA, teamB) {
  const A = freshTeam(teamA), B = freshTeam(teamB);
  let ai = 0, bi = 0, guard = 0;
  while (ai < A.length && bi < B.length && guard++ < 400) {
    const a = A[ai], b = B[bi];
    const order = stageless(a, 'spe') >= stageless(b, 'spe') ? [[a, b, 'a'], [b, a, 'b']] : [[b, a, 'b'], [a, b, 'a']];
    for (const [att, def] of order) {
      if (a.curHp <= 0 || b.curHp <= 0) break;
      const mv = bestMove(att, def);
      if (mv.category === 'status') continue;
      def.curHp -= dmg(att, def, mv);
    }
    if (a.curHp <= 0) ai++;
    if (b.curHp <= 0) bi++;
  }
  return ai >= A.length ? 'B' : 'A'; // A is player
}
function winRate(player, foe, trials = 400) {
  let w = 0; for (let i = 0; i < trials; i++) if (runBattle(player, foe) === 'A') w++;
  return w / trials;
}

function pct(x) { return (x * 100).toFixed(0) + '%'; }

// ---------- (1) level-gap sanity ----------
console.log('## 同种对战 · 等级差胜率（验证「落后2级是否被碾压」）');
const probe = [7, 40, 88, 150]; // a few representative species
function evolveForLevel(dex, lvl) { return Species.dexForLevel(dex, lvl); }
for (const L of [10, 25, 45]) {
  const samples = probe.map(d => evolveForLevel(d, L));
  const mk = (dex, lvl) => [{ dex, level: lvl }];
  let even = 0, behind2 = 0, behind4 = 0, ahead2 = 0;
  for (const d of samples) {
    even += winRate(mk(d, L), mk(d, L), 200);
    behind2 += winRate(mk(d, L - 2), mk(d, L), 200);
    behind4 += winRate(mk(d, L - 4), mk(d, L), 200);
    ahead2 += winRate(mk(d, L + 2), mk(d, L), 200);
  }
  const n = samples.length;
  console.log(`  Lv${L}基准： 同级 ${pct(even / n)} | 落后2级 ${pct(behind2 / n)} | 落后4级 ${pct(behind4 / n)} | 领先2级 ${pct(ahead2 / n)}`);
}

// ---------- (2) full critical-path playthrough ----------
console.log('\n## 主线练级模拟（单初始怪 + 2只捕获，经验共享）');
const npcs = MQ.npcs, enc = MQ.encounters, maps = MQ.maps;
const mapById = new Map(maps.map(m => [m.id, m]));
const order = ['route_01', 'town_riverside', 'route_02', 'forest_verdant', 'town_thunder', 'route_03',
  'town_harbor', 'route_04', 'cave_coral', 'town_stone', 'route_05', 'town_mist', 'route_06', 'town_ember',
  'cave_magma', 'route_07', 'town_frost', 'route_08', 'town_sky', 'route_victory'];

// representative player roster: a starter + 5 caught mons spanning diverse types (a real
// player diversifies to answer different gyms). All level together and evolve.
const baseMons = MQ.monsters.filter(m => !m.evolvesFrom && (m.category === 'common' || m.category === 'uncommon'));
const wantTypes = ['fire', 'grass', 'electric', 'rock', 'psychic', 'ice', 'fighting', 'ghost', 'dragon', 'flying'];
const picks = [];
const usedTypes = new Set(['water']); // starter is water
for (const ty of wantTypes) {
  if (picks.length >= 5) break;
  const cand = baseMons.find(m => m.types.includes(ty) && !m.types.some(t => usedTypes.has(t)) && !picks.includes(m));
  if (cand) { picks.push(cand); cand.types.forEach(t => usedTypes.add(t)); }
}
while (picks.length < 5) { const c = util.pick(baseMons); if (!picks.includes(c)) picks.push(c); }
let party = [Species.create(7, 5), ...picks.map(m => Species.create(m.dex, 5))];

function maybeEvolve(inst) {
  let ev = Species.evolutionFor(inst);
  let g = 0;
  while (ev && g++ < 3) { Species.evolve(inst, ev); ev = Species.evolutionFor(inst); }
}
// modern shared EXP: each mon gains the full, individually level-scaled yield
function giveExpFromFoe(foe, trainer) {
  for (const m of party) { Species.gainExp(m, Species.expYield(foe, m.level, { trainer })); maybeEvolve(m); }
}
function teamLevels() { return party.map(m => m.level); }
function avgLevel() { return Math.round(party.reduce((s, m) => s + m.level, 0) / party.length); }
function maxLevel() { return Math.max(...party.map(m => m.level)); }

for (const id of order) {
  const m = mapById.get(id);
  // wild EXP: ~8 kills at the route's level band
  if (m && m.encounter && enc[m.encounter]) {
    const t = enc[m.encounter].table; const lo = Math.min(...t.map(x => x.min)), hi = Math.max(...t.map(x => x.max));
    for (let k = 0; k < 8; k++) {
      const lvl = lo + Math.floor(Math.random() * (hi - lo + 1));
      giveExpFromFoe(Species.create(util.pick(t).dex, lvl), false);
    }
  }
  // trainer EXP: every trainer mon on this map
  for (const n of npcs.filter(x => x.map === id && x.kind === 'trainer' && x.team)) {
    for (const tm of n.team) giveExpFromFoe(Species.create(tm.dex, tm.level), true);
  }
  // at a gym town, fight the leader
  const leader = npcs.find(x => x.kind === 'gymleader' && x.map === 'int_gym_' + id);
  if (leader) {
    for (const m2 of party) { const s = Species.stats(m2); m2.maxHp = s.maxHp; m2.curHp = s.maxHp; }
    const aceLv = Math.max(...leader.team.map(t => t.level));
    const wr = winRate(party.map(m => ({ dex: m.dex, level: m.level })), leader.team, 400);
    const flag = wr >= 0.45 && wr <= 0.92 ? '✓' : (wr < 0.45 ? '⚠偏难' : '·偏易');
    console.log(`  ${leader.name.padEnd(12)} 馆主Lv${aceLv}（${leader.team.length}只） vs 玩家Lv${avgLevel()}(队伍${teamLevels().join('/')})  胜率 ${pct(wr)} ${flag}`);
  }
}

console.log('\n（健康区间：胜率 45%–92%。偏难=玩家需多练级/换属性；偏易=可加强）');
