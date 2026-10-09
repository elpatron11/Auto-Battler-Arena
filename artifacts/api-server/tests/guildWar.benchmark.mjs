// Synthetic CPU/serialization measurements, not production or device capacity.
import { performance } from "node:perf_hooks";
import { createRoom,addPlayer,stepRoom,snapshot,CLASSES } from "../src/guild-war/engine.mjs";
import { ensureBotGuild,planBotGuild } from "../src/guild-war/bots.mjs";
const names=Object.keys(CLASSES);
function make(id){
  const r=createRoom(id,"practice:benchmark",1800000000000);
  for(let g=0;g<4;g++)for(let i=0;i<5;i++)addPlayer(r,{id:`${g}-${i}`,name:`Hero${g}-${i}`,guildId:`g${g}`,guildName:`Guild${g}`,emblem:"lion",classId:names[(g*5+i)%names.length]});
  ensureBotGuild(r);
  return r;
}
for(const count of [1,5,10]){
  const rooms=Array.from({length:count},(_,i)=>make(`r${i}`)),times=[],start=performance.now();
  for(let t=0;t<1200;t++){
    const before=performance.now();for(const room of rooms){planBotGuild(room);stepRoom(room,.05);}times.push(performance.now()-before);
    if(t%4===0)for(const room of rooms)JSON.stringify(snapshot(room));
  }
  times.sort((a,b)=>a-b);
  const view=snapshot(rooms[0]),bytes=Buffer.byteLength(JSON.stringify(view));
  const serialization=performance.now();for(let i=0;i<1000;i++)JSON.stringify(view);
  console.info(JSON.stringify({rooms:count,heroesPerRoom:25,simulatedSeconds:60,wallMs:+(performance.now()-start).toFixed(1),
    batchP95Ms:+times[Math.floor(times.length*.95)].toFixed(3),batchP99Ms:+times[Math.floor(times.length*.99)].toFixed(3),batchMaxMs:+times.at(-1).toFixed(3),
    snapshotBytes:bytes,estimatedBytesPerSecondAt5HzPerSpectator:bytes*5,serialize1000Ms:+(performance.now()-serialization).toFixed(1)}));
}
const full=make("full"),begin=performance.now();
while(!full.finished){planBotGuild(full);stepRoom(full,.05);}
console.info(JSON.stringify({full20MinuteEventWallMs:+(performance.now()-begin).toFixed(1),finished:full.finished,scores:full.guilds.map(g=>g.score),
  entityCount:full.entities.length,castleOwner:full.owner,noPayouts:full.rewardsEnabled===false}));
