import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { db, storeTestClaimsTable, storeTestPurchasesTable } from "@workspace/db";
import {
  ClaimStoreTestRewardBody, GetStoreResponse,
} from "@workspace/api-zod";
import { lockEconomyAccounts } from "../lib/economy";
import { buildStorePreview, countStoreArenaWins } from "../lib/storePreview";
import { storeTestFlowsEnabled, storeWeekAt } from "../lib/storeRules";
import checkoutRouter from "./storeCheckout";
import { storeCheckoutMode } from "../lib/storeStripeRules";
import { claimLiveStoreReward } from "../lib/storeLiveRewards";

const router: IRouter = Router();
router.use(checkoutRouter);

router.post("/store/claims", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const playerId = getAuth(req).userId;
  if (!playerId) { res.status(401).json({ error: "Sign in to claim a reward." }); return; }
  if (storeCheckoutMode(process.env.NODE_ENV) !== "live") {
    res.status(403).json({ error: "Real reward claims are available only in production." }); return;
  }
  const parsed = ClaimStoreTestRewardBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid reward." }); return; }
  const result = await claimLiveStoreReward(playerId, parsed.data.passId, parsed.data.rewardId);
  if ("error" in result) { res.status(result.status).json({ error: result.error }); return; }
  res.json(GetStoreResponse.parse(result));
});

router.get("/store", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await buildStorePreview(db, getAuth(req).userId, Date.now()));
});

router.post("/store/test-purchases", async (req, res): Promise<void> => {
  const playerId = getAuth(req).userId;
  if (!playerId) { res.status(401).json({ error: "Sign in to activate a test purchase." }); return; }
  if (!storeTestFlowsEnabled(process.env.NODE_ENV)) {
    res.status(403).json({ error: "Test checkout is disabled in production." }); return;
  }
  // Never restore instant activation when Stripe is unavailable: fail closed.
  res.status(409).json({ error: "Instant preview purchases have been replaced by Stripe test checkout." });
});

router.post("/store/test-claims", async (req, res): Promise<void> => {
  const playerId = getAuth(req).userId;
  if (!playerId) { res.status(401).json({ error: "Sign in to claim a preview reward." }); return; }
  if (!storeTestFlowsEnabled(process.env.NODE_ENV)) {
    res.status(403).json({ error: "Test reward claims are disabled in production." }); return;
  }
  const parsed = ClaimStoreTestRewardBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid preview reward." }); return; }
  const result = await db.transaction(async tx => {
    await lockEconomyAccounts(tx, [playerId]);
    const now = Date.now();
    const week = storeWeekAt(now);
    if (parsed.data.passId !== week.id) return { error: "This weekly pass has ended.", status: 410 } as const;
    const reward = week.template.rewards.find(item => item.id === parsed.data.rewardId);
    if (!reward) return { error: "Unknown reward.", status: 400 } as const;
    const [purchase] = await tx.select().from(storeTestPurchasesTable).where(and(
      eq(storeTestPurchasesTable.playerId, playerId),
      eq(storeTestPurchasesTable.offerId, week.offerId),
      eq(storeTestPurchasesTable.passId, week.id),
    ));
    if (!purchase) return { error: "Activate the paid-track test pass first. There is no free progression.", status: 409 } as const;
    const wins = await countStoreArenaWins(tx, playerId, purchase.purchasedAt, new Date(week.endsAt));
    if (wins < reward.wins) return { error: "Earn the required Arena victories before claiming this reward.", status: 409 } as const;
    await tx.insert(storeTestClaimsTable).values({
      playerId, passId: week.id, rewardId: reward.id, kind: reward.kind, itemId: reward.itemId, gold: reward.gold,
    }).onConflictDoNothing();
    return buildStorePreview(tx, playerId, now);
  });
  if ("error" in result) { res.status(result.status).json({ error: result.error }); return; }
  res.json(GetStoreResponse.parse(result));
});

export default router;
