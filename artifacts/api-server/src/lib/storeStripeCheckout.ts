import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, economyUnlocksTable, economyWalletsTable, storeLivePurchasesTable, storeStripeOrdersTable, storeTestPurchasesTable } from "@workspace/db";
import { lockEconomyAccounts } from "./economy";
import { buildStorePreview } from "./storePreview";
import { storeOffersAt, storeWeekAt } from "./storeRules";
import { getUncachableStripeClient } from "./stripeClient";
import { storeCheckoutMode, storeCheckoutOrigin, stripeStoreSku, validStorePayment } from "./storeStripeRules";

export class StoreCheckoutError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
type Order = typeof storeStripeOrdersTable.$inferSelect;

export async function verifyStripeStoreOrder(order: Order) {
  if (storeCheckoutMode(process.env.NODE_ENV) === "off" ||
      order.liveMode !== (storeCheckoutMode(process.env.NODE_ENV) === "live"))
    throw new Error("Order belongs to a different payment environment.");
  if (order.status === "complete") return "complete" as const;
  if (order.status === "expired") return "expired" as const;
  if (!order.sessionId) return "pending" as const;
  const stripe = await getUncachableStripeClient();
  const session = await stripe.checkout.sessions.retrieve(order.sessionId, { expand: ["line_items"] });
  if (session.livemode !== order.liveMode) throw new Error("Wrong payment environment.");
  if (session.status === "expired") {
    await db.update(storeStripeOrdersTable).set({ status: "expired" }).where(and(
      eq(storeStripeOrdersTable.id, order.id), eq(storeStripeOrdersTable.status, "pending")));
    return "expired" as const;
  }
  if (session.payment_status !== "paid") return "pending" as const;
  if (!validStorePayment(session, order)) throw new Error("Stripe payment does not match this order.");
  await db.transaction(async tx => {
    await lockEconomyAccounts(tx, [order.playerId]);
    const [current] = await tx.select().from(storeStripeOrdersTable).where(eq(storeStripeOrdersTable.id, order.id));
    if (!current) throw new Error("Payment order no longer exists.");
    if (current?.status === "complete") return;
    const activatedAt = new Date();
    if (order.liveMode) {
      await tx.insert(storeLivePurchasesTable).values({
        playerId: order.playerId, offerId: order.offerId, passId: order.passId,
        orderId: order.id, purchasedAt: activatedAt,
      }).onConflictDoNothing();
      // Exact immutable item IDs are encoded in the server-created offer ID.
      // Do not consult today's rotation when fulfilling yesterday's paid order.
      const [kind, ...parts] = order.offerId.split(":");
      const itemId = kind === "skin" ? parts.join(":") : parts.slice(1).join(":");
      if (kind === "skin" || kind === "spell" || kind === "ultimate") {
        if (!itemId) throw new Error("Paid order has no item.");
        await tx.insert(economyUnlocksTable).values({ playerId: order.playerId, kind, itemId }).onConflictDoNothing();
      } else if (kind !== "pass" || !order.passId) throw new Error("Invalid paid offer.");
    } else {
      await tx.insert(storeTestPurchasesTable).values({
        playerId: order.playerId, offerId: order.offerId, passId: order.passId, purchasedAt: activatedAt,
      }).onConflictDoNothing();
    }
    await tx.update(storeStripeOrdersTable).set({ status: "complete", fulfilledAt: activatedAt })
      .where(eq(storeStripeOrdersTable.id, order.id));
  });
  return "complete" as const;
}

export async function createStripeStoreCheckout(playerId: string, offerId: string) {
  const offer = storeOffersAt(Date.now()).find(item => item.id === offerId);
  if (!offer) throw new StoreCheckoutError(409, "This offer rotated. Refresh the Store.");
  const mode = storeCheckoutMode(process.env.NODE_ENV);
  if (mode === "off") throw new StoreCheckoutError(403, "Checkout is disabled.");
  const liveMode = mode === "live";
  const origin = storeCheckoutOrigin(process.env.NODE_ENV, process.env.REPLIT_DEV_DOMAIN, process.env.REPLIT_DOMAINS);
  const expiresAt = new Date(Math.min(Date.now() + 60 * 60_000,
    offer.rotatesAt ? Date.parse(offer.rotatesAt) : Infinity));
  if (expiresAt.getTime() - Date.now() < 31 * 60_000)
    throw new StoreCheckoutError(409, "This offer rotates shortly. Wait for the next rotation before checking out.");
  const prices = await db.execute<{ id: string }>(sql`
    SELECT pr.id FROM stripe.products p JOIN stripe.prices pr ON pr.product = p.id
    WHERE p.metadata->>'arena_sku' = ${stripeStoreSku(offer)}
      AND p.metadata->>'arena_store' = 'fantasy-world-arenas'
      AND p.active = true AND pr.active = true AND p.livemode = ${liveMode} AND pr.livemode = ${liveMode}
      AND pr.unit_amount = ${offer.priceCents} AND pr.currency = 'usd' AND pr.type = 'one_time'
    -- Live catalog transfers can produce equivalent prices for the same SKU.
    -- Every candidate still matches the exact mode, amount and currency.
    ORDER BY pr.created ASC NULLS LAST, pr.id ASC
    LIMIT 1
  `);
  if (prices.rows.length !== 1) throw new StoreCheckoutError(503, "Stripe price is not ready for this offer.");
  const order = await db.transaction(async tx => {
    await lockEconomyAccounts(tx, [playerId]);
    if (liveMode) {
      const [wallet] = await tx.select().from(economyWalletsTable).where(eq(economyWalletsTable.playerId, playerId));
      if (!wallet) throw new StoreCheckoutError(409, "Open the Arena and finish account setup before purchasing.");
    }
    const preview = await buildStorePreview(tx, playerId, Date.now());
    const currentOffer = preview.offers.find(item => item.id === offerId);
    if (!currentOffer) throw new StoreCheckoutError(409, "This offer rotated. Refresh the Store.");
    if (currentOffer.owned || currentOffer.testOwned) throw new StoreCheckoutError(409, "This offer is already owned or active.");
    const [pending] = await tx.select().from(storeStripeOrdersTable).where(and(
      eq(storeStripeOrdersTable.playerId, playerId), eq(storeStripeOrdersTable.offerId, offerId),
      eq(storeStripeOrdersTable.liveMode, liveMode),
      eq(storeStripeOrdersTable.status, "pending")));
    if (pending) return pending;
    const [created] = await tx.insert(storeStripeOrdersTable).values({
      id: randomUUID(), playerId, offerId, liveMode, expectedAmount: offer.priceCents, priceId: prices.rows[0].id,
      passId: offer.kind === "battle-pass" ? storeWeekAt(Date.now()).id : null, expiresAt,
    }).returning();
    return created;
  });
  const stripe = await getUncachableStripeClient();
  if (order.sessionId) {
    const status = await verifyStripeStoreOrder(order);
    if (status !== "pending") throw new StoreCheckoutError(409,
      status === "complete" ? "Purchase already activated. Refresh the Store." : "Checkout expired. Try again for a fresh checkout.");
    const existing = await stripe.checkout.sessions.retrieve(order.sessionId);
    if (!existing.url) throw new StoreCheckoutError(409, "Checkout is no longer available. Refresh the Store.");
    return { sessionId: existing.id, url: existing.url };
  }
  if (order.expiresAt.getTime() - Date.now() < 30 * 60_000) {
    await db.update(storeStripeOrdersTable).set({ status: "expired" }).where(eq(storeStripeOrdersTable.id, order.id));
    throw new StoreCheckoutError(409, "Checkout timed out. Try again.");
  }
  const session = await stripe.checkout.sessions.create({
    // Standard Checkout preserves the advertised fixed amount. Accounts may
    // default to Managed Payments, which rejects an explicit card-only list.
    mode: "payment", managed_payments: { enabled: false },
    allowed_payment_method_types: ["card"], client_reference_id: playerId,
    line_items: [{ price: order.priceId, quantity: 1 }], expires_at: Math.floor(order.expiresAt.getTime() / 1000),
    success_url: `${origin}/store?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/store?checkout=canceled`,
    metadata: { arena_order: order.id, arena_offer: offerId, arena_test: String(!liveMode) },
    payment_intent_data: { metadata: { arena_order: order.id, arena_test: String(!liveMode) } },
  }, { idempotencyKey: `arena-${mode}-order:${order.id}` });
  if (session.livemode !== liveMode || !session.url) throw new Error("A valid Stripe checkout was not returned.");
  await db.update(storeStripeOrdersTable).set({ sessionId: session.id }).where(eq(storeStripeOrdersTable.id, order.id));
  return { sessionId: session.id, url: session.url };
}
