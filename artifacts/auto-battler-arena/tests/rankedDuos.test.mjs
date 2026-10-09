import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/ranked-duos.js',import.meta.url),'utf8');
function setup(){
  const trio={heroes:[{classId:'warrior'},{classId:'priest'},{classId:'rogue'}]};
  const context={document:{getElementById:()=>null},location:{origin:'https://arena.test'},
    selected:['warrior','priest'],teamSize:3,selectedBuilds:[{classId:'warrior',talents:['per-copy'],ability:'custom'},{}],
    abilityChoice:{},ultChoice:{},captainClass:'warrior',captainRacial:'human',
    teamOrders:{focus:'priest',switchLow:true},priorityDraft:{},
    playerProfile:{defenseTeam:trio,ranked2v2:{rating:1000,wins:0,losses:0}},
    defenseTalentSnapshot:()=>[],currentDefenseSnapshot:()=>null,
    saveCurrentDefense:()=>{throw new Error('Duo must not invoke the trio save');},
    renderSavedDefense:()=>{},loadSavedDefense:()=>{},showUnlockToast:()=>{},
    savePlayerProfile:()=>{},addEventListener:()=>{},parent:{postMessage:()=>{}},
  };
  context.window=context;
  vm.createContext(context);vm.runInContext(source,context);
  return {context,trio};
}
test('exactly two selected heroes route to duos even when the third builder slot is empty',()=>{
  const {context}=setup();
  const snapshot=context.currentDefenseSnapshot();
  assert.equal(snapshot.heroes.length,2);
  assert.equal(snapshot.heroes[0].ability,'custom');
  assert.deepEqual(Array.from(snapshot.heroes[0].talents),['per-copy']);
  assert.equal(snapshot.orders.focus,'priest');
});
test('saving a duo defense does not overwrite the existing trio defense',()=>{
  const {context,trio}=setup();
  context.saveCurrentDefense();
  assert.equal(context.playerProfile.defenseTeam,trio);
  assert.equal(context.playerProfile.defenseTeam2.heroes.length,2);
});
test('the duo adapter does not invent attacks for one or four selected characters',()=>{
  const {context}=setup();
  for(const heroes of [['warrior'],['warrior','priest','rogue','shaman']]){
    context.selected=heroes;
    assert.equal(context.currentDefenseSnapshot(),null);
  }
});