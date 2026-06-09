// Stack-based menu system: party, bag (with field item use), dex, trainer card,
// save, shop (buy), and PC box (deposit/withdraw). Rendered as full-screen overlays.
(function (MQ) {
  'use strict';
  const util = MQ.util, Species = MQ.Species;
  const UI = MQ.UI = {};
  let stack = [];

  function top() { return stack[stack.length - 1]; }
  function push(name, data) { stack.push({ name, cursor: 0, scroll: 0, data: data || {} }); }
  function pop() { stack.pop(); if (!stack.length) UI.close(); }

  UI.openMenu = function () { MQ.Game.pushMode('menu'); stack = []; push('main'); };
  UI.openShop = function (npc) { MQ.Game.pushMode('menu'); stack = []; push('shop', { npc }); };
  UI.openBox = function () { MQ.Game.pushMode('menu'); stack = []; push('box'); };
  UI.close = function () { stack = []; MQ.Game.popMode(); };

  UI.updateMenu = function (dt) {
    const scr = top(); if (!scr) { UI.close(); return; }
    const S = SCREENS[scr.name]; if (S && S.update) S.update(scr);
  };
  UI.renderMenu = function (ctx) {
    // dim world
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const scr = top(); if (!scr) return;
    const S = SCREENS[scr.name]; if (S && S.render) S.render(ctx, scr);
  };

  // ---------- shared list navigation ----------
  function navList(scr, len, cols) {
    cols = cols || 1;
    if (MQ.Input.consume('b')) { pop(); return 'back'; }
    if (!len) return null;
    if (cols === 1) {
      if (MQ.Input.consume('up')) scr.cursor = (scr.cursor + len - 1) % len;
      if (MQ.Input.consume('down')) scr.cursor = (scr.cursor + 1) % len;
    } else {
      if (MQ.Input.consume('up')) scr.cursor = (scr.cursor - cols + len) % len;
      if (MQ.Input.consume('down')) scr.cursor = (scr.cursor + cols) % len;
      if (MQ.Input.consume('left')) scr.cursor = (scr.cursor + len - 1) % len;
      if (MQ.Input.consume('right')) scr.cursor = (scr.cursor + 1) % len;
    }
    if (MQ.Input.consume('a')) return 'select';
    return null;
  }

  function panel(ctx, title) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.fillStyle = 'rgba(18,22,34,0.96)'; MQ.roundRect(ctx, 24, 24, W - 48, H - 48, 14); ctx.fill();
    ctx.strokeStyle = '#5aa0e0'; ctx.lineWidth = 3; MQ.roundRect(ctx, 24, 24, W - 48, H - 48, 14); ctx.stroke();
    ctx.fillStyle = '#ffd54a'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(title, 44, 38);
    ctx.fillStyle = '#9fb6cc'; ctx.font = '12px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('Z 确认 / X 返回 / 方向键 选择', ctx.canvas.width - 44, 44); ctx.textAlign = 'left';
  }

  const SCREENS = {};

  // ---------- main ----------
  const MAIN = [
    ['怪兽', 'party'], ['背包', 'bag'], ['图鉴', 'dex'],
    ['训练家', 'trainer'], ['存档', 'save'], ['关闭', null],
  ];
  SCREENS.main = {
    update(scr) {
      const r = navList(scr, MAIN.length);
      if (r === 'back') { UI.close(); return; }
      if (r === 'select') {
        const target = MAIN[scr.cursor][1];
        if (!target) { UI.close(); return; }
        if (target === 'save') { MQ.Save.save(); return; }
        push(target);
      }
    },
    render(ctx, scr) {
      panel(ctx, '菜单');
      MAIN.forEach(([label], i) => {
        const y = 86 + i * 40;
        ctx.fillStyle = i === scr.cursor ? '#ffd54a' : '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText((i === scr.cursor ? '▶ ' : '   ') + label, 56, y);
      });
      // sidebar info
      const s = MQ.Game.state, c = MQ.Game.dexCounts();
      ctx.font = '14px sans-serif'; ctx.fillStyle = '#cfe';
      const x = ctx.canvas.width - 300, y0 = 90;
      ctx.fillText(`训练家：${s.player.name}`, x, y0);
      ctx.fillText(`金钱：¥${s.player.money}`, x, y0 + 24);
      ctx.fillText(`徽章：${s.player.badges.length} / 8`, x, y0 + 48);
      ctx.fillText(`图鉴：${c.caught} 捕获 / ${c.seen} 发现`, x, y0 + 72);
      ctx.fillText(`进度：${MQ.Story.progressText()}`, x, y0 + 96);
    },
  };

  // ---------- party ----------
  SCREENS.party = {
    update(scr) {
      const party = MQ.Game.state.party;
      const r = navList(scr, party.length);
      if (r === 'select') push('partyDetail', { idx: scr.cursor });
    },
    render(ctx, scr) {
      panel(ctx, '我的怪兽');
      const party = MQ.Game.state.party;
      party.forEach((mon, i) => {
        const x = 48, y = 80 + i * 56;
        const sel = i === scr.cursor;
        ctx.fillStyle = sel ? 'rgba(90,160,224,0.3)' : 'rgba(255,255,255,0.05)';
        MQ.roundRect(ctx, x, y, ctx.canvas.width - 96, 50, 8); ctx.fill();
        const spr = MQ.Render.monsterSprite(mon.dex, 46);
        ctx.drawImage(spr, x + 2, y + 2);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(`${mon.nickname}`, x + 56, y + 8);
        ctx.font = '13px sans-serif'; ctx.fillStyle = '#bcd';
        const sp = util.monByDex(mon.dex);
        ctx.fillText(`Lv${mon.level}  ${sp.types.map(util.typeName).join('/')}`, x + 56, y + 28);
        // hp bar
        const bx = x + 240, bw = 200;
        ctx.fillStyle = '#444'; MQ.roundRect(ctx, bx, y + 16, bw, 10, 4); ctx.fill();
        const ratio = util.clamp(mon.curHp / mon.maxHp, 0, 1);
        ctx.fillStyle = ratio > 0.5 ? '#52d452' : ratio > 0.2 ? '#f3c43b' : '#e8503a';
        MQ.roundRect(ctx, bx, y + 16, bw * ratio, 10, 4); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(`${Math.ceil(mon.curHp)}/${mon.maxHp}`, bx + bw, y + 30); ctx.textAlign = 'left';
        if (mon.status) { ctx.fillStyle = '#fa5'; ctx.fillText(({ burn: '灼伤', poison: '中毒', toxic: '剧毒', paralyze: '麻痹', sleep: '睡眠', freeze: '冰冻' })[mon.status] || '', x + 460, y + 8); }
      });
    },
  };

  SCREENS.partyDetail = {
    update(scr) { if (MQ.Input.consume('b') || MQ.Input.consume('a')) pop(); },
    render(ctx, scr) {
      const mon = MQ.Game.state.party[scr.data.idx];
      const sp = util.monByDex(mon.dex);
      panel(ctx, `${mon.nickname}  Lv${mon.level}`);
      const spr = MQ.Render.monsterSprite(mon.dex, 150);
      ctx.drawImage(spr, 56, 80);
      ctx.font = '15px sans-serif'; ctx.textAlign = 'left';
      ctx.fillStyle = '#cfe';
      ctx.fillText(`图鉴 No.${String(sp.dex).padStart(3, '0')}  ${sp.name}`, 56, 240);
      sp.types.forEach((t, i) => { ctx.fillStyle = util.typeColor(t); MQ.roundRect(ctx, 56 + i * 64, 264, 56, 22, 6); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.fillText(util.typeName(t), 64 + i * 64, 268); });
      ctx.fillStyle = '#9fb6cc'; ctx.font = '13px sans-serif';
      ctx.fillText(`性格：${Species.natureName(mon)}   特性：${(sp.abilities[0] || '')}`, 56, 296);
      // stats
      const st = Species.stats(mon);
      const labels = [['HP', mon.maxHp], ['攻击', st.atk], ['防御', st.def], ['特攻', st.spa], ['特防', st.spd], ['速度', st.spe]];
      const sx = 300, sy = 84;
      ctx.font = '15px sans-serif';
      labels.forEach(([lab, val], i) => {
        const y = sy + i * 30;
        ctx.fillStyle = '#cfe'; ctx.textAlign = 'left'; ctx.fillText(lab, sx, y);
        ctx.fillStyle = '#333'; MQ.roundRect(ctx, sx + 60, y, 200, 14, 5); ctx.fill();
        ctx.fillStyle = '#5ad'; MQ.roundRect(ctx, sx + 60, y, 200 * util.clamp(val / 200, 0.04, 1), 14, 5); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText(val, sx + 320, y); ctx.textAlign = 'left';
      });
      // moves
      ctx.fillStyle = '#ffd54a'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('招式', sx, sy + 200);
      mon.moves.forEach((slot, i) => {
        const mv = util.move(slot.id); const y = sy + 224 + i * 26;
        ctx.fillStyle = util.typeColor(mv.type); MQ.roundRect(ctx, sx, y, 10, 18, 3); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif';
        ctx.fillText(`${mv.name}`, sx + 18, y); ctx.fillStyle = '#9fb6cc';
        ctx.fillText(`PP ${slot.pp}/${slot.maxpp}`, sx + 180, y);
      });
    },
  };

  // ---------- bag ----------
  const BAG_CATS = [['回复', ['heal', 'cure', 'revive']], ['精灵球', ['ball']], ['进化/强化', ['stone', 'vitamin', 'candy']], ['关键', ['key', 'field', 'held']]];
  SCREENS.bag = {
    update(scr) {
      scr.data.cat = scr.data.cat || 0;
      if (MQ.Input.consume('left')) { scr.data.cat = (scr.data.cat + BAG_CATS.length - 1) % BAG_CATS.length; scr.cursor = 0; }
      if (MQ.Input.consume('right')) { scr.data.cat = (scr.data.cat + 1) % BAG_CATS.length; scr.cursor = 0; }
      const items = bagItems(scr.data.cat);
      if (MQ.Input.consume('b')) { pop(); return; }
      if (items.length) {
        if (MQ.Input.consume('up')) scr.cursor = (scr.cursor + items.length - 1) % items.length;
        if (MQ.Input.consume('down')) scr.cursor = (scr.cursor + 1) % items.length;
        if (MQ.Input.consume('a')) {
          const id = items[scr.cursor];
          const it = util.item(id);
          if (['heal', 'cure', 'revive', 'vitamin', 'candy', 'stone'].includes(it.cat)) push('useTarget', { itemId: id });
          else MQ.Toast.show(it.desc, 2200);
        }
      }
    },
    render(ctx, scr) {
      scr.data.cat = scr.data.cat || 0;
      panel(ctx, '背包');
      BAG_CATS.forEach(([label], i) => {
        const x = 56 + i * 130;
        ctx.fillStyle = i === scr.data.cat ? '#ffd54a' : '#888'; ctx.font = 'bold 15px sans-serif';
        ctx.fillText(label, x, 70);
      });
      const items = bagItems(scr.data.cat);
      if (!items.length) { ctx.fillStyle = '#889'; ctx.font = '15px sans-serif'; ctx.fillText('（这个分类里什么都没有）', 56, 120); return; }
      items.forEach((id, i) => {
        const it = util.item(id); const y = 110 + i * 30;
        if (y > ctx.canvas.height - 90) return;
        ctx.fillStyle = i === scr.cursor ? '#ffd54a' : '#fff'; ctx.font = '16px sans-serif';
        ctx.fillText(`${i === scr.cursor ? '▶ ' : '   '}${it.name}`, 56, y);
        ctx.fillStyle = '#9fb6cc'; ctx.textAlign = 'right'; ctx.fillText('×' + MQ.Game.state.bag[id], 520, y); ctx.textAlign = 'left';
      });
      const sel = items[scr.cursor];
      if (sel) { ctx.fillStyle = '#cfe'; ctx.font = '14px sans-serif'; ctx.fillText(util.item(sel).desc, 56, ctx.canvas.height - 70); }
    },
  };
  function bagItems(catIdx) {
    const cats = BAG_CATS[catIdx][1];
    return Object.keys(MQ.Game.state.bag).filter(id => cats.includes((util.item(id) || {}).cat));
  }

  SCREENS.useTarget = {
    update(scr) {
      const party = MQ.Game.state.party;
      const r = navList(scr, party.length);
      if (r === 'select') {
        const res = applyItemToMon(scr.data.itemId, party[scr.cursor]);
        MQ.Toast.show(res.msg, 1800);
        if (res.consumed) MQ.Game.removeItem(scr.data.itemId, 1);
        pop();
        if (!bagItems(0).concat(bagItems(2)).length) { /* keep */ }
      }
    },
    render(ctx, scr) {
      panel(ctx, '对哪只怪兽使用？');
      MQ.Game.state.party.forEach((mon, i) => {
        const y = 84 + i * 40;
        ctx.fillStyle = i === scr.cursor ? '#ffd54a' : '#fff'; ctx.font = '16px sans-serif';
        ctx.fillText(`${i === scr.cursor ? '▶ ' : '   '}${mon.nickname}  Lv${mon.level}  ${Math.ceil(mon.curHp)}/${mon.maxHp}${mon.status ? ' [' + mon.status + ']' : ''}`, 56, y);
      });
    },
  };

  function applyItemToMon(itemId, mon) {
    const it = util.item(itemId);
    if (it.cat === 'heal') { if (mon.curHp <= 0) return { consumed: false, msg: '濒死的怪兽无法使用伤药。' }; if (mon.curHp >= mon.maxHp) return { consumed: false, msg: '体力已满。' }; mon.curHp = util.clamp(mon.curHp + it.heal, 0, mon.maxHp); return { consumed: true, msg: `${mon.nickname} 回复了体力。` }; }
    if (it.cat === 'revive') { if (mon.curHp > 0) return { consumed: false, msg: '它还很有精神。' }; mon.curHp = Math.floor(mon.maxHp * it.reviveFraction); mon.fainted = false; return { consumed: true, msg: `${mon.nickname} 复活了！` }; }
    if (it.cat === 'cure') { if (it.cures.includes(mon.status)) { mon.status = null; return { consumed: true, msg: `${mon.nickname} 的状态恢复了。` }; } return { consumed: false, msg: '没有可治疗的状态。' }; }
    if (it.cat === 'vitamin') { mon.evs[it.stat] = util.clamp((mon.evs[it.stat] || 0) + 10, 0, 252); const s = Species.stats(mon); mon.maxHp = s.maxHp; return { consumed: true, msg: `${mon.nickname} 的基础点提升了。` }; }
    if (it.cat === 'candy') { if (mon.level >= 100) return { consumed: false, msg: '已经到达 100 级了。' }; const need = Species.expForLevel(util.monByDex(mon.dex).growthRate, mon.level + 1) - mon.exp; const ev = Species.gainExp(mon, Math.max(1, need)); const evo = Species.evolutionFor(mon); if (evo) { const from = mon.nickname; Species.evolve(mon, evo); MQ.Game.markCaught(mon.dex); return { consumed: true, msg: `${from} 升级并进化成了 ${mon.nickname}！` }; } return { consumed: true, msg: `${mon.nickname} 升到了 ${mon.level} 级！` }; }
    if (it.cat === 'stone') { const evo = Species.evolutionFor(mon, { item: itemId }); if (evo) { const from = mon.nickname; Species.evolve(mon, evo); MQ.Game.markCaught(mon.dex); return { consumed: true, msg: `${from} 进化成了 ${mon.nickname}！` }; } return { consumed: false, msg: '似乎没有反应。' }; }
    return { consumed: false, msg: '什么也没发生。' };
  }

  // ---------- dex ----------
  SCREENS.dex = {
    update(scr) {
      const mons = MQ.monsters;
      if (MQ.Input.consume('b')) { pop(); return; }
      const per = 12;
      if (MQ.Input.consume('up')) scr.cursor = (scr.cursor + mons.length - 1) % mons.length;
      if (MQ.Input.consume('down')) scr.cursor = (scr.cursor + 1) % mons.length;
      if (MQ.Input.consume('left')) scr.cursor = util.clamp(scr.cursor - per, 0, mons.length - 1);
      if (MQ.Input.consume('right')) scr.cursor = util.clamp(scr.cursor + per, 0, mons.length - 1);
      if (MQ.Input.consume('a')) push('dexDetail', { dex: mons[scr.cursor].dex });
    },
    render(ctx, scr) {
      const c = MQ.Game.dexCounts();
      panel(ctx, `怪兽图鉴   ${c.caught}/${c.total}`);
      const mons = MQ.monsters, per = 12;
      const page = Math.floor(scr.cursor / per);
      const start = page * per;
      for (let i = 0; i < per; i++) {
        const idx = start + i; if (idx >= mons.length) break;
        const m = mons[idx]; const y = 80 + i * 32;
        const seen = MQ.Game.state.dex.seen[m.dex], caught = MQ.Game.state.dex.caught[m.dex];
        ctx.fillStyle = idx === scr.cursor ? '#ffd54a' : (caught ? '#fff' : seen ? '#aab' : '#667');
        ctx.font = '15px sans-serif'; ctx.textAlign = 'left';
        const name = caught || seen ? m.name : '？？？？';
        ctx.fillText(`${idx === scr.cursor ? '▶' : ' '} No.${String(m.dex).padStart(3, '0')}  ${caught ? '●' : seen ? '○' : ' '} ${name}`, 56, y);
      }
      // preview
      const sel = mons[scr.cursor];
      const known = MQ.Game.state.dex.seen[sel.dex];
      const px = ctx.canvas.width - 220, py = 90;
      if (known) {
        const spr = MQ.Render.monsterSprite(sel.dex, 150); ctx.drawImage(spr, px, py);
        ctx.fillStyle = '#cfe'; ctx.font = '14px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(sel.types.map(util.typeName).join(' / '), px + 20, py + 156);
      } else { ctx.fillStyle = '#556'; ctx.font = '60px sans-serif'; ctx.fillText('？', px + 50, py + 50); }
      ctx.fillStyle = '#889'; ctx.font = '12px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText('● 已捕获  ○ 已发现  ←→ 翻页', ctx.canvas.width - 44, ctx.canvas.height - 44); ctx.textAlign = 'left';
    },
  };
  SCREENS.dexDetail = {
    update(scr) { if (MQ.Input.consume('a') || MQ.Input.consume('b')) pop(); },
    render(ctx, scr) {
      const m = util.monByDex(scr.data.dex);
      const known = MQ.Game.state.dex.seen[m.dex];
      panel(ctx, `No.${String(m.dex).padStart(3, '0')}  ${known ? m.name : '？？？？'}`);
      if (!known) { ctx.fillStyle = '#667'; ctx.font = '20px sans-serif'; ctx.fillText('尚未发现这只怪兽。', 56, 120); return; }
      const spr = MQ.Render.monsterSprite(m.dex, 170); ctx.drawImage(spr, 56, 80);
      ctx.font = '15px sans-serif'; ctx.textAlign = 'left';
      m.types.forEach((t, i) => { ctx.fillStyle = util.typeColor(t); MQ.roundRect(ctx, 56 + i * 70, 256, 60, 24, 6); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.fillText(util.typeName(t), 66 + i * 70, 261); });
      const tx = 280;
      ctx.fillStyle = '#cfe'; ctx.font = '15px sans-serif';
      ctx.fillText(`分类：${({ starter: '初学者伙伴', common: '常见种', uncommon: '少见种', rare: '稀有种', pseudo: '准神', legendary: '传说', mythical: '幻之怪兽' })[m.category] || m.category}`, tx, 90);
      ctx.fillText(`栖息地：${m.region}`, tx, 116);
      ctx.fillText(`身高 ${m.height} m   体重 ${m.weight} kg`, tx, 142);
      ctx.fillText(`种族值总和：${m.bst}`, tx, 168);
      if (m.evolution) ctx.fillText(`进化：${({ level: '等级 ' + m.evolution.level, stone: '使用' + (util.item(m.evolution.item) || {}).name, friendship: '亲密度' })[m.evolution.type]} → ${util.mon(m.evolution.to).name}`, tx, 194);
      // description wrap
      ctx.fillStyle = '#fff'; ctx.font = '15px sans-serif';
      wrapText(ctx, m.desc, tx, 230, ctx.canvas.width - tx - 60, 24);
    },
  };

  // ---------- trainer card ----------
  SCREENS.trainer = {
    update(scr) { if (MQ.Input.consume('a') || MQ.Input.consume('b')) pop(); },
    render(ctx, scr) {
      const s = MQ.Game.state, c = MQ.Game.dexCounts();
      panel(ctx, '训练家卡');
      ctx.font = '18px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
      const L = [
        `姓名：${s.player.name}`,
        `金钱：¥${s.player.money}`,
        `徽章：${s.player.badges.length} / 8 枚`,
        `图鉴：发现 ${c.seen} 种，捕获 ${c.caught} 种`,
        `胜场：${s.stats.battlesWon}    捕获次数：${s.stats.caught}`,
        `步数：${s.stats.steps}`,
        `游戏时间：${fmtTime(s.stats.playtimeMs)}`,
        `当前进度：${MQ.Story.progressText()}`,
      ];
      L.forEach((t, i) => ctx.fillText(t, 56, 90 + i * 34));
      // badges row
      const badges = s.player.badges;
      ctx.fillStyle = '#ffd54a'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('已获得徽章：', 56, 90 + L.length * 34 + 10);
      badges.forEach((b, i) => { ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(180 + i * 40, 90 + L.length * 34 + 16, 12, 0, 7); ctx.fill(); });
    },
  };

  // ---------- save ----------
  // (handled inline in main)

  // ---------- shop ----------
  SCREENS.shop = {
    update(scr) {
      const npc = scr.data.npc;
      const stock = npc.stock || [];
      const r = navList(scr, stock.length);
      if (r === 'select') {
        const id = stock[scr.cursor]; const it = util.item(id);
        if (MQ.Game.state.player.money >= it.price) { MQ.Game.state.player.money -= it.price; MQ.Game.addItem(id, 1); MQ.Toast.show(`购买了 ${it.name}。`, 1400); }
        else MQ.Toast.show('金钱不足！', 1400);
      }
    },
    render(ctx, scr) {
      const npc = scr.data.npc; const stock = npc.stock || [];
      panel(ctx, '商店');
      ctx.fillStyle = '#cfe'; ctx.font = '15px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(`持有金钱：¥${MQ.Game.state.player.money}`, ctx.canvas.width - 44, 70); ctx.textAlign = 'left';
      stock.forEach((id, i) => {
        const it = util.item(id); const y = 100 + i * 34;
        ctx.fillStyle = i === scr.cursor ? '#ffd54a' : '#fff'; ctx.font = '16px sans-serif';
        ctx.fillText(`${i === scr.cursor ? '▶ ' : '   '}${it.name}`, 56, y);
        ctx.fillStyle = '#9fb6cc'; ctx.textAlign = 'right'; ctx.fillText(`¥${it.price}`, 440, y); ctx.textAlign = 'left';
      });
      const sel = stock[scr.cursor];
      if (sel) { ctx.fillStyle = '#cfe'; ctx.font = '14px sans-serif'; ctx.fillText(util.item(sel).desc, 56, ctx.canvas.height - 60); }
    },
  };

  // ---------- box (PC) ----------
  SCREENS.box = {
    update(scr) {
      const party = MQ.Game.state.party, box = MQ.Game.state.box;
      const total = party.length + box.length;
      if (MQ.Input.consume('b')) { pop(); return; }
      if (MQ.Input.consume('up')) scr.cursor = (scr.cursor + total - 1) % total;
      if (MQ.Input.consume('down')) scr.cursor = (scr.cursor + 1) % total;
      if (MQ.Input.consume('a')) {
        if (scr.cursor < party.length) {
          // deposit
          if (party.length <= 1) { MQ.Toast.show('队伍中至少要保留一只怪兽！', 1600); return; }
          const mon = party.splice(scr.cursor, 1)[0]; box.push(mon); MQ.Toast.show(`${mon.nickname} 被存入了储存系统。`, 1500);
          if (scr.cursor >= party.length + box.length) scr.cursor--;
        } else {
          // withdraw
          if (party.length >= 6) { MQ.Toast.show('队伍已满（最多 6 只）！', 1600); return; }
          const bi = scr.cursor - party.length; const mon = box.splice(bi, 1)[0]; party.push(mon); MQ.Toast.show(`${mon.nickname} 加入了队伍。`, 1500);
        }
      }
    },
    render(ctx, scr) {
      const party = MQ.Game.state.party, box = MQ.Game.state.box;
      panel(ctx, '储存系统 PC');
      ctx.fillStyle = '#ffd54a'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('队伍', 56, 70);
      party.forEach((mon, i) => {
        const y = 92 + i * 26; const sel = scr.cursor === i;
        ctx.fillStyle = sel ? '#ffd54a' : '#fff'; ctx.font = '14px sans-serif';
        ctx.fillText(`${sel ? '▶ ' : '   '}${mon.nickname} Lv${mon.level}`, 56, y);
      });
      ctx.fillStyle = '#ffd54a'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(`仓库（${box.length}）`, 320, 70);
      box.forEach((mon, i) => {
        const y = 92 + i * 24; if (y > ctx.canvas.height - 70) return;
        const idx = party.length + i; const sel = scr.cursor === idx;
        ctx.fillStyle = sel ? '#ffd54a' : '#cdd'; ctx.font = '13px sans-serif';
        ctx.fillText(`${sel ? '▶ ' : '   '}${mon.nickname} Lv${mon.level}`, 320, y);
      });
      ctx.fillStyle = '#889'; ctx.font = '12px sans-serif';
      ctx.fillText('队伍中选 Z = 存入仓库；仓库中选 Z = 取回队伍', 56, ctx.canvas.height - 50);
    },
  };

  function wrapText(ctx, text, x, y, maxW, lh) {
    let line = '', yy = y;
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, x, yy); line = ch; yy += lh; }
      else line += ch;
    }
    if (line) ctx.fillText(line, x, yy);
  }
  function fmtTime(ms) { const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return `${h}小时${m}分`; }

})(window.MQ);
