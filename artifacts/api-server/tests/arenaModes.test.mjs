import assert from 'node:assert/strict';
import {test} from 'node:test';
import {rankedSize,rankedView,rankedScorePatch} from '../src/lib/arenaModeRules.ts';
import {parseRankedTeam} from '../src/lib/rankedBattle.ts';

const duo={heroes:[{classId:'warrior'},{classId:'priest'}]};
const trio={heroes:[...duo.heroes,{classId:'rogue'}]};
test('ranked size defaults preserve legacy 3v3 while explicitly accepting 2v2',()=>{
  for(const value of [undefined,null,3,'3',1,4,'wrong'])assert.equal(rankedSize(value),3);
  for(const value of [2,'2'])assert.equal(rankedSize(value),2);
  assert.ok(parseRankedTeam(duo,2));
  assert.equal(parseRankedTeam(duo),null);
  assert.equal(parseRankedTeam(trio,2),null);
  assert.ok(parseRankedTeam(trio));
});
test('duo profile projects only the duo rating, record and defense without mutating historical trios',()=>{
  const original={rating:1500,wins:17,losses:9,rating2:1040,wins2:2,losses2:1,
    defense:trio,defense2:duo,defenseUpdatedAt:new Date(100),defenseUpdatedAt2:new Date(200),
    state:{defenseTeam:trio,defenseTeam2:duo}};
  const before=structuredClone(original);
  const view=rankedView(original,2);
  assert.equal(view.rating,1040);assert.equal(view.wins,2);assert.equal(view.losses,1);
  assert.deepEqual(view.defense,duo);assert.deepEqual(view.state.defenseTeam,duo);
  assert.deepEqual(original,before);assert.equal(rankedView(original,3),original);
  assert.deepEqual(rankedScorePatch(2,1100,3,1),{rating2:1100,wins2:3,losses2:1});
  assert.deepEqual(rankedScorePatch(3,1600,18,9),{rating:1600,wins:18,losses:9});
});