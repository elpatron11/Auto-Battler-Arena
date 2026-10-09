import { parentPort } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createRoom, addPlayer, removePlayer, setCommand, stepRoom, snapshot, eventAt, EVENT_DURATION } from "./engine.mjs";
import { canHumanJoin, ensureBotGuild, planBotGuild } from "./bots.mjs";
import { ARENA_COMBAT_VERSION } from "./arena-combat.mjs";
const rooms=new Map(),samples=[],observed=new Set();
let ready=false,lastCheckpoint=0,lastBroadcast=0;
function roomSummary(r){return {id:r.id,eventId:r.eventId,players:r.entities.length,guilds:r.guilds.length,endsAt:r.endsAt,finished:r.finished};}
function roomFor(id){const r=rooms.get(id);if(!r)throw new Error("Room not found.");return r;}
function activePlayer(id){return [...rooms.values()].find(r=>!r.finished&&r.entities.some(e=>e.id===id));}
parentPort.on("message",msg=>{
  if(msg.kind==="observe"){if(msg.enabled)observed.add(msg.roomId);else observed.delete(msg.roomId);return;}
  if(msg.kind==="init"){
    for(const r of msg.rooms){if(r.endsAt<Date.now()-3600000)continue;
      for(const mover of [...r.entities,r.boss])if(Array.isArray(mover.path))mover.path=mover.path.map(p=>({x:p.x,y:p.y}));
      if(r.now< Date.now()){r.now=Math.min(Date.now(),r.endsAt);if(r.now>=r.endsAt){r.finished=false;stepRoom(r,0);}}
      if(!r.finished&&r.guilds.filter(g=>!g.isBot).length<=4)ensureBotGuild(r);
      rooms.set(r.id,r);
    }
    ready=true;parentPort.postMessage({kind:"ready"});return;
  }
  const {requestId,kind,data}=msg;
  try{
    let value;
    if(kind==="lobby"){
      const now=Date.now(),event=eventAt(now);
      value={enabled:true,now,scheduledStart:event.open?event.start:event.next,scheduledEnd:event.open?event.end:event.next+EVENT_DURATION,
        scheduledOpen:event.open,activeRoomId:activePlayer(data.playerId)?.id??null,rooms:[...rooms.values()].map(roomSummary)};
    }else if(kind==="join"){
      const current=activePlayer(data.id);
      if(current){if(current.entities.find(e=>e.id===data.id).guildId!==data.guildId)throw new Error("Leave your old room before entering with another guild.");ensureBotGuild(current);value={roomId:current.id};}
      else{
        const now=Date.now(),event=eventAt(now);
        if(data.event==="scheduled"&&!event.open)throw new Error("The scheduled event is closed.");
        let start=event.start,eventId=`scheduled:${start}`;
        if(data.event==="practice"){
          const existing=[...rooms.values()].find(r=>!r.finished&&r.combatVersion===ARENA_COMBAT_VERSION&&r.eventId.startsWith("practice:")&&r.endsAt>now);
          start=existing?.startedAt??now;eventId=existing?.eventId??`practice:${randomUUID()}`;
        }
        // Fill oldest eligible rooms first; a guild's sixth active player
        // spills into a different room without blocking the first five.
        let room=[...rooms.values()].find(r=>r.combatVersion===ARENA_COMBAT_VERSION&&r.eventId===eventId&&canHumanJoin(r,data.guildId));
        if(!room){
          if([...rooms.values()].filter(r=>!r.finished).length>=20)throw new Error("Prototype room safety limit reached.");
          room=createRoom(randomUUID(),eventId,start,{arena:true});room.now=now;rooms.set(room.id,room);
        }
        addPlayer(room,data);ensureBotGuild(room);value={roomId:room.id};parentPort.postMessage({kind:"checkpoint",rooms:[...rooms.values()]});
      }
    }else if(kind==="command"){setCommand(roomFor(data.roomId),data.playerId,data.objective,data.form);value={roomId:data.roomId};}
    else if(kind==="leave"){const r=roomFor(data.roomId);removePlayer(r,data.playerId);ensureBotGuild(r);value={roomId:data.roomId};}
    else if(kind==="remove"){for(const r of rooms.values()){removePlayer(r,data.playerId);ensureBotGuild(r);}value={};}
    else if(kind==="snapshot"){value=snapshot(roomFor(data.roomId));}
    else if(kind==="reconcile"){
      const allowed=new Map(data.members.map(m=>[m.playerId,m.guildId]));
      for(const r of rooms.values()){
        for(const e of [...r.entities])if(!e.isBot&&allowed.get(e.id)!==e.guildId)removePlayer(r,e.id);
        ensureBotGuild(r);
      }
      value={};
    }else throw new Error("Unknown worker operation.");
    parentPort.postMessage({kind:"reply",requestId,value});
  }catch(error){parentPort.postMessage({kind:"reply",requestId,error:error.message});}
});
setInterval(()=>{
  if(!ready)return;
  const wallNow=Date.now();
  for(const r of rooms.values()){
    if(r.finished)continue;
    const start=performance.now();
    // Bounded catch-up; stalls never extend the real 20-minute event.
    if(wallNow-r.now>500)r.now=Math.min(r.endsAt,wallNow-250);
    let n=0;while(r.now+50<=wallNow&&!r.finished&&n++<6){planBotGuild(r);stepRoom(r,.05);}
    if(r.now>=r.endsAt&&!r.finished)stepRoom(r,0);
    const ms=performance.now()-start;samples.push(ms);if(samples.length>200)samples.shift();
    r.metrics.tickMs=ms;r.metrics.maxMs=Math.max(r.metrics.maxMs,ms);
    r.metrics.p95Ms=[...samples].sort((a,b)=>a-b)[Math.floor(samples.length*.95)]??0;r.metrics.entityCount=r.entities.length;
  }
  if(wallNow-lastBroadcast>=200){
    lastBroadcast=wallNow;
    for(const r of rooms.values()){
      if(!observed.has(r.id))continue;
      const view=snapshot(r);r.metrics.snapshotBytes=Buffer.byteLength(JSON.stringify(view));
      parentPort.postMessage({kind:"snapshot",roomId:r.id,snapshot:view});
    }
  }
  if(wallNow-lastCheckpoint>=5000){lastCheckpoint=wallNow;parentPort.postMessage({kind:"checkpoint",rooms:[...rooms.values()]});}
   for(const [id,r] of rooms)if(r.endsAt<wallNow-3600000){rooms.delete(id);observed.delete(id);}
},50).unref();
