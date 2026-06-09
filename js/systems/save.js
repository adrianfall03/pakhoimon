// LocalStorage save/load. Battle-only fields (Sets, transient flags) are never in state.
(function (MQ) {
  'use strict';
  const KEY = 'monsterquest_save_v1';
  const Save = MQ.Save = {};

  Save.exists = function () { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } };

  Save.save = function () {
    try {
      localStorage.setItem(KEY, JSON.stringify(MQ.Game.state));
      MQ.Toast && MQ.Toast.show('游戏已保存！', 1500);
      return true;
    } catch (e) { MQ.Toast && MQ.Toast.show('保存失败：' + e.message, 2000); return false; }
  };

  Save.load = function () {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const st = JSON.parse(raw);
      // re-derive transient maxHp in case formulas changed
      for (const m of [...(st.party || []), ...(st.box || [])]) {
        const s = MQ.Species.stats(m); m.maxHp = s.maxHp; if (m.curHp > m.maxHp) m.curHp = m.maxHp;
      }
      MQ.Game.state = st;
      return true;
    } catch (e) { return false; }
  };

  Save.wipe = function () { try { localStorage.removeItem(KEY); } catch (e) { } };

})(window.MQ);
