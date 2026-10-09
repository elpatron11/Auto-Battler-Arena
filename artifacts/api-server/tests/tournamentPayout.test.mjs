import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import vm from 'node:vm';
import {transformSync} from 'esbuild';

const require=createRequire(new URL('../../../lib/api-zod/package.json',import.meta.url));
function load(source,imports={}) {
  const module={exports:{}};
  vm.runInNewContext(transformSync(source,{loader:'ts',format:'cjs'}).code,{
    module,exports:module.exports,require:name=>imports[name]||require(name),
  });
  return module.exports;
}
const schemas=load(readFileSync(new URL('../../../lib/api-zod/src/generated/api.ts',import.meta.url),'utf8'));
const rules=load(readFileSync(new URL('../src/lib/tournamentRules.ts',import.meta.url),'utf8'));
const routes=readFileSync(new URL('../src/routes/economy.ts',import.meta.url),'utf8');
const start=routes.indexOf('router.post("/economy/tournaments/:tournamentId/finish"');
const route=routes.slice(start,routes.indexOf('router.get("/economy/tournaments"',start));

function fixture({placement='eliminated',prize=0,age=100000}={}) {
  const run={id:'run',playerId:'owner',placement,prize,state:'entered',createdAt:new Date(Date.now()-age)};
  const wallet={gold:1000};
  const runTable={},walletTable={};
  const tx={
    select:()=>({from:table=>({where:()=>{
      const query=Promise.resolve([table===runTable?run:wallet]);query.for=()=>query;return query;
    }})}),
    update:table=>({set:values=>({where:()=>{
      const apply=()=>Object.assign(table===runTable?run:wallet,values);
      return {then:(resolve,reject)=>Promise.resolve().then(apply).then(resolve,reject),returning:async()=>[apply()]};
    }})}),
  };
  let chain=Promise.resolve(),handler;
  const c=vm.createContext({
    router:{post:(_path,fn)=>{handler=fn;}},requireReady:()=>true,isUuid:()=>true,
    playerId:res=>res.owner,FinishEconomyTournamentBody:schemas.FinishEconomyTournamentBody,
    db:{transaction:fn=>{const next=chain.then(()=>fn(tx));chain=next.catch(()=>{});return next;}},
    lockEconomyAccounts:async()=>{},economyTournamentRunsTable:runTable,economyWalletsTable:walletTable,
    eq:()=>true,Date,Number,MAX_GOLD:1000000,ECONOMY:{tournament:{champion:500,runnerUp:50,minimumDurationMs:90000}},
    ...rules,settledTournamentWins:async()=>run.state==='finished'&&run.placement==='champion'?1:0,
    tournamentReceipt:(row,gold,repeated,tournamentWins)=>({...row,gold,repeated,tournamentWins}),
  });
  vm.runInContext(transformSync(route,{loader:'ts'}).code,c);
  const finish=async(placement,owner='owner')=>{
    const res={owner,statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;}};
    await handler({params:{tournamentId:'run'},body:placement===undefined?{}:{placement,gold:999999}},res);
    return res;
  };
  return {run,wallet,finish};
}
test('played champion overrides a seeded elimination; the server owns the 500 Gold prize',async()=>{
  const f=fixture(),r=await f.finish('champion');
  assert.equal(r.statusCode,200);assert.equal(f.wallet.gold,1500);
  assert.equal(r.body.prize,500);assert.equal(r.body.placement,'champion');assert.equal(r.body.tournamentWins,1);
});
test('runner-up and elimination replace seeded prizes with 50 and 0 Gold',async()=>{
  for(const [placement,prize] of [['runner_up',50],['eliminated',0]]){
    const f=fixture({placement:'champion',prize:500}),r=await f.finish(placement);
    assert.equal(r.body.prize,prize);assert.equal(f.wallet.gold,1000+prize);
  }
});
test('concurrent retries pay once and cannot change the first settled placement',async()=>{
  const f=fixture();
  const results=await Promise.all([f.finish('champion'),...Array.from({length:10},()=>f.finish('runner_up'))]);
  assert.equal(f.wallet.gold,1500);assert.equal(f.run.placement,'champion');
  assert.equal(results.filter(r=>!r.body.repeated).length,1);
  assert.ok(results.every(r=>r.body.gold===1500&&r.body.prize===500));
});
test('missing/invalid placement, early claims and another owner cannot receive Gold',async()=>{
  for(const [placement,owner,age,status] of [[undefined,'owner',100000,400],['1st','owner',100000,400],
    ['champion','owner',1000,409],['champion','other-owner',100000,404]]){
    const f=fixture({age}),r=await f.finish(placement,owner);
    assert.equal(r.statusCode,status);assert.equal(f.wallet.gold,1000);assert.equal(f.run.state,'entered');
  }
});
