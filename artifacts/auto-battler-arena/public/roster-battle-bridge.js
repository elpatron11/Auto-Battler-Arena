(function () {
  'use strict';
  const query = new URLSearchParams(location.search);
  if (typeof PRACTICE_ONLY === 'undefined' || !PRACTICE_ONLY || !GUEST_TRIAL ||
      query.get('rosterBattlePreview') !== '1' || window.parent === window) return;
  const ids = new Set(['warrior', 'priest', 'frostmage', 'rogue', 'paladin', 'archer', 'warlock', 'druid', 'shaman']);
  let lastLiveTime = 0;
  let frameTime = 0;
  function team(value) {
    if (!Array.isArray(value) || value.length !== 3 || value.some(id => !ids.has(id))) {
      throw new Error('Choose three valid playable classes for each practice team.');
    }
    return value.slice();
  }
  window.RosterBattleGame = {
    beginFrame(time) {
      if (!state || !state.paused) frameTime = time;
    },
    clock(time) {
      if (!state || !state.paused) lastLiveTime = frameTime || time;
      return lastLiveTime;
    },
    // Render-only consumer: never change these live entities or call their combat callbacks.
    entitiesForRendering() { return state ? state.entities : []; },
    start(config) {
      if (!config) throw new Error('The roster practice lineup is missing.');
      const own = team(config.player), opponent = team(config.enemy);
      const encounter = config.encounter || 'arena';
      if (!['arena', 'frost', 'demon', 'temple'].includes(encounter)) throw new Error('Choose a valid practice encounter.');
      if (encounter !== 'arena' && !window.HourlyDungeon?.startPreviewEncounter) throw new Error('The local dungeon engine is not ready.');
      const druidAbility = config.druidAbility === 'custom' ? 'custom' : 'default';
      selected = own;
      selectedBuilds = own.map(classId => ({
        classId, ability: classId === 'druid' ? druidAbility : 'default', ultimate: 'default',
      }));
      abilityChoice = {}; ultChoice = {};
      setTeamSize(3);
      captainClass = own[0]; captainRacial = 'nightelf';
      lastLiveTime = 0;
      frameTime = 0;
      if (encounter !== 'arena') {
        window.HourlyDungeon.startPreviewEncounter(encounter);
        return;
      }
      startBattle({
        _ordersConfirmed: true, _arenaTipShown: true, _priorityPrepared: true,
        enemyTeam: opponent, enemyAbilities: { druid: druidAbility }, enemyUlts: {},
        enemyBuilds: opponent.map(classId => ({
          classId, ability: classId === 'druid' ? druidAbility : 'default', ultimate: 'default',
        })),
        enemyCaptainClass: opponent[0], enemyCaptainRacial: 'nightelf',
      });
    },
    snapshot() {
      const entities = state ? state.entities : [];
      return {
        practice: true, active: !!state && !state.over, over: !!state && !!state.over,
        gold: playerProfile ? playerProfile.gold : 0,
        encounter: state && state.dungeonEncounter ? state.dungeonEncounter.id : 'arena',
        units: entities.filter(e => !e.isPet).map(e => ({
          id: e.id, classId: e.classId, team: e.team, alive: e.alive, hp: e.hp, maxHp: e.maxHp,
          name: e.name, creature: !!(e._dungeonBoss || e._dungeonAdd),
          form: e.extra && e.extra.form || '',
        })),
        creatures: entities.filter(e => e.isPet || e._dungeonBoss || e._dungeonAdd).map(e => ({
          classId: e.classId, name: e.name, alive: e.alive,
        })),
      };
    },
  };
})();