import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import {transformSync} from 'esbuild';
import {squadRatingFixture} from './squadRatingFixture.mjs';
import {prestigeFixture} from './prestigeFixture.mjs';

function load(path, dependencies = {}) {
  dependencies={...dependencies,"../lib/prestigeRewards":prestigeFixture};
  const module = {exports:{}};
  const code = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {loader:'ts',format:'cjs'}).code;
  vm.runInNewContext(code, {module,exports:module.exports,require:(id)=>{
    assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
    return dependencies[id];
  }});
  return module.exports;
}
const rules = load('../src/lib/arenaModeRules.ts');
const {rankedView} = load('../src/lib/arenaMode.ts', {
  '@workspace/db':{arenaProfilesTable:{}},
  './arenaModeRules':rules,
  './squadRatings':squadRatingFixture,
});

for (const size of [2,3]) {
  test(`${size}v${size} Arena keeps the player name while using the published squad's score`, ()=>{
    const defense = {squadId:'alpha',heroes:Array.from({length:size},()=>({classId:'warrior'}))};
    const player = {
      id:'player-one',name:'Player One',rating:1000,wins:0,losses:0,rating2:1000,wins2:0,losses2:0,
      defense:size===3?defense:null,defense2:size===2?defense:null,
      defenseUpdatedAt:null,defenseUpdatedAt2:null,
      state:{savedTeams:[{id:'alpha',name:'Team Alpha',heroes:defense.heroes}],
        squadRatings:{[`${size}:alpha`]:{name:'Team Alpha',rating:1450,wins:12,losses:4}}},
    };
    const result = rankedView(player,size);
    assert.equal(result.name,'Player One');
    assert.equal(result.id,player.id);
    assert.equal(result.rating,1450);
    assert.equal(result.wins,12);
    assert.equal(result.losses,4);
    assert.equal(result.state.squadRatings[`${size}:alpha`].name,'Team Alpha');
    assert.equal(player.name,'Player One');
  });
}