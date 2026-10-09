type Score={rating:number;wins:number;losses:number};
type Profile={rating:number;wins:number;losses:number;rating2:number;wins2:number;losses2:number;state:Record<string,unknown>};
type Squad=Score & {name:string};
export type SquadRatings=Record<string,Squad>;
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function squadRatings(player:Profile):SquadRatings {
  const ranks:SquadRatings={};
  for(const [key,value] of Object.entries(object(player.state?.squadRatings))){
    const v=object(value);
    if(/^[23]:[a-zA-Z0-9_-]{1,100}$/.test(key)&&Number.isFinite(v.rating)&&Number.isFinite(v.wins)&&Number.isFinite(v.losses))
      ranks[key]={rating:Math.max(100,Number(v.rating)),wins:Math.max(0,Number(v.wins)),losses:Math.max(0,Number(v.losses)),name:String(v.name||'Saved squad').slice(0,50)};
  }
  for(const size of [2,3] as const){
    const key=`${size}:current`;
    if(!Object.keys(ranks).some(id=>id.startsWith(`${size}:`)))
      ranks[key]={rating:(size===2?player.rating2:player.rating)??1000,wins:(size===2?player.wins2:player.wins)??0,
        losses:(size===2?player.losses2:player.losses)??0,name:`Current ${size}v${size} squad`};
    const defense=object(player.state?.[size===2?'defenseTeam2':'defenseTeam']);
    const teams=Array.isArray(player.state?.savedTeams)?player.state.savedTeams.map(object):[];
    const ids=(heroes:unknown)=>Array.isArray(heroes)?heroes.map(hero=>object(hero).classId).sort().join(','):'';
    const matched=teams.find(team=>team.id===defense.squadId)||
      teams.find(team=>Array.isArray(team.heroes)&&team.heroes.length===size&&ids(team.heroes)===ids(defense.heroes));
    if(ranks[key]&&matched&&typeof matched.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(matched.id)&&!ranks[`${size}:${matched.id}`]){
      ranks[`${size}:${matched.id}`]={...ranks[key],name:String(matched.name||'Saved squad')};
      delete ranks[key];
    }
  }
  for(const team of Array.isArray(player.state?.savedTeams)?player.state.savedTeams.map(object):[]){
    const size=Array.isArray(team.heroes)?team.heroes.length:0;
    if((size===2||size===3)&&typeof team.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(team.id)){
      const key=`${size}:${team.id}`;
      if(!ranks[key])ranks[key]={rating:1000,wins:0,losses:0,name:String(team.name||'Saved squad').slice(0,50)};
    }
  }
  return ranks;
}
export function savedSquadId(state:Record<string,unknown>,value:unknown):string|null {
  if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(value))return null;
  return Array.isArray(state.savedTeams)&&state.savedTeams.some(team=>object(team).id===value)?value:null;
}
export function squadScore(player:Profile,size:2|3,snapshot:Record<string,unknown>,ranks=squadRatings(player)): {key:string;score:Squad} {
  const id=typeof snapshot.squadId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(snapshot.squadId)?snapshot.squadId:'current';
  const key=`${size}:${id}`;
  const saved=Array.isArray(player.state?.savedTeams)?player.state.savedTeams.map(object).find(team=>team.id===id):undefined;
  if(!ranks[key]){
    // Transfer the historical current-squad score once, only to its matching
    // saved loadout. Subsequent squads start at 1000, never copied account RP.
    const defense=object(player.state?.[size===2?'defenseTeam2':'defenseTeam']);
    const sameHeroes=(a:unknown,b:unknown)=>Array.isArray(a)&&Array.isArray(b)&&
      JSON.stringify(a.map(hero=>object(hero).classId).sort())===JSON.stringify(b.map(hero=>object(hero).classId).sort());
    const legacy=ranks[`${size}:current`];
    if(saved&&legacy&&!Object.keys(ranks).some(k=>k.startsWith(`${size}:`)&&k!==`${size}:current`)&&sameHeroes(saved.heroes,defense.heroes)){
      ranks[key]={...legacy,name:String(saved.name||'Saved squad')};
      delete ranks[`${size}:current`];
    }else ranks[key]={rating:1000,wins:0,losses:0,name:String(saved?.name||'Saved squad')};
  }
  return {key,score:ranks[key]};
}
export function bestSquad(ranks:SquadRatings,size:2|3):Squad {
  return Object.entries(ranks).filter(([key])=>key.startsWith(`${size}:`)).map(([,score])=>score)
    .sort((a,b)=>b.rating-a.rating||b.wins-a.wins)[0]||{rating:1000,wins:0,losses:0,name:`${size}v${size}`};
}
export function ratingChange(rating:number,opponentRating:number,outcome:'win'|'loss'|'draw'):number {
  const expected=1/(1+10**((opponentRating-rating)/400));
  const raw=Math.round(24*((outcome==='win'?1:outcome==='loss'?0:.5)-expected));
  // Losses no longer approach -24 against much lower-rated opponents.
  return outcome==='loss'?Math.max(-12,raw):raw;
}
export function passiveRatingDelta(challenge:{attackerRatingDelta:number;defense:Record<string,unknown>}):number{
  return typeof challenge.defense?.settledRatingDelta==='number'?challenge.defense.settledRatingDelta:-challenge.attackerRatingDelta;
}