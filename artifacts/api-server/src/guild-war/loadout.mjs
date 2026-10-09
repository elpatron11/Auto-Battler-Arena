// Only server-held profiles and ledger ownership can define a war character.
export function selectGuildWarBuild(state,classId,heroIndex,unlocks){
  const owned=new Set(unlocks.map(u=>`${u.kind}:${u.itemId}`));
  if(!owned.has(`class:${classId}`))throw new Error("Choose a class owned by your account.");
  const active=state?.activeBuild, heroes=Array.isArray(active?.heroes)?active.heroes:[];
  const hero=heroIndex===undefined?heroes.find(h=>h?.classId===classId):heroes[heroIndex];
  if(heroIndex!==undefined&&(!hero||hero.classId!==classId))throw new Error("That equipped character changed. Reload the class picker.");
  const ability=hero?.ability??"default",ultimate=hero?.ultimate??"default";
  if(!["default","custom"].includes(ability)||!["default","custom",...(classId==="frostmage"?["polymorph"]:[])].includes(ultimate))
    throw new Error("The saved character has an unsupported spell selection.");
  if(ability==="custom"&&!owned.has(`spell:ability:${classId}`))throw new Error("The equipped alternate spell is not unlocked.");
  if(ultimate!=="default"&&!owned.has(`ultimate:ult:${classId}`))throw new Error("The equipped ultimate is not unlocked.");
  // The actual Arena classTalents function equips one talent, not every
  // unlocked talent. Preserve that distinction.
  const talents=Array.isArray(hero?.talents)?hero.talents.slice(0,1):[];
  if(talents.some(t=>typeof t!=="string"||!owned.has(`talent:${classId}:${t}`)))
    throw new Error("The equipped talent is not unlocked.");
  const isCaptain=!!hero&&active.captainClass===classId;
  const racial=isCaptain?(active.captainRacial??null):null;
  if(racial&&!owned.has(`racial:${racial}`))throw new Error("The equipped captain racial is not unlocked.");
  const skinId=hero?.skinId??state?.skins?.[classId]??"default";
  if(skinId!=="default"&&!owned.has(`skin:${skinId}`))throw new Error("The equipped skin is not owned.");
  return {ability,ultimate,talents,racial,isCaptain,skinId,heroIndex:hero?heroes.indexOf(hero):null};
}
