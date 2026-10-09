import test from "node:test";
import assert from "node:assert/strict";
import {Worker} from "node:worker_threads";
import {createRoom,addPlayer,removePlayer,stepRoom,snapshot,setCommand,damageEntity,damageStructure,damageBoss} from "../src/guild-war/engine.mjs";
import {canHumanJoin,ensureBotGuild,planBotGuild} from "../src/guild-war/bots.mjs";
import {move,route,segIntersectsRect,WALLS} from "../src/guild-war/geometry.mjs";
const START=1800000000000;
function room(){return createRoom("bot-test","practice:test",START);}
function human(r,id="h",guildId="human"){
  addPlayer(r,{id,name:id,guildId,guildName:guildId,emblem:"lion",classId:"warrior"});
  return r.entities.find(e=>e.id===id);
}
function advance(r,ms){for(let i=0;i<ms/50;i++){planBotGuild(r);stepRoom(r,.05);}}
test("one human gets one persistent AI guild, separate protected camp and equal base stats",()=>{
  const r=room(),h=human(r),g=ensureBotGuild(r),b=r.entities.find(e=>e.isBot);
  assert.equal(r.guilds.length,2);assert.equal(r.entities.length,2);
  assert.equal(b.role,"attacker");assert.equal(b.hp,h.hp);assert.notDeepEqual(g.camp,r.guilds[0].camp);
  damageEntity(r,b,999,h);assert.equal(b.alive,true);
  for(let i=0;i<10;i++)ensureBotGuild(r);
  assert.equal(r.guilds.filter(g=>g.isBot).length,1);assert.equal(r.entities.length,2);
  assert.equal(r.contested,false,"AI must not pretend to be a second real guild");
  assert.throws(()=>setCommand(r,b.id,"boss"),/controlled by the server/);
});
test("five-class AI team counts within five guilds and25 characters; real guilds take remaining slots",()=>{
  const r=room();
  for(let g=0;g<4;g++)for(let i=0;i<5;i++){
    assert.equal(canHumanJoin(r,`g${g}`),true);human(r,`${g}-${i}`,`g${g}`);ensureBotGuild(r);
  }
  assert.equal(r.guilds.length,5);assert.equal(r.entities.length,25);
  const bots=r.entities.filter(e=>e.isBot);assert.equal(bots.length,5);assert.equal(new Set(bots.map(e=>e.classId)).size,5);
  assert.equal(canHumanJoin(r,"fifth-real-guild"),false);assert.equal(r.contested,true);
  removePlayer(r,"0-4");ensureBotGuild(r);assert.equal(canHumanJoin(r,"g0"),true);
  human(r,"replacement","g0");ensureBotGuild(r);assert.equal(r.entities.length,25);
});
test("different rooms feature all nine class types without resetting existing AI squads",()=>{
  const seen=new Set();
  for(let i=0;i<8;i++){
    const r=createRoom(`guild-roster-${i.toString(16)}`,"practice:test",START);
    for(let j=0;j<5;j++)human(r,`h${j}`);
    ensureBotGuild(r);
    const classes=r.entities.filter(e=>e.isBot).map(e=>e.classId);
    assert.equal(classes.length,5);
    assert.equal(new Set(classes).size,5);
    assert.ok(classes.includes("warrior"));
    classes.forEach(c=>seen.add(c));
    const stored=JSON.parse(JSON.stringify(r));ensureBotGuild(stored);
    assert.deepEqual(stored.entities.filter(e=>e.isBot).map(e=>e.classId),classes);
  }
  assert.deepEqual([...seen].sort(),Object.keys({warrior:1,archer:1,frostmage:1,druid:1,shaman:1,rogue:1,warlock:1,paladin:1,priest:1}).sort());
});
test("AI uses exact ten-second respawn, normal capture/defender role and boss scoring",()=>{
  const r=room(),h=human(r),g=ensureBotGuild(r),b=r.entities.find(e=>e.isBot);
  b.x=300;b.y=600;damageEntity(r,b,999,h);assert.equal(b.alive,false);
  advance(r,9950);assert.equal(b.alive,false);advance(r,50);assert.equal(b.alive,true);
  damageStructure(r,r.structures[0],1000,b);damageStructure(r,r.structures[1],1000,b);
  assert.equal(r.owner,g.id);assert.equal(b.role,"defender");assert.equal(h.role,"attacker");assert.equal(g.score,140);
  damageBoss(r,600,b);assert.equal(r.boss.guildId,g.id);assert.equal(g.score,215);
  assert.equal(snapshot(r).rewardsEnabled,false);assert.equal("gold" in g,false);assert.equal("items" in b,false);
});
test("bot resizing/checkpoint restore does not duplicate guilds or reset killed reserves",()=>{
  let r=room();for(let i=0;i<5;i++)human(r,`h${i}`);ensureBotGuild(r);
  const victim=r.entities.find(e=>e.isBot&&e.classId==="shaman");
  victim.x=300;victim.y=600;damageEntity(r,victim,999,r.entities[0]);victim.cooldowns.bossHeal=r.now+30000;
  removePlayer(r,"h4");ensureBotGuild(r);assert.equal(r.entities.some(e=>e.id===victim.id),false);
  r=JSON.parse(JSON.stringify(r));human(r,"h4");ensureBotGuild(r);
  const returned=r.entities.find(e=>e.id===victim.id);
  assert.equal(returned.alive,false);assert.equal(returned.respawnAt,START+10000);
  assert.equal(returned.cooldowns.bossHeal,START+30000);assert.equal(r.guilds.filter(g=>g.isBot).length,1);
  const ids=r.entities.map(e=>e.id);ensureBotGuild(r);assert.deepEqual(r.entities.map(e=>e.id),ids);
});
test("tactics budget is one pass/sec, respects channels and sends boss/banner/defense goals",()=>{
  const r=room();for(let i=0;i<5;i++)human(r,`h${i}`);const g=ensureBotGuild(r);
  planBotGuild(r);
  assert.equal(r.entities.find(e=>e.isBot&&e.classId==="frostmage").objective,"boss");
  assert.equal(r.entities.find(e=>e.isBot&&e.classId==="druid").objective,"banner");
  const next=r.nextBotPlanAt;planBotGuild(r);assert.equal(r.nextBotPlanAt,next);
  r.owner=g.id;r.boss.guildId=g.id;r.now+=2000;
  const frost=r.entities.find(e=>e.isBot&&e.classId==="frostmage");
  frost.channel={kind:"ice",endsAt:r.now+2000};planBotGuild(r);assert.equal(frost.channel.kind,"ice");
  frost.channel=null;r.now+=2000;planBotGuild(r);assert.equal(frost.objective,"auto");
});
test("one human guild vs one bot guild plays real simulation; unattended human has a capturing opponent",()=>{
  const r=room();human(r);const g=ensureBotGuild(r);
  let fought=false,moved=false;for(let i=0;i<6000;i++){
    planBotGuild(r);stepRoom(r,.05);
    fought||=r.entities.some(e=>e.hp<e.maxHp||!e.alive);
    moved||=r.entities.some(e=>e.isBot&&Math.hypot(e.x-g.camp.x,e.y-g.camp.y)>100);
  }
  assert.equal(moved,true);assert.equal(fought,true);assert.ok(r.guilds.some(g=>g.score>0));
  const alone=room();const h=human(alone);setCommand(alone,h.id,"regroup");const opponent=ensureBotGuild(alone);
  advance(alone,300000);assert.equal(alone.owner,opponent.id);assert.ok(opponent.score>=140);
  assert.equal(alone.entities.find(e=>e.isBot).role,"defender");
});
test("empty routes recover from padded wall corners without crossing real walls",()=>{
  const r=room(),e=human(r);e.x=434;e.y=549;const target={x:980,y:620},before={x:e.x,y:e.y};
  assert.equal(route(r,e,target).length,0);move(r,e,target,.05);r.now+=3050;move(r,e,target,.05);
  assert.ok(Math.hypot(e.x-before.x,e.y-before.y)>0);
  assert.equal(WALLS.some(w=>segIntersectsRect(before.x,before.y,e.x,e.y,w)),false);
  assert.ok(route(r,e,target).length>0);
});
test("reciprocal pursuit keeps coordinate-only JSON-safe combat checkpoints",()=>{
  const r=room(),h=human(r);ensureBotGuild(r);const b=r.entities.find(e=>e.isBot);
  h.x=300;h.y=400;b.x=400;b.y=400;advance(r,50);
  assert.doesNotThrow(()=>JSON.stringify(r));
  for(const e of r.entities)for(const p of e.path)assert.deepEqual(Object.keys(p).sort(),["x","y"]);
  for(let i=0;i<6000;i++){
    planBotGuild(r);stepRoom(r,.05);
    if(i%100===0)assert.doesNotThrow(()=>JSON.stringify(r),`checkpoint during PvP at ${i}`);
  }
  const restored=JSON.parse(JSON.stringify(r));ensureBotGuild(restored);advance(restored,5000);
  assert.equal(restored.guilds.filter(g=>g.isBot).length,1);assert.doesNotThrow(()=>JSON.stringify(restored));
});
test("worker fills real slots first, spills fifth human guild and retains one bot on reconcile/reload",async()=>{
  let w,seq=0;const pending=new Map();
  const start=async(rooms)=>{
    w=new Worker(new URL("../src/guild-war/worker.mjs",import.meta.url));
    const ready=new Promise(resolve=>w.on("message",m=>{
      if(m.kind==="ready")resolve();
      if(m.kind==="reply"){const task=pending.get(m.requestId);if(task){pending.delete(m.requestId);m.error?task.reject(new Error(m.error)):task.resolve(m.value);}}
    }));
    w.postMessage({kind:"init",rooms});await ready;
  };
  const request=(kind,data)=>new Promise((resolve,reject)=>{const requestId=String(++seq);pending.set(requestId,{resolve,reject});w.postMessage({kind,data,requestId});});
  await start([]);
  try{
    let first;const members=[];
    for(let g=0;g<5;g++)for(let i=0;i<(g===4?1:5);i++){
      const data={id:`${g}-${i}`,name:"Human",guildId:`g${g}`,guildName:`g${g}`,emblem:"lion",classId:"warrior",event:"practice"};
      members.push({playerId:data.id,guildId:data.guildId});
      const joined=await request("join",data);first??=joined.roomId;
      if(g<4)assert.equal(joined.roomId,first);else assert.notEqual(joined.roomId,first);
    }
    await request("reconcile",{members});const s=await request("snapshot",{roomId:first});
    assert.equal(s.entities.length,25);assert.equal(s.guilds.filter(g=>g.isBot).length,1);
    const checkpoint=new Promise(resolve=>{const listener=m=>{if(m.kind==="checkpoint"){w.off("message",listener);resolve(m.rooms);}};w.on("message",listener);});
    await request("join",{id:"4-1",name:"Human",guildId:"g4",guildName:"g4",emblem:"lion",classId:"warrior",event:"practice"});
    const states=await checkpoint;
    await w.terminate();await start(JSON.parse(JSON.stringify(states)));const restored=await request("snapshot",{roomId:first});
    assert.equal(restored.entities.length,25);assert.equal(restored.guilds.filter(g=>g.isBot).length,1);
  }finally{await w.terminate();}
});
