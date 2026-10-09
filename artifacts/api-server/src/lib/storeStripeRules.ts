import type Stripe from "stripe";
import type { storeOffersAt } from "./storeRules";

export function stripeStoreSku(offer: ReturnType<typeof storeOffersAt>[number]) {
  return offer.kind === "battle-pass" ? offer.id.split(":").slice(0, 2).join(":") : `${offer.kind}:${offer.itemId}`;
}

/** Pure checks on a session retrieved from Stripe, never on client-supplied payment data. */
export function validStorePayment(session: Stripe.Checkout.Session, order: {
  id: string; playerId: string; offerId: string; priceId: string; expectedAmount: number; sessionId: string | null;
  liveMode?: boolean;
}) {
  const line = session.line_items?.data[0];
  const priceId = typeof line?.price === "string" ? line.price : line?.price?.id;
  return session.livemode === (order.liveMode ?? false) && session.mode === "payment" &&
    session.status === "complete" && session.payment_status === "paid" &&
    session.id === order.sessionId && session.client_reference_id === order.playerId &&
    session.metadata?.arena_order === order.id && session.metadata?.arena_offer === order.offerId &&
    session.metadata?.arena_test === String(!(order.liveMode ?? false)) &&
    session.amount_total === order.expectedAmount && session.currency === "usd" &&
    session.line_items?.data.length === 1 && line?.quantity === 1 && priceId === order.priceId;
}

export function storeCheckoutMode(environment: string | undefined): "test" | "live" | "off" {
  return environment === "development" ? "test" : environment === "production" ? "live" : "off";
}

/** Use only hosting-owned domains, never an incoming Host/Origin header. */
export function storeCheckoutOrigin(environment: string | undefined, devDomain?: string, productionDomains?: string) {
  const mode = storeCheckoutMode(environment);
  const host = mode === "test" ? devDomain : mode === "live" ? productionDomains?.split(",")[0]?.trim() : null;
  if (!host || !/^[a-zA-Z0-9.-]+(?::[0-9]+)?$/.test(host)) throw new Error("Checkout domain is unavailable.");
  return `https://${host}`;
}
