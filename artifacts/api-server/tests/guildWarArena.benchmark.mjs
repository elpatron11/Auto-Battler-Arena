import {performance} from "node:perf_hooks";
import {createRoom,addPlayer,stepRoom,snapshot,CLASSES} from "../src/guild-war/engine.mjs";
import {arenaCatalogue} from "../src/guild-war/arena-combat.mjs";
const r=createRoom("bench","practice:benchmark",1_800_000_000_000,{arena:true}),classes=Object.keys(CLASSES);
for(let i=0;i<25;i++){
  const cls=classes[i%9];
  addPlayer(r,{id:`hero${i}`,name:`Hero${i}`,guildId:`guild${Math.floor(i/5)}`,guildName:`Guild${Math.floor(i/5)}`,classId:cls,
    build:{ability:"custom",ultimate:"custom",talents:[arenaCatalogue.talents[cls][0].id],racial:i%5===0?"orc":null,isCaptain:i%5===0,skinId:"default"}});
  Object.assign(r.entities[i],{x:1080+(i%5)*50,y:1160+Math.floor(i/5)*40});
}
const start=performance.now(),times=[];let bytes=0,events=0,maxSummons=0;
for(let i=0;i<1200;i++){
  const t=performance.now();stepRoom(r);times.push(performance.now()-t);
  maxSummons=Math.max(maxSummons,r.summons?.length??0);
  if(i%4===0){const snap=snapshot(r);bytes=Math.max(bytes,Buffer.byteLength(JSON.stringify(snap)));events+=snap.events.length;}
}
times.sort((a,b)=>a-b);
console.log(JSON.stringify({scope:"SERVER simulation; NOT a physical-phone measurement",rooms:1,heroes:25,boss:1,maxSummons,simulatedSeconds:60,
  wallMs:+(performance.now()-start).toFixed(1),tickP95Ms:+times[Math.floor(times.length*.95)].toFixed(2),
  tickP99Ms:+times[Math.floor(times.length*.99)].toFixed(2),tickMaxMs:+times.at(-1).toFixed(2),maxSnapshotBytes:bytes,
  maxBytesPerSecondAt5Hz:bytes*5,sampledEvents:events,noPayouts:!r.rewardsEnabled}));
