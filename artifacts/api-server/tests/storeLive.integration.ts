import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as orm from "drizzle-orm";
import * as database from "@workspace/db";
import * as contracts from "@workspace/api-zod";
import * as rules from "../src/lib/storeRules";
import * as stripeRules from "../src/lib/storeStripeRules";
import { boundedGoldCredit, lockEconomyAccounts } from "../src/lib/economy";

export async function verifyLive(load: (path: string, dependencies: Record<string, unknown>, clock: { now: number }) => any) {
  assert.equal(process.env.NODE_ENV, "development");
  assert.equal(process.env.STORE_DB_TESTS, "1");
  const { db, pool, arenaProfilesTable: profiles, arenaChallengesTable: matches,
    economyWalletsTable: wallets, economyUnlocksTable: unlocks,
    storeLivePurchasesTable: purchases, storeLiveClaimsTable: claims,
    storeTestPurchasesTable: previews, storeStripeOrdersTable: orders } = database;
  const { eq, inArray, or } = orm;
  const owner = `store-live-regression-${randomUUID()}`, opponent = `store-live-regression-${randomUUID()}`;
  const ids = [owner, opponent], clock = { now: Date.UTC(2026, 9, 5, 12) };
  const rollback = new Error("Intentional fixture rollback");
  let finished = false;
  try {
    try {
      await db.transaction(async tx => {
        const routeDb = { select: tx.select.bind(tx), insert: tx.insert.bind(tx),
          update: tx.update.bind(tx), execute: async () => ({ rows: [{ id: "price_fixture" }] }),
          transaction: async (fn: (reader: typeof tx) => unknown) => fn(tx) };
        const dependencies: Record<string, unknown> = {
          "@workspace/db": { ...database, db: routeDb }, "drizzle-orm": orm,
          "@workspace/api-zod": contracts, "./storeRules": rules,
          "./storeStripeRules": stripeRules, "./storeStripeState": { storeStripeState: { ready: true } },
          "./economy": { lockEconomyAccounts, boundedGoldCredit },
          "node:crypto": { randomUUID },
        };
        const state = load("src/lib/storePreview.ts", dependencies, clock);
        dependencies["./storePreview"] = state;
        let session: any;
        dependencies["./stripeClient"] = { getUncachableStripeClient: async () => ({
          checkout: { sessions: { retrieve: async () => session,
            create: async (params: any) => {
              assert.equal(params.managed_payments.enabled, false);
              assert.deepEqual(Array.from(params.allowed_payment_method_types), ["card"]);
              assert.equal(params.metadata.arena_test, "false");
              assert.equal(params.line_items[0].quantity, 1);
              return { id: "cs_live_creation_fixture", livemode: true, url: "https://checkout.stripe.com/c/pay/fixture" };
            },
          } },
        }) };
        const checkout = load("src/lib/storeStripeCheckout.ts", dependencies, clock);
        const rewards = load("src/lib/storeLiveRewards.ts", dependencies, clock);
        await tx.insert(profiles).values(ids.map(id => ({ id, name: "Live logic regression fixture", isBot: false })));
        await tx.insert(wallets).values({ playerId: owner, gold: 321 });
        const week = rules.storeWeekAt(clock.now);
        await tx.insert(previews).values({ playerId: owner, offerId: week.offerId, passId: week.id,
          purchasedAt: new Date(clock.now - 60_000) });
        const initial = await state.buildStorePreview(tx, owner, clock.now);
        assert.equal(initial.checkoutMode, "live");
        assert.equal(initial.pass.purchasedAt, null, "sandbox receipt never activates a real pass");
        assert.deepEqual(Array.from(initial.previewBadges), []);
        assert.equal((await rewards.claimLiveStoreReward(owner, week.id, "gold-5")).status, 409);
        await checkout.createStripeStoreCheckout(owner, week.offerId);
        await tx.update(orders).set({ status: "expired" }).where(eq(orders.sessionId, "cs_live_creation_fixture"));
        async function paidOrder(offerId: string, passId: string | null = null, liveMode = true) {
          const id = randomUUID(), sessionId = `cs_${liveMode ? "live" : "test"}_${randomUUID().replaceAll("-", "")}`;
          const [order] = await tx.insert(orders).values({ id, playerId: owner, offerId, passId, liveMode,
            expectedAmount: 799, priceId: "price_fixture", sessionId,
            expiresAt: new Date(clock.now + 3_600_000) }).returning();
          session = { id: sessionId, livemode: liveMode, mode: "payment", status: "complete", payment_status: "paid",
            client_reference_id: owner, amount_total: 799, currency: "usd",
            metadata: { arena_order: id, arena_offer: offerId, arena_test: String(!liveMode) },
            line_items: { data: [{ quantity: 1, price: { id: order.priceId } }] } };
          return order;
        }
        const skin = await paidOrder("skin:wingedPaladin");
        await checkout.verifyStripeStoreOrder(skin);
        await checkout.verifyStripeStoreOrder(skin);
        assert.equal((await tx.select().from(unlocks).where(eq(unlocks.playerId, owner))).length, 1);
        assert.equal((await tx.select().from(purchases).where(eq(purchases.playerId, owner))).length, 1);
        const forged = await paidOrder("skin:emberLord");
        session.amount_total = 1;
        await assert.rejects(checkout.verifyStripeStoreOrder(forged), /does not match/);
        assert.equal((await tx.select().from(purchases).where(eq(purchases.playerId, owner))).length, 1);
        const sandbox = await paidOrder("spell:fixture:ability:priest", null, false);
        await assert.rejects(checkout.verifyStripeStoreOrder(sandbox), /different payment environment/);
        const pass = await paidOrder(week.offerId, week.id);
        await checkout.verifyStripeStoreOrder(pass);
        await checkout.verifyStripeStoreOrder(pass);
        assert.equal((await tx.select().from(purchases).where(eq(purchases.playerId, owner))).length, 2);
        const match = async (resolvedAt: number, defense = false) => {
          await tx.insert(matches).values({ attackerId: defense ? opponent : owner,
            defenderId: defense ? owner : opponent, status: "completed", outcome: defense ? "loss" : "win",
            teamSize: defense ? 2 : 3, resolvedAt: new Date(resolvedAt),
            attack: {}, defense: {} });
        };
        for (let i = 0; i < 5; i++) await match(clock.now - 1);
        assert.equal((await state.buildStorePreview(tx, owner, clock.now)).pass.wins, 0);
        for (let i = 0; i < 35; i++) await match(clock.now + 1, i % 2 === 0);
        clock.now += 1000;
        for (const reward of week.template.rewards) {
          assert.equal((await rewards.claimLiveStoreReward(owner, week.id, reward.id)).pass.rewards
            .find((r: any) => r.id === reward.id).state, "claimed");
          await rewards.claimLiveStoreReward(owner, week.id, reward.id);
        }
        assert.equal((await tx.select().from(wallets).where(eq(wallets.playerId, owner)))[0].gold, 646);
        const owned = await tx.select().from(unlocks).where(eq(unlocks.playerId, owner));
        for (const item of ["rogue:escape", "ability:rogue", "ult:rogue"])
          assert.equal(owned.filter(row => row.itemId === item).length, 1);
        assert.equal((await tx.select().from(claims).where(eq(claims.playerId, owner))).length, 7);
        assert.equal((await tx.select().from(previews).where(eq(previews.playerId, owner))).length, 1);
        clock.now = week.endsAt;
        const next = await state.buildStorePreview(tx, owner, clock.now);
        assert.equal(next.pass.purchasedAt, null);
        assert.equal(next.pass.wins, 0);
        assert.deepEqual(Array.from(next.earnedBadges), ["rogue-week"]);
        assert.equal((await rewards.claimLiveStoreReward(owner, week.id, "gold-5")).status, 410);
        finished = true;
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    assert.equal(finished, true);
    for (const table of [profiles, wallets, unlocks, purchases, claims, previews, orders]) {
      const column = table === profiles ? profiles.id : (table as typeof wallets).playerId;
      assert.equal((await db.select().from(table).where(inArray(column, ids))).length, 0);
    }
    assert.equal((await db.select().from(matches).where(or(inArray(matches.attackerId, ids), inArray(matches.defenderId, ids)))).length, 0);
    console.log("PASS: Live logic, payment matching, duplicate delivery, preview isolation, real items/Gold, post-activation Arena wins and permanent badges. No Stripe calls; every fixture rolled back.");
  } finally { await pool.end(); }
}
