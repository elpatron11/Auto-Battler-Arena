import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { db, pool, guildWarCheckpointsTable, guildMembersTable, type PoolClient } from "@workspace/db";
import { lt } from "drizzle-orm";
import { logger } from "./logger";
import { GuildError } from "./guildFoundation";

export const guildWarsEnabled=()=>process.env.NODE_ENV==="development";
type Pending={resolve:(value:any)=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout};
const pending=new Map<string,Pending>(),subscribers=new Map<string,Set<Response>>();
let worker:Worker|null=null,initializing:Promise<void>|null=null;
let persisting=false,queuedCheckpoints:any[]|null=null,lastPrune=0;
let lease:PoolClient|null=null;

async function persist(rooms:any[]){
  queuedCheckpoints=rooms;if(persisting)return;persisting=true;
  try{
    while(queuedCheckpoints){const batch=queuedCheckpoints;queuedCheckpoints=null;
      for(const room of batch)await db.insert(guildWarCheckpointsTable).values({id:room.id,state:room,updatedAt:new Date()})
        .onConflictDoUpdate({target:guildWarCheckpointsTable.id,set:{state:room,updatedAt:new Date()}});
      if(Date.now()-lastPrune>300000){
        await db.delete(guildWarCheckpointsTable).where(lt(guildWarCheckpointsTable.updatedAt,new Date(Date.now()-86400000)));
        lastPrune=Date.now();
      }
    }
  }catch(error){logger.error({err:error},"Guild Wars checkpoint failed");}
  finally{persisting=false;}
}
function broadcast(id:string,value:any){
  const message=`id: ${value.tick}\ndata: ${JSON.stringify(value)}\n\n`;
  for(const response of subscribers.get(id)??[]){
    if(response.destroyed){subscribers.get(id)?.delete(response);continue;}
    // Bound slow-client buffers; reconnect receives a fresh full snapshot.
    if(response.writableLength>256*1024){response.end();subscribers.get(id)?.delete(response);continue;}
    response.write(message);
  }
}
export async function startGuildWars(){
  if(!guildWarsEnabled())throw new GuildError("Guild Wars is an unpublished development prototype.",403);
  if(initializing)return initializing;
  if(worker)return;
  initializing=(async()=>{
    lease=await pool.connect();
    const lock=await lease.query("SELECT pg_try_advisory_lock(72461002) AS acquired");
    if(!lock.rows[0].acquired){lease.release();lease=null;throw new GuildError("Another prototype coordinator owns the rooms. Retry shortly.",503);}
    const states=await db.select().from(guildWarCheckpointsTable);
    const coordinator=new Worker(new URL("./guild-war-worker.mjs",import.meta.url));
    const connection=lease;
    worker=coordinator;
    lease.on("error",error=>{
      logger.error({err:error},"Guild Wars coordinator lease lost");
      void coordinator.terminate();
    });
    await new Promise<void>((resolve,reject)=>{
      const startup=setTimeout(()=>reject(new Error("Guild Wars worker startup timed out.")),10000);
      coordinator.on("message",async msg=>{
        if(msg.kind==="ready"){clearTimeout(startup);resolve();}
        else if(msg.kind==="reply"){
          const task=pending.get(msg.requestId);if(!task)return;
          clearTimeout(task.timer);pending.delete(msg.requestId);
          if(msg.error)task.reject(new GuildError(msg.error));else task.resolve(msg.value);
        }else if(msg.kind==="snapshot")broadcast(msg.roomId,msg.snapshot);
        else if(msg.kind==="checkpoint")void persist(msg.rooms);
      });
      coordinator.on("error",error=>{clearTimeout(startup);reject(error);logger.error({err:error},"Guild Wars worker failure");});
      coordinator.on("exit",()=>{
        clearTimeout(startup);reject(new GuildError("Prototype coordinator stopped.",503));
        if(worker!==coordinator)return;
         worker=null;
        for(const response of [...subscribers.values()].flatMap(set=>[...set]))response.end();subscribers.clear();
        for(const p of pending.values()){clearTimeout(p.timer);p.reject(new GuildError("Prototype worker restarted. Reconnect.",503));}pending.clear();
        if(lease===connection){connection.release(true);lease=null;}
      });
      coordinator.postMessage({kind:"init",rooms:states.map(s=>s.state)});
    });
  })().catch(error=>{void worker?.terminate();worker=null;if(lease){lease.release(true);lease=null;}throw error;})
    .finally(()=>{initializing=null;});
  return initializing;
}
export async function warRequest(kind:string,data:Record<string,unknown>):Promise<any>{
  await startGuildWars();
  const requestId=randomUUID();
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(requestId);reject(new GuildError("The room coordinator did not respond.",503));},5000);
    pending.set(requestId,{resolve,reject,timer});worker!.postMessage({kind,requestId,data});
  });
}
export async function removeWarPlayer(playerId:string){
  if(worker)await warRequest("remove",{playerId});
}
export async function openWarStream(roomId:string,res:Response){
  const snap=await warRequest("snapshot",{roomId});
   if(res.destroyed||res.writableEnded)return;
  const set=subscribers.get(roomId)??new Set<Response>();
  if(set.size>=100)throw new GuildError("Prototype spectator safety limit reached.",429);
  res.status(200).set({"Content-Type":"text/event-stream","Cache-Control":"no-cache, no-transform","Connection":"keep-alive","X-Accel-Buffering":"no"});
  res.flushHeaders();res.write(`retry: 2000\nid: ${snap.tick}\ndata: ${JSON.stringify(snap)}\n\n`);
   const first=!set.size;set.add(res);subscribers.set(roomId,set);
   if(first)worker?.postMessage({kind:"observe",roomId,enabled:true});
  const heartbeat=setInterval(()=>res.write(": heartbeat\n\n"),15000);
  // Force a periodic authenticated reconnect instead of retaining an expired
  // Clerk session forever. No bearer tokens appear in URLs.
  const lifetime=setTimeout(()=>res.end(),5*60000);
   res.on("close",()=>{clearInterval(heartbeat);clearTimeout(lifetime);set.delete(res);if(!set.size&&subscribers.get(roomId)===set){subscribers.delete(roomId);worker?.postMessage({kind:"observe",roomId,enabled:false});}});
}
const reconcile=setInterval(async()=>{
  if(!worker)return;
  try{await warRequest("reconcile",{members:await db.select().from(guildMembersTable)});}
  catch(error){logger.warn({err:error},"Guild Wars membership reconciliation failed");}
},5000);
reconcile.unref();
