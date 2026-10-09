import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/active-build.js', import.meta.url), 'utf8');

function openGame(profile) {
  const messages = [];
  const game = {
    playerProfile: profile,
    selected: [],
    selectedBuilds: [],
    teamSize: 3,
    abilityChoice: {},
    ultChoice: {},
    captainClass: null,
    captainRacial: null,
    activeTeamFormation: null,
    teamOrders: { focus: null, control: null, heal: null, switchLow: true },
    FORMATIONS: { balanced: {} },
    window: { parent: { postMessage: message => messages.push(message) } },
    location: { origin: 'https://example.test' },
    ownsClass: key => profile.ownedClasses.includes(key),
    ownsRacial: key => profile.ownedRacials.includes(key),
    ownsCustomAbility: key => (profile.ownedSpells || []).includes(key),
    ownsCustomUlt: key => (profile.ownedUltimates || []).includes(key),
    isTalentUnlocked: (_key, id) => id === 'free',
    defenseTalentSnapshot: key => profile.talents[key] || [],
    setTeamSize: size => { game.teamSize = size; },
    mainLoadoutV4464: () => profile.savedTeams?.find(t => t.id === profile.mainLoadoutId) || null,
    savePlayerProfile: () => { game.saved = structuredClone(profile); },
    buildSelectScreen: () => {},
    renderSlots: () => {},
    refreshCaptainUI: () => {},
    refreshBattleButtons: () => {},
    updateHubTeamSummary: () => {},
    startBattle: () => {},
    showOverlay: () => {},
  };
  vm.runInNewContext(source, game);
  return { game, messages };
}

test('the active team and each hero build persist after a match and account reload', () => {
  const profile = {
    ownedClasses: ['warrior', 'priest', 'rogue'], ownedRacials: ['orc'],
    ownedSpells: ['warrior'], ownedUltimates: ['rogue'], talents: { warrior: ['free'] },
  };
  const { game, messages } = openGame(profile);
  game.selected = ['warrior', 'priest', 'rogue'];
  game.selectedBuilds = [
    { classId: 'warrior', ability: 'custom', ultimate: 'default' },
    { classId: 'priest', ability: 'default', ultimate: 'default' },
    { classId: 'rogue', ability: 'default', ultimate: 'custom' },
  ];
  game.captainClass = 'warrior';
  game.captainRacial = 'orc';
  game.activeTeamFormation = 'balanced';
  game.renderSlots();
  game.startBattle();
  game.showOverlay('Victory!');

  assert.ok(messages.some(message => message.type === 'arena:flush-profile'));
  const reopened = openGame(game.saved).game;
  assert.deepEqual(Array.from(reopened.selected), ['warrior', 'priest', 'rogue']);
  assert.deepEqual(Array.from(reopened.selectedBuilds, h => h.ability), ['custom', 'default', 'default']);
  assert.deepEqual(Array.from(reopened.selectedBuilds, h => h.ultimate), ['default', 'default', 'custom']);
  assert.equal(reopened.captainClass, 'warrior');
  assert.equal(reopened.captainRacial, 'orc');
  assert.equal(reopened.activeTeamFormation, 'balanced');
});

test('a previously designated main loadout equips itself when no active build was stored', () => {
  const profile = {
    ownedClasses: ['warrior', 'priest', 'rogue'], ownedRacials: ['orc'], talents: {},
    mainLoadoutId: 'main',
    savedTeams: [{
      id: 'main', name: 'Main', heroes: ['warrior', 'priest', 'rogue'].map(classId => ({
        classId, ability: 'default', ultimate: 'default', talents: [],
      })),
      captainClass: 'priest', captainRacial: 'orc', formation: 'balanced',
    }],
  };
  const { game } = openGame(profile);
  assert.deepEqual(Array.from(game.selected), ['warrior', 'priest', 'rogue']);
  assert.equal(game.captainClass, 'priest');
  assert.equal(game.activeTeamFormation, 'balanced');
});

test('a stale active build cannot equip a class the account does not own', () => {
  const profile = {
    ownedClasses: ['warrior'], ownedRacials: [], talents: {},
    activeBuild: { teamSize: 1, heroes: [{ classId: 'rogue' }] },
  };
  const { game } = openGame(profile);
  assert.deepEqual(Array.from(game.selected), []);
});