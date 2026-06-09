// Engine UI primitives: screen transitions, transient toasts, and the dialogue box.
(function (MQ) {
  'use strict';
  const util = MQ.util;

  // ---------- Transition (fade) ----------
  const Transition = MQ.Transition = { active: false };
  let phase = 'idle', alpha = 0, cb = null;
  Transition.fade = function (midCb) {
    if (Transition.active) { midCb && midCb(); return; }
    Transition.active = true; phase = 'out'; alpha = 0; cb = midCb;
  };
  Transition.update = function (dt) {
    if (!Transition.active) return;
    const sp = dt * 3.2;
    if (phase === 'out') { alpha += sp; if (alpha >= 1) { alpha = 1; phase = 'in'; if (cb) { const f = cb; cb = null; f(); } } }
    else if (phase === 'in') { alpha -= sp; if (alpha <= 0) { alpha = 0; phase = 'idle'; Transition.active = false; } }
  };
  Transition.render = function (ctx) {
    if (alpha <= 0) return;
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  };

  // ---------- Toast ----------
  const Toast = MQ.Toast = {};
  let toastMsg = null, toastT = 0;
  Toast.show = function (msg, ms = 1500) { toastMsg = msg; toastT = ms / 1000; };
  Toast.render = function (ctx) {
    if (!toastMsg || toastT <= 0) return;
    ctx.save();
    ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    const w = ctx.measureText(toastMsg).width + 28;
    ctx.fillStyle = 'rgba(20,20,30,0.82)';
    roundRect(ctx, ctx.canvas.width / 2 - w / 2, 10, w, 30, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(toastMsg, ctx.canvas.width / 2, 16);
    ctx.restore();
  };
  // toast countdown lives in Game loop via update hook
  Toast.update = function (dt) { if (toastT > 0) toastT -= dt; };

  // ---------- Dialogue ----------
  const Dialogue = MQ.Dialogue = {};
  let lines = [], li = 0, shown = 0, opts = null, choosing = false, choiceIdx = 0, openInDialogue = false;
  let typeAcc = 0;

  Dialogue.isOpen = () => MQ.Game.mode === 'dialogue';

  Dialogue.open = function (text, options) {
    lines = Array.isArray(text) ? text.slice() : [text];
    li = 0; shown = 0; typeAcc = 0; opts = options || null; choosing = false; choiceIdx = 0;
    if (MQ.Game.mode !== 'dialogue') MQ.Game.pushMode('dialogue');
  };

  Dialogue.close = function () {
    const done = opts && opts.onDone;
    opts = null; lines = [];
    MQ.Game.popMode();
    if (done) done();
  };

  Dialogue.update = function (dt) {
    const cur = lines[li] || '';
    if (shown < cur.length) {
      typeAcc += dt;
      const cps = 48;
      while (typeAcc > 1 / cps && shown < cur.length) { shown++; typeAcc -= 1 / cps; }
      if (MQ.Input.consume('a')) shown = cur.length; // skip typing
      return;
    }
    // line fully shown
    if (choosing) {
      const n = opts.choices.length;
      if (MQ.Input.consume('up')) choiceIdx = (choiceIdx + n - 1) % n;
      if (MQ.Input.consume('down')) choiceIdx = (choiceIdx + 1) % n;
      if (MQ.Input.consume('a')) {
        const idx = choiceIdx; choosing = false;
        const handler = opts.onChoice;
        const wasOpts = opts;
        // a choice handler may itself open a new dialogue; detect that
        const before = lines.length;
        if (handler) handler(idx);
        // if handler opened a fresh dialogue, lines/li were reset; otherwise close
        if (MQ.Game.mode === 'dialogue' && (opts === wasOpts)) Dialogue.close();
        return;
      }
      return;
    }
    if (MQ.Input.consume('a') || MQ.Input.consume('b')) {
      if (li < lines.length - 1) { li++; shown = 0; typeAcc = 0; }
      else if (opts && opts.choices) { choosing = true; }
      else { Dialogue.close(); }
    }
  };

  function wrap(ctx, text, maxW) {
    const out = []; let line = '';
    for (const ch of text) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = ch; }
      else line = test;
    }
    if (line) out.push(line);
    return out;
  }

  Dialogue.render = function (ctx) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const boxH = 116, pad = 16;
    const by = H - boxH - 8;
    ctx.fillStyle = 'rgba(15,18,28,0.94)';
    roundRect(ctx, 8, by, W - 16, boxH, 12); ctx.fill();
    ctx.strokeStyle = '#5aa0e0'; ctx.lineWidth = 3; roundRect(ctx, 8, by, W - 16, boxH, 12); ctx.stroke();

    ctx.fillStyle = '#fff'; ctx.font = '18px "PingFang SC", "Microsoft YaHei", sans-serif'; ctx.textAlign = 'left';
    const cur = (lines[li] || '').slice(0, shown);
    const wrapped = wrap(ctx, cur, W - 16 - pad * 2);
    wrapped.slice(0, 3).forEach((l, i) => ctx.fillText(l, 8 + pad, by + pad + i * 26));

    // choices
    if (choosing && shown >= (lines[li] || '').length) {
      const cw = 150, ch = opts.choices.length * 28 + 12;
      const cx = W - cw - 16, cy = by - ch - 6;
      ctx.fillStyle = 'rgba(15,18,28,0.96)'; roundRect(ctx, cx, cy, cw, ch, 8); ctx.fill();
      ctx.strokeStyle = '#5aa0e0'; ctx.lineWidth = 2; roundRect(ctx, cx, cy, cw, ch, 8); ctx.stroke();
      opts.choices.forEach((c, i) => {
        ctx.fillStyle = i === choiceIdx ? '#ffd54a' : '#fff';
        ctx.fillText((i === choiceIdx ? '▶ ' : '   ') + c, cx + 12, cy + 8 + i * 28);
      });
    } else if (shown >= (lines[li] || '').length) {
      // blinking advance arrow
      ctx.fillStyle = '#ffd54a';
      const t = (Date.now() % 800) < 400;
      if (t) { ctx.beginPath(); ctx.moveTo(W - 34, by + boxH - 22); ctx.lineTo(W - 22, by + boxH - 22); ctx.lineTo(W - 28, by + boxH - 14); ctx.fill(); }
    }
  };

  // shared rounded-rect path
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  MQ.roundRect = roundRect;

})(window.MQ);
