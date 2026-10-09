import { getStripeSync } from "./stripeClient";
import { db, storeStripeOrdersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyStripeStoreOrder } from "./storeStripeCheckout";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string) {
    if (!Buffer.isBuffer(payload)) throw new Error("Stripe webhook requires an unparsed body.");
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
    // Only inspect the event after signature verification. Re-read the session
    // through Stripe before delivery; never trust event metadata as a receipt.
    // Request-bound delivery also works when an autoscale server was idle.
    const event = JSON.parse(payload.toString("utf8"));
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const sessionId = event.data?.object?.id;
      if (typeof sessionId !== "string") throw new Error("Checkout event has no session.");
      const [order] = await db.select().from(storeStripeOrdersTable).where(eq(storeStripeOrdersTable.sessionId, sessionId));
      if (order) await verifyStripeStoreOrder(order);
    }
  }
}
