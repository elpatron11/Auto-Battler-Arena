import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { ActGuildFoundationBody, ActGuildFoundationResponse, GetGuildFoundationResponse } from "@workspace/api-zod";
import { actGuild, guildFoundation, GuildError } from "../lib/guildFoundation";
import { removeWarPlayer } from "../lib/guildWarRuntime";
import { guildMutationOriginAllowed } from "../lib/guildRequestPolicy";
const router:IRouter = Router();
router.use("/guilds", (req,res,next) => {
  const id=getAuth(req).userId;
  if(!id) {res.status(401).json({error:"Sign in to manage guilds."});return;}
  res.locals.guildPlayerId=id;
  if(!guildMutationOriginAllowed(req)){res.status(403).json({error:"Cross-origin guild actions are not allowed."});return;}
  next();
});
router.get("/guilds",async(_req,res):Promise<void> => {
  res.json(GetGuildFoundationResponse.parse(await guildFoundation(res.locals.guildPlayerId)));
});
router.post("/guilds/action",async(req,res):Promise<void> => {
  const parsed=ActGuildFoundationBody.safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:"Invalid guild action."});return;}
  try{
    const result=await actGuild(res.locals.guildPlayerId,parsed.data);
    if(parsed.data.action==="leave"||parsed.data.action==="kick")
      await removeWarPlayer(parsed.data.action==="leave"?res.locals.guildPlayerId:parsed.data.playerId!);
    res.json(ActGuildFoundationResponse.parse(result));
  }
  catch(error){if(error instanceof GuildError){res.status(error.status).json({error:error.message});return;}throw error;}
});
export default router;
