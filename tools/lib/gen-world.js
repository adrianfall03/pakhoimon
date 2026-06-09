// Generates the explorable world: tile maps (towns, routes, caves, interiors),
// warps that connect them, wild-encounter tables, and 100+ NPCs (trainers,
// shopkeepers, nurses, flavor townsfolk) plus story-critical characters.
//
// Tile semantics (kept in sync with js/engine/tiles meta, emitted as world.tiles):
//  0 grass(walk) 1 path(walk) 2 tree(block) 3 water(block) 4 tallgrass(walk,encounter)
//  5 wall(block) 6 roof(block) 7 door(warp) 8 sign(block,read) 9 ledge(one-way down)
//  10 floor(walk) 11 counter(block,read) 12 cavewall(block) 13 cavefloor(walk,encounter)
//  14 flower(walk) 15 fence(block) 16 sand(walk) 17 mat(warp) 18 pc(block,read) 19 heal(block,read)

const TILE = {
  GRASS: 0, PATH: 1, TREE: 2, WATER: 3, TALL: 4, WALL: 5, ROOF: 6, DOOR: 7, SIGN: 8,
  LEDGE: 9, FLOOR: 10, COUNTER: 11, CAVEWALL: 12, CAVEFLOOR: 13, FLOWER: 14, FENCE: 15,
  SAND: 16, MAT: 17, PC: 18, HEAL: 19,
};

const TILE_META = {
  0: { walk: true }, 1: { walk: true }, 2: {}, 3: {}, 4: { walk: true, encounter: 'grass' },
  5: {}, 6: {}, 7: { walk: true, warp: true }, 8: { read: true }, 9: { walk: true, ledge: 'down' },
  10: { walk: true }, 11: { read: true }, 12: {}, 13: { walk: true, encounter: 'cave' }, 14: { walk: true },
  15: {}, 16: { walk: true }, 17: { walk: true, warp: true }, 18: { read: true }, 19: { read: true },
};

const OW = 26, OH = 20;   // outdoor map dimensions
const IW = 16, IH = 12;   // interior dimensions

export function generateWorld(rng, ctx) {
  const { monsters, regions, legendaryDex } = ctx;
  const maps = [];
  const npcs = [];
  const encounters = {};
  const mapById = {};

  // ---------- monster index helpers ----------
  const byDex = new Map(monsters.map(m => [m.dex, m]));
  const wildPool = monsters.filter(m => !m.evolvesFrom && ['common', 'uncommon', 'rare'].includes(m.category));

  function resolveStage(dex, level) {
    let m = byDex.get(dex);
    while (m && m.evolution && m.evolution.type === 'level' && level >= m.evolution.level) {
      m = byDex.get(parseInt(m.evolution.to.slice(4), 10));
    }
    return m ? m.dex : dex;
  }
  function monstersInRegion(region) {
    return monsters.filter(m => m.region === region && m.category !== 'legendary' && m.category !== 'mythical');
  }

  // ---------- map construction helpers ----------
  function blank(w, h, fill) {
    return Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
  }
  function frameTrees(t) {
    const h = t.length, w = t[0].length;
    for (let x = 0; x < w; x++) { t[0][x] = TILE.TREE; t[h - 1][x] = TILE.TREE; }
    for (let y = 0; y < h; y++) { t[y][0] = TILE.TREE; t[y][w - 1] = TILE.TREE; }
  }
  function rect(t, x0, y0, w, h, v) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++)
      if (t[y] && t[y][x] !== undefined) t[y][x] = v;
  }
  function hPath(t, y, x0, x1) { for (let x = x0; x <= x1; x++) t[y][x] = TILE.PATH; }
  function vPath(t, x, y0, y1) { for (let y = y0; y <= y1; y++) t[y][x] = TILE.PATH; }

  function newMap(id, name, kind, region, w, h, fill) {
    const m = { id, name, kind, region, w, h, tiles: blank(w, h, fill), warps: [], objects: [], npcs: [], encounter: null, heal: kind === 'town' };
    maps.push(m); mapById[id] = m; return m;
  }

  // Stamp a building footprint with a door; register a warp from the door to `toMap`.
  function building(m, x, y, w, h, toMapId, label) {
    rect(m.tiles, x, y, w, h, TILE.WALL);
    rect(m.tiles, x, y, w, 1, TILE.ROOF);
    const doorX = x + (w >> 1), doorY = y + h - 1;
    m.tiles[doorY][doorX] = TILE.DOOR;
    m.warps.push({ x: doorX, y: doorY, to: toMapId, toX: IW >> 1, toY: IH - 2, label });
    if (label) m.objects.push({ x, y: y - 1, sign: label });
    return { doorX, doorY };
  }

  // Build a generic interior with an exit mat that returns to `back` (town id + door pos).
  function interior(id, name, region, backMapId, backX, backY, decorate) {
    const m = newMap(id, name, 'interior', region, IW, IH, TILE.FLOOR);
    rect(m.tiles, 0, 0, IW, 1, TILE.WALL);
    rect(m.tiles, 0, IH - 1, IW, 1, TILE.WALL);
    rect(m.tiles, 0, 0, 1, IH, TILE.WALL);
    rect(m.tiles, IW - 1, 0, 1, IH, TILE.WALL);
    const matX = IW >> 1;
    m.tiles[IH - 1][matX] = TILE.MAT;
    m.warps.push({ x: matX, y: IH - 1, to: backMapId, toX: backX, toY: backY + 1 });
    if (decorate) decorate(m);
    return m;
  }

  // ---------- world topology ----------
  // Linear-with-branches chain of towns and routes spanning all regions, plus
  // caves, hideouts, and the league. Adjacency drives reciprocal warp creation.
  const nodes = [
    // id, name, kind, region, gymType (null if none), connections {dir:targetId}
    { id: 'town_newleaf',  name: '新叶镇',   kind: 'town',  r: 0, gym: null },
    { id: 'route_01',      name: '1号道路',  kind: 'route', r: 0 },
    { id: 'town_riverside',name: '川岸镇',   kind: 'town',  r: 0, gym: 'bug' },
    { id: 'route_02',      name: '2号道路',  kind: 'route', r: 0 },
    { id: 'forest_verdant',name: '翠绿森林', kind: 'route', r: 3 },
    { id: 'town_thunder',  name: '雷鸣市',   kind: 'town',  r: 0, gym: 'electric' },
    { id: 'route_03',      name: '3号道路',  kind: 'route', r: 1 },
    { id: 'town_harbor',   name: '碧波港',   kind: 'town',  r: 1, gym: 'water' },
    { id: 'route_04',      name: '4号道路',  kind: 'route', r: 1 },
    { id: 'cave_coral',    name: '珊瑚洞窟', kind: 'cave',  r: 1 },
    { id: 'town_stone',    name: '苍岩镇',   kind: 'town',  r: 2, gym: 'rock' },
    { id: 'route_05',      name: '5号道路',  kind: 'route', r: 2 },
    { id: 'town_mist',     name: '迷雾村',   kind: 'town',  r: 3, gym: 'ghost' },
    { id: 'route_06',      name: '6号道路',  kind: 'route', r: 3 },
    { id: 'town_ember',    name: '熔火城',   kind: 'town',  r: 4, gym: 'fire' },
    { id: 'cave_magma',    name: '岩浆地穴', kind: 'cave',  r: 4 },
    { id: 'route_07',      name: '7号道路',  kind: 'route', r: 5 },
    { id: 'town_frost',    name: '霜寒镇',   kind: 'town',  r: 5, gym: 'ice' },
    { id: 'route_08',      name: '8号道路',  kind: 'route', r: 5 },
    { id: 'town_sky',      name: '天穹市',   kind: 'town',  r: 2, gym: 'dragon' },
    { id: 'route_victory', name: '冠军之路', kind: 'cave',  r: 2 },
    { id: 'league_plateau',name: '联盟高原', kind: 'town',  r: 2, gym: null },
  ];
  // chain adjacency (north leads forward along the chain)
  const order = nodes.map(n => n.id);
  const adj = {};
  for (let i = 0; i < order.length - 1; i++) {
    adj[order[i]] = adj[order[i]] || {};
    adj[order[i + 1]] = adj[order[i + 1]] || {};
    adj[order[i]].north = order[i + 1];
    adj[order[i + 1]].south = order[i];
  }

  // ---------- build each outdoor map ----------
  for (const n of nodes) {
    const fill = n.kind === 'cave' ? TILE.CAVEFLOOR : (n.kind === 'town' ? TILE.PATH : TILE.GRASS);
    const m = newMap(n.id, n.name, n.kind, n.r, OW, OH, fill);
    m.gym = n.gym || null;
    if (n.kind === 'cave') {
      // cave: walls border + scattered rock pillars + cave-floor encounters
      for (let x = 0; x < OW; x++) { m.tiles[0][x] = TILE.CAVEWALL; m.tiles[OH - 1][x] = TILE.CAVEWALL; }
      for (let y = 0; y < OH; y++) { m.tiles[y][0] = TILE.CAVEWALL; m.tiles[y][OW - 1] = TILE.CAVEWALL; }
      for (let i = 0; i < 26; i++) {
        const px = rng.int(2, OW - 3), py = rng.int(2, OH - 3);
        m.tiles[py][px] = TILE.CAVEWALL;
      }
      m.encounter = `enc_${n.id}`;
    } else {
      frameTrees(m.tiles);
      if (n.kind === 'route') {
        // a winding path with tall-grass patches and a one-way ledge
        const midY = OH >> 1;
        hPath(m.tiles, midY, 1, OW - 2);
        vPath(m.tiles, OW >> 1, 1, OH - 2);
        for (let p = 0; p < 5; p++) {
          const gx = rng.int(2, OW - 6), gy = rng.int(2, OH - 5);
          rect(m.tiles, gx, gy, rng.int(3, 5), rng.int(2, 4), TILE.TALL);
        }
        // ledge row
        const ly = rng.int(4, OH - 5);
        for (let x = 3; x < OW - 3; x++) if (rng.chance(0.7)) m.tiles[ly][x] = TILE.LEDGE;
        m.tiles[midY][OW >> 1] = TILE.PATH; // keep path crossing open
        m.encounter = `enc_${n.id}`;
      } else {
        // town: open paths, a flower bed, a sign
        rect(m.tiles, 2, 2, OW - 4, OH - 4, TILE.PATH);
        rect(m.tiles, OW - 8, OH - 6, 3, 2, TILE.FLOWER);
        m.tiles[OH - 3][3] = TILE.SIGN;
        m.objects.push({ x: 3, y: OH - 3, sign: `${n.name} —— 愿你的旅途充满奇迹。` });
      }
    }
  }

  // ---------- reciprocal edge warps ----------
  function edgeWarp(m, dir) {
    if (dir === 'north') return { x: OW >> 1, y: 1 };
    if (dir === 'south') return { x: OW >> 1, y: OH - 2 };
    if (dir === 'east') return { x: OW - 2, y: OH >> 1 };
    return { x: 1, y: OH >> 1 };
  }
  const opp = { north: 'south', south: 'north', east: 'west', west: 'east' };
  for (const [from, dirs] of Object.entries(adj)) {
    for (const [dir, to] of Object.entries(dirs)) {
      const m = mapById[from];
      const p = edgeWarp(m, dir);
      const arrive = edgeWarp(mapById[to], opp[dir]);
      // open the border tile so the warp is reachable
      m.tiles[p.y][p.x] = m.kind === 'cave' ? TILE.CAVEFLOOR : TILE.PATH;
      // also open the very edge tile (the wall) as the warp trigger
      const edge = dir === 'north' ? { x: p.x, y: 0 } : dir === 'south' ? { x: p.x, y: OH - 1 } : dir === 'east' ? { x: OW - 1, y: p.y } : { x: 0, y: p.y };
      m.tiles[edge.y][edge.x] = TILE.PATH;
      m.warps.push({ x: edge.x, y: edge.y, to, toX: arrive.x, toY: arrive.y });
    }
  }

  // ---------- interiors + buildings for towns ----------
  const GYM_LEADERS = {}; // gymType -> npc id, set when placing
  let npcSeq = 0;
  function nextNpcId() { return `npc_${String(++npcSeq).padStart(3, '0')}`; }

  function makeTeam(filterFn, count, lvlMin, lvlMax, allowEvo = true) {
    let pool = monsters.filter(filterFn);
    if (!pool.length) pool = monsters.filter(m => m.category !== 'legendary' && m.category !== 'mythical');
    const team = [];
    for (let i = 0; i < count; i++) {
      if (!pool.length) break;
      const base = rng.pick(pool);
      const level = rng.int(lvlMin, lvlMax);
      const dex = allowEvo ? resolveStage(base.dex, level) : base.dex;
      team.push({ dex, level });
    }
    return team;
  }

  const FLAVOR_LINES = [
    '你知道吗？怪兽的属性相克是战斗取胜的关键。',
    '我年轻时也是个训练师，如今只想看看后辈们的成长。',
    '听说苍岩山脉深处沉睡着传说中的巨龙……',
    '精灵中心可以免费治疗你的怪兽，记得常去。',
    '黯灭组织最近频繁出没，旅行要当心。',
    '进化石能让特定的怪兽进化，商店偶尔会进货。',
    '在高高的草丛里行走，很容易遇见野生怪兽。',
    '我的孙子去挑战道馆了，真希望他平安。',
    '据说收集齐八枚徽章，就能挑战精灵联盟。',
    '风从天穹市的方向吹来，带着龙的气息。',
    '钓竿能在水边钓起平时见不到的怪兽哦。',
    '传说当世界陷入失衡，远古的守护者就会苏醒。',
    '雷鸣市的发电厂是全地区的能源命脉。',
    '迷雾村的夜晚，常能听见幽灵怪兽的低语。',
    '熔火城的温泉对怪兽的疲劳很有效呢。',
    '霜寒镇的冰雕节是一年中最热闹的时候。',
    '别小看普通属性的怪兽，潜力深不可测。',
    '我在森林里迷路过三次，你可要带好地图。',
    '努力训练吧，强大的羁绊会回应你的心意。',
    '冠军是这片土地最强的训练师，无人能及。',
    '碧波港的海鲜可是远近闻名。',
    '听老人说，月之石只在满月的夜晚才会发光。',
    '我收集了各地的徽章贴纸，是不是很厉害？',
    '黯灭组织想唤醒虚空之兽，那太危险了！',
    '速度快的怪兽通常能抢先出招。',
    '状态异常会持续消耗体力，要及时治疗。',
    '我相信总有一天，人类与怪兽能真正心意相通。',
    '据说图鉴收录全部怪兽的人，能见到博士的秘密。',
    '别老是站在原地发呆啦，去冒险吧！',
    '这条路的尽头连着更广阔的世界。',
  ];

  function placeFlavorNpc(m, x, y, region) {
    const id = nextNpcId();
    const n = { id, kind: 'flavor', name: ['居民', '老人', '少女', '少年', '商人', '渔夫', '登山客', '研究员'][rng.int(0, 7)], map: m.id, x, y, dir: 'down', dialogue: [rng.pick(FLAVOR_LINES)] };
    npcs.push(n); m.npcs.push(id); return n;
  }

  function placeTrainer(m, x, y, opts) {
    const id = nextNpcId();
    const cls = opts.cls || rng.pick(['少年', '少女', '钓鱼手', '登山男', '上班族', '黑衣人', '研究员', '富家少爷', '空手道家', '美女']);
    const n = {
      id, kind: 'trainer', trainerClass: cls, name: `${cls}`, map: m.id, x, y, dir: opts.dir || 'down',
      team: opts.team, money: opts.money || (opts.team.reduce((s, t) => s + t.level, 0) * 12),
      sight: opts.sight || 0,
      preBattle: opts.pre || rng.pick(['想从我身边过去？先打赢我再说！', '哈，又来一个想挑战联盟的小鬼。', '让你见识见识真正的实力！', '我可不会手下留情！', '我训练我的伙伴们很久了！']),
      postBattle: opts.post || rng.pick(['可恶……你比我想象的要强。', '看来你和怪兽的羁绊更深。', '我会变得更强的！', '这就是实力的差距吗……', '了不起，收下这点谢礼吧。']),
      defeated: false,
    };
    npcs.push(n); m.npcs.push(id); return n;
  }

  // ----- per-town interiors: center, mart, gym, houses -----
  for (const n of nodes) {
    const m = mapById[n.id];
    if (n.kind !== 'town') continue;
    if (n.id === 'league_plateau') continue; // laid out specially below

    // Pokémon Center
    const centerId = `int_center_${n.id}`;
    const cb = building(m, 4, 4, 4, 3, centerId, `${n.name} 精灵中心`);
    interior(centerId, `${n.name}精灵中心`, n.r, n.id, cb.doorX, cb.doorY, (im) => {
      im.tiles[2][IW >> 1] = TILE.HEAL;
      im.heal = true;
      const nurse = { id: nextNpcId(), kind: 'healer', name: '乔伊小姐', map: centerId, x: (IW >> 1), y: 3, dir: 'down', dialogue: ['欢迎光临精灵中心！要让你的怪兽恢复活力吗？'] };
      npcs.push(nurse); im.npcs.push(nurse.id);
      im.tiles[2][IW - 3] = TILE.PC;
      im.objects.push({ x: IW - 3, y: 2, sign: '储存系统：管理你寄存的怪兽。', pc: true });
    });

    // Mart
    const martId = `int_mart_${n.id}`;
    const mb = building(m, OW - 9, 4, 4, 3, martId, `${n.name} 商店`);
    interior(martId, `${n.name}商店`, n.r, n.id, mb.doorX, mb.doorY, (im) => {
      const stock = ['item_ball', 'item_greatball', 'item_potion', 'item_superpotion', 'item_antidote', 'item_paralyzeheal', 'item_repel'];
      const clerk = { id: nextNpcId(), kind: 'shop', name: '店员', map: martId, x: (IW >> 1), y: 3, dir: 'down', stock, dialogue: ['欢迎光临！想买点什么？'] };
      npcs.push(clerk); im.npcs.push(clerk.id);
      im.tiles[3][IW >> 1] = TILE.COUNTER;
    });

    // A flavor house
    const houseId = `int_house_${n.id}`;
    const hb = building(m, 4, OH - 6, 4, 3, houseId, '民宅');
    interior(houseId, `${n.name}民宅`, n.r, n.id, hb.doorX, hb.doorY, (im) => {
      placeFlavorNpc(im, IW >> 1, 3, n.r);
    });

    // Gym
    if (n.gym) {
      const gymId = `int_gym_${n.id}`;
      const gb = building(m, OW - 9, OH - 6, 4, 3, gymId, `${n.name} 道馆`);
      interior(gymId, `${n.name}道馆`, n.r, n.id, gb.doorX, gb.doorY, (im) => {
        rect(im.tiles, 0, 0, IW, 1, TILE.WALL);
        // two gym trainers
        const gymLevel = 12 + order.indexOf(n.id) * 3;
        placeTrainer(im, 4, 6, { cls: '道馆训练师', team: makeTeam(mm => mm.types.includes(n.gym) && mm.category !== 'legendary', 2, gymLevel - 3, gymLevel - 1), sight: 3, dir: 'right' });
        placeTrainer(im, IW - 5, 6, { cls: '道馆训练师', team: makeTeam(mm => mm.types.includes(n.gym) && mm.category !== 'legendary', 2, gymLevel - 3, gymLevel - 1), sight: 3, dir: 'left' });
        // leader at top center
        const leaderTeam = makeTeam(mm => mm.types.includes(n.gym) && mm.category !== 'legendary', 4, gymLevel, gymLevel + 2);
        const leader = {
          id: nextNpcId(), kind: 'gymleader', name: GYM_NAMES[n.gym] || '道馆馆主', map: gymId, x: IW >> 1, y: 2, dir: 'down',
          gymType: n.gym, badge: BADGES[n.gym], team: leaderTeam,
          money: leaderTeam.reduce((s, t) => s + t.level, 0) * 30,
          preBattle: `我是${n.name}道馆馆主，专精${TYPE_ZH[n.gym]}属性！让我看看你的觉悟！`,
          postBattle: `了不起……这枚${BADGES[n.gym].name}是你应得的。`,
          defeated: false,
        };
        npcs.push(leader); im.npcs.push(leader.id);
        GYM_LEADERS[n.gym] = leader.id;
      });
    }

    // a couple of townsfolk outdoors
    placeFlavorNpc(m, 10, 8, n.r);
    placeFlavorNpc(m, OW - 12, OH - 8, n.r);
  }

  // ----- route trainers + encounter tables -----
  for (const n of nodes) {
    const m = mapById[n.id];
    if (n.kind === 'route' || n.kind === 'cave') {
      const idx = order.indexOf(n.id);
      const baseLvl = 4 + idx * 2;
      // encounter table from region monsters (base/early stages)
      const pool = monstersInRegion(regions[n.r]).filter(x => !x.evolvesFrom);
      const fallback = wildPool;
      const src = (pool.length ? pool : fallback);
      const table = [];
      for (let i = 0; i < 6 && i < src.length; i++) {
        const mm = rng.pick(src);
        table.push({ dex: mm.dex, min: baseLvl, max: baseLvl + 3, weight: rng.int(5, 30) });
      }
      encounters[m.encounter] = { kind: n.kind === 'cave' ? 'cave' : 'grass', table };

      // place 3-5 trainers along the route
      const count = rng.int(3, 5);
      for (let i = 0; i < count; i++) {
        let x = rng.int(3, OW - 4), y = rng.int(3, OH - 4);
        const team = makeTeam(mm => mm.region === regions[n.r] && mm.category !== 'legendary', rng.int(1, 3), baseLvl, baseLvl + 2);
        if (!team.length) continue;
        placeTrainer(m, x, y, { team, sight: rng.int(0, 3) });
      }
    }
  }

  // build cave encounter table entries (caves already set m.encounter)
  for (const n of nodes) {
    if (n.kind !== 'cave') continue;
    const m = mapById[n.id];
    const idx = order.indexOf(n.id);
    const baseLvl = 6 + idx * 2;
    const pool = monstersInRegion(regions[n.r]).filter(x => !x.evolvesFrom);
    const src = pool.length ? pool : wildPool;
    const table = [];
    for (let i = 0; i < 6 && i < src.length; i++) {
      const mm = rng.pick(src);
      table.push({ dex: mm.dex, min: baseLvl, max: baseLvl + 4, weight: rng.int(5, 30) });
    }
    encounters[m.encounter] = { kind: 'cave', table };
  }

  // ---------- story-critical NPCs ----------
  // Professor in the starting town's lab.
  const labId = 'int_lab';
  {
    const town = mapById['town_newleaf'];
    const lb = building(town, OW >> 1, 3, 4, 3, labId, '怪兽研究所');
    interior(labId, '怪兽研究所', 0, 'town_newleaf', lb.doorX, lb.doorY, (im) => {
      const prof = {
        id: 'npc_prof', kind: 'story', role: 'professor', name: '橡树博士', map: labId, x: IW >> 1, y: 2, dir: 'down',
        dialogue: [
          '欢迎来到怪兽的世界！我是研究怪兽生态的橡树博士。',
          '这个世界里，人与怪兽彼此扶持、共同生活。',
          '现在，选择一只属于你的伙伴，踏上属于你的旅程吧！',
        ],
        givesStarter: true,
      };
      npcs.push(prof); im.npcs.push(prof.id);
      im.tiles[2][3] = TILE.COUNTER; im.tiles[2][IW - 4] = TILE.COUNTER;
    });
  }

  // Rival — appears in starting town, recurs along the chain.
  const rivalSpots = ['town_newleaf', 'route_02', 'town_harbor', 'town_mist', 'town_sky', 'league_plateau'];
  rivalSpots.forEach((mapId, i) => {
    const m = mapById[mapId];
    if (!m) return;
    const lvl = 6 + i * 8;
    const id = `npc_rival_${i}`;
    const team = makeTeam(mm => mm.category !== 'legendary' && mm.category !== 'mythical', Math.min(2 + i, 6), lvl, lvl + 2);
    const n = {
      id, kind: 'rival', name: '青木', map: mapId, x: 6 + i, y: 6, dir: 'down', encounterIndex: i,
      team, money: 0,
      preBattle: i === 0 ? '哟！既然博士给了我们怪兽，不比一场怎么行？' : '又见面了！让我看看你进步了多少！',
      postBattle: i === 0 ? '哼，这次算你走运。下次不会这么简单了！' : '可恶……不过别得意，我会追上来的！',
      defeated: false,
    };
    npcs.push(n); m.npcs.push(id);
  });

  // Villain organization "黯灭组织" — grunts in caves/hideouts + bosses.
  const hideoutId = 'int_hideout';
  {
    const town = mapById['town_ember'];
    const hb = building(town, 10, 3, 4, 3, hideoutId, '可疑的建筑');
    interior(hideoutId, '黯灭组织据点', 4, 'town_ember', hb.doorX, hb.doorY, (im) => {
      rect(im.tiles, 0, 0, IW, 2, TILE.WALL);
      for (let i = 0; i < 3; i++) {
        placeTrainer(im, 3 + i * 4, 6, { cls: '黯灭组织战斗员', team: makeTeam(mm => mm.types.some(t => ['dark', 'poison', 'ghost'].includes(t)) && mm.category !== 'legendary', 2, 22, 26), sight: 0, dir: 'down', pre: '黯灭组织的计划不容外人插手！', post: '区区训练师，竟然……' });
      }
      const boss = {
        id: 'npc_villain_boss', kind: 'story', role: 'villain', name: '黯灭首领·赫拉斯', map: hideoutId, x: IW >> 1, y: 3, dir: 'down',
        team: makeTeam(mm => mm.types.includes('dark') && mm.category !== 'legendary', 5, 30, 34),
        money: 5000,
        preBattle: '你就是那个碍事的训练师？我要用虚空之兽的力量重塑这个世界！',
        postBattle: '不可能……我的宏图怎能止步于此！',
        defeated: false,
      };
      boss.team.push({ dex: legendaryDex[9], level: 36 }); // void legendary as ace
      npcs.push(boss); im.npcs.push(boss.id);
    });
  }

  // Elite Four + Champion in the league interior.
  {
    const plateau = mapById['league_plateau'];
    // a healing spot + sign for the plateau itself
    plateau.tiles[OH - 4][3] = TILE.HEAL;
    plateau.heal = true;
    const eliteTypes = ['poison', 'fighting', 'psychic', 'dragon'];
    const eliteX = [3, 9, 15, 21];
    eliteTypes.forEach((ty, i) => {
      const roomId = `int_elite_${i}`;
      const b = building(plateau, eliteX[i], 12, 3, 3, roomId, `四天王之间 ${i + 1}`);
      interior(roomId, `四天王·${TYPE_ZH[ty]}之间`, 2, 'league_plateau', b.doorX, b.doorY, (im) => {
        rect(im.tiles, 0, 0, IW, 2, TILE.WALL);
        const lvl = 48 + i * 2;
        const e = {
          id: `npc_elite_${i}`, kind: 'elite', name: ELITE_NAMES[i], map: roomId, x: IW >> 1, y: 3, dir: 'down', eliteType: ty,
          team: makeTeam(mm => mm.types.includes(ty) && mm.category !== 'legendary', 5, lvl, lvl + 3),
          money: lvl * 60,
          preBattle: `我是精灵联盟四天王之一，${ELITE_NAMES[i]}。${TYPE_ZH[ty]}属性的奥义，你接得住吗？`,
          postBattle: '漂亮……前往下一间吧，真正的考验还在后面。',
          defeated: false,
        };
        npcs.push(e); im.npcs.push(e.id);
      });
    });
    // Champion
    const champId = 'int_champion';
    const cb = building(plateau, (OW >> 1) - 2, 4, 4, 3, champId, '冠军之间');
    interior(champId, '冠军之间', 2, 'league_plateau', cb.doorX, cb.doorY, (im) => {
      rect(im.tiles, 0, 0, IW, 2, TILE.WALL);
      const champTeam = makeTeam(mm => mm.category === 'rare' || mm.category === 'pseudo', 5, 58, 62);
      champTeam.push({ dex: legendaryDex[0], level: 65 }); // sky dragon ace
      const champ = {
        id: 'npc_champion', kind: 'champion', name: '冠军·天野澪', map: champId, x: IW >> 1, y: 3, dir: 'down',
        team: champTeam, money: 12000,
        preBattle: '欢迎来到顶点。我是这片土地的冠军——天野澪。让我见证你旅途的全部重量吧！',
        postBattle: '……了不起。从今天起，新的冠军诞生了。这片天空属于你了。',
        defeated: false,
      };
      npcs.push(champ); im.npcs.push(champ.id);
    });
  }

  // ---------- emit tile meta + dimensions ----------
  return { maps, npcs, encounters, tiles: TILE_META, tileEnum: TILE, dims: { OW, OH, IW, IH } };
}

// ---------- lookup tables ----------
const TYPE_ZH = {
  normal: '普通', fire: '火', water: '水', grass: '草', electric: '电', ice: '冰', fighting: '格斗',
  poison: '毒', ground: '地面', flying: '飞行', psychic: '超能力', bug: '虫', rock: '岩石', ghost: '幽灵',
  dragon: '龙', dark: '恶', steel: '钢', fairy: '妖精',
};
const GYM_NAMES = {
  bug: '虫之卷·阿绿', electric: '雷霆·伏特', water: '碧波·澜', rock: '磐石·坚太', ghost: '幽影·黛',
  fire: '烈焰·炎司', ice: '霜华·雪乃', dragon: '苍龙·天行',
};
const BADGES = {
  bug: { id: 'badge_bug', name: '虫林徽章' }, electric: { id: 'badge_electric', name: '雷光徽章' },
  water: { id: 'badge_water', name: '碧波徽章' }, rock: { id: 'badge_rock', name: '磐石徽章' },
  ghost: { id: 'badge_ghost', name: '幽冥徽章' }, fire: { id: 'badge_fire', name: '烈焰徽章' },
  ice: { id: 'badge_ice', name: '霜华徽章' }, dragon: { id: 'badge_dragon', name: '苍龙徽章' },
};
const ELITE_NAMES = ['四天王·毒娘菈薇', '四天王·铁拳刚', '四天王·灵眸澄', '四天王·驭龙焰'];
