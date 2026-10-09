import test from "node:test";
import assert from "node:assert/strict";
import {buildSync,transformSync} from "esbuild";
import {readFileSync} from "node:fs";
import {Module,createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import vm from "node:vm";
import { selectGuildWarBuild } from "../src/guild-war/loadout.mjs";
import { arenaCatalogue } from "../src/guild-war/arena-combat.mjs";

// Real generated contracts; no database, Clerk credentials or worker opened.
const dir=fileURLToPath(new URL("../",import.meta.url));
const contracts=buildSync({entryPoints:[fileURLToPath(new URL("../../../lib/api-zod/src/index.ts",import.meta.url))],
  bundle:true,platform:"node",format:"cjs",write:false,logLevel:"error"});
const contractModule=new Module(dir+"tests/guild-contracts.cjs");
contractModule.filename=dir+"tests/guild-contracts.cjs";
contractModule.paths=createRequire(import.meta.url).resolve.paths("zod");
contractModule._compile(contracts.outputFiles[0].text,contractModule.filename);
const policyModule={exports:{}};
vm.runInNewContext(transformSync(readFileSync(new URL("../src/lib/guildRequestPolicy.ts",import.meta.url),"utf8"),{loader:"ts",format:"cjs"}).code,
  {module:policyModule,exports:policyModule.exports,URL});
const routeCode=transformSync(readFileSync(new URL("../src/routes/guild-wars.ts",import.meta.url),"utf8"),{loader:"ts",format:"cjs"}).code;
function harness({enabled=true,owned=true,active="actor",profileState={},ledger=[{kind:"class",itemId:"warrior"}]}={}){
  const steps=[],calls=[];
  const router={
    use:(path,fn)=>steps.push({method:"USE",path,fn}),
    get:(path,fn)=>steps.push({method:"GET",path,fn}),
    post:(path,fn)=>steps.push({method:"POST",path,fn}),
  };
  class GuildError extends Error{constructor(message,status=409){super(message);this.status=status;}}
  const dependencies={
    express:{Router:()=>router},"@clerk/express":{getAuth:req=>({userId:req.userId})},
    "@workspace/api-zod":contractModule.exports,
    "../lib/guildFoundation":{GuildError,guildPlayer:async()=>({guild:{id:"g"},profile:{name:"Hero",state:profileState}})},
    "../guild-war/loadout.mjs":{selectGuildWarBuild},
    "../lib/economy":{CLASS_TALENTS:Object.fromEntries(Object.entries(arenaCatalogue.talents).map(([k,v])=>[k,v.map(t=>t.id)])),
      RACIAL_IDS:["nightelf","tauren","orc","troll","dwarf","bloodelf","goblin","undead"]},
    "../lib/guildRequestPolicy":policyModule.exports,
    "../lib/guildWarRuntime":{
      guildWarsEnabled:()=>enabled,
      warRequest:async(kind,data)=>{calls.push({kind,data});
        if(kind==="lobby")return {enabled:true,now:0,scheduledStart:0,scheduledEnd:0,scheduledOpen:false,activeRoomId:null,rooms:[]};
        if(kind==="snapshot")return {entities:[{id:active,guildId:"g"}]};
        return {roomId:"room"};
      },
      openWarStream:async(roomId,res)=>{calls.push({kind:"stream",data:{roomId}});res.json({stream:true});},
    },
    "@workspace/db":{db:{select:fields=>({from:()=>({where:async()=>owned?(fields?ledger:[{}]):[]})})},economyUnlocksTable:{}},
    "drizzle-orm":{and:(...args)=>args,eq:(...args)=>args},
  };
  const module={exports:{}};
  vm.runInNewContext(routeCode,{module,exports:module.exports,Date,URL,require:name=>{
    assert.ok(dependencies[name],`Unexpected dependency ${name}`);return dependencies[name];
  }});
  const request=async(method,path,body={},userId="actor",origin)=>{
    const req={method,userId,body,params:{roomId:"room"},headers:{host:"game.example",...(origin?{origin}:{})}};
    const res={locals:{},statusCode:200,done:false,status(n){this.statusCode=n;return this;},json(data){this.data=data;this.done=true;return this;}};
    for(const step of steps){
      if(step.method==="USE"&&path.startsWith(step.path)){
        let next=false;await step.fn(req,res,()=>{next=true;});if(!next||res.done)return res;
      }else if(step.method===method&&step.path===path){await step.fn(req,res);return res;}
    }
    throw new Error(`No route ${method} ${path}`);
  };
  return {request,calls};
}
test("all Guild Wars endpoints require authenticated actor including SSE",async()=>{
  const {request,calls}=harness();
  for(const [method,path] of [["GET","/guild-wars"],["POST","/guild-wars/join"],["GET","/guild-wars/rooms/:roomId/stream"],["POST","/guild-wars/rooms/:roomId/command"]]){
    assert.equal((await request(method,path,{},null)).statusCode,401);
  }
  assert.equal(calls.length,0);
});
test("production lobby disabled; joins, commands and streams rejected without coordinator",async()=>{
  const {request,calls}=harness({enabled:false});
  const lobby=await request("GET","/guild-wars");assert.equal(lobby.statusCode,200);assert.equal(lobby.data.enabled,false);
  for(const [method,path] of [["POST","/guild-wars/join"],["POST","/guild-wars/rooms/:roomId/command"],["GET","/guild-wars/rooms/:roomId/stream"]])
    assert.equal((await request(method,path)).statusCode,403);
  assert.equal(calls.length,0);
});
test("join uses Clerk actor, strips supplied identity, validates owned class and no Monk",async()=>{
  const h=harness();
  assert.equal((await h.request("POST","/guild-wars/join",{event:"practice",classId:"warrior",id:"other",playerId:"other",guildId:"other"})).statusCode,200);
  assert.equal(h.calls[0].data.id,"actor");assert.equal(h.calls[0].data.guildId,"g");
  assert.equal((await h.request("POST","/guild-wars/join",{event:"practice",classId:"monk"})).statusCode,400);
  assert.equal((await harness({owned:false}).request("POST","/guild-wars/join",{event:"practice",classId:"warrior"})).statusCode,403);
});
test("spectator command denied before engine; participant can command only own entity",async()=>{
  const h=harness({active:"another"});
  assert.equal((await h.request("POST","/guild-wars/rooms/:roomId/command",{objective:"gate",playerId:"another"})).statusCode,403);
  assert.equal(h.calls.some(c=>c.kind==="command"),false);
  const self=harness();
  assert.equal((await self.request("POST","/guild-wars/rooms/:roomId/command",{objective:"castle",playerId:"another"})).statusCode,200);
  assert.equal(self.calls.at(-1).data.playerId,"actor");
});
test("authenticated spectator may read stream; malformed/foreign mutation Origin rejected",async()=>{
  const h=harness();
  assert.equal((await h.request("GET","/guild-wars/rooms/:roomId/stream")).statusCode,200);
  for(const origin of ["https://foreign.example","not-a-url"]){
    assert.equal((await h.request("POST","/guild-wars/join",{event:"practice",classId:"warrior"},"actor",origin)).statusCode,403);
  }
  assert.equal((await h.request("POST","/guild-wars/join",{event:"practice",classId:"warrior"},"actor","https://game.example")).statusCode,200);
});
test("join ignores client combat builds and validates server loadout and selected slot",async()=>{
  const h=harness();
  const res=await h.request("POST","/guild-wars/join",{event:"practice",classId:"warrior",
    build:{ability:"custom",talents:["all"],racial:"orc",isCaptain:true},hp:999999});
  assert.equal(res.statusCode,200);
  assert.equal(h.calls[0].data.build.ability,"default");assert.equal(h.calls[0].data.build.isCaptain,false);
  assert.equal(h.calls[0].data.hp,undefined);
  assert.equal((await h.request("POST","/guild-wars/join",{event:"practice",classId:"warrior",heroIndex:4})).statusCode,403);
  assert.equal((await h.request("POST","/guild-wars/join",{event:"practice",classId:"warrior",heroIndex:-1})).statusCode,400);
  const invalid=harness({profileState:{activeBuild:{heroes:[{classId:"warrior",ability:"custom"}]}}});
  assert.equal((await invalid.request("POST","/guild-wars/join",{event:"practice",classId:"warrior",heroIndex:0})).statusCode,403);
  assert.equal(invalid.calls.length,0);
});
