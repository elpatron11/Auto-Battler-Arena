(function () {
  'use strict';
  const query = new URLSearchParams(location.search);
  if (typeof PRACTICE_ONLY === 'undefined' || !PRACTICE_ONLY ||
      !GUEST_TRIAL || query.get('warriorBattlePreview') !== '1' ||
      window.parent === window) return;

  // This bridge never imports saved account data or awards anything. It calls
  // the same practice lifecycle the existing isolated practice document uses.
  let lastLiveTime = 0;
  window.WarriorBattleGame = {
    clock(time) {
      if (!state || !state.paused) lastLiveTime = time;
      return lastLiveTime;
    },
    start() {
      lastLiveTime = 0;
      startBattle({
        _ordersConfirmed: true,
        // The isolated visual comparison opens directly in combat; keep the
        // normal game's loading-tip lifecycle unchanged.
        _arenaTipShown: true,
        _priorityPrepared: true,
        enemyTeam: ['warrior', 'priest', 'frostmage'],
        enemyAbilities: {},
        enemyUlts: {},
      });
    },
    snapshot() {
      const entities = state ? state.entities : [];
      const hero = entities.find(e => e.team === 'player' && e.isCaptain && e.classId === 'warrior');
      return {
        practice: true,
        active: !!state && !state.over,
        over: !!state && !!state.over,
        units: entities.filter(e => !e.isPet).length,
        gold: playerProfile ? playerProfile.gold : 0,
        hero: hero ? { id: hero.id, alive: hero.alive, hp: hero.hp, maxHp: hero.maxHp } : null,
      };
    },
  };
})();