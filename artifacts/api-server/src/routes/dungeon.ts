import { getAuth } from "@clerk/express";
import {
  CreateDungeonAttemptBody,
  CreateDungeonAttemptResponse,
  FinishDungeonAttemptBody,
  FinishDungeonAttemptParams,
  FinishDungeonAttemptResponse,
  GetDungeonStatusResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { db, economyWalletsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  createDungeonAttempt,
  finishDungeonAttempt,
  getDungeonStatus,
} from "../lib/hourlyDungeon";

const router: IRouter = Router();

router.get("/dungeon/status", async (req, res): Promise<void> => {
  const playerId = getAuth(req).userId ?? null;
  const status = await getDungeonStatus(playerId);
  res.json(GetDungeonStatusResponse.parse(status));
});

router.post("/dungeon/attempts", async (req, res): Promise<void> => {
  const playerId = getAuth(req).userId;
  if (!playerId) {
    res.status(401).json({ error: "Sign in to start a dungeon attempt." });
    return;
  }

  const parsed = CreateDungeonAttemptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if(![2,3].includes(parsed.data.heroes.length)){
    res.status(400).json({error:"Hourly Dungeon requires exactly 2 or 3 heroes."});return;
  }

  const result = await createDungeonAttempt(playerId, parsed.data.requestId);
  if (result.kind === "completed") {
    res.status(409).json({ error: "The current hourly dungeon is already complete." });
    return;
  }
  if (result.kind === "limit") {
    res.status(429).json({ error: "The hourly dungeon attempt limit has been reached." });
    return;
  }

  const response = CreateDungeonAttemptResponse.parse({
    id: result.attempt.id,
    cycle: result.attempt.cycle,
    encounterId: result.attempt.encounterId,
    startedAt: result.attempt.startedAt.getTime(),
    status: await getDungeonStatus(playerId),
  });
  res.status(result.created ? 201 : 200).json(response);
});

router.post("/dungeon/attempts/:attemptId/finish", async (req, res): Promise<void> => {
  const playerId = getAuth(req).userId;
  if (!playerId) {
    res.status(401).json({ error: "Sign in to finish a dungeon attempt." });
    return;
  }

  const params = FinishDungeonAttemptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = FinishDungeonAttemptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = await finishDungeonAttempt(playerId, params.data.attemptId, parsed.data.outcome);
  if (result.kind === "not_found") {
    res.status(404).json({ error: "Dungeon attempt not found for this account." });
    return;
  }
  if (result.kind === "too_soon") {
    res.status(409).json({ error: "A dungeon win can only be recorded after eight seconds." });
    return;
  }

  const [wallet] = await db.select({gold:economyWalletsTable.gold}).from(economyWalletsTable)
    .where(eq(economyWalletsTable.playerId,playerId));
  res.json(FinishDungeonAttemptResponse.parse({
    status: await getDungeonStatus(playerId),
    awarded: result.awarded,
    gold: result.gold,
    balance: wallet?.gold ?? 0,
  }));
});

export default router;