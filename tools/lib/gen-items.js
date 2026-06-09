// Item catalog: balls, healing, status cures, evolution stones, battle items, key items.
export function generateItems() {
  return [
    // --- Capture balls (rate = ball modifier) ---
    { id: 'item_ball', name: '精灵球', cat: 'ball', price: 200, ballRate: 1, desc: '用于捕捉野生怪兽的基础球。' },
    { id: 'item_greatball', name: '超级球', cat: 'ball', price: 600, ballRate: 1.5, desc: '比精灵球性能更好的球。' },
    { id: 'item_ultraball', name: '高级球', cat: 'ball', price: 1200, ballRate: 2, desc: '性能极高的捕捉球。' },
    { id: 'item_duskball', name: '黑暗球', cat: 'ball', price: 1000, ballRate: 3, desc: '在洞窟或夜晚捕捉率极高。' },
    { id: 'item_masterball', name: '大师球', cat: 'ball', price: 0, ballRate: 255, desc: '必定能捕获任何野生怪兽的终极球。' },

    // --- HP / status healing ---
    { id: 'item_potion', name: '伤药', cat: 'heal', price: 200, heal: 20, desc: '回复20点体力。' },
    { id: 'item_superpotion', name: '好伤药', cat: 'heal', price: 700, heal: 60, desc: '回复60点体力。' },
    { id: 'item_hyperpotion', name: '厉害伤药', cat: 'heal', price: 1500, heal: 120, desc: '回复120点体力。' },
    { id: 'item_maxpotion', name: '全满药', cat: 'heal', price: 2500, heal: 9999, desc: '完全回复体力。' },
    { id: 'item_revive', name: '活力碎片', cat: 'revive', price: 1500, reviveFraction: 0.5, desc: '让濒死的怪兽以半血复活。' },
    { id: 'item_maxrevive', name: '活力块', cat: 'revive', price: 3000, reviveFraction: 1, desc: '让濒死的怪兽满血复活。' },
    { id: 'item_antidote', name: '解毒药', cat: 'cure', price: 100, cures: ['poison', 'toxic'], desc: '治愈中毒状态。' },
    { id: 'item_burnheal', name: '烧伤药', cat: 'cure', price: 250, cures: ['burn'], desc: '治愈灼伤状态。' },
    { id: 'item_iceheal', name: '解冻药', cat: 'cure', price: 250, cures: ['freeze'], desc: '治愈冰冻状态。' },
    { id: 'item_paralyzeheal', name: '解麻药', cat: 'cure', price: 200, cures: ['paralyze'], desc: '治愈麻痹状态。' },
    { id: 'item_awakening', name: '解眠药', cat: 'cure', price: 250, cures: ['sleep'], desc: '唤醒沉睡的怪兽。' },
    { id: 'item_fullheal', name: '万灵药', cat: 'cure', price: 600, cures: ['poison', 'toxic', 'burn', 'freeze', 'paralyze', 'sleep'], desc: '治愈所有异常状态。' },

    // --- Evolution stones ---
    { id: 'item_firestone', name: '火之石', cat: 'stone', price: 3000, desc: '能让某些怪兽进化的炽热石头。' },
    { id: 'item_waterstone', name: '水之石', cat: 'stone', price: 3000, desc: '能让某些怪兽进化的湛蓝石头。' },
    { id: 'item_thunderstone', name: '雷之石', cat: 'stone', price: 3000, desc: '能让某些怪兽进化的带电石头。' },
    { id: 'item_leafstone', name: '叶之石', cat: 'stone', price: 3000, desc: '能让某些怪兽进化的翠绿石头。' },
    { id: 'item_icestone', name: '冰之石', cat: 'stone', price: 3000, desc: '能让某些怪兽进化的寒冷石头。' },
    { id: 'item_moonstone', name: '月之石', cat: 'stone', price: 3000, desc: '能让某些怪兽进化的漆黑石头。' },
    { id: 'item_sunstone', name: '日之石', cat: 'stone', price: 3000, desc: '能让某些怪兽进化的炽红石头。' },
    { id: 'item_duskstone', name: '暗之石', cat: 'stone', price: 3000, desc: '能让某些怪兽进化的幽暗石头。' },
    { id: 'item_everstone', name: '不变之石', cat: 'stone', price: 1000, desc: '让持有的怪兽无法进化的奇异石头。' },

    // --- Permanent stat boosters ---
    { id: 'item_hpup', name: '健康加分', cat: 'vitamin', stat: 'hp', price: 3000, desc: '些微提升怪兽的体力基础点。' },
    { id: 'item_protein', name: '力量加分', cat: 'vitamin', stat: 'atk', price: 3000, desc: '些微提升怪兽的攻击基础点。' },
    { id: 'item_iron', name: '防御加分', cat: 'vitamin', stat: 'def', price: 3000, desc: '些微提升怪兽的防御基础点。' },
    { id: 'item_calcium', name: '智力加分', cat: 'vitamin', stat: 'spa', price: 3000, desc: '些微提升怪兽的特攻基础点。' },
    { id: 'item_zinc', name: '精神加分', cat: 'vitamin', stat: 'spd', price: 3000, desc: '些微提升怪兽的特防基础点。' },
    { id: 'item_carbos', name: '速度加分', cat: 'vitamin', stat: 'spe', price: 3000, desc: '些微提升怪兽的速度基础点。' },
    { id: 'item_rarecandy', name: '神奇糖果', cat: 'candy', price: 0, desc: '让怪兽立刻提升一级。' },

    // --- Held / misc ---
    { id: 'item_leftovers', name: '吃剩的东西', cat: 'held', price: 0, desc: '持有时每回合缓慢回复体力。' },
    { id: 'item_choiceband', name: '讲究头带', cat: 'held', price: 0, desc: '提升攻击，但只能使用首次选择的招式。' },
    { id: 'item_repel', name: '驱虫喷雾', cat: 'field', price: 350, steps: 100, desc: '一段时间内不会遇到低等级的野生怪兽。' },
    { id: 'item_escaperope', name: '逃脱绳', cat: 'field', price: 550, desc: '从洞窟中瞬间回到入口。' },

    // --- Key items (story) ---
    { id: 'item_dex', name: '怪兽图鉴', cat: 'key', price: 0, desc: '记录所见与所捕获的怪兽资料的高科技装置。' },
    { id: 'item_bike', name: '自行车', cat: 'key', price: 0, desc: '能更快移动的折叠自行车。' },
    { id: 'item_oldrod', name: '旧钓竿', cat: 'key', price: 0, desc: '可以在水边钓起水栖怪兽。' },
    { id: 'item_townmap', name: '小镇地图', cat: 'key', price: 0, desc: '显示整个地区地理的便携地图。' },
    { id: 'item_relicorb', name: '远古之珠', cat: 'key', price: 0, desc: '据说能呼应传说怪兽的神秘宝珠。剧情关键道具。' },
    { id: 'item_voidshard', name: '虚空碎片', cat: 'key', price: 0, desc: '黯灭组织觊觎的危险结晶。剧情关键道具。' },
    { id: 'item_skykey', name: '苍穹之钥', cat: 'key', price: 0, desc: '开启天空神殿的古老钥匙。剧情关键道具。' },
    { id: 'item_badgecase', name: '徽章盒', cat: 'key', price: 0, desc: '收纳各道馆徽章的精致盒子。' },
  ];
}
