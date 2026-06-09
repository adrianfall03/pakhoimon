// Generates a coherent move list: universal Normal moves + a themed kit per type.
import { TYPES } from './types.js';

// Per-type flavored move names at tiers [weak, mid, strong, status].
const MOVE_NAMES = {
  normal:   ['撞击', '电光一闪', '破坏光线', '猛撞'],
  fire:     ['火花', '火焰轮', '大字爆炎', '日光浴'],
  water:    ['水枪', '泡沫光线', '水炮', '聚气'],
  grass:    ['藤鞭', '飞叶快刀', '日光束', '光合作用'],
  electric: ['电击', '电光', '十万伏特', '电磁波'],
  ice:      ['细雪', '冰冻光束', '暴风雪', '极光幕'],
  fighting: ['空手劈', '冲天拳', '近身战', '健美'],
  poison:   ['毒针', '污泥攻击', '污泥炸弹', '剧毒'],
  ground:   ['踩踏', '挖洞', '地震', '撒菱'],
  flying:   ['啄', '翅膀攻击', '暴风', '羽栖'],
  psychic:  ['念力', '幻象冲击', '精神强念', '冥想'],
  bug:      ['连续吓', '虫咬', '超级角击', '丝线'],
  rock:     ['落石', '岩石封锁', '尖石攻击', '硬化'],
  ghost:    ['黑夜魔影', '影子偷袭', '暗影球', '诅咒'],
  dragon:   ['龙息', '龙爪', '逆鳞', '龙之舞'],
  dark:     ['咬住', '穷追猛打', '恶之波动', '诡计'],
  steel:    ['金属爪', '钢翼', '铁头', '铁壁'],
  fairy:    ['妖精之风', '魅惑之声', '魔法闪耀', '月光'],
};

const STATUS_BY_TYPE = {
  fire: { kind: 'statChange', target: 'self', stat: 'spa', stages: 1 },
  water: { kind: 'statChange', target: 'self', stat: 'spa', stages: 1 },
  grass: { kind: 'heal', fraction: 0.5 },
  electric: { kind: 'status', status: 'paralyze' },
  ice: { kind: 'screen', screen: 'special' },
  fighting: { kind: 'statChange', target: 'self', stat: 'atk', stages: 1, also: 'def' },
  poison: { kind: 'status', status: 'toxic' },
  ground: { kind: 'hazard', hazard: 'spikes' },
  flying: { kind: 'heal', fraction: 0.5 },
  psychic: { kind: 'statChange', target: 'self', stat: 'spa', stages: 1, also: 'spd' },
  bug: { kind: 'statChange', target: 'foe', stat: 'spe', stages: -1 },
  rock: { kind: 'statChange', target: 'self', stat: 'def', stages: 1 },
  ghost: { kind: 'curse' },
  dragon: { kind: 'statChange', target: 'self', stat: 'atk', stages: 1, also: 'spe' },
  dark: { kind: 'statChange', target: 'self', stat: 'spa', stages: 2 },
  steel: { kind: 'statChange', target: 'self', stat: 'def', stages: 2 },
  fairy: { kind: 'heal', fraction: 0.5 },
  normal: { kind: 'statChange', target: 'self', stat: 'spe', stages: 2 },
};

// Secondary effect attached to the "strong" move of certain types.
const STRONG_RIDER = {
  fire: { effect: { kind: 'status', status: 'burn' }, chance: 0.1 },
  electric: { effect: { kind: 'status', status: 'paralyze' }, chance: 0.1 },
  ice: { effect: { kind: 'status', status: 'freeze' }, chance: 0.1 },
  poison: { effect: { kind: 'status', status: 'poison' }, chance: 0.3 },
  psychic: { effect: { kind: 'statChange', target: 'foe', stat: 'spd', stages: -1 }, chance: 0.1 },
  fighting: { effect: { kind: 'recoil', fraction: 0 }, chance: 0 },
};

export function generateMoves() {
  const moves = [];
  const add = (m) => { moves.push(m); return m.id; };

  // --- Universal physical Normal-type staples every monster can learn ---
  add({ id: 'mv_tackle', name: '撞击', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 35, priority: 0, effect: null, effectChance: 0, desc: '用整个身体撞向对手。' });
  add({ id: 'mv_scratch', name: '抓', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 35, priority: 0, effect: null, effectChance: 0, desc: '用坚硬锐利的爪子抓对手。' });
  add({ id: 'mv_quickattack', name: '电光一闪', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 30, priority: 1, effect: null, effectChance: 0, desc: '以迅雷不及掩耳之势出招，必定先制攻击。' });
  add({ id: 'mv_bodyslam', name: '泰山压顶', type: 'normal', category: 'physical', power: 85, accuracy: 100, pp: 15, priority: 0, effect: { kind: 'status', status: 'paralyze' }, effectChance: 0.3, desc: '用整个身体压向对手，有时令其麻痹。' });
  add({ id: 'mv_hyperbeam', name: '破坏光线', type: 'normal', category: 'special', power: 150, accuracy: 90, pp: 5, priority: 0, effect: { kind: 'recharge' }, effectChance: 1, desc: '向对手发射强烈光线，下一回合无法行动。' });
  add({ id: 'mv_growl', name: '叫声', type: 'normal', category: 'status', power: 0, accuracy: 100, pp: 40, priority: 0, effect: { kind: 'statChange', target: 'foe', stat: 'atk', stages: -1 }, effectChance: 1, desc: '让对手放松警惕，降低其攻击。' });
  add({ id: 'mv_tailwhip', name: '摇尾巴', type: 'normal', category: 'status', power: 0, accuracy: 100, pp: 30, priority: 0, effect: { kind: 'statChange', target: 'foe', stat: 'def', stages: -1 }, effectChance: 1, desc: '摇晃尾巴诱使对手大意，降低其防御。' });
  add({ id: 'mv_rest', name: '睡觉', type: 'normal', category: 'status', power: 0, accuracy: null, pp: 5, priority: 0, effect: { kind: 'rest' }, effectChance: 1, desc: '睡上一觉，回复全部体力并治愈状态。' });

  // --- Per-type kit: weak / mid / strong damaging + a status move ---
  const tierStats = {
    weak:   { power: 45, accuracy: 100, pp: 25 },
    mid:    { power: 75, accuracy: 100, pp: 15 },
    strong: { power: 110, accuracy: 90, pp: 10 },
  };
  for (const t of TYPES) {
    if (t.id === 'normal') continue; // normal handled above
    const names = MOVE_NAMES[t.id];
    // physical or special category by type convention
    const specialTypes = ['fire', 'water', 'grass', 'electric', 'ice', 'psychic', 'dragon', 'dark', 'fairy'];
    const cat = specialTypes.includes(t.id) ? 'special' : 'physical';

    add({ id: `mv_${t.id}_weak`, name: names[0], type: t.id, category: cat, power: tierStats.weak.power, accuracy: tierStats.weak.accuracy, pp: tierStats.weak.pp, priority: 0, effect: null, effectChance: 0, desc: `初级的${t.zh}属性招式。` });
    add({ id: `mv_${t.id}_mid`, name: names[1], type: t.id, category: cat, power: tierStats.mid.power, accuracy: tierStats.mid.accuracy, pp: tierStats.mid.pp, priority: 0, effect: null, effectChance: 0, desc: `中阶的${t.zh}属性招式。` });

    const rider = STRONG_RIDER[t.id];
    add({ id: `mv_${t.id}_strong`, name: names[2], type: t.id, category: cat, power: tierStats.strong.power, accuracy: tierStats.strong.accuracy, pp: tierStats.strong.pp, priority: 0, effect: rider ? rider.effect : null, effectChance: rider ? rider.chance : 0, desc: `强力的${t.zh}属性招式。` });

    add({ id: `mv_${t.id}_status`, name: names[3], type: t.id, category: 'status', power: 0, accuracy: null, pp: 20, priority: 0, effect: STATUS_BY_TYPE[t.id], effectChance: 1, desc: `${t.zh}属性的变化招式。` });
  }

  return moves;
}
