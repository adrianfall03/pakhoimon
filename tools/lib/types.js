// The 18 elemental types and the full effectiveness chart.
// Source of truth used by the generator; also emitted to js/data/types.js for the browser.

export const TYPES = [
  { id: 'normal',   zh: '普通', color: '#9099a1' },
  { id: 'fire',     zh: '火',   color: '#ff9c54' },
  { id: 'water',    zh: '水',   color: '#4d90d5' },
  { id: 'grass',    zh: '草',   color: '#63bc5a' },
  { id: 'electric', zh: '电',   color: '#f3d23b' },
  { id: 'ice',      zh: '冰',   color: '#74cec5' },
  { id: 'fighting', zh: '格斗', color: '#ce4069' },
  { id: 'poison',   zh: '毒',   color: '#ab6ac8' },
  { id: 'ground',   zh: '地面', color: '#d97746' },
  { id: 'flying',   zh: '飞行', color: '#8fa8dd' },
  { id: 'psychic',  zh: '超能力', color: '#f97176' },
  { id: 'bug',      zh: '虫',   color: '#90c12c' },
  { id: 'rock',     zh: '岩石', color: '#c7b78b' },
  { id: 'ghost',    zh: '幽灵', color: '#5269ac' },
  { id: 'dragon',   zh: '龙',   color: '#0a6dc4' },
  { id: 'dark',     zh: '恶',   color: '#5a5366' },
  { id: 'steel',    zh: '钢',   color: '#5a8ea1' },
  { id: 'fairy',    zh: '妖精', color: '#ec8fe6' },
];

// Effectiveness multipliers. chart[attacker][defender].
// 2 = super effective, 0.5 = not very effective, 0 = no effect, 1 = neutral (default).
const X = {
  normal:   { rock: .5, ghost: 0, steel: .5 },
  fire:     { fire: .5, water: .5, grass: 2, ice: 2, bug: 2, rock: .5, dragon: .5, steel: 2 },
  water:    { fire: 2, water: .5, grass: .5, ground: 2, rock: 2, dragon: .5 },
  grass:    { fire: .5, water: 2, grass: .5, poison: .5, ground: 2, flying: .5, bug: .5, rock: 2, dragon: .5, steel: .5 },
  electric: { water: 2, grass: .5, electric: .5, ground: 0, flying: 2, dragon: .5 },
  ice:      { fire: .5, water: .5, grass: 2, ice: .5, ground: 2, flying: 2, dragon: 2, steel: .5 },
  fighting: { normal: 2, ice: 2, poison: .5, flying: .5, psychic: .5, bug: .5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: .5 },
  poison:   { grass: 2, poison: .5, ground: .5, rock: .5, ghost: .5, steel: 0, fairy: 2 },
  ground:   { fire: 2, grass: .5, electric: 2, poison: 2, flying: 0, bug: .5, rock: 2, steel: 2 },
  flying:   { grass: 2, electric: .5, fighting: 2, bug: 2, rock: .5, steel: .5 },
  psychic:  { fighting: 2, poison: 2, psychic: .5, dark: 0, steel: .5 },
  bug:      { fire: .5, grass: 2, fighting: .5, poison: .5, flying: .5, psychic: 2, ghost: .5, dark: 2, steel: .5, fairy: .5 },
  rock:     { fire: 2, ice: 2, fighting: .5, ground: .5, flying: 2, bug: 2, steel: .5 },
  ghost:    { normal: 0, psychic: 2, ghost: 2, dark: .5 },
  dragon:   { dragon: 2, steel: .5, fairy: 0 },
  dark:     { fighting: .5, psychic: 2, ghost: 2, dark: .5, fairy: .5 },
  steel:    { fire: .5, water: .5, electric: .5, ice: 2, rock: 2, steel: .5, fairy: 2 },
  fairy:    { fire: .5, fighting: 2, poison: .5, dragon: 2, dark: 2, steel: .5 },
};

// Materialize a dense chart so lookups are always defined.
export const TYPE_CHART = {};
for (const a of TYPES) {
  TYPE_CHART[a.id] = {};
  for (const d of TYPES) {
    TYPE_CHART[a.id][d.id] = (X[a.id] && X[a.id][d.id] !== undefined) ? X[a.id][d.id] : 1;
  }
}

export function typeName(id) {
  const t = TYPES.find(t => t.id === id);
  return t ? t.zh : id;
}
