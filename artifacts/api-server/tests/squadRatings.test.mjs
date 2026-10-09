import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
const module={exports:{}};
vm.runInNewContext(transformSync(readFileSync(new URL('../src/lib/squadRatings.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'}).code,{module,exports:module.exports});
const {squadRatings,squadScore,bestSquad,savedSquadId,ratingChange,passiveRatingDelta}=module.exports;
const make=()=>({rating:1540,wins:25,losses:7,rating2:1120,wins2:3,losses2:2,state:{
  savedTeams:[{id:'alpha',name:'Alpha',heroes:[{classId:'warrior'},{classId:'priest'},{classId:'druid'}]},
    {id:'beta',name:'Beta',heroes:[{classId:'warrior'},{classId:'rogue'},{classId:'archer'}]}],
  defenseTeam:{heroes:[{classId:'warrior'},{classId:'priest'},{classId:'druid'}]}}});
test('matching historical squad receives its old score once; another squad starts independently',()=>{
  const p=make(),r=squadRatings(p),a=squadScore(p,3,{squadId:'alpha'},r),b=squadScore(p,3,{squadId:'beta'},r);
  assert.equal(a.score.rating,1540);assert.equal(a.score.wins,25);assert.equal(b.score.rating,1000);
  assert.equal(r['3:current'],undefined);assert.equal(r['2:current'].rating,1120);
});
test('editing heroes and renaming the saved squad retains its identity and score',()=>{
  const p=make(),r=squadRatings(p);squadScore(p,3,{squadId:'alpha'},r).score.rating=1600;
  p.state.squadRatings=r;p.state.savedTeams[0].name='Renamed';p.state.savedTeams[0].heroes=[{classId:'rogue'}];
  assert.equal(squadScore(p,3,{squadId:'alpha'}).score.rating,1600);
  assert.equal(bestSquad(r,3).rating,1600);
});
test('unplayed saved squads count toward mode highs at their initial rating',()=>{
  const p=make();p.rating=988;p.wins=0;p.losses=1;
  const ranks=squadRatings(p);
  assert.equal(ranks['3:alpha'].rating,988);assert.equal(ranks['3:beta'].rating,1000);
  assert.equal(bestSquad(ranks,3).rating,1000);
});
test('saved identity validation rejects foreign or malformed ids and rating claims',()=>{
  assert.equal(savedSquadId(make().state,'alpha'),'alpha');
  assert.equal(savedSquadId(make().state,'foreign'),null);
  assert.equal(savedSquadId(make().state,'__proto__'),null);
  assert.equal(Object.keys(squadRatings({...make(),state:{squadRatings:{invalid:{rating:9999}}}})).length,2);
});
test('losses are capped at 12 even against much lower ratings; wins remain meaningful',()=>{
  assert.equal(ratingChange(2000,1000,'loss'),-12);
  assert.equal(ratingChange(1200,1200,'loss'),-12);
  assert.ok(ratingChange(1000,2000,'loss')>=-1);
  assert.ok(ratingChange(1000,2000,'win')>=23);
  assert.equal(passiveRatingDelta({attackerRatingDelta:24,defense:{settledRatingDelta:-12}}),-12);
  assert.equal(passiveRatingDelta({attackerRatingDelta:8,defense:{}}),-8);
});