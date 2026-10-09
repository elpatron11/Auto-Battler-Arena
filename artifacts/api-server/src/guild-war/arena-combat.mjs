// Trusted Arena source is extracted without editing the existing game. This
// adapter owns room-local state; clients never provide combat results.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { obstacles, lineOfSight, dist, move, layout } from "./geometry.mjs";

const html = typeof __GUILD_ARENA_SOURCE__ === "string" ? __GUILD_ARENA_SOURCE__ :
  readFileSync(new URL("../../../auto-battler-arena/public/game.html", import.meta.url), "utf8");
const collision = typeof __GUILD_COLLISION_SOURCE__ === "string" ? __GUILD_COLLISION_SOURCE__ :
  readFileSync(new URL("../../../auto-battler-arena/public/arena-collision.js", import.meta.url), "utf8");
function between(start, end) {
  const a=html.indexOf(start), b=html.indexOf(end,a);
  if(a<0||b<0)throw new Error(`Arena extraction boundary missing: ${start}`);
  return html.slice(a,b);
}
const combatSource=between("const CLASS_STATS =", "const canvas = document.getElementById('arena')");
const talentSource=between("const CLASS_TALENTS=", "function renderTalentTree(");
const captainSource=between("function applyCaptainBuffs(", "// Remembers the exact enemy matchup");
const focusSource=between("function focusDamageImmune(", "function manualFocusTarget(");
const packSource=between("function applyDruidPackBuff(", "function applyCaptainBuffs(");
const movementSource=between("  const rampageBoost=", "  const beforeX=");
export const ARENA_COMBAT_VERSION=`arena-extracted:${createHash("sha256").update(combatSource+talentSource+captainSource+focusSource+packSource).digest("hex").slice(0,12)}`;
export const arenaCatalogue=JSON.parse(vm.runInNewContext(
  between("const CLASS_STATS =", "const CLASS_COLOR =")+talentSource.split("let talentViewClass")[0]+
  ";JSON.stringify({classes:CLASS_STATS,talents:CLASS_TALENTS})"));
const runtimes=new WeakMap();
function objectiveFace(r,target,source){
  if(target?.id!=="gate"&&target?.id!=="ice")return target;
  const inside=source.y<target.y;
  return {...target,y:(inside?520:550)*(r.mapScale||1)+(inside?-1:1)};
}
const PRELUDE=`
let playerProfile=null,legacyTalentAccess=false,balanceSimulationRunning=true;
let activeTeamFormation=null,formationFocusId=null,teamOrders={focus:null,control:null,heal:null,switchLow:false};
let captainClass=null,captainRacial=null;
function equippedSkin(){return 'default';}
function orderEntity(){return null;}
function lowHealthFinishTarget(){return null;}
function orderedFocusTarget(){return null;}
function orderedControlTarget(){return null;}
function orderedHealTarget(){return null;}
function manualFocusTarget(){return null;}
function balanceTrackDamage(){};
`;
const BRIDGE=`
function arenaMoveSpeed(e){${movementSource}return speed;}
state={entities:[],log:[],effects:[],over:false,running:true,speed:1,killFeed:[],recentKills:[],traps:[],totems:[],fireZones:[],startTime:0};
entityHasTalent=(e,id)=>!!(e&&!e.isPet&&e.__talents?.includes(id));
const originalDamage=dealDamage, originalHeal=healTarget, originalEffect=addEffect;
const originalAbilityLabel=abilityLabel;
abilityLabel=function(e,text,color){bridge.event('cast',e,null,0,text);originalAbilityLabel(e,text,color);};
matchAbilityImage=function(){return null;};
dealDamage=function(source,target,amount,opts){
  if(!bridge.canHit(target,source))return;
  amount=bridge.reduce(target,source,amount);
  const before=target.hp;originalDamage(source,target,amount,opts);
  if(!target.__objective&&target.hp<before)bridge.hurt(target);
  bridge.event('damage',source,target,Math.max(0,before-target.hp),opts?.tag||'Attack');
};
healTarget=function(source,target,amount){
  if(target?.__objective)return; // Only the specified war channels heal bosses.
  const before=target?.hp||0;originalHeal(source,target,amount);
  if(target&&target.hp>before)bridge.event('heal',source,target,target.hp-before,'Healing');
};
addEffect=function(fx){
  if(fx.type!=='particle'&&fx.type!=='text')bridge.effect(fx);
};
log=function(message){bridge.log(message);};
sfx=function(){};
moveToward=function(e,target,dt,stop){opportunisticMeleeSwing(e,target);bridge.move(e,target,dt,stop,arenaMoveSpeed(e));};
hasLOS=function(x,y,tx,ty){return bridge.los(x,y,tx,ty);};
globalThis.api={
  spawn(p){
    playerProfile={talents:{[p.classId]:p.build?.talents||[]},unlockedTalents:{[p.classId]:p.build?.talents||[]}};
    const e=createEntity(p.classId,'player',p.x,p.y,p.build?.ability,p.build?.ultimate);
    e.id=p.id;e.team=p.guildId;e.name=p.name;e.__talents=p.build?.talents||[];
    e.skinId=p.build?.skinId||'default';e.racial=p.build?.racial||null;
    if(p.build?.isCaptain)applyCaptainBuffs(e,[...state.entities,e]);
    e.racialManual=false;e.__war=true;
    e.__baseRange=e.range;
    state.entities.push(e);
    if(e.classId==='archer')state.entities.push(createPet(e));
    return e;
  },
  revive(old,p){
    const oldLength=state.entities.length,e=this.spawn(p);
    e.cd={...old.cd};e.extra.hasResurrected=old.extra.hasResurrected;
    e.extra.hasSummonStoneRevive=old.extra.hasSummonStoneRevive;
    const freshPets=new Set(state.entities.slice(oldLength).filter(a=>a.isPet).map(a=>a.id));
    for(let i=state.entities.length-1;i>=0;i--){
      const a=state.entities[i];
      if(a===old||a.isPet&&a.owner===p.id&&!freshPets.has(a.id))state.entities.splice(i,1);
    }
    p.hp=e.hp;p.maxHp=e.maxHp;return e;
  },
  proxy(p){
    const e={...p,team:p.guildId,name:p.id,classId:p.kind||'boss',radius:20,alive:p.hp>0,isPet:false,
      status:makeStatus(),extra:{frozenAttackers:new Set()},speed:0,range:0,dmg:0,atkTimer:999,atkCd:999,
      cd:{a1:999,a2:999,ult:999},matchStats:{damage:0,healing:0,kills:0,assists:0,selfHeal:0,dot:0,pet:0,aoe:0},__objective:true};
    state.entities.push(e);return e;
  },
  hurt(id,amount,source){
    const target=state.entities.find(e=>e.id===id);if(!target)return null;
    const from=state.entities.find(e=>e.id===source.id)||state.entities.find(e=>e.id==='boss')||
      {id:'boss',classId:'boss',name:'Siege Boss',team:source.guildId||'neutral',extra:{},status:makeStatus()};
    from.team=source.guildId||'neutral';dealDamage(from,target,amount,{tag:'Siege Boss'});
    return {hp:target.hp,maxHp:target.maxHp,alive:target.alive};
  },
  all(){return state.entities;},
  moveSpeed(e){return arenaMoveSpeed(e);},
  step(dt,width,height,walls,active){
    ARENA_W=width;ARENA_H=height;WALLS=walls;
    for(const e of [...state.entities]){
      bridge.current(e);
      playerProfile=e.__war?{talents:{[e.classId]:e.__talents},unlockedTalents:{[e.classId]:e.__talents}}:null;
      if(!e.alive){for(const key of Object.keys(e.cd||{}))e.cd[key]=Math.max(0,e.cd[key]-dt);continue;}
      // Non-engaged heroes still advance status/casts/CDs, but their strategic
      // movement is owned by the Guild Wars objectives.
      if(e.__objective){tickEntity(e,dt);continue;}
      const ai=classAI;classAI=(actor,delta)=>{if(active.has(actor.id)||actor.isPet)ai(actor,delta);};
      try{tickEntity(e,dt);}finally{classAI=ai;}
    }
    tickTraps(dt);tickFireZones(dt);tickTotems(dt);
    state.entities=state.entities.filter(e=>e.__war||e.alive);
    state.effects.length=0;
  }
};
`;
// Arena's historic player-only talent guards become per-entity build guards.
// The formulas and individual ability implementations remain the originals.
function perEntityGuards(source) {
  return source.replace(/\b(e|source|target|owner)\.team==='player'/g,"!$1.isPet")
    .replace(/\b(e|source)\.team!=='player'/g,"$1.isPet");
}
// Preserve the original damage formula and reactions, but delegate objective
// HP application to the existing war rules BEFORE original death handling.
// Otherwise low-HP shielded structures cap hits or trigger false Arena kills.
const hpBoundary="  target.hp -= amount;";
if(!combatSource.includes(hpBoundary))throw new Error("Arena objective damage boundary missing");
const objectiveSource=combatSource.replace(hpBoundary,
  "  if(target.__objective)bridge.objectiveDamage(target,source,amount);else target.hp -= amount;");
function runtime(r) {
  let out=runtimes.get(r);if(out)return out;
  const map=layout(r), events=[];
  let serial=r.eventSerial||0, current=null;
  const emit=(kind,source,target,amount,label,x=source?.x||target?.x||0,y=source?.y||target?.y||0,tx=target?.x||x,ty=target?.y||y)=>{
    if(![x,y,tx,ty,amount].every(Number.isFinite))return;
    events.push({id:++serial,at:r.now,kind,sourceId:source?.id==null?null:String(source.id),ownerId:source?.owner??null,
      sourceGuildId:source?.team??null,targetId:target?.id==null?null:String(target.id),x,y,tx,ty,amount,label:String(label).slice(0,60)});
    if(events.length>96)events.shift();r.eventSerial=serial;
  };
  const bridge={
    current(e){current=e;},
    event:emit,
    effect(fx){emit(fx.type,current,null,0,fx.spellName||fx.label||fx.type,fx.x??fx.x1??current?.x??0,fx.y??fx.y1??current?.y??0,fx.x2??fx.tx??fx.x??0,fx.y2??fx.ty??fx.y??0);},
    log(message){const text=String(message).replace(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/gu,"").trim();r.log.push({at:r.now,text});if(r.log.length>24)r.log.shift();},
    canHit(target){
      if(target?.id==="castle"&&(r.structures.find(t=>t.kind==="gate").hp>0||r.ice?.hp>0))return false;
      const e=r.entities.find(e=>e.id===target?.id);
      return !e||e.role!=="attacker"||dist(e,r.guilds.find(g=>g.id===e.guildId).camp)>=65;
    },
    reduce(target,source,amount){
      const p=r.entities.find(p=>p.id===target?.id);
      return source?.id!=="boss"&&p?.classId==="druid"&&p.carrying&&p.form==="bear"?amount*.8:amount;
    },
    hurt(target){const p=r.entities.find(p=>p.id===target.id);if(p){p.lastHurtAt=r.now;p.channel=null;}},
    objectiveDamage(target,source,amount){
      const ownerId=source?.isPet?source.owner:source?.id;
      const owner=r.entities.find(p=>p.id===ownerId);
      if(!owner||!amount)return;
      const result=out.damageObjective?.(target.id,amount,owner,target.status.shield);
      if(result){target.hp=result.hp;target.alive=result.hp>0;}
    },
    move(e,target,dt,stop,speed){
      const p=r.entities.find(p=>p.id===e.id);
      if(p?.towerId||p?.wall||e.status.rootTimer>0)return;
      if(dist(e,target)>(stop||0))move(r,e,target,dt,speed);
    },
    los(x,y,tx,ty){
      const endpoint=(x,y)=>{const e=r.entities.find(e=>Math.hypot(e.x-x,e.y-y)<3);return {x,y,wall:!!e?.wall,towerId:e?.towerId,classId:e?.classId};};
      const a=endpoint(x,y);
      const obj=[...r.structures,...(r.ice?[{id:"ice",x:600*(r.mapScale||1),y:545*(r.mapScale||1)}]:[])].find(t=>Math.hypot(t.x-tx,t.y-ty)<3);
      const b=objectiveFace(r,obj??endpoint(tx,ty),a);
      return a.towerId&&a.classId==="archer"?true:lineOfSight(r,a,b);
    },
  };
  const context=vm.createContext({window:{},document:{getElementById(){return null;}},performance,console,bridge,
    setTimeout(){},setInterval(){},clearInterval(){}});
  vm.runInContext(collision,context);
   vm.runInContext(PRELUDE+perEntityGuards(objectiveSource)+perEntityGuards(talentSource)+captainSource+focusSource+packSource+BRIDGE,context,{timeout:2000});
  vm.runInContext("const originalAllies=aliveAllies;aliveAllies=(e,self)=>originalAllies(e,self).filter(o=>!o.__objective);",context);
  out={api:context.api,events,setCurrent(e){current=e;},width:map.width,height:map.height};
  runtimes.set(r,out);return out;
}
export function prepareArenaCombat(r) {
  if(!r.combatVersion)return;
  const rt=runtime(r),actors=rt.api.all();
  for(const p of r.entities){
    let e=actors.find(e=>e.id===p.id);
    if(!e){
      const hp=p.hp,maxHp=p.maxHp;
      e=rt.api.spawn(p);
      if(p.arenaCheckpoint){
        e.hp=hp;e.maxHp=maxHp;e.cd={...e.cd,...p.arenaCheckpoint.cd};e.atkTimer=p.arenaCheckpoint.atkTimer||0;
        for(const [key,value] of Object.entries(p.arenaCheckpoint.status||{}))if(typeof value==="number"||typeof value==="boolean")e.status[key]=value;
        Object.assign(e.extra,p.arenaCheckpoint.extra||{});
        e.extra.frozenAttackers=new Set(p.arenaCheckpoint.frozenAttackers||[]);
        e.__restoreTicks=p.arenaCheckpoint.ticks;
      }else{p.maxHp=e.maxHp;p.hp=e.hp;}
    }
    e.x=p.x;e.y=p.y;
    if(p.alive&&!e.alive){
      e=rt.api.revive(e,p);
    }
    e.hp=p.hp;e.maxHp=p.maxHp;e.alive=p.alive;
    e.range=e.__baseRange*(p.towerId?2:1);
    p.arenaBusy=!!e.casting||e.status.stunTimer>0||e.status.fearTimer>0||e.status.disorientTimer>0||e.status.sapTimer>0||e.status.polymorphed||e.status.mcTimer>0;
    p.arenaRooted=e.status.rootTimer>0;
    p.arenaMoveSpeed=rt.api.moveSpeed(e);
    const siege=r.structures.some(t=>t.hp>0&&r.owner!==p.guildId&&dist(p,t)<e.range*1.25&&lineOfSight(r,p,objectiveFace(r,t,p)))||
      r.boss.alive&&r.boss.guildId!==p.guildId&&dist(p,r.boss)<e.range*1.25;
    p.arenaEngaged=p.alive&&!p.channel&&(!p.towerId||r.structures.find(t=>t.id===p.towerId)?.disabledUntil<=r.now)&&
      (!!e.casting||siege||r.entities.some(other=>other.alive&&other.guildId!==p.guildId&&dist(p,other)<Math.max(250,e.range*1.5)));
  }
  const objectives=[...r.structures.map(t=>({...t,guildId:r.owner??"neutral"})),
    ...(r.ice?[{id:"ice",kind:"ice",x:600*(r.mapScale||1),y:545*(r.mapScale||1),...r.ice,guildId:r.owner}]:[]),
    ...(r.boss.alive?[{...r.boss,id:"boss",kind:"boss",guildId:r.boss.guildId??"neutral"}]:[])];
  for(const t of objectives){
    let e=actors.find(e=>e.__objective&&e.id===t.id);
    if(!e)e=rt.api.proxy(t);
    // War structure shielding/multipliers belong to damageStructure, once.
    e.x=t.x;e.y=t.y;e.hp=t.hp;e.maxHp=t.maxHp;e.alive=t.hp>0;e.team=t.guildId;e.status.shield=0;
  }
  const liveIds=new Set(r.entities.map(p=>p.id));
  // Delete actors and their summons when their owner leaves the room.
  for(let i=actors.length-1;i>=0;i--)if(actors[i].__war&&!liveIds.has(actors[i].id)||actors[i].isPet&&!liveIds.has(actors[i].owner))actors.splice(i,1);
  for(let i=actors.length-1;i>=0;i--)if(actors[i].__objective&&!objectives.some(t=>t.id===actors[i].id))actors.splice(i,1);
  for(const e of actors)if(e.__restoreTicks){
    for(const kind of ["dots","hots"])e.status[kind]=(e.__restoreTicks[kind]||[]).map(t=>{
      const source=actors.find(actor=>actor.id===t.sourceId);
      return source?{...t,source}:null;
    }).filter(Boolean);
    delete e.__restoreTicks;
  }
}
export function stepArenaCombat(r,dt,onDeath,damageObjective) {
  if(!r.combatVersion)return;
  const rt=runtime(r),actors=rt.api.all();
  rt.damageObjective=damageObjective;
  for(const p of r.entities){
    let e=rt.api.all().find(e=>e.id===p.id);
    if(p.alive&&e&&!e.alive)e=rt.api.revive(e,p);
    if(e){e.x=p.x;e.y=p.y;e.hp=p.hp;e.alive=p.alive;}
  }
  const map=layout(r);
  const siege=r.siege;
  rt.api.step(dt,map.width,map.height,obstacles(r),new Set(r.entities.filter(p=>p.arenaEngaged&&!p.retreat).map(p=>p.id)));
  for(const p of r.entities){
    const e=rt.api.all().find(e=>e.id===p.id);if(!e)continue;
    if(siege!==r.siege){e.x=p.x;e.y=p.y;e.hp=p.hp;e.alive=p.alive;}
    else{p.x=e.x;p.y=e.y;p.hp=Math.max(0,e.hp);p.maxHp=e.maxHp;}
    if(p.alive&&!e.alive){
      const hit=[...rt.events].reverse().find(v=>v.targetId===p.id&&v.kind==="damage");
      const source=r.entities.find(v=>v.id===(hit?.ownerId??hit?.sourceId));
      onDeath(p,source?{...source,guildId:hit.sourceGuildId||source.guildId}:undefined);
    }
    p.combat={casting:e.casting?(rt.events.filter(v=>v.sourceId===p.id&&v.kind==="cast").at(-1)?.label||"Casting"):null,shield:(e.status.shield||0)+(e.status.bubbleShield||0),
      cc:[...["stun","root","fear","silence","slow","disorient"].filter(k=>e.status[`${k}Timer`]>0),
        ...(e.status.stunTimer>0&&e.status.stunKind==="freeze"?["freeze"]:[]),...(e.status.polymorphed?["polymorph"]:[]),...(e.status.mcTimer>0?["mindcontrol"]:[])],
      form:e.extra.form||"",attackAt:rt.events.filter(v=>v.sourceId===p.id&&v.kind==="damage").at(-1)?.at||0,targetId:e.lastTarget?.id??null};
    // JSON-safe cooldown checkpoint. In-flight casts are explicitly interrupted
    // on worker restart; complete cast/pet graph parity is not claimed.
    const primitives=(obj)=>Object.fromEntries(Object.entries(obj).filter(([,v])=>typeof v==="number"||typeof v==="boolean"||typeof v==="string"));
    p.arenaCheckpoint={cd:{...e.cd},atkTimer:e.atkTimer,status:primitives(e.status),extra:primitives(e.extra),
      frozenAttackers:[...(e.extra.frozenAttackers||[])],
      ticks:Object.fromEntries(["dots","hots"].map(kind=>[kind,(e.status[kind]||[]).map(t=>({...primitives(t),sourceId:t.source?.id}))]))};
  }
  r.summons=rt.api.all().filter(e=>e.isPet&&e.alive).map(e=>({id:String(e.id),ownerId:e.owner,
    guildId:r.entities.find(p=>p.id===e.owner)?.guildId??e.team,classId:e.classId,x:e.x,y:e.y,hp:e.hp,maxHp:e.maxHp,alive:e.alive}));
  r.events=rt.events.filter(v=>r.now-v.at<1800);
}
export function arenaBossDamage(r,target,amount,source){
  if(!r.combatVersion)return null;
  const rt=runtime(r);
  const result=rt.api.hurt(target.id,amount,{id:"boss",...source});
  r.events=rt.events.filter(v=>r.now-v.at<1800);
  return result;
}
