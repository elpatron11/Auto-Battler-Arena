import assert from "node:assert/strict";
import { test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  boundedGoldCredit,
  ECONOMY,
  bootstrapUnlocks,
  CLASS_IDS,
  classUnlockPrice,
  chooseDuplicateLoss,
  isCanonicalCollectible,
  legacyClassTalentUnlocks,
  lockEconomyAccounts,
  orderedAccountIds,
  mapLegacyEconomyState,
  selectDuplicateLossCopy,
  listedSaleAmounts,
  localStartRetryAfterSeconds,
  localWinGold,
  purchaseQuote,
  racialUnlockPrice,
  rollArenaDrops,
  validBootstrapSelection,
} from "../src/lib/economy.ts";

test("local AI bonuses stay unchanged while Arena and Dungeons pay 25 Gold", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(localWinGold), [35, 35, 35, 10, 10]);
  assert.equal(localWinGold(100), 10);
  assert.equal(ECONOMY.arenaGold.win, 25);
  assert.equal(ECONOMY.arenaGold.loss, 5);
  assert.equal(ECONOMY.dungeonGold, 25);
});

test("local reward registration limits concurrent tickets and rapid starts", () => {
  const now = Date.now();
  assert.equal(localStartRetryAfterSeconds(new Date(now - 1_000), 0, now), 19);
  assert.equal(localStartRetryAfterSeconds(new Date(now - 20_000), 0, now), null);
  assert.equal(localStartRetryAfterSeconds(null, 2, now), 60);
  assert.equal(localStartRetryAfterSeconds(null, 1, now), null);
});

test("server drop rolls independently award multiple collectible types", () => {
  const values = [0.01, 0.1, 0.01, 0.4, 0.02, 0.5];
  const drops = rollArenaDrops("win", () => values.shift());
  assert.deepEqual(drops.map(({ kind }) => kind), ["spell", "talent", "ultimate"]);
  assert.ok(drops.every(({ kind, itemId }) => isCanonicalCollectible(kind, itemId)));
});

test("loss roll rates are centralized and independent", () => {
  const values = [0.005, 0.2, 0.002, 0.2, 0.002, 0.2];
  assert.deepEqual(rollArenaDrops("loss", () => values.shift()).map(({ kind }) => kind),
    ["spell", "talent", "ultimate"]);
  assert.deepEqual(rollArenaDrops("loss", () => 0.99), []);
});

test("spell rolls respect the reduced win and loss odds", () => {
  assert.equal(rollArenaDrops("win", () => 0.08).some(drop => drop.kind === "spell"), false);
  assert.equal(rollArenaDrops("loss", () => 0.02).some(drop => drop.kind === "spell"), false);
  assert.equal(rollArenaDrops("win", () => 0.06).some(drop => drop.kind === "spell"), true);
  assert.equal(rollArenaDrops("loss", () => 0.005).some(drop => drop.kind === "spell"), true);
});

test("duplicate loss only picks from existing duplicate inventory", () => {
  assert.equal(chooseDuplicateLoss("spell", [], () => 0), null);
  assert.equal(chooseDuplicateLoss("spell", ["listed-copy", "unlisted-copy"], () => 0.01), "listed-copy");
  assert.equal(chooseDuplicateLoss("ultimate", ["one"], () => 0.06), null);
});

test("duplicate loss includes listed copies and cancels only the selected listed copy", () => {
  const copies = [{ itemId: "listed-and-unlisted", quantity: 2, listedQuantity: 1 }];
  const listedRoll = [0.01, 0.1, 0.1];
  assert.deepEqual(selectDuplicateLossCopy("spell", copies, () => listedRoll.shift()), {
    itemId: "listed-and-unlisted", listingCancelled: true,
  });
  const unlistedRoll = [0.01, 0.75, 0.99];
  assert.deepEqual(selectDuplicateLossCopy("spell", copies, () => unlistedRoll.shift()), {
    itemId: "listed-and-unlisted", listingCancelled: false,
  });
});

test("legacy import preserves only the actual owned fields without adding arbitrary defaults", () => {
  const legacy = mapLegacyEconomyState({
    gold: 1234,
    ownedClasses: ["rogue", "shaman"],
    ownedRacials: ["nightelf"],
    ownedSpells: ["ability:rogue", "ability:fake"],
    ownedUltimates: ["ult:shaman", "ult:fake"],
    unlockedTalents: { rogue: ["precision", "escape", "fake"], shaman: ["spirit"], frostmage: ["icearmor"] },
    tournamentWins: 2,
    tournamentEntries: 5,
    tournamentHistory: [{ id: "old-run", placement: "champion" }],
  });
  assert.equal(legacy.present, true);
  assert.equal(legacy.gold, 1234);
  assert.equal(legacy.legacyTournamentWins, 2);
  assert.equal(legacy.legacyTournamentEntries, 5);
  assert.deepEqual(legacy.legacyTournamentHistory, [{ id: "old-run", placement: "champion" }]);
  assert.deepEqual(legacy.unlocks.filter(({ kind }) => kind === "class").map(({ itemId }) => itemId),
    ["rogue", "shaman"]);
  assert.deepEqual(legacy.unlocks.filter(({ kind }) => kind === "racial").map(({ itemId }) => itemId), ["nightelf"]);
  assert.ok(legacy.unlocks.some(({ kind, itemId }) => kind === "spell" && itemId === "ability:rogue"));
  assert.ok(legacy.unlocks.some(({ kind, itemId }) => kind === "ultimate" && itemId === "ult:shaman"));
  assert.deepEqual(legacy.unlocks.filter(({ kind }) => kind === "talent").map(({ itemId }) => itemId).sort(),
    ["rogue:escape", "rogue:precision", "rogue:quickhands", "shaman:earth", "shaman:elements", "shaman:spirit"]);
  assert.ok(!legacy.unlocks.some(({ itemId }) => itemId === "human" || itemId === "frostmage"));
  assert.deepEqual(legacyClassTalentUnlocks(["rogue", "rogue", "unknown"])
    .map(({ itemId }) => itemId).sort(), ["rogue:escape", "rogue:precision", "rogue:quickhands"]);
});

test("empty profile state is not eligible for one-time import and requires explicit bootstrap", () => {
  assert.deepEqual(mapLegacyEconomyState({}), {
    present: false, gold: 0, unlocks: [], legacyTournamentWins: 0,
    legacyTournamentEntries: 0, legacyTournamentHistory: [],
  });
  assert.equal(validBootstrapSelection(["rogue", "shaman", "priest"], "nightelf"), true);
  assert.equal(validBootstrapSelection(["rogue", "rogue", "priest"], "nightelf"), false);
  assert.equal(validBootstrapSelection(["rogue", "shaman", "priest"], "human"), false);
  assert.deepEqual(bootstrapUnlocks(["rogue", "shaman", "priest"], "nightelf"), [
    { kind: "class", itemId: "rogue" },
    { kind: "class", itemId: "shaman" },
    { kind: "class", itemId: "priest" },
    { kind: "racial", itemId: "nightelf" },
    { kind: "talent", itemId: "rogue:precision" },
    { kind: "talent", itemId: "shaman:elements" },
    { kind: "talent", itemId: "priest:grace" },
  ]);
  assert.equal(CLASS_IDS.length, 9);
});

test("economy account advisory locks deduplicate and acquire account IDs in global sort order", async () => {
  assert.deepEqual(orderedAccountIds(["seller", "buyer", "seller"]), ["buyer", "seller"]);
  const dialect = new PgDialect();
  const acquired = [];
  await lockEconomyAccounts({ execute: async query => {
    acquired.push(dialect.sqlToQuery(query).params[0]);
  } }, ["seller", "buyer", "seller"]);
  assert.deepEqual(acquired, ["buyer", "seller"]);
});

test("opposing market transactions serialize without an advisory-lock cycle", async () => {
  const dialect = new PgDialect();
  const tails = new Map();
  async function transaction(accountIds) {
    const releases = [];
    const tx = {
      execute: async query => {
        const key = dialect.sqlToQuery(query).params[0];
        const previous = tails.get(key) ?? Promise.resolve();
        let release;
        const current = new Promise(resolve => { release = resolve; });
        tails.set(key, previous.then(() => current));
        await previous;
        releases.push(release);
      },
    };
    await lockEconomyAccounts(tx, accountIds);
    await Promise.resolve();
    for (const release of releases.reverse()) release();
  }
  let timer;
  await Promise.race([
    Promise.all([transaction(["seller-a", "seller-b"]), transaction(["seller-b", "seller-a"])]),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("advisory lock cycle")), 500); }),
  ]).finally(() => clearTimeout(timer));
});

test("market tax, class progression, and racial progression use configured steps", () => {
  assert.deepEqual(listedSaleAmounts(5000), { tax: 500, sellerAmount: 4500 });
  assert.deepEqual(listedSaleAmounts(1), { tax: 0, sellerAmount: 1 });
  assert.deepEqual(purchaseQuote(5000, 6000, 0), {
    buyerGoldAfter: 1000, sellerGoldAfter: 4500, tax: 500, sellerAmount: 4500,
  });
  assert.equal(purchaseQuote(5000, 4999, 0), null);
  assert.equal(purchaseQuote(5000, 5000, 2_147_483_647), null);
  assert.equal(boundedGoldCredit(2_147_483_637, 30), 10);
  assert.equal(boundedGoldCredit(2_147_483_647, 30), 0);
  assert.equal(boundedGoldCredit(-1, 30), null);
  assert.equal(classUnlockPrice(3), 1000);
  assert.equal(classUnlockPrice(8), 6000);
  assert.equal(classUnlockPrice(9), 8000);
  assert.equal(racialUnlockPrice(0), 750);
  assert.equal(racialUnlockPrice(4), 4500);
  assert.equal(racialUnlockPrice(5), 6000);
});