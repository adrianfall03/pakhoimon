// Generates 200+ monsters organized into evolution families, with stats, learnsets,
// abilities, evolution methods, and dex flavor. Deterministic given the RNG seed.
import { TYPES, typeName } from './types.js';
import { ELEMENT_ROOTS, CREATURE_BASES, STAGE_PREFIX, LEGEND_TITLES } from './names.js';

const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

// Stat-spread archetypes: weights that sum to ~6, multiplied by BST/6.
const ARCHETYPES = {
  physical:  { hp: 1.0, atk: 1.5, def: 1.0, spa: 0.6, spd: 0.9, spe: 1.0 },
  special:   { hp: 1.0, atk: 0.6, def: 0.9, spa: 1.5, spd: 1.0, spe: 1.0 },
  fast:      { hp: 0.85, atk: 1.2, def: 0.7, spa: 1.0, spd: 0.8, spe: 1.45 },
  tank:      { hp: 1.4, atk: 0.9, def: 1.4, spa: 0.8, spd: 1.2, spe: 0.3 },
  wall:      { hp: 1.5, atk: 0.6, def: 1.4, spa: 0.7, spd: 1.4, spe: 0.4 },
  balanced:  { hp: 1.0, atk: 1.0, def: 1.0, spa: 1.0, spd: 1.0, spe: 1.0 },
  glassnuke: { hp: 0.8, atk: 1.6, def: 0.6, spa: 1.6, spd: 0.6, spe: 1.2 },
};

const REGIONS = ['黎明高原', '碧波海湾', '苍岩山脉', '迷雾密林', '熔火荒原', '极昼冻土'];

const ABILITY_POOL = {
  fire: ['blaze', 'flameBody'],
  water: ['torrent', 'swiftSwim'],
  grass: ['overgrow', 'chlorophyll'],
  electric: ['static', 'levitate'],
  ice: ['snowCloak', 'sturdy'],
  fighting: ['guts', 'intimidate'],
  poison: ['poisonPoint', 'corrosion'],
  ground: ['sandVeil', 'sturdy'],
  flying: ['keenEye', 'intimidate'],
  psychic: ['synchronize', 'levitate'],
  bug: ['swarm', 'compoundEyes'],
  rock: ['sturdy', 'rockHead'],
  ghost: ['levitate', 'cursedBody'],
  dragon: ['intimidate', 'roughSkin'],
  dark: ['intimidate', 'guts'],
  steel: ['sturdy', 'clearBody'],
  fairy: ['cuteCharm', 'pixilate'],
  normal: ['runAway', 'adaptability'],
};

const STONES = {
  fire: 'item_firestone', water: 'item_waterstone', electric: 'item_thunderstone',
  grass: 'item_leafstone', ice: 'item_icestone', fairy: 'item_moonstone',
  psychic: 'item_sunstone', dark: 'item_duskstone', rock: 'item_everstone',
};

const GROWTH = ['fast', 'medium', 'mediumslow', 'slow'];

const DESC_TEMPLATES = [
  '栖息于{region}，{type}属性的特征令它在族群中格外醒目。',
  '据{region}的古老传说记载，它能操纵{type}之力守护领地。',
  '{region}的居民相信遇见它会带来好运，它的{type}能量温和而坚定。',
  '生性{trait}，常出没于{region}一带，以{type}属性招式驱赶入侵者。',
  '研究者在{region}首次记录到它，惊叹于其纯粹的{type}天赋。',
];
const TRAITS = ['警觉', '温顺', '好斗', '神秘', '忠诚', '孤僻', '顽强', '机敏'];

function distributeStats(bst, archetype, rng) {
  const w = ARCHETYPES[archetype];
  const total = STATS.reduce((s, k) => s + w[k], 0);
  const out = {};
  for (const k of STATS) {
    const base = (w[k] / total) * bst;
    const jitter = 1 + (rng.next() - 0.5) * 0.16; // ±8%
    out[k] = Math.max(15, Math.round(base * jitter));
  }
  return out;
}

function buildLearnset(monster, rng) {
  const ls = [];
  const t = monster.types[0];
  const t2 = monster.types[1];
  const phys = monster.baseStats.atk >= monster.baseStats.spa;
  ls.push({ level: 1, move: phys ? 'mv_tackle' : `mv_${t}_weak` });
  ls.push({ level: 1, move: 'mv_growl' });
  ls.push({ level: 4, move: `mv_${t}_weak` });
  ls.push({ level: 7, move: phys ? 'mv_scratch' : 'mv_quickattack' });
  ls.push({ level: 10, move: 'mv_tailwhip' });
  ls.push({ level: 13, move: t === 'normal' ? 'mv_bodyslam' : `mv_${t}_status` });
  ls.push({ level: 17, move: t === 'normal' ? 'mv_bodyslam' : `mv_${t}_mid` });
  if (t2 && t2 !== 'normal') ls.push({ level: 21, move: `mv_${t2}_weak` });
  ls.push({ level: 25, move: 'mv_quickattack' });
  if (t2 && t2 !== 'normal') ls.push({ level: 30, move: `mv_${t2}_mid` });
  ls.push({ level: 34, move: t === 'normal' ? 'mv_bodyslam' : `mv_${t}_strong` });
  ls.push({ level: 40, move: 'mv_bodyslam' });
  if (monster.bst >= 500) ls.push({ level: 50, move: 'mv_hyperbeam' });
  // dedup by move keeping earliest level
  const seen = new Map();
  for (const e of ls) if (!seen.has(e.move) || seen.get(e.move).level > e.level) seen.set(e.move, e);
  return [...seen.values()].sort((a, b) => a.level - b.level);
}

export function generateMonsters(rng) {
  const monsters = [];
  const usedNames = new Set();
  let dex = 0;

  function makeName(typeId, stageIdx, stages, legendary) {
    const roots = ELEMENT_ROOTS[typeId] || [''];
    for (let attempt = 0; attempt < 60; attempt++) {
      const root = rng.pick(roots);
      const base = rng.pick(CREATURE_BASES);
      let prefix = '';
      if (legendary) prefix = rng.pick(LEGEND_TITLES);
      else if (stages > 1) {
        if (stageIdx === 0) prefix = rng.pick(STAGE_PREFIX.small);
        else if (stageIdx === stages - 1) prefix = rng.pick(STAGE_PREFIX.final);
        else prefix = rng.pick(STAGE_PREFIX.mid);
      }
      const name = (prefix + root + base).slice(0, 4);
      if (name.length >= 2 && !usedNames.has(name)) { usedNames.add(name); return name; }
    }
    // fallback guaranteed-unique
    const fb = '奇兽' + (dex + 1);
    usedNames.add(fb);
    return fb;
  }

  function makeDesc(typeId, region, rng) {
    const tpl = rng.pick(DESC_TEMPLATES);
    return tpl
      .replace('{region}', region)
      .replace('{type}', typeName(typeId))
      .replace('{trait}', rng.pick(TRAITS));
  }

  // Create one evolution family and append its members; returns array of dex numbers.
  function family(cfg) {
    const { stages, baseTypes, archetype, region, category } = cfg;
    const bstByStage = cfg.bst;
    const created = [];
    let prevId = null;
    // share a creature base across the family for visual coherence in names
    const sharedBase = rng.pick(CREATURE_BASES);

    for (let i = 0; i < stages; i++) {
      dex++;
      const id = `mon_${String(dex).padStart(3, '0')}`;
      const types = baseTypes[i] || baseTypes[baseTypes.length - 1];
      const bst = bstByStage[i];
      const stats = distributeStats(bst, archetype, rng);
      // build name with shared base
      let name;
      {
        const roots = ELEMENT_ROOTS[types[0]] || [''];
        let made = null;
        for (let a = 0; a < 40; a++) {
          const root = rng.pick(roots);
          let prefix = '';
          if (category === 'legendary' || category === 'mythical') prefix = rng.pick(LEGEND_TITLES);
          else if (stages > 1) {
            if (i === 0) prefix = rng.pick(STAGE_PREFIX.small);
            else if (i === stages - 1) prefix = rng.pick(STAGE_PREFIX.final);
            else prefix = rng.pick(STAGE_PREFIX.mid);
          }
          const candidate = (prefix + root + sharedBase).slice(0, 4);
          if (candidate.length >= 2 && !usedNames.has(candidate)) { usedNames.add(candidate); made = candidate; break; }
        }
        name = made || makeName(types[0], i, stages, category === 'legendary');
      }

      const abilityPool = [...new Set([...(ABILITY_POOL[types[0]] || []), ...(ABILITY_POOL[(types[1] || types[0])] || [])])];
      const abilities = rng.shuffle(abilityPool).slice(0, Math.min(2, abilityPool.length));
      // starters get the signature low-HP boost ability
      if (category === 'starter' && i === 0) {
        const sig = { fire: 'blaze', water: 'torrent', grass: 'overgrow' }[types[0]];
        if (sig && !abilities.includes(sig)) abilities.unshift(sig);
      }

      const catchRate = {
        starter: 45, common: 200, uncommon: 120, rare: 55, pseudo: 30, legendary: 3, mythical: 3,
      }[category];

      const mon = {
        dex, id, name, types,
        baseStats: stats,
        bst,
        abilities: abilities.length ? abilities : ['runAway'],
        catchRate,
        baseExp: Math.round(bst * 0.32 + i * 18),
        growthRate: category === 'legendary' || category === 'pseudo' ? 'slow' : rng.pick(GROWTH),
        category,
        region,
        height: +(0.3 + bst / 700 + rng.next()).toFixed(1),
        weight: +(2 + bst / 8 + rng.next() * 40).toFixed(1),
        genderless: category === 'legendary' || category === 'mythical',
        desc: makeDesc(types[0], region, rng),
        evolvesFrom: prevId,
        evolution: null,
        learnset: null,
      };
      mon.learnset = buildLearnset(mon, rng);
      monsters.push(mon);
      created.push(mon);

      if (prevId) {
        // attach evolution info to previous stage
        const prev = monsters.find(m => m.id === prevId);
        let method;
        const roll = rng.next();
        if (category === 'starter' || roll < 0.62) {
          method = { type: 'level', level: cfg.evoLevels[i - 1] };
        } else if (roll < 0.82 && STONES[types[0]]) {
          method = { type: 'stone', item: STONES[types[0]] };
        } else {
          method = { type: 'friendship', value: 200 };
        }
        prev.evolution = { to: id, ...method };
      }
      prevId = id;
    }
    return created.map(m => m.dex);
  }

  // ---------- 1. Hand-authored starters (narrative anchors) ----------
  // Grass line
  family({ stages: 3, category: 'starter', region: REGIONS[0], archetype: 'balanced',
    baseTypes: [['grass'], ['grass'], ['grass', 'fairy']], bst: [318, 410, 530], evoLevels: [16, 32] });
  // Fire line
  family({ stages: 3, category: 'starter', region: REGIONS[0], archetype: 'fast',
    baseTypes: [['fire'], ['fire'], ['fire', 'fighting']], bst: [316, 408, 530], evoLevels: [16, 32] });
  // Water line
  family({ stages: 3, category: 'starter', region: REGIONS[0], archetype: 'tank',
    baseTypes: [['water'], ['water'], ['water', 'steel']], bst: [314, 405, 530], evoLevels: [16, 32] });

  // ---------- 2. Procedural common/uncommon/rare/pseudo families ----------
  const dualChance = 0.45;
  function randomTypes() {
    const t1 = rng.pick(TYPES).id;
    if (rng.chance(dualChance)) {
      let t2 = rng.pick(TYPES).id;
      let guard = 0;
      while (t2 === t1 && guard++ < 8) t2 = rng.pick(TYPES).id;
      return t2 === t1 ? [t1] : [t1, t2];
    }
    return [t1];
  }

  const plan = [];
  for (let i = 0; i < 42; i++) plan.push('common');
  for (let i = 0; i < 30; i++) plan.push('uncommon');
  for (let i = 0; i < 20; i++) plan.push('rare');
  for (let i = 0; i < 6; i++) plan.push('pseudo');

  for (const category of rng.shuffle(plan)) {
    let stages, bst, evoLevels;
    if (category === 'common') {
      stages = rng.chance(0.5) ? 2 : (rng.chance(0.4) ? 1 : 3);
    } else if (category === 'uncommon') {
      stages = rng.chance(0.6) ? 2 : 3;
    } else if (category === 'rare') {
      stages = rng.chance(0.55) ? 1 : 2;
    } else { // pseudo
      stages = 3;
    }
    const region = rng.pick(REGIONS);
    const archetype = rng.pick(Object.keys(ARCHETYPES));
    const baseTypes = [];
    const finalTypes = randomTypes();
    for (let i = 0; i < stages; i++) {
      if (i < stages - 1 && finalTypes.length === 2 && i === 0) baseTypes.push([finalTypes[0]]);
      else baseTypes.push(finalTypes);
    }
    if (category === 'pseudo') {
      bst = [stages === 3 ? 300 : 360, 420, 600].slice(0, stages);
      evoLevels = [30, 55].slice(0, stages - 1);
    } else if (category === 'rare') {
      bst = stages === 1 ? [rng.int(480, 540)] : [rng.int(300, 340), rng.int(470, 520)];
      evoLevels = [rng.int(28, 40)].slice(0, stages - 1);
    } else if (category === 'uncommon') {
      bst = stages === 2 ? [rng.int(300, 340), rng.int(430, 480)] : [rng.int(270, 300), rng.int(360, 400), rng.int(480, 510)];
      evoLevels = stages === 2 ? [rng.int(18, 26)] : [rng.int(16, 20), rng.int(34, 40)];
    } else { // common
      if (stages === 1) bst = [rng.int(280, 340)];
      else if (stages === 2) { bst = [rng.int(250, 300), rng.int(380, 430)]; evoLevels = [rng.int(16, 24)]; }
      else { bst = [rng.int(230, 280), rng.int(330, 380), rng.int(440, 480)]; evoLevels = [rng.int(14, 18), rng.int(30, 36)]; }
    }
    family({ stages, category, region, archetype, baseTypes, bst, evoLevels: evoLevels || [] });
  }

  // ---------- 3. Legendaries & mythicals (story-tied, single-stage) ----------
  // These get fixed roles referenced by the storyline.
  const legendCfgs = [
    { types: ['dragon', 'fire'], archetype: 'glassnuke', bst: 680, region: REGIONS[4], role: 'sky' },
    { types: ['dragon', 'water'], archetype: 'tank', bst: 670, region: REGIONS[1], role: 'sea' },
    { types: ['dragon', 'ground'], archetype: 'wall', bst: 670, region: REGIONS[2], role: 'land' },
    { types: ['psychic', 'steel'], archetype: 'balanced', bst: 600, region: REGIONS[0], role: 'time' },
    { types: ['ghost', 'dragon'], archetype: 'special', bst: 600, region: REGIONS[3], role: 'space' },
    { types: ['ice', 'flying'], archetype: 'special', bst: 580, region: REGIONS[5], role: 'frost' },
    { types: ['electric', 'flying'], archetype: 'fast', bst: 580, region: REGIONS[2], role: 'storm' },
    { types: ['fire', 'flying'], archetype: 'glassnuke', bst: 580, region: REGIONS[4], role: 'flame' },
    { types: ['fairy', 'psychic'], archetype: 'special', bst: 620, region: REGIONS[0], role: 'life' },
    { types: ['dark', 'ghost'], archetype: 'glassnuke', bst: 620, region: REGIONS[3], role: 'void' },
    { types: ['steel', 'fairy'], archetype: 'wall', bst: 600, region: REGIONS[2], role: 'order' },
    { types: ['ground', 'fire'], archetype: 'physical', bst: 600, region: REGIONS[4], role: 'magma' },
  ];
  const legendaryDex = [];
  for (const lc of legendCfgs) {
    const created = family({ stages: 1, category: 'legendary', region: lc.region, archetype: lc.archetype,
      baseTypes: [lc.types], bst: [lc.bst], evoLevels: [] });
    const m = monsters.find(x => x.dex === created[0]);
    m.legendRole = lc.role;
    legendaryDex.push(m.dex);
  }
  const mythicalRoles = ['origin', 'dream', 'judge'];
  const mythicalDex = [];
  for (let i = 0; i < 3; i++) {
    const types = i === 0 ? ['normal', 'dragon'] : i === 1 ? ['psychic'] : ['steel', 'fire'];
    const created = family({ stages: 1, category: 'mythical', region: REGIONS[0], archetype: 'balanced',
      baseTypes: [types], bst: [690], evoLevels: [] });
    const m = monsters.find(x => x.dex === created[0]);
    m.mythRole = mythicalRoles[i];
    mythicalDex.push(m.dex);
  }

  return { monsters, legendaryDex, mythicalDex, regions: REGIONS };
}
