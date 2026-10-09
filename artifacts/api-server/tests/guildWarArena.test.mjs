import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, addPlayer, stepRoom, snapshot, CLASSES, removePlayer } from "../src/guild-war/engine.mjs";
import { arenaCatalogue, ARENA_COMBAT_VERSION, prepareArenaCombat } from "../src/guild-war/arena-combat.mjs";
import { selectGuildWarBuild } from "../src/guild-war/loadout.mjs";
import { obstacles, lineOfSight, point } from "../src/guild-war/geometry.mjs";

const start=1_800_000_000_000;
function room(){return createRoom("test","practice:fixture",start,{arena:true});}
function player(r,id,classId="warrior",guildId=id,build){
  addPlayer(r,{id,name:id,guildId,guildName:guildId,classId,build});
  return r.entities.find(e=>e.id===id);
}
function ticks(r,n){for(let i=0;i<n;i++)stepRoom(r);}
const own=(kind,itemId)=>({kind,itemId});

test("new extraction is versioned and scaled; legacy rooms are unchanged",()=>{
  const r=room(),old=createRoom("old","practice:old",start);
  assert.equal(r.combatVersion,ARENA_COMBAT_VERSION);
  assert.equal(old.combatVersion,undefined);
  assert.equal(snapshot(r).map.width,2400);
  assert.equal(snapshot(r).map.height,1600);
  assert.equal(snapshot(old).map.width,1200);
  assert.equal(r.structures[0].hp,old.structures[0].hp);
  assert.deepEqual(point(r,600,545),{x:1200,y:1090});
  assert.equal(r.rewardsEnabled,false);
});
test("loadouts come from the exact selected owned server slot",()=>{
  const state={activeBuild:{heroes:[
    {classId:"warrior",ability:"default",ultimate:"default",talents:[]},
    {classId:"warrior",ability:"custom",ultimate:"custom",talents:["iron"]},
  ],captainClass:"warrior",captainRacial:"orc"}};
  const ledger=[own("class","warrior"),own("spell","ability:warrior"),own("ultimate","ult:warrior"),
    own("talent","warrior:iron"),own("racial","orc")];
  const build=selectGuildWarBuild(state,"warrior",1,ledger);
  assert.equal(build.ability,"custom");assert.deepEqual(build.talents,["iron"]);assert.equal(build.racial,"orc");
  assert.equal(build.heroIndex,1);
  assert.throws(()=>selectGuildWarBuild(state,"warrior",3,ledger),/changed/);
  assert.throws(()=>selectGuildWarBuild(state,"warrior",1,[own("class","warrior")]),/not unlocked/);
  assert.throws(()=>selectGuildWarBuild(state,"priest",undefined,ledger),/owned/);
  assert.deepEqual(selectGuildWarBuild({},"warrior",undefined,[own("class","warrior")]).talents,[]);
});
test("Arena class stats replace the legacy approximation in new rooms",()=>{
  const r=room();player(r,"mage","frostmage");prepareArenaCombat(r);
  assert.equal(r.entities[0].maxHp,arenaCatalogue.classes.frostmage.hp);
  assert.equal(r.entities[0].build.ability,"default");
});
test("restart does not refill a wounded character; shields, CC and cooldowns persist",()=>{
  const r=room(),e=player(r,"hero");prepareArenaCombat(r);ticks(r,2);
  e.hp=67;e.arenaCheckpoint.cd.a1=9;
  e.arenaCheckpoint.status.shield=31;e.arenaCheckpoint.status.shieldTimer=4;e.arenaCheckpoint.status.stunTimer=2;
  const restored=JSON.parse(JSON.stringify(r));
  prepareArenaCombat(restored);
  assert.equal(restored.entities[0].hp,67);
  ticks(restored,1);
  assert.equal(restored.entities[0].hp,67);
  assert.equal(restored.entities[0].combat.shield,31);
  assert.ok(restored.entities[0].combat.cc.includes("stun"));
  assert.ok(restored.entities[0].arenaCheckpoint.cd.a1>8.9);
});
test("guild scaling preserves gate LOS and occupied-tower exception geometry",()=>{
  const r=room();
  assert.equal(obstacles(r).length,6);
  assert.equal(lineOfSight(r,{x:1200,y:1150},{x:1200,y:950}),false);
  r.structures[0].hp=0;
  assert.equal(lineOfSight(r,{x:1200,y:1150},{x:1200,y:950}),true);
  assert.equal(lineOfSight(r,{x:900,y:1150},{x:900,y:950}),false);
});
test("crowd control prevents war movement and unsafe channels",()=>{
  const r=room(),e=player(r,"hero","rogue");prepareArenaCombat(r);ticks(r,1);
  e.x=1200;e.y=1130;e.channel={kind:"sabotage",startedAt:r.now,endsAt:r.now+1000,target:"tower-left"};
  e.arenaCheckpoint.status.stunTimer=2;
  const restored=JSON.parse(JSON.stringify(r));ticks(restored,1);
  const result=restored.entities[0];
  assert.equal(result.x,1200);assert.equal(result.y,1130);assert.equal(result.channel,null);
});
for(const variant of ["default","custom","polymorph"]){
  test(`25 real Arena actors, all nine classes, ${variant} kits, siege targets and boss stay finite`,()=>{
    const r=room(),classes=Object.keys(CLASSES);
    for(let i=0;i<25;i++){
      const cls=classes[i%classes.length],e=player(r,`hero${i}`,cls,`guild${Math.floor(i/5)}`,{
        ability:variant==="default"?"default":"custom",
        ultimate:variant==="polymorph"&&cls!=="frostmage"?"default":variant,
        talents:[],racial:null,isCaptain:false,skinId:"default",
      });
      e.x=1100+(i%5)*35;e.y=1150+Math.floor(i/5)*35;
    }
    let damage=false,cast=false,healing=false;
    for(let t=0;t<1000;t++){
      stepRoom(r);
      damage ||=r.events.some(e=>e.kind==="damage"&&e.amount>0);
      cast ||=r.events.some(e=>e.kind==="cast");
      healing ||=r.events.some(e=>e.kind==="heal"&&e.amount>0);
      assert.ok(r.entities.every(e=>[e.x,e.y,e.hp,e.maxHp].every(Number.isFinite)));
      assert.ok(r.entities.every(e=>e.hp>=0));
    }
    assert.ok(damage,"authoritative damage events");assert.ok(cast,"original named casts");assert.ok(healing,"original healing");
    assert.equal(r.entities.length,25);assert.equal(r.guilds.length,5);assert.equal(r.rewardsEnabled,false);
    const view=snapshot(r);assert.ok(!JSON.stringify(view).includes("arenaCheckpoint"));
    assert.ok(Array.isArray(view.summons));assert.doesNotThrow(()=>JSON.stringify(r));
  });
}
test("real archer summons survive ticks and leave with their owner",()=>{
  const r=room();player(r,"archer","archer");ticks(r,20);
  assert.ok(snapshot(r).summons.some(p=>p.ownerId==="archer"));
  removePlayer(r,"archer");ticks(r,1);
  assert.equal(snapshot(r).summons.length,0);
});
test("real melee damages the exposed closed gate without making the protected castle vulnerable",()=>{
  const r=room(),e=player(r,"siege");e.x=1200;e.y=1130;
  r.structures.find(t=>t.kind==="castle").shield=150;
  r.structures.find(t=>t.kind==="castle").shieldUntil=r.endsAt;
  ticks(r,180);
  assert.ok(r.structures[0].hp<300,"original melee must reach gate");
  assert.equal(r.structures.find(t=>t.kind==="castle").hp,600);
  assert.equal(r.structures.find(t=>t.kind==="castle").shield,150);
});
test("a low-HP castle absorbs the actual incoming hit with its war shield, not one HP per hit",()=>{
  const r=room(),e=player(r,"siege");e.x=1200;e.y=700;
  r.structures[0].hp=0;
  const castle=r.structures.find(t=>t.kind==="castle");
  castle.hp=1;castle.shield=150;castle.shieldUntil=r.endsAt;
  ticks(r,12);
  assert.equal(castle.hp,1);
  assert.ok(castle.shield<145&&castle.shield>0,`real shield absorption: ${castle.shield}`);
  assert.equal(r.owner,null);
});
test("ten-second respawn clears old CC and creates only one fresh archer companion",()=>{
  const r=room(),e=player(r,"archer","archer");ticks(r,1);
  e.alive=false;e.hp=0;e.respawnAt=r.now+50;
  e.arenaCheckpoint.status.stunTimer=9;
  const restored=JSON.parse(JSON.stringify(r));ticks(restored,1);
  assert.equal(restored.entities[0].alive,true);
  assert.equal(restored.entities[0].hp,restored.entities[0].maxHp);
  assert.deepEqual(restored.entities[0].combat.cc,[]);
  assert.equal(snapshot(restored).summons.filter(p=>p.ownerId==="archer").length,1);
});
test("all captain racials and one equipped class talent can run without browser globals",()=>{
  const races=["nightelf","tauren","orc","troll","dwarf","bloodelf","goblin","undead"];
  for(const [index,racial] of races.entries()){
    const r=room(),cls=Object.keys(CLASSES)[index],talent=arenaCatalogue.talents[cls][0].id;
    const e=player(r,"captain",cls,"blue",{ability:"custom",ultimate:"custom",talents:[talent],isCaptain:true,racial});
    player(r,"opponent","warrior","red");
    e.x=1200;e.y=1150;r.entities[1].x=1250;r.entities[1].y=1150;
    ticks(r,300);
    assert.ok(r.entities.every(p=>Number.isFinite(p.hp)));
    assert.ok(r.entities[0].maxHp>=arenaCatalogue.classes[cls].hp);
  }
});
