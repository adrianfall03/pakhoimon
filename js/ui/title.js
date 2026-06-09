// Title screen: new game / continue, name pick, and starter selection.
(function (MQ) {
  'use strict';
  const util = MQ.util;
  const Title = MQ.Title = {};

  let state = 'menu', cursor = 0, t = 0;
  const NAMES = ['小遥', '阿宇', '晴', '凛', '澪', '一航', '星野', '随机'];
  const STARTERS = [1, 4, 7]; // grass / fire / water stage-1 dex
  let chosenName = NAMES[0];

  Title.reset = function () { state = MQ.Save.exists() ? 'menu' : 'menu'; cursor = 0; };

  Title.update = function (dt) {
    t += dt;
    if (state === 'menu') {
      const opts = menuOpts();
      if (MQ.Input.consume('up')) cursor = (cursor + opts.length - 1) % opts.length;
      if (MQ.Input.consume('down')) cursor = (cursor + 1) % opts.length;
      if (MQ.Input.consume('a')) {
        const opt = opts[cursor];
        if (opt === 'continue') { doContinue(); }
        else { state = 'name'; cursor = 0; }
      }
    } else if (state === 'name') {
      if (MQ.Input.consume('left')) cursor = (cursor + NAMES.length - 1) % NAMES.length;
      if (MQ.Input.consume('right')) cursor = (cursor + 1) % NAMES.length;
      if (MQ.Input.consume('up')) cursor = (cursor + NAMES.length - 1) % NAMES.length;
      if (MQ.Input.consume('down')) cursor = (cursor + 1) % NAMES.length;
      if (MQ.Input.consume('b')) { state = 'menu'; cursor = 0; }
      if (MQ.Input.consume('a')) {
        chosenName = NAMES[cursor] === '随机' ? util.pick(NAMES.slice(0, -1)) : NAMES[cursor];
        state = 'starter'; cursor = 0;
      }
    } else if (state === 'starter') {
      if (MQ.Input.consume('left')) cursor = (cursor + STARTERS.length - 1) % STARTERS.length;
      if (MQ.Input.consume('right')) cursor = (cursor + 1) % STARTERS.length;
      if (MQ.Input.consume('b')) { state = 'name'; }
      if (MQ.Input.consume('a')) {
        const dex = STARTERS[cursor];
        MQ.Transition.fade(() => { MQ.Game.newGame(dex, chosenName); });
      }
    }
  };

  function menuOpts() { return MQ.Save.exists() ? ['continue', 'new'] : ['new']; }

  function doContinue() {
    if (MQ.Save.load()) {
      const p = MQ.Game.state.player;
      MQ.Transition.fade(() => {
        MQ.Game.setMode('overworld');
        MQ.World.load(p.mapId, p.x, p.y, p.dir);
      });
    }
  }

  Title.render = function (ctx) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a2a4a'); g.addColorStop(0.5, '#2a4a7a'); g.addColorStop(1, '#5a3a6a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // drifting monster silhouettes
    for (let i = 0; i < 6; i++) {
      const dx = (i * 53 + 1) % 200;
      const x = ((t * (12 + i * 4) + i * 130) % (W + 160)) - 80;
      const y = 80 + i * 48 + Math.sin(t + i) * 10;
      const spr = MQ.Render.monsterSprite(STARTERS[i % 3] + i, 70);
      ctx.globalAlpha = 0.18; ctx.drawImage(spr, x, y); ctx.globalAlpha = 1;
    }
    // title
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd54a'; ctx.font = 'bold 56px "PingFang SC", sans-serif';
    ctx.fillText('怪兽探险', W / 2, H * 0.16);
    ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif';
    ctx.fillText('MonsterQuest · 澪原物语', W / 2, H * 0.16 + 64);
    ctx.fillStyle = '#bcd'; ctx.font = '13px sans-serif';
    ctx.fillText(`收录 ${(MQ.monsters || []).length} 种怪兽 · ${(MQ.npcs || []).length} 位角色 · 长篇主线`, W / 2, H * 0.16 + 92);

    if (state === 'menu') {
      const opts = menuOpts();
      const labels = { continue: '继续游戏', new: '新的旅程' };
      opts.forEach((o, i) => {
        ctx.fillStyle = i === cursor ? '#ffd54a' : '#fff'; ctx.font = 'bold 26px sans-serif';
        ctx.fillText((i === cursor ? '▶ ' : '') + labels[o], W / 2, H * 0.55 + i * 48);
      });
      ctx.fillStyle = '#9fb6cc'; ctx.font = '14px sans-serif';
      ctx.fillText('方向键选择 · Z 确认 · X 返回 · M 打开菜单', W / 2, H - 40);
    } else if (state === 'name') {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif'; ctx.fillText('你叫什么名字？', W / 2, H * 0.42);
      ctx.font = 'bold 30px sans-serif';
      ctx.fillStyle = '#ffd54a'; ctx.fillText('◀  ' + NAMES[cursor] + '  ▶', W / 2, H * 0.55);
      ctx.fillStyle = '#9fb6cc'; ctx.font = '14px sans-serif'; ctx.fillText('左右切换名字 · Z 确认', W / 2, H - 40);
    } else if (state === 'starter') {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif'; ctx.fillText('选择你的第一个伙伴', W / 2, H * 0.30);
      STARTERS.forEach((dex, i) => {
        const x = W / 2 + (i - 1) * 220, y = H * 0.5;
        const sel = i === cursor;
        const m = util.monByDex(dex);
        if (sel) { ctx.fillStyle = 'rgba(255,213,74,0.18)'; MQ.roundRect(ctx, x - 90, y - 90, 180, 200, 14); ctx.fill(); }
        const spr = MQ.Render.monsterSprite(dex, sel ? 150 : 120);
        ctx.drawImage(spr, x - (sel ? 75 : 60), y - (sel ? 80 : 70));
        ctx.fillStyle = sel ? '#ffd54a' : '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(m.name, x, y + 92);
        ctx.fillStyle = util.typeColor(m.types[0]); ctx.font = '14px sans-serif';
        ctx.fillText(m.types.map(util.typeName).join('/'), x, y + 116);
      });
      ctx.fillStyle = '#9fb6cc'; ctx.font = '14px sans-serif';
      ctx.fillText('左右选择 · Z 确认 · X 返回', W / 2, H - 40);
    }
    ctx.textAlign = 'left';
  };

})(window.MQ);
