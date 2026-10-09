import { and, asc, eq, gt, or } from "drizzle-orm";
import { db, storeStripeOrdersTable } from "@workspace/db";
import { verifyStripeStoreOrder } from "./storeStripeCheckout";
import { storeStripeState } from "./storeStripeState";
import { storeCheckoutMode } from "./storeStripeRules";
import { logger } from "./logger";

let running = false;
let cursor: { id: string; createdAt: Date } | null = null;
export async function recoverStoreTestCheckouts() {
  const mode = storeCheckoutMode(process.env.NODE_ENV);
  if (running || !storeStripeState.ready || mode === "off") return;
  running = true;
  try {
    const ahead = cursor ? or(gt(storeStripeOrdersTable.createdAt, cursor.createdAt),
      and(eq(storeStripeOrdersTable.createdAt, cursor.createdAt), gt(storeStripeOrdersTable.id, cursor.id))) : undefined;
    let orders = await db.select().from(storeStripeOrdersTable)
      .where(and(eq(storeStripeOrdersTable.status, "pending"), eq(storeStripeOrdersTable.liveMode, mode === "live"), ahead))
      .orderBy(asc(storeStripeOrdersTable.createdAt), asc(storeStripeOrdersTable.id)).limit(20);
    // Fair batches: twenty abandoned open checkouts must not starve a later payer.
    if (!orders.length && cursor) {
      cursor = null;
      orders = await db.select().from(storeStripeOrdersTable)
        .where(and(eq(storeStripeOrdersTable.status, "pending"), eq(storeStripeOrdersTable.liveMode, mode === "live")))
        .orderBy(asc(storeStripeOrdersTable.createdAt), asc(storeStripeOrdersTable.id)).limit(20);
    }
    for (const order of orders) {
      try {
        if (!order.sessionId && order.expiresAt.getTime() < Date.now()) {
          await db.update(storeStripeOrdersTable).set({ status: "expired" }).where(eq(storeStripeOrdersTable.id, order.id));
        } else await verifyStripeStoreOrder(order);
      } catch { logger.warn("A Stripe checkout could not be reconciled; it will retry"); }
      finally { cursor = { id: order.id, createdAt: order.createdAt }; }
    }
  } finally { running = false; }
}

export function startStoreStripeRecovery() {
  const timer = setInterval(() => void recoverStoreTestCheckouts(), 20_000);
  timer.unref();
}
