import { addPlayer, canJoin, removePlayer, setBotCommand } from "./engine.mjs";

// One persistent room-local guild, not a player account or an economy actor.
// Mirror the largest human squad rather than creating five opponents for a solo.
const SUPPORT=["archer","frostmage","druid","shaman","rogue","warlock","paladin","priest"];
const ROSTER=["warrior",...SUPPORT];
const LABELS={warrior:"Warrior",archer:"Archer",frostmage:"Frost Mage",druid:"Druid",shaman:"Shaman",rogue:"Rogue",warlock:"Warlock",paladin:"Paladin",priest:"Priest"};
function roomRoster(room){
  if(room.botRoster)return room.botRoster;
  // Keep old live rooms' opponents intact when upgrading a running preview.
  if(room.guilds.some(g=>g.isBot))return room.botRoster=ROSTER.slice(0,5);
  // A solo player always meets a capable Warrior; larger squads see the other
  // eight existing classes over successive rooms, at most five unique bots.
  const last=room.id.match(/[0-9a-f]$/i)?.[0]??"0";
  const offset=parseInt(last,16)%SUPPORT.length;
  return room.botRoster=["warrior",...SUPPORT.slice(offset),...SUPPORT.slice(0,offset)];
}
export function canHumanJoin(room,guildId){
  const humans=room.guilds.filter(g=>!g.isBot);
  if(room.guilds.some(g=>g.id===guildId&&g.isBot))return false;
  // Always reserve one of the five guild slots for the AI opponent.
  if(humans.length>=4&&!humans.some(g=>g.id===guildId))return false;
  if(humans.length>4)return false; // Legacy full rooms cannot safely add a bot.
  return canJoin(room,guildId)&&room.entities.filter(e=>!e.isBot).length<20;
}
export function ensureBotGuild(room){
  if(room.finished)return null;
  const humans=room.entities.filter(e=>!e.isBot);
  let bot=room.guilds.find(g=>g.isBot);
  if(!bot&&!humans.length)return null;
  if(!bot&&room.guilds.length>=5)throw new Error("This legacy room has no AI slot. Join a new room.");
  const largest=Math.max(1,...room.guilds.filter(g=>!g.isBot).map(g=>humans.filter(e=>e.guildId===g.id).length));
  const count=Math.min(5,largest,25-humans.length);
  if(count<1)throw new Error("This room has no character slot for its AI opponent.");
  const guildId=bot?.id??`bot-guild:${room.id}`;
  const desired=roomRoster(room).slice(0,count),reserves=room.botReserves??={};
  for(const e of [...room.entities]){
    if(e.isBot&&e.guildId===guildId&&!desired.includes(e.classId)){
      // Preserve deaths, HP and cooldowns through resize so joining/leaving
      // cannot reset an opponent's ten-second respawn or farm fresh victims.
      reserves[e.id]={hp:e.hp,alive:e.alive,respawnAt:e.respawnAt,cooldowns:e.cooldowns,nextAttack:e.nextAttack,lastHurtAt:e.lastHurtAt};
      removePlayer(room,e.id);
    }
  }
  for(const classId of desired){
    const id=`${guildId}:${classId}`;
    if(room.entities.some(e=>e.id===id))continue;
    addPlayer(room,{id,name:`AI ${LABELS[classId]}`,classId,guildId,guildName:"Iron Wardens",emblem:"sword",isBot:true});
    const e=room.entities.find(e=>e.id===id);
    if(reserves[id]){Object.assign(e,reserves[id]);delete reserves[id];}
  }
  bot=room.guilds.find(g=>g.id===guildId);
  return bot;
}
export function planBotGuild(room){
  if(room.finished||room.now<(room.nextBotPlanAt??0))return;
  room.nextBotPlanAt=room.now+1000; // One cheap tactical pass per second.
  const bots=room.entities.filter(e=>e.isBot),humans=room.entities.filter(e=>!e.isBot);
  if(!bots.length)return;
  const guildId=bots[0].guildId,boss=room.boss;
  // A mirrored solo melee duel can otherwise retreat/heal indefinitely at the
  // gate. Switch to a boss expedition after 45s without any scoring progress,
  // then return to siege once the claim/death resolves. No combat cheats.
  if(bots.length<=2&&humans.length&&room.now-room.startedAt>=45000&&
    room.guilds.find(g=>g.id===guildId)?.score===0&&boss.alive&&boss.guildId!==guildId)room.botRaid=true;
  if(!boss.alive||boss.guildId===guildId)room.botRaid=false;
  const contestBoss=humans.length&&(bots.length>=3||room.botRaid)&&boss.alive&&boss.guildId!==guildId;
  for(const e of bots){
    if(!e.alive||e.channel||e.retreat)continue;
    let objective="auto",form=e.form;
    if(!humans.length)objective="regroup";
    else if(contestBoss&&["warrior","frostmage"].includes(e.classId))objective="boss";
    else if(e.classId==="shaman"&&boss.guildId===guildId&&(boss.alive&&boss.hp<boss.maxHp*.9))objective="boss";
    else if(e.classId==="druid"){
      if(room.banner.carrier===e.id)form=e.hp<e.maxHp*.4?"bear":"cheetah";
      else if(!room.banner.carrier&&room.banner.availableAt<=room.now)objective="banner";
    }
    // All movement, LOS, damage, specials, survival, roles and respawn stay in
    // the exact shared engine used by human-controlled objective characters.
    if((objective!==e.objective||form!==e.form)&&room.now-e.lastCommandAt>=2000)setBotCommand(room,e.id,objective,e.classId==="druid"?form:undefined);
  }
}
