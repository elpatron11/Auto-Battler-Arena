import assert from "node:assert/strict";
import { test } from "node:test";
import { autoDefenseCandidates, explicitDefenseChange } from "../src/lib/arenaAutoDefense.ts";

const team = (name) => ({
  id: name,
  heroes: ["warrior", "priest", "rogue"].map(classId => ({ classId })),
  captainClass: "warrior",
  captainRacial: "nightelf",
  orders: { switchLow: true },
  name,
  stats: { games: 5 },
});

test("missing defense uses equipped team before the main or recent saved teams", () => {
  const state = {
    currentTeam: team("equipped"),
    mainLoadoutId: "main",
    savedTeams: [team("main"), team("recent")],
  };
  const candidates = autoDefenseCandidates(state);
  assert.equal(candidates.length, 3);
  assert.deepEqual(candidates.map(candidate => candidate.heroes), [
    state.currentTeam.heroes, state.savedTeams[0].heroes, state.savedTeams[1].heroes,
  ]);
  assert.equal(candidates[0].name, undefined);
  assert.equal(candidates[0].stats, undefined);
});

test("an explicitly saved defense takes precedence and incomplete entries are skipped", () => {
  const explicit = team("defense");
  const candidates = autoDefenseCandidates({
    defenseTeam: explicit,
    currentTeam: { heroes: "invalid" },
    savedTeams: [team("backup")],
  });
  assert.deepEqual(candidates[0].heroes, explicit.heroes);
  assert.equal(candidates.length, 2);
  assert.deepEqual(autoDefenseCandidates({ savedTeams: [] }), []);
});

test("explicit defense edits and resaves update the posted guard", () => {
  const before = {...team("old"),savedAt:100};
  const after = {...team("new"),savedAt:200};
  after.heroes = ["warlock","archer","druid"].map(classId=>({classId}));
  assert.deepEqual(explicitDefenseChange({defenseTeam:after},{defenseTeam:before})?.heroes,after.heroes);
  assert.ok(explicitDefenseChange({defenseTeam:{...before,savedAt:101}},{defenseTeam:before}),
    "saving the same lineup again repairs or republishes its public defense");
});

test("attack squad changes, omitted defenses and unchanged drafts do not replace a chosen public defense", () => {
  const defense = {...team("guard"),savedAt:100};
  assert.equal(explicitDefenseChange({defenseTeam:defense,currentTeam:team("attack")},{defenseTeam:defense}),null);
  assert.equal(explicitDefenseChange({currentTeam:team("attack")},{defenseTeam:defense}),null);
  assert.equal(explicitDefenseChange({defenseTeam:null},{defenseTeam:defense}),null);
});