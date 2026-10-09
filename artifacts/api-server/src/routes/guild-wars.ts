import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { JoinGuildWarBody, JoinGuildWarResponse, CommandGuildWarBody, GetGuildWarsLobbyResponse } from "@workspace/api-zod";
import { guildPlayer, GuildError } from "../lib/guildFoundation";
import { guildWarsEnabled, warRequest, openWarStream } from "../lib/guildWarRuntime";
import { db, economyUnlocksTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { guildMutationOriginAllowed } from "../lib/guildRequestPolicy";
import { selectGuildWarBuild } from "../guild-war/loadout.mjs";
import { CLASS_TALENTS, RACIAL_IDS } from "../lib/economy";
const router:IRouter=Router();
router.use("/guild-wars",(req,res,next)=>{
  const id=getAuth(req).userId;
  if(!id){res.status(401).json({error:"Sign in to access Guild Wars."});return;}
  res.locals.warPlayerId=id;
  // New mutable requests must originate in this app; SameSite cookies and
  // Clerk still authenticate the actor. Never accept a caller's player ID.
  if(!guildMutationOriginAllowed(req)){
    res.status(403).json({error:"Cross-origin commands are not allowed."});return;
  }
  next();
});
const handle=(fn:(req:any,res:any)=>Promise<void>)=>async(req:any,res:any)=>{
  try{await fn(req,res);}catch(error){
    if(error instanceof GuildError){if(!res.headersSent)res.status(error.status).json({error:error.message});return;}throw error;
  }
};
router.get("/guild-wars",handle(async(_req,res)=>{
  if(!guildWarsEnabled()){res.json({enabled:false,now:Date.now(),scheduledStart:0,scheduledEnd:0,scheduledOpen:false,activeRoomId:null,rooms:[]});return;}
  res.json(GetGuildWarsLobbyResponse.parse(await warRequest("lobby",{playerId:res.locals.warPlayerId})));
}));
router.use("/guild-wars",(req,res,next)=>{
  if(!guildWarsEnabled()){res.status(403).json({error:"Guild Wars is development-only. No payouts."});return;}next();
});
router.post("/guild-wars/join",handle(async(req,res)=>{
  const body=JoinGuildWarBody.safeParse(req.body);
  if(!body.success){res.status(400).json({error:"Choose a valid event and class."});return;}
  const id=res.locals.warPlayerId,{guild,profile}=await guildPlayer(id);
  const [owned]=await db.select().from(economyUnlocksTable).where(and(eq(economyUnlocksTable.playerId,id),eq(economyUnlocksTable.kind,"class"),eq(economyUnlocksTable.itemId,body.data.classId)));
  if(!owned){res.status(403).json({error:"Choose a class owned by your account."});return;}
  const unlocks=await db.select({kind:economyUnlocksTable.kind,itemId:economyUnlocksTable.itemId})
    .from(economyUnlocksTable).where(eq(economyUnlocksTable.playerId,id));
  let build;
  try{build=selectGuildWarBuild(profile.state,body.data.classId,body.data.heroIndex,unlocks);}
  catch(error){res.status(403).json({error:error instanceof Error?error.message:"Unable to load your character."});return;}
  if(build.talents.some((t:string)=>!CLASS_TALENTS[body.data.classId]?.includes(t))||
    build.racial&&!RACIAL_IDS.includes(build.racial as typeof RACIAL_IDS[number])){
    res.status(400).json({error:"The saved character contains an unknown talent or racial."});return;
  }
  res.json(JoinGuildWarResponse.parse(await warRequest("join",{id,name:profile.name,guildId:guild.id,guildName:guild.name,emblem:guild.emblem,...body.data,build})));
}));
router.post("/guild-wars/rooms/:roomId/command",handle(async(req,res)=>{
  const body=CommandGuildWarBody.safeParse(req.body);
  if(!body.success){res.status(400).json({error:"Invalid objective."});return;}
  const {guild}=await guildPlayer(res.locals.warPlayerId);
  const snap=await warRequest("snapshot",{roomId:req.params.roomId});
  if(!snap.entities.some((e:any)=>e.id===res.locals.warPlayerId&&e.guildId===guild.id)){res.status(403).json({error:"You are not active in this room."});return;}
  res.json(await warRequest("command",{roomId:req.params.roomId,playerId:res.locals.warPlayerId,...body.data}));
}));
router.post("/guild-wars/rooms/:roomId/leave",handle(async(req,res)=>{
  res.json(await warRequest("leave",{roomId:req.params.roomId,playerId:res.locals.warPlayerId}));
}));
router.get("/guild-wars/rooms/:roomId/stream",handle(async(req,res)=>{await openWarStream(String(req.params.roomId),res);}));
export default router;
