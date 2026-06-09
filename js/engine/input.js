// Keyboard input mapped to logical buttons, with a one-shot "just pressed" queue.
(function (MQ) {
  'use strict';
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    KeyZ: 'a', Enter: 'a', Space: 'a',
    KeyX: 'b', Backspace: 'b', Escape: 'b',
    ShiftLeft: 'run', ShiftRight: 'run',
    KeyM: 'menu', KeyP: 'menu',
  };

  const down = {};
  const queue = [];

  const Input = MQ.Input = {
    isDown: (b) => !!down[b],
    // pop the next one-shot press of any/specific button
    next() { return queue.shift() || null; },
    peekAll() { const q = queue.slice(); queue.length = 0; return q; },
    clear() { queue.length = 0; },
    consume(button) {
      const i = queue.indexOf(button);
      if (i >= 0) { queue.splice(i, 1); return true; }
      return false;
    },
  };

  window.addEventListener('keydown', (e) => {
    const b = KEYMAP[e.code];
    if (!b) return;
    e.preventDefault();
    if (!down[b]) queue.push(b); // edge-trigger
    down[b] = true;
  });
  window.addEventListener('keyup', (e) => {
    const b = KEYMAP[e.code];
    if (!b) return;
    down[b] = false;
  });
  window.addEventListener('blur', () => { for (const k in down) down[k] = false; queue.length = 0; });
})(window.MQ);
