import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../public/real-player-tournament.js',import.meta.url),'utf8');
function setup(){
  const context={simSeries:()=>{throw new Error('Must use frozen passive outcome');},
    startBattle:options=>options,finishSeriesRating:()=>{},tournament:null};
  context.window=context;vm.createContext(context);vm.runInContext(source,context);
  return context;
}
function receipt(){
  const snapshot=id=>({rating:1200,captainClass:'priest',captainRacial:'human',
    heroes:[{classId:'priest',ability:'custom',talents:['owned-talent']},{classId:'warrior'},{classId:'rogue'}]});
  const match=(round,a,b,winner)=>({round,playerA:a,playerB:b,playerAName:a,playerBName:b,
    playerASnapshot:snapshot(a),playerBSnapshot:snapshot(b),winner});
  return {history:[match('round_of_6','player','human-1','player'),match('round_of_6','human-2','human-3','human-2'),
    match('semifinal','human-4','player','player'),match('semifinal','human-5','human-2','human-2'),
    match('final','player','human-2','player')]};
}
test('tournament UI uses exactly five distinct saved real-player squads with the frozen bracket draw',()=>{
  const ctx=setup(), result=ctx.RealPlayerTournament.teams(receipt());
  assert.equal(result.teams.length,6);assert.equal(result.you.id,'player');
  assert.deepEqual(Array.from(result.teams,t=>t.id),['player','human-1','human-2','human-3','human-4','human-5']);
  assert.equal(result.teams[1].builds[0].ability,'custom');
  assert.deepEqual(Array.from(result.teams[1].builds[0].talents),['owned-talent']);
  assert.equal(result.teams[1].captainRacial,'human');
});
test('missing server squads and bot entries explicitly fail rather than creating AI opponents',()=>{
  const ctx=setup();assert.equal(ctx.RealPlayerTournament.teams({}),null);
  const bad=receipt();bad.history[0].playerB='arena-bot-1';
  assert.equal(ctx.RealPlayerTournament.teams(bad),null);
});
test('passive tournament display follows the server encounter winner',()=>{
  const ctx=setup(),r=receipt(),result=ctx.RealPlayerTournament.teams(r);
  ctx.tournament={serverResult:r};
  const m={a:result.teams[2],b:result.teams[3],round:'Quarterfinal',done:false,wa:0,wb:0};
  assert.equal(ctx.simSeries(m).id,'human-2');
  assert.equal(m.wa,2);assert.equal(m.wb,0);assert.equal(m.done,true);
});
test('actual backend bracket histories hydrate real squads and passive results without UI-shaped fixtures',()=>{
  const backendSource=readFileSync(new URL('../../api-server/src/lib/tournamentRules.ts',import.meta.url),'utf8');
  const backend={exports:{}};
  vm.runInNewContext(ts.transpileModule(backendSource,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,backend);
  const snapshot=receipt().history[0].playerASnapshot;
  const opponents=Array.from({length:5},(_,i)=>({id:`real-${i}`,name:`Real ${i}`,snapshot}));
  const r=backend.exports.resolveSixTeamBracket(snapshot,opponents,()=> 'win',()=>0.5);
  const ctx=setup(),result=ctx.RealPlayerTournament.teams(r);
  assert.equal(result.teams.length,6);
  const row=r.history.find(m=>m.round==='round_of_6'&&m.playerA!=='player'&&m.playerB!=='player');
  ctx.tournament={serverResult:r};
  const m={a:result.teams.find(t=>t.id===row.playerA),b:result.teams.find(t=>t.id===row.playerB),
    round:'Quarterfinal',done:false,wa:0,wb:0};
  assert.equal(ctx.simSeries(m).id,row.winner);
  assert.equal(m.done,true);
});