import { runMigrations } from "stripe-replit-sync";
import { getStripeSync, getUncachableStripeClient } from "./stripeClient";
import { storeStripeState } from "./storeStripeState";
import { storeCheckoutMode, storeCheckoutOrigin } from "./storeStripeRules";
import { logger } from "./logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { storeOffersAt } from "./storeRules";
import { stripeStoreSku } from "./storeStripeRules";

export async function initializeStoreStripe() {
  const mode = storeCheckoutMode(process.env.NODE_ENV);
  storeStripeState.ready = false;
  if (mode === "off") return;
  let stage = "connection";
  try {
    const stripe = await getUncachableStripeClient();
    if ((await stripe.balance.retrieve()).livemode !== (mode === "live")) throw new Error("Wrong Stripe mode.");
    if (mode === "live") {
      const account = await stripe.accounts.retrieve(null);
      if (!account.charges_enabled) throw new Error("The connected Stripe account cannot accept payments.");
    }
    stage = "migrations";
    await runMigrations({ databaseUrl: process.env.DATABASE_URL! });
    const sync = await getStripeSync();
    const origin = storeCheckoutOrigin(process.env.NODE_ENV, process.env.REPLIT_DEV_DOMAIN, process.env.REPLIT_DOMAINS);
    stage = "webhook";
    await sync.findOrCreateManagedWebhook(`${origin}/api/stripe/webhook`);
    stage = "backfill";
    await sync.syncBackfill({ object: "all" });
    stage = "catalog";
    for (const offer of storeOffersAt(Date.now())) {
      const prices = await db.execute<{ id: string }>(sql`
        SELECT pr.id FROM stripe.products p JOIN stripe.prices pr ON pr.product = p.id
        WHERE p.metadata->>'arena_store' = 'fantasy-world-arenas'
          AND p.metadata->>'arena_sku' = ${stripeStoreSku(offer)}
          AND p.active = true AND pr.active = true
          AND p.livemode = ${mode === "live"} AND pr.livemode = ${mode === "live"}
          AND pr.unit_amount = ${offer.priceCents} AND pr.currency = 'usd' AND pr.type = 'one_time'
        ORDER BY pr.created ASC NULLS LAST, pr.id ASC
        LIMIT 1
      `);
      if (prices.rows.length !== 1) throw new Error("Catalog prices are not ready.");
    }
    storeStripeState.ready = true;
    logger.info({ mode }, "Stripe Store checkout ready");
  } catch {
    storeStripeState.ready = false;
    logger.error({ stage, mode }, "Stripe checkout initialization failed; Store browsing remains available");
  }
}
