// The long main storyline. Each milestone unlocks when its condition first becomes true
// (decoupled from strict ordering so side-events like the villain arc never soft-lock the
// narrative). check() fires any newly-satisfied milestones' narration in sequence.
(function (MQ) {
  'use strict';
  const Story = MQ.Story = {};

  const CH = [
    {
      id: 'prologue', title: '序章 · 新叶镇的清晨',
      cond: () => true,
      lines: [
        '【新叶镇】晨雾还未散尽，远山如黛。',
        '这片名为「澪原」的辽阔大地上，人类与怪兽世代相依——它们是伙伴，是对手，也是这个世界跳动的心脏。',
        '今天，是你成为训练师的日子。橡树博士在研究所等着把第一只伙伴交到你手中。',
        '没有人知道，一场足以颠覆整片大陆的阴谋，正悄然在阴影里苏醒……',
        '但此刻，故事才刚刚开始。推开家门，去迎接属于你的旅程吧。',
      ],
    },
    {
      id: 'ch1', title: '第一章 · 虫林的试炼', cond: (s) => s.player.badges.length >= 1,
      lines: [
        '川岸镇道馆的虫属性馆主阿绿，成了你旅途上第一个被你超越的对手。',
        '「徽章不只是奖牌，」她把虫林徽章别在你胸前，「它是无数次跌倒又爬起的证明。」',
        '你第一次真切地感到：自己和伙伴们，正在变强。',
      ],
    },
    {
      id: 'ch2', title: '第二章 · 雷鸣不止', cond: (s) => s.player.badges.length >= 2,
      lines: [
        '雷鸣市的发电厂日夜轰鸣，是整个澪原的能源命脉。',
        '在这里，你击败了电属性馆主伏特，也第一次听见了那个名字——「黯灭组织」。',
        '据说，他们近来频繁出没于各地遗迹，似乎在寻找着什么古老而危险的东西。',
      ],
    },
    {
      id: 'ch3', title: '第三章 · 潮起碧波', cond: (s) => s.player.badges.length >= 3,
      lines: [
        '碧波港的海风咸涩而温柔。水属性馆主澜的招式如潮水般连绵不绝。',
        '战后，她望着海平线对你说：「海的深处沉睡着守护之兽。若有一天潮水变得狂暴，那便是世界失衡的征兆。」',
        '你把这句话记在了心里。',
      ],
    },
    {
      id: 'ch4', title: '第四章 · 苍岩与磐石', cond: (s) => s.player.badges.length >= 4,
      lines: [
        '苍岩山脉巍峨横亘。岩属性馆主坚太的怪兽如山岳般难以撼动，你却用智慧与羁绊将其攻克。',
        '山民们传唱着一首古谣：当三只守护巨龙——天、海、地——同时震怒，唯有「远古之珠」能平息它们。',
        '而黯灭组织，似乎正是觊觎这股力量的人。',
      ],
    },
    {
      id: 'villain', title: '插曲 · 黯灭据点', cond: (s) => s.flags.villainDefeated,
      lines: [
        '在熔火城那栋可疑建筑的最深处，你直面了黯灭组织的首领——赫拉斯。',
        '他想用「虚空碎片」强行唤醒沉眠的虚空之兽，让永夜降临，淘汰一切「弱者」。',
        '一场惊心动魄的对战后，他的野心被你彻底击碎。',
        '「这……不可能……」赫拉斯踉跄后退，「但你要记住，虚空一旦被惊扰，就不会轻易再次沉睡……」',
        '他狼狈逃走，留下满地狼藉，和一枚还在微微震颤的虚空碎片。',
      ],
      onEnter: (s) => { MQ.Game.addItem('item_voidshard', 1); },
    },
    {
      id: 'ch6', title: '第六章 · 迷雾深处', cond: (s) => s.player.badges.length >= 5,
      lines: [
        '迷雾村终年笼罩在乳白色的雾气里，幽灵属性的怪兽在巷陌间低语。',
        '馆主黛的招式虚实难辨，你却凭着与伙伴的默契识破了所有幻象。',
        '夜里，你梦见一头由黑暗凝成的巨兽，睁开了一只猩红的眼。',
      ],
    },
    {
      id: 'ch7', title: '第七章 · 烈焰不熄', cond: (s) => s.player.badges.length >= 6,
      lines: [
        '熔火城的地热温泉蒸腾，火属性馆主炎司性情如烈火般直率。',
        '「输给你这样的训练师，我心服口服！」他大笑着递来烈焰徽章。',
        '你离精灵联盟，又近了一步。',
      ],
    },
    {
      id: 'ch8', title: '第八章 · 霜与雪的尽头', cond: (s) => s.player.badges.length >= 7,
      lines: [
        '霜寒镇的冰雕在极昼下闪着幽蓝的光。冰属性馆主雪乃沉静如雪，出招却凌厉如刀。',
        '战后，她为你披上一件斗篷：「前路是天穹市与冠军之路，那里的风，足以冻住犹豫的人。」',
      ],
    },
    {
      id: 'ch9', title: '第九章 · 苍龙之巅', cond: (s) => s.player.badges.length >= 8,
      lines: [
        '天穹市悬于云海之上，龙属性馆主天行是公认最难缠的馆主。',
        '当苍龙徽章落入你手，八枚徽章终于聚齐——它们在徽章盒里熠熠生辉。',
        '通往精灵联盟的「冠军之路」，已经为你敞开。',
        '但你心中那不祥的预感，也愈发清晰了……',
      ],
    },
    {
      id: 'champion', title: '终章 · 新的冠军', cond: (s) => s.flags.championDefeated,
      lines: [
        '四天王、冠军——澪原最强的训练师们，一个接一个倒在了你与伙伴的羁绊之下。',
        '冠军天野澪把手按在你的肩上：「从今天起，新的冠军诞生了。这片天空，属于你了。」',
        '名册被郑重地刻下你的名字。欢呼声中，你却注意到天边那一抹不自然的暗影正在扩散——',
        '虚空之兽，苏醒了。',
      ],
      onEnter: (s) => { s.flags.voidAwakening = true; },
    },
    {
      id: 'finale', title: '真·终章 · 永夜与黎明', cond: (s) => s.flags.championDefeated,
      lines: [
        '怀中的虚空碎片骤然炸裂，化作一道指引的光，将你带往天穹市之上的「天空神殿」。',
        '那里，由纯粹黑暗凝成的虚空之兽盘踞在祭坛之巅，要将整片澪原拖入永恒的长夜。',
        '就在绝望蔓延之际，你曾守护过的山川湖海做出了回应——天之龙、海之龙、地之龙的咆哮响彻云霄。',
        '远古的守护之力汇聚于你，与你和伙伴们多年累积的羁绊共鸣。',
        '这一战，为的不再是徽章或荣耀，而是每一个平凡清晨能再次到来的明天。',
        '当第一缕真正的阳光重新洒向新叶镇，你知道——你的传奇，已经写进了澪原的群山与潮汐之中。',
        '（你已通关主线！世界依然广阔：继续完成图鉴、培育最强队伍、收服传说中的守护巨龙吧。）',
      ],
      onEnter: (s) => { s.flags.gameCleared = true; },
    },
  ];

  Story.chapters = CH;

  Story.start = function () {
    MQ.Game.state.story.shown = MQ.Game.state.story.shown || [];
    Story.check();
  };

  Story.titleOf = function (idx) { return CH[idx] ? CH[idx].title : ''; };

  // Fire narration for any milestone whose condition is newly satisfied.
  Story.check = function () {
    const s = MQ.Game.state;
    if (!s.story.shown) s.story.shown = [];
    const queued = [];
    CH.forEach((ch, idx) => {
      if (s.story.shown.includes(ch.id)) return;
      let ok = false;
      try { ok = ch.cond(s); } catch (e) { ok = false; }
      if (!ok) return;
      s.story.shown.push(ch.id);
      s.story.chapter = Math.max(s.story.chapter || 0, idx);
      if (ch.onEnter) { try { ch.onEnter(s); } catch (e) { } }
      queued.push(ch);
    });
    if (!queued.length) return;
    // build a dialogue sequence with chapter titles as banners
    const lines = [];
    for (const ch of queued) { lines.push(`—— ${ch.title} ——`); lines.push(...ch.lines); }
    MQ.Dialogue.open(lines, { onDone: () => MQ.Toast.show('剧情推进：' + queued[queued.length - 1].title, 2200) });
  };

  Story.progressText = function () {
    const s = MQ.Game.state;
    const cur = CH[s.story.chapter] || CH[0];
    return cur.title;
  };

})(window.MQ);
