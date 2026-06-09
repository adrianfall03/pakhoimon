// Morphology-based Chinese monster-name generator.
// Names are built as [stagePrefix?] + elementRoot + creatureBase, deduped by the caller.

export const ELEMENT_ROOTS = {
  normal:   ['', '原', '朴', '常', '野'],
  fire:     ['炎', '焰', '烈', '灼', '燚', '焱'],
  water:    ['水', '潮', '澜', '涛', '渊', '沛'],
  grass:    ['草', '叶', '萌', '蔓', '芽', '森'],
  electric: ['电', '雷', '霆', '闪', '磁', '伏'],
  ice:      ['冰', '霜', '雪', '凛', '寒', '冻'],
  fighting: ['拳', '武', '斗', '搏', '刚', '猛'],
  poison:   ['毒', '瘴', '腐', '蚀', '酸', '疫'],
  ground:   ['岩', '土', '沙', '尘', '坤', '垒'],
  flying:   ['风', '翔', '羽', '空', '翼', '云'],
  psychic:  ['念', '灵', '幻', '冥', '智', '玄'],
  bug:      ['虫', '蛊', '茧', '螯', '甲', '蜉'],
  rock:     ['磐', '砾', '晶', '矿', '坚', '砺'],
  ghost:    ['幽', '魂', '魅', '影', '冥', '咒'],
  dragon:   ['龙', '螭', '虬', '蟠', '麟', '渊'],
  dark:     ['暗', '夜', '黯', '渊', '邪', '蚀'],
  steel:    ['钢', '铁', '锋', '锐', '铸', '甲'],
  fairy:    ['妖', '仙', '幻', '萝', '霓', '绯'],
};

export const CREATURE_BASES = [
  '龙', '兽', '鸟', '鱼', '虫', '猫', '犬', '狼', '猿', '熊', '鹿', '蛇',
  '蝠', '蝶', '蛙', '鳄', '鹰', '豹', '虎', '狐', '鼠', '蟹', '马', '羊',
  '蜥', '鲨', '鲸', '龟', '蜂', '蛛', '隼', '鹫', '麒', '凰', '貂', '獾',
];

export const STAGE_PREFIX = {
  // index 0 = first stage, 1 = mid, 2 = final
  small: ['幼', '小', '稚', '雏'],
  mid:   ['', '青', '壮', '飞'],
  final: ['巨', '霸', '王', '皇', '极', '帝'],
};

export const LEGEND_TITLES = ['神', '圣', '尊', '帝', '古', '原', '创', '终', '幻', '元'];
