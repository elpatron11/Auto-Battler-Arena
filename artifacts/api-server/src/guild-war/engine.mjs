import { CAMPS, RAMPS, dist, lineOfSight, move, point, layout } from "./geometry.mjs";
import { prepareArenaCombat, stepArenaCombat, arenaBossDamage, ARENA_COMBAT_VERSION } from "./arena-combat.mjs";

export const CLASSES={
  warrior:{hp:190,damage:11,range:32,interval:1},
  archer:{hp:100,damage:14,range:165,interval:1},
  rogue:{hp:140,damage:12,range:32,interval:.75},
  frostmage:{hp:100,damage:15,range:150,interval:1.2},
  warlock:{hp:115,damage:16,range:145,interval:1.1},
  druid:{hp:145,damage:8,range:36,interval:1.15},
  paladin:{hp:170,damage:13,range:35,interval:1.1},
  shaman:{hp:140,damage:8,range:120,interval:1.15},
  priest:{hp:85,damage:5,range:140,interval:1.3},
};
export const COMMANDS=["auto","castle","gate","tower","boss","banner","defend","regroup","wall"];
export const EVENT_DURATION=20*60*1000, EVENT_PERIOD=3*60*60*1000;
const COLORS=["#5dbdff","#ed7987","#b3df78","#d3a8ff","#f5bc65"];
const scores={kill:10,tower:30,gate:40,ice:15,capture:100,boss:75,bossObjective:25,defense:25,banner:25};
export function eventAt(now){const start=Math.floor(now/EVENT_PERIOD)*EVENT_PERIOD;return {start,end:start+EVENT_DURATION,open:now<start+EVENT_DURATION,next:start+EVENT_PERIOD};}
export function createRoom(id,eventId,start,options={}){
  const room={id,eventId,startedAt:start,endsAt:start+EVENT_DURATION,now:start,tick:0,finished:false,winners:[],owner:null,contested:false,rewardsEnabled:false,
    guilds:[],entities:[],structures:[
      {id:"gate",kind:"gate",x:600,y:545,hp:300,maxHp:300,shield:0},
      {id:"castle",kind:"castle",x:600,y:330,hp:600,maxHp:600,shield:0},
      {id:"tower-left",kind:"tower",x:475,y:495,hp:100,maxHp:100,shield:0},
      {id:"tower-right",kind:"tower",x:725,y:495,hp:100,maxHp:100,shield:0},
    ].map(s=>({...s,disabledUntil:0,immuneUntil:0,occupant:null})),
    ice:null,boss:{x:980,y:620,hp:600,maxHp:600,guildId:null,alive:true,corpseUntil:0,resurrected:false,pactUntil:0,target:null,contributors:{},nextAttack:0},
     banner:{x:180,y:610,carrier:null,availableAt:0},log:[],siege:0,geometry:0,castleDamage:{},awards:{},killAwardAt:{},holdAt:start,
    lastAttackAt:0,attackPending:false,lastDefenseAt:0,metrics:{tickMs:0,p95Ms:0,maxMs:0,entityCount:0,snapshotBytes:0}};
  if(options.arena){room.combatVersion=ARENA_COMBAT_VERSION;room.mapScale=2;
    for(const e of [...room.structures,room.boss,room.banner]){e.x*=2;e.y*=2;}}
  return room;
}
function log(r,text){r.log.push({at:r.now,text});if(r.log.length>24)r.log.shift();}
function guild(r,id){return r.guilds.find(g=>g.id===id);}
function award(r,id,kind,key){
  const g=guild(r,id);if(!g)return;
  const token=`${id}:${kind}:${key}`;if(r.awards[token])return;
  r.awards[token]=true;g.score+=scores[kind]??0;
}
export function canJoin(r,guildId){return !r.finished&&r.entities.length<25&&r.entities.filter(e=>e.guildId===guildId).length<5&&(r.guilds.some(g=>g.id===guildId)||r.guilds.length<5);}
export function addPlayer(r,p){
  if(r.entities.some(e=>e.id===p.id))return;
  if(!canJoin(r,p.guildId))throw new Error("Room capacity reached.");
  if(!CLASSES[p.classId])throw new Error("Unknown class.");
  let g=guild(r,p.guildId);
  if(!g){g={id:p.guildId,name:p.guildName,emblem:p.emblem,isBot:p.isBot===true,score:0,color:COLORS[r.guilds.length],camp:layout(r).camps[r.guilds.length]};r.guilds.push(g);}
  if(r.guilds.filter(g=>!g.isBot).length>1)r.contested=true;
  const base=CLASSES[p.classId],role=p.guildId===r.owner?"defender":"attacker";
  const index=r.entities.filter(e=>e.guildId===p.guildId).length;
  r.entities.push({id:p.id,name:p.name,guildId:p.guildId,classId:p.classId,isBot:p.isBot===true,
    x:role==="defender"?point(r,570+index*15,410).x:g.camp.x+index*12*(r.mapScale||1),y:role==="defender"?point(r,570,410).y:g.camp.y,
    hp:base.hp,maxHp:base.hp,alive:true,respawnAt:0,role,objective:"auto",form:"normal",channel:null,
    cooldowns:{},towerId:null,carrying:false,wall:false,nextAttack:0,lastHurtAt:0,lastCommandAt:r.now-2000,path:[],pathUntil:0,retreat:false,
    ...(r.combatVersion?{build:p.build??{ability:"default",ultimate:"default",talents:[],racial:null,isCaptain:false,skinId:"default"}}:{})});
  log(r,`${p.name} joined ${g.name}.`);
}
export function removePlayer(r,id){
  const e=r.entities.find(e=>e.id===id);if(!e)return;
  dropBanner(r,e);releaseTower(r,e);r.entities=r.entities.filter(e=>e.id!==id);log(r,`${e.name} left the room.`);
}
export function setCommand(r,id,objective,form){
  const e=r.entities.find(e=>e.id===id);
  if(!e)throw new Error("You are not an active player in this room.");
  if(e.isBot)throw new Error("AI opponents are controlled by the server.");
  applyCommand(r,e,objective,form);
}
export function setBotCommand(r,id,objective,form){
  const e=r.entities.find(e=>e.id===id);
  if(!e?.isBot)throw new Error("Only AI characters accept bot orders.");
  applyCommand(r,e,objective,form);
}
function applyCommand(r,e,objective,form){
  if(r.finished)throw new Error("The event has ended.");
  if(!COMMANDS.includes(objective))throw new Error("Unknown objective.");
  if(r.now-e.lastCommandAt<2000)throw new Error("Commands have a two-second cooldown.");
  if(form&&e.classId!=="druid")throw new Error("Only a Druid can change form.");
  if(form&&!["normal","cheetah","bear"].includes(form))throw new Error("Unknown form.");
  releaseTower(r,e);e.wall=false;e.objective=objective;e.lastCommandAt=r.now;e.pathUntil=0;e.channel=null;
  if(form)e.form=form;
}
function releaseTower(r,e){const t=r.structures.find(s=>s.occupant===e.id);if(t)t.occupant=null;e.towerId=null;}
function dropBanner(r,e){
  if(r.banner.carrier===e.id){r.banner.carrier=null;r.banner.x=e.x;r.banner.y=e.y;r.banner.availableAt=r.now;log(r,"The banner was dropped.");}
  e.carrying=false;
}
function spawn(r,e){
  releaseTower(r,e);e.role=e.guildId===r.owner?"defender":"attacker";e.wall=false;
  const camp=guild(r,e.guildId).camp,index=r.entities.filter(x=>x.guildId===e.guildId).indexOf(e);
  e.x=e.role==="defender"?point(r,565+index*15,410).x:camp.x+index*12*(r.mapScale||1);e.y=e.role==="defender"?point(r,565,410).y:camp.y;
  e.hp=e.maxHp;e.alive=true;e.channel=null;e.pathUntil=0;e.retreat=false;
}
function kill(r,e,source){
  if(!e.alive)return;
  e.hp=0;e.alive=false;e.respawnAt=r.now+10000;e.channel=null;releaseTower(r,e);dropBanner(r,e);
  if(source?.guildId&&source.guildId!==e.guildId){
    // A victim can award a given guild only once per minute, including after
    // reconnect or respawn. Camp victims never give points.
    r.killAwardAt??={};
    const key=`${source.guildId}:${e.id}`;
    if(dist(e,guild(r,e.guildId).camp)>90&&r.now-(r.killAwardAt[key]??0)>=60000){
      r.killAwardAt[key]=r.now;award(r,source.guildId,"kill",`${e.id}:${r.now}`);
    }
  }
  log(r,`${e.name} fell. Respawn in 10 seconds.`);
}
export function damageEntity(r,e,amount,source){
  if(!e.alive)return 0;
  if(e.role==="attacker"&&dist(e,guild(r,e.guildId).camp)<65)return 0;
  const reduction=e.classId==="druid"&&e.carrying&&e.form==="bear"?.8:1;
  if(r.combatVersion){
    const before=e.hp,result=arenaBossDamage(r,e,amount*reduction,source);
    if(result){
      e.hp=Math.max(0,result.hp);e.maxHp=result.maxHp;
      if(e.hp<before){e.lastHurtAt=r.now;e.channel=null;}
      if(!result.alive)kill(r,e,source);
      return Math.max(0,before-e.hp);
    }
    throw new Error("Guild Wars combat actor missing.");
  }
  const dealt=Math.min(e.hp,amount*reduction);e.hp-=dealt;e.lastHurtAt=r.now;e.channel=null;
  if(e.hp<=0)kill(r,e,source);return dealt;
}
function capture(r){
  const entries=Object.entries(r.castleDamage).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  const winner=entries[0]?.[0];if(!winner)return;
  const prior=r.owner;r.owner=winner;r.siege++;r.holdAt=r.now;r.castleDamage={};r.attackPending=false;r.lastAttackAt=0;
  award(r,winner,"capture",r.siege);r.geometry++;r.ice=null;
  for(const s of r.structures){s.hp=s.maxHp;s.shield=0;s.occupant=null;s.disabledUntil=0;s.immuneUntil=0;}
  for(const e of r.entities){
    releaseTower(r,e);e.channel=null;e.wall=false;e.pathUntil=0;
    e.role=e.guildId===winner?"defender":"attacker";
    if(e.alive&&(e.guildId===winner||e.guildId===prior)){
      const camp=guild(r,e.guildId).camp;e.x=e.guildId===winner?point(r,600,410).x:camp.x;e.y=e.guildId===winner?point(r,600,410).y:camp.y;
    }
  }
  log(r,`${guild(r,winner).name} captured the castle. Structures repaired.`);
  const carrier=r.entities.find(e=>e.id===r.banner.carrier&&e.guildId===winner&&e.alive);
  if(carrier)deliverBanner(r,carrier);
}
export function damageStructure(r,s,amount,source){
  if(!s||s.hp<=0||!source?.guildId||source.guildId===r.owner)return;
  // Castle is vulnerable only after both main and ice gate have fallen.
  const gate=r.structures.find(x=>x.kind==="gate");
  if(s.kind==="castle"&&(gate.hp>0||r.ice?.hp>0))return;
  const multiplier=source.classId==="warrior"&&s.kind==="gate"?1.5:1;
  let hit=amount*multiplier;
  if(s.shield>0){const absorbed=Math.min(s.shield,hit);s.shield-=absorbed;hit-=absorbed;}
  const dealt=Math.min(s.hp,hit);s.hp-=dealt;
   if(r.owner&&amount>0){r.lastAttackAt=r.now;r.attackPending=true;}
  if(s.kind==="castle")r.castleDamage[source.guildId]=(r.castleDamage[source.guildId]||0)+dealt;
  if(s.hp<=0){
    releaseOccupant(r,s);r.geometry++;
    if(s.kind==="castle")capture(r);
    else{award(r,source.guildId,s.kind,`${r.siege}:${s.id}`);log(r,`${guild(r,source.guildId).name} destroyed ${s.id}.`);}
    if(source.classId==="boss")award(r,source.guildId,"bossObjective",`${r.siege}:${s.id}`);
  }
}
function releaseOccupant(r,s){const e=r.entities.find(e=>e.id===s.occupant);if(e){e.towerId=null;e.wall=false;e.pathUntil=0;}s.occupant=null;}
export function damageIce(r,amount,source){
  if(!r.ice||source.guildId===r.owner)return;
  r.ice.hp-=amount*(source.classId==="warrior"?1.5:1);
  if(r.owner){r.lastAttackAt=r.now;r.attackPending=true;}
  if(r.ice.hp<=0){r.ice=null;r.geometry++;award(r,source.guildId,"ice",r.siege);if(source.classId==="boss")award(r,source.guildId,"bossObjective",`${r.siege}:ice`);log(r,"The ice gate shattered.");}
}
export function damageBoss(r,amount,source){
  const b=r.boss;if(!b.alive||b.guildId===source.guildId)return;
  const hit=Math.min(b.hp,amount);b.hp-=hit;
  if(!b.guildId)b.contributors[source.guildId]=(b.contributors[source.guildId]||0)+hit;
  if(b.hp<=0){
    if(!b.guildId){
      const owner=Object.entries(b.contributors).sort((a,c)=>c[1]-a[1]||a[0].localeCompare(c[0]))[0]?.[0];
      if(owner){b.guildId=owner;b.hp=b.maxHp;b.contributors={};award(r,owner,"boss","claim");log(r,`${guild(r,owner).name} claimed the siege boss.`);}
    }else{b.alive=false;b.corpseUntil=r.now+15000;log(r,`${guild(r,b.guildId).name}'s boss was killed. Corpse available for 15 seconds.`);}
  }
}
function deliverBanner(r,e){
  award(r,e.guildId,"banner",`${r.banner.availableAt}:${r.tick}`);
  r.banner.carrier=null;r.banner.availableAt=r.now+60000;Object.assign(r.banner,point(r,180,610));e.carrying=false;
  log(r,`${e.name} delivered the banner (+25).`);
}
const ready=(r,e,key)=>(e.cooldowns[key]||0)<=r.now;
function channel(r,e,kind,duration,target,cd){
  if(e.channel||!ready(r,e,kind))return false;
  e.channel={kind,endsAt:r.now+duration,target,startedAt:r.now};
  e.cooldowns[kind]=r.now+cd;return true;
}
function special(r,e){
  const gate=r.structures.find(s=>s.kind==="gate"),castle=r.structures.find(s=>s.kind==="castle"),boss=r.boss;
  if(e.classId==="rogue"&&e.role==="attacker"){
    const t=r.structures.find(s=>s.kind==="tower"&&s.hp>0&&s.occupant&&s.disabledUntil<=r.now&&s.immuneUntil<=r.now&&dist(e,s)<65);
    if(t&&channel(r,e,"sabotage",2000,t.id,30000))return true;
  }
  if(e.classId==="frostmage"&&e.role==="defender"&&gate.hp<=0&&!r.ice&&dist(e,point(r,600,500))<100){
    if(!r.entities.some(x=>x.guildId===e.guildId&&x.channel?.kind==="ice")&&channel(r,e,"ice",2000,"gate",60000))return true;
  }
  if(e.classId==="paladin"&&e.role==="defender"&&gate.hp<=0&&castle.shield<=0&&ready(r,e,"protection")&&dist(e,castle)<150){
    castle.shield=150;castle.shieldUntil=r.now+10000;e.cooldowns.protection=r.now+30000;log(r,"Divine Protection shields the castle.");return false;
  }
  if(e.classId==="warlock"&&boss.alive&&boss.guildId===e.guildId&&dist(e,boss)<100&&ready(r,e,"pact")){
    e.hp*=.75;e.lastHurtAt=r.now;boss.pactUntil=r.now+10000;e.cooldowns.pact=r.now+60000;log(r,`${e.name} invoked Blood Pact.`);return false;
  }
  if(e.classId==="shaman"&&boss.alive&&boss.guildId===e.guildId&&boss.hp<boss.maxHp*.9&&dist(e,boss)<100
    &&!r.entities.some(x=>x.channel?.kind==="bossHeal")){
    if(channel(r,e,"bossHeal",3000,"boss",30000))return true;
  }
  if(e.classId==="priest"&&!boss.alive&&boss.guildId===e.guildId&&!boss.resurrected&&boss.corpseUntil>r.now&&dist(e,boss)<100
    &&!r.entities.some(x=>x.channel?.kind==="rebirth")){
    if(channel(r,e,"rebirth",5000,"boss",60000))return true;
  }
  return false;
}
function finishChannel(r,e){
  const c=e.channel;if(!c)return;
  const b=r.boss,gate=r.structures.find(s=>s.kind==="gate");
  // Revalidate role, ownership, range and corpse at completion. Incoming
  // damage or a changed objective cancels the channel immediately.
  if(c.kind==="sabotage"){
    const t=r.structures.find(s=>s.id===c.target);
    if(e.role==="attacker"&&t?.hp>0&&t.occupant&&t.disabledUntil<=r.now&&t.immuneUntil<=r.now&&dist(e,t)<65){
      t.disabledUntil=r.now+5000;t.immuneUntil=r.now+20000;log(r,"Tower Archer sabotaged for five seconds.");
    }
  }else if(c.kind==="ice"&&e.role==="defender"&&gate.hp<=0&&!r.ice&&dist(e,point(r,600,500))<100){
    r.ice={hp:150,maxHp:150,expiresAt:r.now+12000};r.geometry++;log(r,"An ice gate formed.");
  }else if(c.kind==="bossHeal"&&b.alive&&b.guildId===e.guildId&&dist(e,b)<100){
    b.hp=Math.min(b.maxHp,b.hp+b.maxHp*.2);log(r,"The Shaman healed the owned boss.");
  }else if(c.kind==="rebirth"&&!b.alive&&b.guildId===e.guildId&&b.corpseUntil>r.now&&!b.resurrected&&dist(e,b)<100){
    b.alive=true;b.hp=b.maxHp*.5;b.resurrected=true;b.corpseUntil=0;log(r,"Divine Rebirth restored the boss at half health.");
  }
  e.channel=null;
}
function objective(r,e){
  const gate=r.structures.find(s=>s.kind==="gate"),castle=r.structures.find(s=>s.kind==="castle");
  const enemyTower=r.structures.find(s=>s.kind==="tower"&&s.hp>0);
  if(e.carrying&&e.role==="defender")return {kind:"point",...point(r,600,410)};
  if(e.objective==="auto"){
    if(e.classId==="priest"&&!r.boss.alive&&r.boss.guildId===e.guildId&&!r.boss.resurrected&&r.boss.corpseUntil>r.now)return {kind:"boss",target:r.boss};
    if(e.classId==="shaman"&&r.boss.alive&&r.boss.guildId===e.guildId&&r.boss.hp<r.boss.maxHp*.8)return {kind:"boss",target:r.boss};
    if(e.classId==="warlock"&&r.boss.alive&&r.boss.guildId===e.guildId&&ready(r,e,"pact"))return {kind:"boss",target:r.boss};
  }
  switch(e.objective){
    case "regroup":return {kind:"point",...guild(r,e.guildId).camp};
    case "banner":if(e.classId==="druid"&&!r.banner.carrier&&r.banner.availableAt<=r.now)return {kind:"point",...r.banner};break;
    case "boss":return {kind:"boss",target:r.boss};
    case "tower":if(e.role==="attacker"&&enemyTower)return {kind:"structure",target:enemyTower};break;
    case "wall":case "defend":if(e.role==="defender")return {kind:"point",...point(r,e.classId==="frostmage"||e.classId==="paladin"?600:500,e.classId==="frostmage"||e.classId==="paladin"?480:510)};break;
    case "castle":case "gate":break;
    default:
      if(e.role==="defender")return {kind:"point",...point(r,600,e.classId==="paladin"?420:480)};
      if(e.classId==="druid"&&!r.banner.carrier&&r.banner.availableAt<=r.now)return {kind:"point",...r.banner};
  }
  if(e.role==="defender")return {kind:"point",...point(r,600,480)};
  if(gate.hp>0)return {kind:"structure",target:gate};
  if(r.ice)return {kind:"ice",target:point(r,600,545)};
  if(e.objective==="tower"&&enemyTower)return {kind:"structure",target:enemyTower};
  return {kind:"structure",target:castle};
}
function gateFace(r,e){
  const s=r.mapScale||1,inside=e.x>454*s&&e.x<746*s&&e.y>234*s&&e.y<526*s;
  return point(r,600,inside?520:550);
}
function attackPosition(r,e,t,range){
  if(t.kind==="gate"||t.kind==="ice")return gateFace(r,e).y===point(r,0,520).y
    ?{x:point(r,600,505).x,y:point(r,600,505).y-Math.min(60,range*.35)}
    :{x:point(r,600,565).x,y:point(r,600,565).y+Math.min(60,range*.35)};
  if(t.kind==="castle")return point(r,600,350);
  // Tower is inside the walls: attackers enter through the destroyed gate.
  if(t.kind==="tower")return {x:t.x,y:t.y-20};
  return {x:t.x,y:t.y};
}
function towerAI(r,e,dt){
  if(e.classId!=="archer"||e.role!=="defender"||!["auto","defend","wall","tower"].includes(e.objective))return false;
  let t=r.structures.find(s=>s.occupant===e.id);
  if(!t){t=r.structures.find(s=>s.kind==="tower"&&s.hp>0&&!s.occupant);if(!t)return false;
    if(dist(e,t)>15){move(r,e,t,dt);return true;}t.occupant=e.id;e.towerId=t.id;e.wall=true;e.x=t.x;e.y=t.y;
  }
  if(t.hp<=0){releaseTower(r,e);return false;}
  if(t.disabledUntil>r.now)return true;
  if(r.combatVersion)return true;
  const target=r.entities.filter(x=>x.alive&&x.guildId!==e.guildId&&dist(e,x)<=CLASSES.archer.range*2&&dist(x,guild(r,x.guildId).camp)>65)
    .sort((a,b)=>dist(e,a)-dist(e,b))[0];
  if(target&&e.nextAttack<=r.now){damageEntity(r,target,CLASSES.archer.damage,e);e.nextAttack=r.now+1000;}
  return true; // ONLY occupied tower Archer bypasses wall LOS, at double range.
}
function wallAI(r,e,dt){
  if(e.role!=="defender"||e.objective!=="wall"||CLASSES[e.classId].range<100||e.towerId)return false;
  if(!e.wall){const ramp=layout(r).ramps[0];if(dist(e,ramp)>15&&e.x<point(r,440,0).x){move(r,e,ramp,dt);return true;}
    // Walkway ramp from inside to the exposed front parapet.
    const p=point(r,500,510);if(dist(e,p)>15){move(r,e,p,dt);return true;}e.wall=true;Object.assign(e,point(r,500,520));
  }
  return false;
}
function ai(r,e,dt){
  if(!e.alive){if(r.now>=e.respawnAt)spawn(r,e);return;}
  if(r.combatVersion&&e.arenaBusy){e.channel=null;return;}
  if(e.channel){if(r.now>=e.channel.endsAt)finishChannel(r,e);return;}
  const scale=r.mapScale||1;
  if(r.banner.carrier===e.id&&e.role==="defender"&&e.x>454*scale&&e.x<746*scale&&e.y>234*scale&&e.y<526*scale){deliverBanner(r,e);}
  if(e.classId==="druid"&&!r.banner.carrier&&r.banner.availableAt<=r.now&&dist(e,r.banner)<20){
    r.banner.carrier=e.id;e.carrying=true;log(r,`${e.name} picked up the banner.`);
  }
  const base=CLASSES[e.classId];
  const threats=r.entities.filter(x=>x.alive&&x.guildId!==e.guildId&&dist(e,x)<180&&dist(x,guild(r,x.guildId).camp)>65&&lineOfSight(r,e,x));
  // Survival has priority, with local retreat and recovery; commanded objective
  // is retained. No target pursuit beyond a local 180-unit perception leash.
  if(e.hp/e.maxHp<.22&&threats.length)e.retreat=true;
  if(e.retreat){
     releaseTower(r,e);e.wall=false;
    const safe=e.role==="defender"?point(r,600,280):guild(r,e.guildId).camp;
    move(r,e,safe,dt,85);
    if(!threats.length)e.hp=Math.min(e.maxHp,e.hp+e.maxHp*.035*dt);
    if(e.hp/e.maxHp>=.55)e.retreat=false;return;
  }
  if(towerAI(r,e,dt))return;
  if(special(r,e))return;
  if(wallAI(r,e,dt))return;
  // Normal support heals guild heroes only. Boss healing is exclusively the
  // Shaman channel above; Priest/Druid never heal a boss incidentally.
  if(!r.combatVersion&&["priest","shaman","druid","paladin"].includes(e.classId)&&e.nextAttack<=r.now){
    const ally=r.entities.filter(x=>x.alive&&x.guildId===e.guildId&&x.hp<x.maxHp*.8&&dist(e,x)<140&&lineOfSight(r,e,x))
      .sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
    if(ally){ally.hp=Math.min(ally.maxHp,ally.hp+(e.classId==="priest"?12:7));e.nextAttack=r.now+base.interval*1000;return;}
  }
  if(r.combatVersion&&e.arenaEngaged)return;
  const enemy=!r.combatVersion&&threats.sort((a,b)=>dist(e,a)-dist(e,b))[0];
  if(enemy&&(!e.carrying||dist(e,enemy)<base.range)){
    if(dist(e,enemy)<=base.range&&e.nextAttack<=r.now){damageEntity(r,enemy,base.damage,e);e.nextAttack=r.now+base.interval*1000;
      if(["frostmage","warlock","shaman"].includes(e.classId)&&ready(r,e,"aoe")){
        // Area damage remains radius-based and can cross walls; ordinary
        // targeted attacks still require LOS. No effect spawns extra NPCs.
        for(const other of r.entities)if(other.id!==enemy.id&&other.alive&&other.guildId!==e.guildId&&dist(other,enemy)<45)damageEntity(r,other,base.damage*.5,e);
        e.cooldowns.aoe=r.now+10000;
      }return;}
    if(!e.wall){move(r,e,enemy,dt);return;}
  }
  if(e.wall)return;
  const goal=objective(r,e);
   const speed=(e.arenaMoveSpeed??70)*(e.carrying&&e.classId==="druid"&&e.form==="cheetah"?1.5:1);
  if(goal.kind==="point"){move(r,e,goal,dt,speed);if(!threats.length&&r.now-e.lastHurtAt>6000)e.hp=Math.min(e.maxHp,e.hp+2*dt);return;}
  const target=goal.target;
  if(goal.kind==="boss"&&target.guildId===e.guildId){
    move(r,e,{x:target.x-45,y:target.y+35},dt,speed);return;
  }
  if(!target||target.hp===0||target.alive===false)return;
  const pos=goal.kind==="boss"?target:attackPosition(r,e,goal.kind==="ice"?{...target,kind:"ice"}:target,base.range);
  const attackRange=goal.kind==="boss"?base.range:Math.max(40,base.range);
  // Gate/ice target is the exposed face, not a point behind its collider.
   const losTarget=goal.kind==="ice"||target.kind==="gate"?gateFace(r,e):target;
  if(r.combatVersion){move(r,e,pos,dt,speed);return;}
  if(dist(e,losTarget)<=attackRange&&lineOfSight(r,e,losTarget)&&e.nextAttack<=r.now){
    if(goal.kind==="boss")damageBoss(r,base.damage,e);
    else if(goal.kind==="ice")damageIce(r,base.damage,e);
    else damageStructure(r,target,base.damage,e);
    e.nextAttack=r.now+base.interval*1000;
  }else if(dist(e,losTarget)>attackRange||!lineOfSight(r,e,losTarget))move(r,e,pos,dt,speed);
}
function bossAI(r,dt){
  const b=r.boss;if(!b.alive)return;
  if(!b.guildId){
    const enemy=r.entities.filter(e=>e.alive&&dist(e,b)<125&&dist(e,guild(r,e.guildId).camp)>65).sort((a,c)=>dist(b,a)-dist(b,c))[0];
    if(enemy&&b.nextAttack<=r.now){damageEntity(r,enemy,18,{guildId:null});b.nextAttack=r.now+1500;}
    return;
  }
  if(b.guildId===r.owner){b.target=null;move(r,b,point(r,600,440),dt,42);return;}
  const blocker=r.entities.find(e=>e.alive&&e.guildId!==b.guildId&&dist(e,guild(r,e.guildId).camp)>65&&dist(e,b)<55&&lineOfSight(r,b,e));
  if(blocker){b.target=blocker.id;if(b.nextAttack<=r.now){damageEntity(r,blocker,24,{guildId:b.guildId});b.nextAttack=r.now+1500;}return;}
  const gate=r.structures.find(s=>s.kind==="gate"),tower=r.structures.find(s=>s.kind==="tower"&&s.hp>0);
  const t=gate.hp>0?gate:r.ice?{...point(r,600,545),kind:"ice"}:tower??r.structures.find(s=>s.kind==="castle");
  b.target=t.id??"ice";const source={guildId:b.guildId,classId:"boss"},pos=attackPosition(r,b,t,40);
  const face=t.kind==="gate"||t.kind==="ice"?gateFace(r,b):t;
  if(dist(b,face)<65&&lineOfSight(r,b,face)){
    if(b.nextAttack<=r.now){const amount=30*(b.pactUntil>r.now&&["gate","tower"].includes(t.kind)?1.3:1);
      if(t.kind==="ice")damageIce(r,amount,source);else damageStructure(r,t,amount,source);b.nextAttack=r.now+1500;}
  }else move(r,b,pos,dt,42);
}
export function stepRoom(r,dt=.05){
  if(r.finished)return;
  r.now=Math.min(r.endsAt,r.now+dt*1000);r.tick++;
  if(r.ice&&r.ice.expiresAt<=r.now){r.ice=null;r.geometry++;log(r,"The ice gate expired.");}
  for(const s of r.structures)if(s.shield>0&&s.shieldUntil<=r.now)s.shield=0;
  prepareArenaCombat(r);
  for(const e of r.entities)ai(r,e,dt);
  stepArenaCombat(r,dt,(e,source)=>kill(r,e,source),(id,amount,source)=>{
    if(id==="boss"){damageBoss(r,amount,source);return r.boss;}
    if(id==="ice"){damageIce(r,amount,source);return r.ice??{hp:0};}
    const s=r.structures.find(s=>s.id===id);
    if(s){damageStructure(r,s,amount,source);return s;}
  });
  bossAI(r,dt);
  // Minimal separation, confined to local overlap. Larger load tests measure
  // this pair scan; no physics library or client-only correction is involved.
  const living=r.entities.filter(e=>e.alive&&!e.towerId&&!e.wall);
  for(let i=0;i<living.length;i++)for(let j=i+1;j<living.length;j++){
    const a=living[i],b=living[j],d=dist(a,b);
    if(d<16){const n=d||1,dx=d?(a.x-b.x)/n:1,dy=d?(a.y-b.y)/n:0;
      const p={x:a.x+dx*2,y:a.y+dy*2};if(lineOfSight(r,a,p)){a.x=p.x;a.y=p.y;}
    }
  }
  while(r.owner&&r.now-r.holdAt>=60000){
    const boundary=r.holdAt+60000;guild(r,r.owner).score+=boundary>r.endsAt-180000?50:25;r.holdAt=boundary;
  }
  if(r.owner&&r.attackPending&&r.now-r.lastAttackAt>=15000&&r.now-r.lastDefenseAt>=60000){
    award(r,r.owner,"defense",Math.floor(r.now/60000));r.lastDefenseAt=r.now;r.attackPending=false;log(r,"Successful defense (+25).");
  }
  if(r.now>=r.endsAt){
    r.finished=true;const high=Math.max(0,...r.guilds.map(g=>g.score));r.winners=r.guilds.filter(g=>g.score===high).map(g=>g.id);
    log(r,`Event complete. ${r.contested?"Contested":"Uncontested — reduced-reward classification"}. No economy payout.`);
  }
}
export function snapshot(r){
  // Strip path caches, contribution internals and award ledger from traffic.
  return {
    id:r.id,eventId:r.eventId,startedAt:r.startedAt,endsAt:r.endsAt,now:r.now,tick:r.tick,finished:r.finished,winners:r.winners,owner:r.owner,contested:r.contested,rewardsEnabled:false,
    guilds:r.guilds,entities:r.entities.map(e=>({id:e.id,name:e.name,guildId:e.guildId,classId:e.classId,isBot:e.isBot===true,x:e.x,y:e.y,hp:e.hp,maxHp:e.maxHp,alive:e.alive,respawnAt:e.respawnAt,role:e.role,objective:e.objective,form:e.form,channel:e.channel?{kind:e.channel.kind,endsAt:e.channel.endsAt}:null,cooldowns:e.cooldowns,towerId:e.towerId,carrying:e.carrying,wall:e.wall,...(e.build?{build:e.build,combat:e.combat}:{} )})),
    structures:r.structures,ice:r.ice,boss:{x:r.boss.x,y:r.boss.y,hp:r.boss.hp,maxHp:r.boss.maxHp,guildId:r.boss.guildId,alive:r.boss.alive,corpseUntil:r.boss.corpseUntil,resurrected:r.boss.resurrected,pactUntil:r.boss.pactUntil,target:r.boss.target},
    banner:r.banner,log:r.log,metrics:r.metrics,map:layout(r),events:r.events??[],summons:r.summons??[],combatVersion:r.combatVersion??"prototype",
  };
}
