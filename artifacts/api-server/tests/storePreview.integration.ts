import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as orm from "drizzle-orm";
import * as database from "@workspace/db";
import * as contracts from "@workspace/api-zod";
import * as preview from "../src/lib/storePreview";
import * as rules from "../src/lib/storeRules";
import { lockEconomyAccounts } from "../src/lib/economy";
import * as stripeRules from "../src/lib/storeStripeRules";

type Response = { statusCode: number; headers: Record<string, string>; body: any };
type Request = (method: string, path: string, body?: unknown, userId?: string | null) => Promise<Response>;
type Harness = (imports: Record<string, unknown>, clock: { now: number }, environment?: string) => Request;

export async function verify(routeHarness: Harness) {
  assert.equal(process.env.NODE_ENV, "development");
  assert.equal(process.env.STORE_DB_TESTS, "1");
  const {
    db, pool, arenaProfilesTable: profiles, arenaChallengesTable: matches,
    economyWalletsTable: wallets, economyUnlocksTable: unlocks,
    storeTestPurchasesTable: purchases, storeTestClaimsTable: claims,
    economyDuplicatesTable: duplicates, economyListingsTable: listings,
    economyTournamentRunsTable: tournaments, economyLocalMatchesTable: localMatches,
  } = database;
  const { eq, or, inArray } = orm;
  const owner = `store-regression-${randomUUID()}`;
  const opponent = `store-regression-${randomUUID()}`;
  const bot = `store-regression-${randomUUID()}`;
  const ids = [owner, opponent, bot];
  const rollback = new Error("Intentional fixture rollback");
  const clock = { now: Date.UTC(2026, 9, 5, 12) };
  let finished = false;
  try {
    try {
      await db.transaction(async tx => {
        // Real SQL, constraints and advisory locks, all on one rollback-only
        // transaction. This suite tests retries, not multi-connection contention.
        const routeDb = {
          select: tx.select.bind(tx),
          transaction: async (fn: (reader: typeof tx) => unknown) => fn(tx),
        };
        const imports = {
          "@workspace/db": { ...database, db: routeDb },
          "drizzle-orm": orm, "@workspace/api-zod": contracts,
          "../lib/economy": { lockEconomyAccounts },
          "../lib/storePreview": preview, "../lib/storeRules": rules,
          "./storeCheckout": {}, "../lib/storeStripeRules": stripeRules,
          "../lib/storeLiveRewards": { claimLiveStoreReward: () => { throw new Error("No live grants in preview regression."); } },
        };
        const request = routeHarness(imports, clock);
        const get = async (userId: string | null = owner) => {
          const response = await request("GET", "/store", {}, userId);
          assert.equal(response.statusCode, 200);
          assert.equal(response.headers["Cache-Control"], "private, no-store");
          return contracts.GetStoreResponse.parse(response.body);
        };
        const buy = async (offerId: string, status = 200, userId: string | null = owner) => {
          const body = contracts.PurchaseStoreTestOfferBody.parse({ offerId });
          const response = await request("POST", "/store/test-purchases", body, userId);
          if (status === 200) {
            // Seed a previously verified sandbox receipt inside this rolled-back
            // fixture; the retired instant-purchase endpoint must never grant it.
            assert.equal(response.statusCode, 409);
            const offer = rules.storeOffersAt(clock.now).find(item => item.id === offerId);
            assert.ok(offer, "fixture activation must use a current server offer");
            await tx.insert(purchases).values({ playerId: userId!, offerId,
              passId: offer.kind === "battle-pass" ? rules.storeWeekAt(clock.now).id : null,
              purchasedAt: new Date(clock.now),
            }).onConflictDoNothing();
            return get(userId);
          }
          assert.equal(response.statusCode, status, JSON.stringify(response.body));
          return status === 200 ? contracts.GetStoreResponse.parse(response.body) : null;
        };
        const claim = async (passId: string, rewardId: string, status = 200, userId: string | null = owner) => {
          const body = contracts.ClaimStoreTestRewardBody.parse({ passId, rewardId });
          const response = await request("POST", "/store/test-claims", body, userId);
          assert.equal(response.statusCode, status, JSON.stringify(response.body));
          return status === 200 ? contracts.GetStoreResponse.parse(response.body) : null;
        };
        const receipts = () => tx.select().from(purchases).where(eq(purchases.playerId, owner));
        const claimed = () => tx.select().from(claims).where(eq(claims.playerId, owner));
        const realEconomy = async () => ({
          wallets: await tx.select().from(wallets).where(inArray(wallets.playerId, ids)),
          unlocks: await tx.select().from(unlocks).where(inArray(unlocks.playerId, ids)),
          duplicates: await tx.select().from(duplicates).where(inArray(duplicates.playerId, ids)),
          listings: await tx.select().from(listings).where(inArray(listings.sellerId, ids)),
        });
        await tx.insert(profiles).values(ids.map(id => ({
          id, name: "Store regression fixture", isBot: id === bot,
          wins: 500, wins2: 500,
          state: { localWins: 500, tournamentHistory: [{ winner: owner }] },
        })));
        await tx.insert(wallets).values({ playerId: owner, gold: 321 });
        await tx.insert(unlocks).values({ playerId: owner, kind: "class", itemId: "rogue" });
        await tx.insert(duplicates).values({ playerId: owner, kind: "spell", itemId: "ability:priest", quantity: 2 });
        await tx.insert(listings).values({ sellerId: owner, kind: "spell", itemId: "ability:priest", price: 99 });
        const baseline = await realEconomy();
        const week = rules.storeWeekAt(clock.now);
        const addMatch = async (overrides: Partial<typeof matches.$inferInsert> = {}) => {
          await tx.insert(matches).values({
            id: randomUUID(), attackerId: owner, defenderId: opponent,
            attack: {}, defense: {}, teamSize: 3, status: "completed", outcome: "win",
            createdAt: new Date(clock.now - 1000), resolvedAt: new Date(clock.now),
            ...overrides,
          });
        };
        // Actual local/tournament ledgers are also irrelevant to pass progress.
        await tx.insert(localMatches).values({
          id: randomUUID(), playerId: owner, outcome: "win", gold: 0,
          completedAt: new Date(clock.now),
        });
        await tx.insert(tournaments).values({
          playerId: owner, requestId: randomUUID(), attack: {}, placement: "champion",
          state: "finished", history: [], prize: 100,
        });
        await addMatch({ resolvedAt: new Date(clock.now - 1) });
        const guest = await get(null);
        assert.equal(guest.signedIn, false);
        assert.equal(guest.pass.wins, 0);
        assert.deepEqual(guest.previewBadges, []);
        await buy(week.offerId, 401, null);
        await claim(week.id, "gold-5", 401, null);
        assert.equal((await request("POST", "/store/test-purchases", {}, owner)).statusCode, 409);
        assert.equal((await request("POST", "/store/test-claims", {}, owner)).statusCode, 400);
        await buy("offer-that-does-not-exist", 409);
        await claim(week.id, "unknown", 400);
        await claim(week.id, "gold-5", 409);
        assert.equal((await receipts()).length, 0, "browsing/cancel/no mutation leaves no activation");
        assert.ok((await get()).pass.rewards.every(reward => reward.state === "locked"));

        // Both mutations fail closed, even with valid signed-in requests.
        for (const environment of ["production", "staging", "test", undefined]) {
          const disabled = routeHarness(imports, clock, environment === undefined ? "" : environment);
          assert.equal((await disabled("POST", "/store/test-purchases", { offerId: week.offerId }, owner)).statusCode, 403);
          assert.equal((await disabled("POST", "/store/test-claims", { passId: week.id, rewardId: "gold-5" }, owner)).statusCode, 403);
        }
        assert.equal((await receipts()).length, 0);
        const activation = (await buy(week.offerId))!;
        const purchasedAt = activation.pass.purchasedAt!;
        assert.equal(purchasedAt, new Date(clock.now).toISOString());
        assert.equal(activation.pass.wins, 0, "no historical/profile/local/tournament backfill");
        clock.now += 60_000;
        const retry = (await buy(week.offerId))!;
        assert.equal(retry.pass.purchasedAt, purchasedAt, "retry must not move the win-count start");
        assert.equal((await receipts()).length, 1);
        await claim(week.id, "gold-5", 409);
        await claim(week.id, "gold-5", 409, opponent);
        assert.equal((await get(opponent)).pass.purchasedAt, null);

        // Attack/defense in both modes; start is inclusive.
        const start = Date.parse(purchasedAt);
        for (const teamSize of [2, 3]) {
          await addMatch({ teamSize, resolvedAt: new Date(start) });
          await addMatch({ teamSize, attackerId: opponent, defenderId: owner, outcome: "loss" });
        }
        assert.equal((await get()).pass.wins, 4);
        const excluded: Array<Partial<typeof matches.$inferInsert>> = [
          { defenderId: bot }, { attackerId: bot, defenderId: owner, outcome: "loss" },
          { resolvedAt: new Date(start - 1) },
          { resolvedAt: new Date(week.endsAt) },
          { resolvedAt: new Date(week.endsAt + 1) },
          { outcome: "loss" }, { attackerId: opponent, defenderId: owner, outcome: "win" },
          { status: "pending" }, { status: "cancelled" }, { resolvedAt: null },
          { teamSize: 1 }, { teamSize: 4 }, { attackerId: opponent, defenderId: bot },
        ];
        for (const match of excluded) await addMatch(match);
        assert.equal((await get()).pass.wins, 4, "excluded rows must not inflate progress");
        await claim(week.id, "gold-5", 409);
        await addMatch();
        assert.equal((await get()).pass.rewards.find(reward => reward.id === "gold-5")!.state, "available");
        const firstClaim = (await claim(week.id, "gold-5"))!;
        assert.equal(firstClaim.pass.claimedGold, 75);
        const firstClaimRows = await claimed();
        assert.equal((await claim(week.id, "gold-5"))!.pass.claimedGold, 75);
        assert.deepEqual(await claimed(), firstClaimRows, "duplicate claim preserves the sole original receipt");
        for (let wins = 6; wins <= 35; wins++) {
          await addMatch({ teamSize: wins % 2 ? 2 : 3 });
          const current = await get();
          assert.equal(current.pass.wins, wins);
          for (const reward of current.pass.rewards) {
            if (reward.wins === wins) {
              assert.equal(reward.state, "available", `exact milestone ${reward.id}`);
              await claim(week.id, reward.id);
              await claim(week.id, reward.id);
            } else if (reward.wins > wins) {
              assert.equal(reward.state, "locked", `future milestone ${reward.id}`);
            }
          }
        }
        const completed = await get();
        assert.equal(completed.pass.claimedGold, 325);
        assert.ok(completed.pass.rewards.every(reward => reward.state === "claimed"));
        assert.deepEqual(completed.previewBadges, ["rogue-week"]);
        assert.equal((await claimed()).length, week.template.rewards.length);
        // Fresh route instance represents reload/session reconstruction, not a cached response.
        const reloaded = await routeHarness(imports, clock)("GET", "/store", {}, owner);
        assert.deepEqual(contracts.GetStoreResponse.parse(reloaded.body), completed);
        assert.deepEqual((await get(opponent)).previewBadges, []);

        // All current offers persist as preview-only; UTC daily identity rotates.
        clock.now = Date.UTC(2026, 9, 6) - 1;
        const dailyBefore = await get();
        for (const offer of dailyBefore.offers) {
          const bought = (await buy(offer.id))!;
          assert.equal(bought.offers.find(item => item.id === offer.id)!.testOwned, true);
          const beforeRetry = await receipts();
          await buy(offer.id);
          assert.deepEqual(await receipts(), beforeRetry, "every preview offer retry preserves its receipt");
        }
        const oldDaily = dailyBefore.offers.filter(offer => ["spell", "ultimate"].includes(offer.kind));
        clock.now++;
        const dailyAfter = await get();
        assert.equal(dailyAfter.pass.purchasedAt, purchasedAt, "daily rollover does not reset weekly activation");
        assert.equal(dailyAfter.pass.wins, 35);
        for (const old of oldDaily) await buy(old.id, 409);
        for (const kind of ["spell", "ultimate"]) {
          const next = dailyAfter.offers.find(offer => offer.kind === kind)!;
          assert.equal(next.testOwned, false);
          await buy(next.id);
        }
        assert.ok(dailyAfter.offers.filter(offer => offer.kind === "skin").every(offer => offer.testOwned));

        // Weekly end is exclusive. Sunday 23:59:59.999 belongs to old pass.
        clock.now = week.endsAt - 1;
        await addMatch();
        assert.equal((await get()).pass.wins, 36);
        assert.equal((await get()).pass.id, week.id);
        clock.now++;
        const reset = await get();
        assert.notEqual(reset.pass.id, week.id);
        assert.equal(reset.pass.purchasedAt, null);
        assert.equal(reset.pass.wins, 0);
        assert.equal(reset.pass.claimedGold, 0);
        assert.ok(reset.pass.rewards.every(reward => reward.state === "locked"));
        assert.deepEqual(reset.previewBadges, ["rogue-week"], "earned preview badge survives reset");
        await buy(week.offerId, 409);
        await claim(week.id, "gold-5", 410);
        await claim(reset.pass.id, "gold-5", 409);
        // Activate later: the previously inserted exact-boundary match is history.
        clock.now += 1000;
        await buy(reset.pass.offerId);
        assert.equal((await get()).pass.wins, 0);
        for (let i = 0; i < 35; i++) await addMatch();
        for (const reward of reset.pass.rewards) await claim(reset.pass.id, reward.id);
        const secondWeek = await get();
        assert.equal(secondWeek.pass.claimedGold, 325, "claims are scoped to the new week");
        assert.deepEqual(secondWeek.previewBadges, ["rogue-week"], "same test badge deduplicates across weeks");
        assert.equal((await claimed()).length, week.template.rewards.length * 2);
        assert.deepEqual(await realEconomy(), baseline, "all preview buys/claims leave the real economy byte-for-byte unchanged");
        assert.equal((await get()).offers.find(offer => offer.kind === "battle-pass")!.owned, false);
        finished = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    assert.equal(finished, true, "suite must reach its intentional rollback");
    // Assert cleanup rather than assuming the rollback worked.
    for (const table of [profiles, wallets, unlocks, purchases, claims, duplicates, localMatches, tournaments]) {
      const column = table === profiles ? profiles.id : (table as typeof wallets).playerId;
      assert.equal((await db.select().from(table).where(inArray(column, ids))).length, 0);
    }
    assert.equal((await db.select().from(listings).where(inArray(listings.sellerId, ids))).length, 0);
    assert.equal((await db.select().from(matches).where(or(
      inArray(matches.attackerId, ids), inArray(matches.defenderId, ids),
    ))).length, 0);
    console.log("PASS: Store routes, duplicate activation/claims, mode/direction exclusions, reload, isolated economy, UTC daily/weekly resets and permanent test badge. All fixtures rolled back.");
  } finally {
    await pool.end();
  }
}
