import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { createRoom,addPlayer,canJoin,setCommand,removePlayer,stepRoom,snapshot,damageStructure,damageEntity,damageBoss,damageIce,eventAt,EVENT_DURATION,EVENT_PERIOD } from "../src/guild-war/engine.mjs";
import {lineOfSight,route} from "../src/guild-war/geometry.mjs";
const START=1800000000000;
function room(){return createRoom("room","practice:test",START);}
function player(r,id="a",classId="warrior",guildId="g1"){
  addPlayer(r,{id,name:id,classId,guildId,guildName:guildId,emblem:"lion"});return r.entities.at(-1);
}
function take(r,guildId="g1"){
  const source={guildId,classId:"warrior"};
  damageStructure(r,r.structures[0],1000,source);damageStructure(r,r.structures[1],1000,source);
}
function advance(r,ms){for(let i=0;i<ms/50;i++)stepRoom(r,.05);}
function near(e,x,y){e.x=x;e.y=y;e.pathUntil=Infinity;e.objective="regroup";}

test("UTC event is every three hours and open exactly twenty minutes",()=>{
  const base=Math.floor(START/EVENT_PERIOD)*EVENT_PERIOD;
  assert.equal(eventAt(base).open,true);assert.equal(eventAt(base+EVENT_DURATION-1).open,true);
  assert.equal(eventAt(base+EVENT_DURATION).open,false);assert.equal(eventAt(base+EVENT_PERIOD).start,base+EVENT_PERIOD);
});
test("capacity is five guilds, five active players each, total25; no Monk",()=>{
  const r=room();for(let g=1;g<=5;g++)for(let i=0;i<5;i++)player(r,`${g}-${i}`,"warrior",`g${g}`);
  assert.equal(r.entities.length,25);assert.equal(canJoin(r,"g1"),false);assert.equal(canJoin(r,"g6"),false);
  assert.throws(()=>player(r,"extra"),/capacity/);const q=room();assert.throws(()=>player(q,"monk","monk"),/Unknown/);
});
test("one guild can destroy neutral gate and capture castle, all initially attackers",()=>{
  const r=room(),e=player(r);assert.equal(e.role,"attacker");take(r);
  assert.equal(r.owner,"g1");assert.equal(e.role,"defender");assert.equal(e.x,600);
  assert.equal(r.guilds[0].score,140);assert.equal(r.structures.every(s=>s.hp===s.maxHp),true);
});
test("castle is invulnerable behind main gate, then behind ice gate",()=>{
  const r=room();player(r);const core=r.structures[1],s={guildId:"g1",classId:"warrior"};
  damageStructure(r,core,1000,s);assert.equal(core.hp,600);
  damageStructure(r,r.structures[0],1000,s);r.ice={hp:150,maxHp:150,expiresAt:r.now+12000};
  damageStructure(r,core,1000,s);assert.equal(core.hp,600);
});
test("siege winner is most castle damage, not last hit; roles and respawns change",()=>{
  const r=room(),a=player(r,"a","warrior","g1"),b=player(r,"b","warrior","g2");
  damageStructure(r,r.structures[0],1000,a);
  damageStructure(r,r.structures[1],400,a);damageStructure(r,r.structures[1],200,b);
  assert.equal(r.owner,"g1");assert.equal(a.role,"defender");assert.equal(b.role,"attacker");
  damageStructure(r,r.structures[0],1000,b);damageStructure(r,r.structures[1],1000,b);
  assert.equal(r.owner,"g2");assert.equal(a.role,"attacker");assert.deepEqual({x:a.x,y:a.y},r.guilds[0].camp);
  assert.equal(b.role,"defender");
});
test("death respawns after ten seconds using current ownership",()=>{
  const r=room(),a=player(r);near(a,300,600);damageEntity(r,a,999,{guildId:"g2"});
  assert.equal(a.alive,false);advance(r,9950);assert.equal(a.alive,false);
  advance(r,50);assert.equal(a.alive,true);assert.equal(a.hp,a.maxHp);
});
test("camp protection blocks damage and camp kill rewards",()=>{
  const r=room(),a=player(r),b=player(r,"b","rogue","g2");
  damageEntity(r,a,999,b);assert.equal(a.alive,true);assert.equal(r.guilds[1].score,0);
});
test("kill farm protection awards only once per guild/victim/minute",()=>{
  const r=room(),a=player(r),b=player(r,"b","rogue","g2");near(a,300,600);
  damageEntity(r,a,999,b);assert.equal(r.guilds[1].score,10);
  a.alive=true;a.hp=a.maxHp;damageEntity(r,a,999,b);assert.equal(r.guilds[1].score,10);
  r.now+=50000;a.alive=true;a.hp=a.maxHp;damageEntity(r,a,999,b);assert.equal(r.guilds[1].score,10);
  r.now+=10000;a.alive=true;a.hp=a.maxHp;damageEntity(r,a,999,b);assert.equal(r.guilds[1].score,20);
});
test("commands are server validated, cooldown2sec and do not accept spectator IDs",()=>{
  const r=room();player(r);
  setCommand(r,"a","boss");assert.equal(r.entities[0].objective,"boss");
  assert.throws(()=>setCommand(r,"a","castle"),/cooldown/);
  assert.throws(()=>setCommand(r,"spectator","boss"),/not an active/);
  r.now+=2000;assert.throws(()=>setCommand(r,"a","castle","bear"),/Druid/);
});
test("Warrior has +50% gate and ice damage, not castle damage",()=>{
  const r=room(),e=player(r);damageStructure(r,r.structures[0],10,e);assert.equal(r.structures[0].hp,285);
  r.structures[0].hp=0;damageStructure(r,r.structures[1],10,e);assert.equal(r.structures[1].hp,590);
  r.owner="g2";r.ice={hp:150,maxHp:150,expiresAt:r.now+12000};damageIce(r,10,e);assert.equal(r.ice.hp,135);
});
test("normal attacks blocked by walls, open gate has walkable path",()=>{
  const r=room();assert.equal(lineOfSight(r,{x:400,y:400},{x:500,y:400}),false);
  assert.equal(lineOfSight(r,{x:600,y:580},{x:600,y:400}),false);
  r.structures[0].hp=0;r.geometry++;
  assert.equal(lineOfSight(r,{x:600,y:580},{x:600,y:400}),true);
  const p=route(r,{x:300,y:600},{x:600,y:400});assert.ok(p.length);
});
test("wall ranged units expose endpoint but cannot shoot through far wall",()=>{
  const r=room();
  assert.equal(lineOfSight(r,{x:500,y:520,wall:true},{x:500,y:600}),true);
  assert.equal(lineOfSight(r,{x:500,y:520,wall:true},{x:500,y:100}),false);
});
test("tower Archer alone bypasses wall LOS at double range",()=>{
  const r=room(),a=player(r,"archer","archer"),enemy=player(r,"enemy","warrior","g2");take(r);
  const tower=r.structures[2];a.x=tower.x;a.y=tower.y;a.objective="auto";enemy.x=380;enemy.y=495;enemy.objective="regroup";
  const before=enemy.hp;stepRoom(r,.05);assert.equal(a.towerId,tower.id);assert.ok(enemy.hp<before);
});
test("Rogue sabotage cast2sec, disable5sec, immunity15sec after recovery",()=>{
  const r=room(),a=player(r,"archer","archer"),rogue=player(r,"rogue","rogue","g2");take(r);
  const t=r.structures[2];t.occupant=a.id;a.towerId=t.id;a.x=t.x;a.y=t.y;
  near(rogue,t.x,t.y-30);t.disabledUntil=r.now+100; // prevent first tower hit only
  r.now+=100;stepRoom(r,.05);assert.equal(rogue.channel?.kind,"sabotage");
  // Hold attacker out of tower firing while casting to isolate completion.
  a.nextAttack=r.now+10000;advance(r,2000);
  assert.equal(t.disabledUntil,r.now+5000);assert.equal(t.immuneUntil,r.now+20000);
  assert.equal(rogue.cooldowns.sabotage,START+100+50+30000);
});
test("incoming damage interrupts an active channel",()=>{
  const r=room(),e=player(r,"r","rogue");near(e,300,600);e.channel={kind:"sabotage",endsAt:r.now+2000};
  damageEntity(r,e,1,{guildId:"enemy"});assert.equal(e.channel,null);
});
test("Frost Mage creates one defender ice gate after2sec, lasts12, cd60",()=>{
  const r=room(),e=player(r,"frost","frostmage");take(r);r.structures[0].hp=0;near(e,600,480);
  stepRoom(r,.05);assert.equal(e.channel?.kind,"ice");advance(r,2000);
  assert.equal(r.ice?.hp,150);assert.equal(r.ice.expiresAt,r.now+12000);
  assert.ok(e.cooldowns.ice>r.now);advance(r,12000);assert.equal(r.ice,null);
});
test("Paladin shield is150 and nonstacking, defender only after gate falls",()=>{
  const r=room(),e=player(r,"p","paladin");take(r);r.structures[0].hp=0;near(e,600,400);
  stepRoom(r,.05);assert.equal(r.structures[1].shield,150);
  const p=player(r,"p2","paladin");near(p,600,400);stepRoom(r,.05);assert.equal(r.structures[1].shield,150);
  advance(r,10000);assert.equal(r.structures[1].shield,0);
});
test("Warlock sacrifices25% CURRENT ownHP, pact10sec cooldown60",()=>{
  const r=room(),e=player(r,"w","warlock");r.boss.guildId="g1";near(e,950,620);e.hp=80;
  stepRoom(r,.05);assert.equal(e.hp,60);assert.equal(r.boss.pactUntil,r.now+10000);assert.ok(e.cooldowns.pact>r.now);
});
test("boss claim highest damage and awards75 once; owned death leaves15sec corpse",()=>{
  const r=room(),a=player(r),b=player(r,"b","warrior","g2");damageBoss(r,400,a);damageBoss(r,200,b);
  assert.equal(r.boss.guildId,"g1");assert.equal(r.boss.hp,600);assert.equal(r.guilds[0].score,75);
  damageBoss(r,600,b);assert.equal(r.boss.alive,false);assert.equal(r.boss.corpseUntil,r.now+15000);
});
test("Shaman alone heals own boss20% after3sec and prevents stacked channels",()=>{
  const r=room(),e=player(r,"s","shaman"),other=player(r,"s2","shaman");
  r.boss.guildId="g1";r.boss.hp=300;near(e,950,620);near(other,950,650);
  stepRoom(r,.05);assert.equal(r.entities.filter(x=>x.channel?.kind==="bossHeal").length,1);
  advance(r,3000);assert.equal(r.boss.hp,420);assert.ok(e.cooldowns.bossHeal>r.now);
});
test("Priest rebirth own boss50% after5sec, once only and no claim points",()=>{
  const r=room(),e=player(r,"p","priest");r.boss.guildId="g1";r.boss.alive=false;r.boss.hp=0;r.boss.corpseUntil=r.now+15000;near(e,950,620);
  stepRoom(r,.05);assert.equal(e.channel?.kind,"rebirth");advance(r,5000);
  assert.equal(r.boss.hp,300);assert.equal(r.boss.alive,true);assert.equal(r.boss.resurrected,true);assert.equal(r.guilds[0].score,0);
  r.boss.alive=false;r.boss.corpseUntil=r.now+15000;e.cooldowns.rebirth=0;stepRoom(r,.05);assert.equal(e.channel,null);
});
test("Druid only banner pickup, drops on death, owned delivery25, respawn60sec",()=>{
  const r=room(),w=player(r,"w","warrior"),d=player(r,"d","druid");near(w,180,610);near(d,200,610);
  stepRoom(r,.05);assert.equal(r.banner.carrier,null);near(d,180,610);stepRoom(r,.05);assert.equal(r.banner.carrier,d.id);
  damageEntity(r,d,999,{guildId:"enemy"});assert.equal(r.banner.carrier,null);assert.equal(r.banner.x,d.x);
  d.alive=true;d.hp=d.maxHp;near(d,r.banner.x,r.banner.y);stepRoom(r,.05);take(r);
  assert.equal(r.banner.carrier,null);assert.equal(r.banner.availableAt,r.now+60000);assert.equal(r.guilds[0].score,165);
});
test("carrying Bear reduces incoming damage20%; Cheetah moves50% faster",()=>{
  const r=room(),d=player(r,"d","druid");near(d,300,600);d.carrying=true;d.form="bear";
  damageEntity(r,d,10,{guildId:"enemy"});assert.equal(d.hp,d.maxHp-8);
  const normal=room(),fast=room(),n=player(normal,"d","druid"),f=player(fast,"d","druid");
  for(const e of [n,f]){e.x=300;e.y=700;e.carrying=true;e.objective="gate";}f.form="cheetah";
  stepRoom(normal,.05);stepRoom(fast,.05);assert.ok(Math.abs(Math.hypot(f.x-300,f.y-700)/Math.hypot(n.x-300,n.y-700)-1.5)<.01);
});
test("control points completed minutes, timer resets; final3min50",()=>{
  const r=room();player(r);take(r);r.entities=[];
  advance(r,59950);assert.equal(r.guilds[0].score,140);advance(r,50);assert.equal(r.guilds[0].score,165);
  r.now=r.endsAt-180000;r.holdAt=r.now;advance(r,60000);assert.equal(r.guilds[0].score,215);
});
test("exact17minute hold boundary remains25; only next three completions award50",()=>{
  const r=room();player(r);take(r);r.entities=[];r.holdAt=START;r.now=START;
  advance(r,EVENT_DURATION);assert.equal(r.guilds[0].score,140+17*25+3*50);
});
test("Boss structure kills award extra25 and pact buffs only gate/tower damage",()=>{
  const r=room();player(r);r.boss.guildId="g1";r.boss.x=600;r.boss.y=575;r.boss.pactUntil=r.now+10000;
  stepRoom(r,.05);assert.equal(r.structures[0].hp,261);
  r.structures[0].hp=1;r.boss.nextAttack=0;stepRoom(r,.05);assert.equal(r.guilds[0].score,65);
  r.owner="g2";r.ice={hp:150,maxHp:150,expiresAt:r.now+12000};r.boss.nextAttack=0;r.entities=[];
  stepRoom(r,.05);assert.equal(r.ice.hp,120);
});
test("an attacker already inside can strike the inside face of a new ice gate",()=>{
  const r=room(),e=player(r);r.owner="g2";r.structures[0].hp=0;
  r.ice={hp:150,maxHp:150,expiresAt:r.now+12000};e.x=600;e.y=480;e.objective="castle";
  stepRoom(r,.05);assert.equal(r.ice.hp,133.5);assert.equal(r.structures[1].hp,600);
});
test("hold timer restarts upon changing ownership",()=>{
  const r=room(),a=player(r),b=player(r,"b","warrior","g2");take(r);r.entities=[];
  advance(r,59000);damageStructure(r,r.structures[0],1000,b);damageStructure(r,r.structures[1],1000,b);
  const score=r.guilds[1].score;advance(r,1000);assert.equal(r.guilds[1].score,score);
  advance(r,59000);assert.equal(r.guilds[1].score,score+25);
});
test("low health local retreat preserves commanded objective and resumes it",()=>{
  const r=room(),e=player(r),enemy=player(r,"b","warrior","g2");near(e,300,600);near(enemy,400,600);
  e.objective="boss";e.hp=20;stepRoom(r,.05);assert.equal(e.retreat,true);assert.equal(e.objective,"boss");
  enemy.alive=false;advance(r,15000);assert.equal(e.retreat,false);assert.equal(e.objective,"boss");
});
test("defense requires actual enemy attack and15sec quiet, max once/min",()=>{
  const r=room();player(r);player(r,"b","warrior","g2");take(r);r.entities=[];
  advance(r,16000);assert.equal(r.guilds[0].score,140);
  damageStructure(r,r.structures[0],1,{guildId:"g2"});advance(r,15000);assert.equal(r.guilds[0].score,165);
  damageStructure(r,r.structures[0],1,{guildId:"g2"});advance(r,15000);assert.equal(r.guilds[0].score,165);
});
test("finished event freezes simulation and computes ties, no economy fields",()=>{
  const r=room();player(r);player(r,"b","warrior","g2");r.now=r.endsAt-50;stepRoom(r,.05);
  assert.equal(r.finished,true);assert.deepEqual(r.winners,["g1","g2"]);const tick=r.tick;stepRoom(r);assert.equal(r.tick,tick);
  assert.equal(snapshot(r).rewardsEnabled,false);assert.equal("gold" in snapshot(r),false);
});
test("solo playable warrior actually navigates and captures without admin commands",()=>{
  const r=room();player(r);advance(r,300000);assert.equal(r.owner,"g1");
});
test("serialized checkpoints restore valid full-state spectator snapshot",()=>{
  const r=room();player(r);advance(r,1000);const restored=JSON.parse(JSON.stringify(r));stepRoom(restored);
  assert.equal(snapshot(restored).entities.length,1);assert.ok(snapshot(restored).tick>r.tick);
});
test("worker allocates oldest room, spills sixth guild member and enforces one room",async()=>{
  const w=new Worker(new URL("../src/guild-war/worker.mjs",import.meta.url)),requests=new Map();let seq=0;
  const ready=new Promise(resolve=>w.on("message",m=>{if(m.kind==="ready")resolve();if(m.kind==="reply"){const p=requests.get(m.requestId);if(p){requests.delete(m.requestId);m.error?p.reject(new Error(m.error)):p.resolve(m.value);}}}));
  w.postMessage({kind:"init",rooms:[]});await ready;
  const request=(kind,data)=>new Promise((resolve,reject)=>{const requestId=String(++seq);requests.set(requestId,{resolve,reject});w.postMessage({kind,data,requestId});});
  try{
    const input=i=>({id:`a${i}`,name:`a${i}`,guildId:"g1",guildName:"g1",emblem:"lion",classId:"warrior",event:"practice"});
    const first=await request("join",input(0));for(let i=1;i<5;i++)assert.equal((await request("join",input(i))).roomId,first.roomId);
    const sixth=await request("join",input(5));assert.notEqual(sixth.roomId,first.roomId);
    assert.equal((await request("join",{...input(0),event:"scheduled"})).roomId,first.roomId);
    const other=await request("join",{...input(6),guildId:"g2",guildName:"g2"});assert.equal(other.roomId,first.roomId);
    const snap=await request("snapshot",{roomId:first.roomId});assert.equal(snap.entities.filter(e=>!e.isBot).length,6);
    assert.equal(snap.entities.filter(e=>e.isBot).length,5);assert.equal(snap.guilds.filter(g=>g.isBot).length,1);
    await new Promise(resolve=>setTimeout(resolve,150));
    assert.ok((await request("snapshot",{roomId:first.roomId})).tick>snap.tick,"simulation must run with zero spectators");
    await assert.rejects(request("command",{roomId:first.roomId,playerId:"spectator",objective:"gate"}),/not an active/);
    await request("leave",{roomId:first.roomId,playerId:"a0"});
    assert.equal((await request("join",input(0))).roomId,first.roomId);
    await request("reconcile",{members:Array.from({length:7},(_,i)=>({playerId:`a${i}`,guildId:i===6?"g2":"g1"}))});
    assert.equal((await request("snapshot",{roomId:first.roomId})).entities.filter(e=>e.isBot).length,5,"membership reconciliation must retain bots");
  }finally{await w.terminate();}
});
