// NPC interaction: flavor chat, trainer battles, gym leaders & badges, healers, shops,
// and story-character hooks. Also handles post-battle bookkeeping and black-outs.
(function (MQ) {
  'use strict';
  const util = MQ.util;
  const NPCs = MQ.NPCs = {};

  const BADGE_BY_GYM = {
    bug: { id: 'badge_bug', name: '虫林徽章' }, electric: { id: 'badge_electric', name: '雷光徽章' },
    water: { id: 'badge_water', name: '碧波徽章' }, rock: { id: 'badge_rock', name: '磐石徽章' },
    ghost: { id: 'badge_ghost', name: '幽冥徽章' }, fire: { id: 'badge_fire', name: '烈焰徽章' },
    ice: { id: 'badge_ice', name: '霜华徽章' }, dragon: { id: 'badge_dragon', name: '苍龙徽章' },
  };

  NPCs.talk = function (n) {
    switch (n.kind) {
      case 'flavor': return chat(n);
      case 'healer': return healPrompt();
      case 'shop': return MQ.UI.openShop(n);
      case 'story': return story(n);
      case 'rival':
      case 'trainer':
      case 'gymleader':
      case 'elite':
      case 'champion':
        return battleNpc(n);
      default: return chat(n);
    }
  };

  function chat(n) {
    const lines = Array.isArray(n.dialogue) ? n.dialogue : [n.dialogue || '……'];
    MQ.Dialogue.open(lines);
  }

  function healPrompt() {
    MQ.Dialogue.open(['欢迎光临精灵中心！要让你的怪兽恢复活力吗？'], {
      choices: ['好的', '不用了'],
      onChoice: (i) => { if (i === 0) { MQ.Game.healParty(); MQ.Dialogue.open(['叮咚～你的怪兽已经完全恢复了！期待你再次光临！']); } },
    });
  }

  function battleNpc(n) {
    if (n.defeated) {
      MQ.Dialogue.open([postDefeatChat(n)]);
      return;
    }
    if (!MQ.Game.partyAlive()) { MQ.Dialogue.open(['你的怪兽们都没法战斗了，先去精灵中心吧。']); return; }
    const intro = [n.preBattle || '来一场对战吧！'];
    MQ.Dialogue.open(intro, { onDone: () => MQ.Transition.fade(() => MQ.Battle.startTrainer(n)) });
  }

  function postDefeatChat(n) {
    if (n.kind === 'gymleader') return `你已经拥有${(BADGE_BY_GYM[n.gymType] || {}).name || '徽章'}了，去挑战下一座道馆吧！`;
    if (n.kind === 'champion') return '冠军的宝座现在属于你了。去书写属于你的传奇吧。';
    if (n.kind === 'rival') return '哼，下次我一定赢回来！';
    return n.postBattle || '我已经输给你了。';
  }

  function story(n) {
    if (n.role === 'professor') return professor(n);
    if (n.role === 'villain') return villain(n);
    chat(n);
  }

  function professor(n) {
    const got = MQ.Game.state.flags.gotDex;
    if (!got) {
      MQ.Dialogue.open([
        ...n.dialogue,
        '这是「怪兽图鉴」，能自动记录你遇见和捕获的怪兽资料。',
        `这个地区共栖息着 ${(MQ.monsters || []).length} 种怪兽，把它们的资料填满，是每个研究者的梦想。`,
        '先去北边的 1 号道路试试身手吧。路上的高草丛里藏着许多野生怪兽哦！',
      ], { onDone: () => { MQ.Game.state.flags.gotDex = true; MQ.Story.check(); } });
    } else {
      const c = MQ.Game.dexCounts();
      MQ.Dialogue.open([`图鉴进度：已发现 ${c.seen} 种、已捕获 ${c.caught} 种（共 ${c.total} 种）。`, '继续加油，年轻的训练师！']);
    }
  }

  function villain(n) {
    if (n.defeated) { MQ.Dialogue.open(['黯灭组织……已经土崩瓦解了。', '这个世界，暂时安全了。']); return; }
    if (!MQ.Game.partyAlive()) { MQ.Dialogue.open(['哼，连站稳的力气都没有，也敢挡我的路？先去疗伤吧。']); return; }
    MQ.Dialogue.open([
      n.preBattle,
      '虚空之兽一旦觉醒，永夜将笼罩大地，弱者将被淘汰，只有强者配活在新世界！',
      '让我看看，你是否有资格阻止我！',
    ], { onDone: () => MQ.Transition.fade(() => MQ.Battle.startTrainer(n)) });
  }

  // ---------- trainer sight approach ----------
  NPCs.trainerApproach = function (n) {
    MQ.Toast.show('！', 700);
    MQ.Game.pushMode('dialogue');
    MQ.Dialogue.open([n.preBattle || '别想偷偷溜走！'], { onDone: () => MQ.Transition.fade(() => MQ.Battle.startTrainer(n)) });
  };

  // ---------- post-battle ----------
  NPCs.onTrainerDefeated = function (n) {
    n.defeated = true;
    if (n.kind === 'gymleader') {
      const badge = BADGE_BY_GYM[n.gymType];
      if (badge) {
        MQ.Game.addBadge(badge);
        MQ.Dialogue.open([
          `${n.name}：了不起的对战！这枚「${badge.name}」是你实力的证明。`,
          `你现在拥有 ${MQ.Game.state.player.badges.length} 枚徽章了。`,
        ], { onDone: () => MQ.Story.check() });
        return;
      }
    }
    if (n.kind === 'champion') {
      MQ.Game.state.flags.championDefeated = true;
      MQ.Story.check();
      return;
    }
    if (n.role === 'villain' || n.id === 'npc_villain_boss') {
      MQ.Game.state.flags.villainDefeated = true;
    }
    if (n.kind === 'rival') {
      MQ.Game.state.flags['rival_' + (n.encounterIndex ?? 0)] = true;
    }
    if (n.kind === 'elite') {
      MQ.Game.state.flags['elite_' + (n.id || '')] = true;
    }
    MQ.Story.check();
  };

  // ---------- black out ----------
  NPCs.blackout = function () {
    MQ.Game.healParty();
    const lost = Math.floor(MQ.Game.state.player.money / 2);
    MQ.Game.state.player.money -= lost;
    const back = MQ.Game.state.flags.lastCenter || { mapId: 'town_newleaf', x: 13, y: 12 };
    MQ.Transition.fade(() => {
      MQ.World.load(back.mapId, back.x, back.y, 'down');
      MQ.Dialogue.open([`${MQ.Game.state.player.name} 眼前一黑……`, `回过神来，已经被送回了 ${util.map(back.mapId).name}。`, `（失去了 ${lost} 元……）`]);
    });
  };

})(window.MQ);
