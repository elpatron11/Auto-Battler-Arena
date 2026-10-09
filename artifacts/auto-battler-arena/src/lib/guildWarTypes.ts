// Presentation-only snapshot contract. No combat calculations run in the client.
export type WarObjective = 'auto'|'castle'|'gate'|'tower'|'boss'|'banner'|'defend'|'regroup'|'wall';
export type WarEntity = {
  id:string; name:string; guildId:string; classId:string; isBot?:boolean; x:number; y:number;
  hp:number; maxHp:number; alive:boolean; respawnAt:number; role:'attacker'|'defender';
  objective:WarObjective; form:'normal'|'cheetah'|'bear'; channel:{kind:string; endsAt:number}|null;
  cooldowns:Record<string,number>; towerId:string|null; carrying:boolean; wall:boolean;
  build?:{ability:string;ultimate:string;talents:string[];racial:string|null;isCaptain:boolean;skinId:string};
  combat?:{casting:string|null;shield:number;cc:string[];form:string;attackAt:number;targetId:string|null};
};
export type WarStructure = {id:string;kind:string;x:number;y:number;hp:number;maxHp:number;shield:number;disabledUntil:number;immuneUntil:number;occupant:string|null};
export type WarSnapshot = {
  id:string; eventId:string; startedAt:number; endsAt:number; now:number; tick:number;
  finished:boolean; winners:string[]; owner:string|null; contested:boolean; rewardsEnabled:false;
  guilds:{id:string;name:string;emblem:string;isBot?:boolean;score:number;color:string;camp:{x:number;y:number}}[];
  entities:WarEntity[]; structures:WarStructure[];
  ice:{hp:number;maxHp:number;expiresAt:number}|null;
  boss:{x:number;y:number;hp:number;maxHp:number;guildId:string|null;alive:boolean;corpseUntil:number;resurrected:boolean;pactUntil:number;target:string|null};
  banner:{x:number;y:number;carrier:string|null;availableAt:number};
  log:{at:number;text:string}[];
  metrics:{tickMs:number;p95Ms:number;maxMs:number;entityCount:number;snapshotBytes:number};
  map?:{width:number;height:number;scale:number;walls:{x:number;y:number;w:number;h:number}[];ramps:{x:number;y:number}[]};
  events?:{id:number;at:number;kind:string;sourceId:string|null;targetId:string|null;x:number;y:number;tx:number;ty:number;amount:number;label:string}[];
  combatVersion?:string;
  summons?:{id:string;ownerId:string;guildId:string;classId:string;x:number;y:number;hp:number;maxHp:number;alive:boolean}[];
};
