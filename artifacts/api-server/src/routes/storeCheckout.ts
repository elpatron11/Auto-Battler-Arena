import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { db, storeStripeOrdersTable } from "@workspace/db";
import { CreateStoreCheckoutBody } from "@workspace/api-zod";
import { storeCheckoutMode } from "../lib/storeStripeRules";
import { storeStripeState } from "../lib/storeStripeState";
import { createStripeStoreCheckout, StoreCheckoutError, verifyStripeStoreOrder } from "../lib/storeStripeCheckout";
import { buildStorePreview } from "../lib/storePreview";
import { logger } from "../lib/logger";

const router = Router();
router.use("/store/checkout", (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (!getAuth(req).userId) { res.status(401).json({ error: "Sign in for Stripe checkout." }); return; }
  if (storeCheckoutMode(process.env.NODE_ENV) === "off") { res.status(403).json({ error: "Checkout is disabled." }); return; }
  if (!storeStripeState.ready) { res.status(503).json({ error: "Stripe checkout is temporarily unavailable." }); return; }
  next();
});
router.post("/store/checkout", async (req, res) => {
  const parsed = CreateStoreCheckoutBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid offer." }); return; }
  try { res.json(await createStripeStoreCheckout(getAuth(req).userId!, parsed.data.offerId)); }
  catch (error) {
    if (!(error instanceof StoreCheckoutError)) {
      const type = (error as { type?: unknown })?.type;
      logger.warn({ errorType: typeof type === "string" && /^[A-Za-z]{1,80}$/.test(type) ? type : "CheckoutError" },
        "Store checkout creation failed");
    }
    res.status(error instanceof StoreCheckoutError ? error.status : 503)
      .json({ error: error instanceof StoreCheckoutError ? error.message : "Stripe checkout could not be created. Try again." });
  }
});
router.get("/store/checkout/:sessionId", async (req, res) => {
  const playerId = getAuth(req).userId!;
  const [order] = await db.select().from(storeStripeOrdersTable).where(and(
    eq(storeStripeOrdersTable.playerId, playerId), eq(storeStripeOrdersTable.sessionId, req.params.sessionId)));
  if (!order) { res.status(404).json({ error: "Checkout was not found for this account." }); return; }
  try {
    const status = await verifyStripeStoreOrder(order);
    res.json({ status, store: await buildStorePreview(db, playerId, Date.now()) });
  } catch { res.status(503).json({ error: "Stripe payment could not be verified yet. Try again." }); }
});
export default router;
