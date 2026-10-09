import assert from "node:assert/strict";
import { test } from "node:test";
import { validStorePayment, stripeStoreSku, storeCheckoutMode, storeCheckoutOrigin } from "../src/lib/storeStripeRules.ts";

const order = { id: "order-test", playerId: "test-player", offerId: "pass:rogue-week:2026-10-05",
  priceId: "price_test", expectedAmount: 799, sessionId: "cs_test_fixture" };
const paid = () => ({ id: order.sessionId, livemode: false, mode: "payment", status: "complete",
  payment_status: "paid", client_reference_id: order.playerId, amount_total: 799, currency: "usd",
  metadata: { arena_order: order.id, arena_offer: order.offerId, arena_test: "true" },
  line_items: { data: [{ quantity: 1, price: { id: order.priceId } }] } });
test("only the exact paid test checkout can activate a preview", () => {
  assert.equal(validStorePayment(paid(), order), true);
  for (const patch of [
    { livemode: true }, { status: "open" }, { payment_status: "unpaid" }, { mode: "subscription" },
    { client_reference_id: "another-player" }, { id: "cs_test_other" }, { amount_total: 1 },
    { currency: "eur" }, { metadata: {} }, { line_items: { data: [] } },
    { line_items: { data: [{ quantity: 2, price: { id: order.priceId } }] } },
    { line_items: { data: [{ quantity: 1, price: { id: "price_wrong" } }] } },
  ]) assert.equal(validStorePayment({ ...paid(), ...patch }, order), false, JSON.stringify(patch));
});
test("weekly offers use a stable Stripe SKU, but keep week-specific app receipts", () => {
  assert.equal(stripeStoreSku({ kind: "battle-pass", id: order.offerId }), "pass:rogue-week");
  assert.equal(stripeStoreSku({ kind: "spell", itemId: "ability:priest" }), "spell:ability:priest");
});

test("live payments require a live order and cannot fulfill a preview or accept forged amounts", () => {
  const liveOrder = { ...order, liveMode: true, sessionId: "cs_live_fixture" };
  const liveSession = { ...paid(), id: liveOrder.sessionId, livemode: true,
    metadata: { ...paid().metadata, arena_test: "false" } };
  assert.equal(validStorePayment(liveSession, liveOrder), true);
  assert.equal(validStorePayment(liveSession, order), false);
  assert.equal(validStorePayment(paid(), liveOrder), false);
  for (const patch of [{ livemode: false }, { amount_total: 1 }, { payment_status: "unpaid" },
    { status: "open" }, { client_reference_id: "someone-else" }, { metadata: paid().metadata }])
    assert.equal(validStorePayment({ ...liveSession, ...patch }, liveOrder), false);
});

test("production uses live checkout and a hosting-owned production return URL only", () => {
  assert.equal(storeCheckoutMode("development"), "test");
  assert.equal(storeCheckoutMode("production"), "live");
  for (const env of [undefined, "", "staging", "test"]) assert.equal(storeCheckoutMode(env), "off");
  assert.equal(storeCheckoutOrigin("production", "workspace.replit.dev", "game.example.com,other.example.com"), "https://game.example.com");
  assert.equal(storeCheckoutOrigin("development", "workspace.replit.dev", "game.example.com"), "https://workspace.replit.dev");
  assert.throws(() => storeCheckoutOrigin("production", "workspace.replit.dev"));
  assert.throws(() => storeCheckoutOrigin("production", undefined, "malicious.example/path"));
  assert.throws(() => storeCheckoutOrigin("production", undefined, "x.example@evil.example"));
});
