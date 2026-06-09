// Boot: build data indexes, init the renderer, show the title screen, start the loop.
(function (MQ) {
  'use strict';
  window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game');
    MQ.util.buildIndexes();
    MQ.Render.init(canvas);
    MQ.Title.reset();
    MQ.Game.mode = 'title';
    MQ.Game.start();
    // expose for debugging in the console
    window.MQ = MQ;
    console.log(`MonsterQuest loaded: ${MQ.monsters.length} monsters, ${MQ.moves.length} moves, ${MQ.npcs.length} NPCs, ${MQ.maps.length} maps.`);
  });
})(window.MQ);
