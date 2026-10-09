import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import {
  PASS_TEMPLATES, STORE_DAY_MS, STORE_WEEK_MS, storeOffersAt,
  storeRewardState, storeTestFlowsEnabled, storeWeekAt,
} from "../src/lib/storeRules.ts";

test("weekly paid pass resets at Monday UTC, not local midnight, without historical progress", () => {
  const monday = Date.UTC(2026, 9, 5);
  const start = storeWeekAt(monday);
  assert.equal(start.startsAt, monday);
  assert.equal(start.endsAt, monday + STORE_WEEK_MS);
  assert.equal(storeWeekAt(start.endsAt - 1).id, start.id);
  assert.notEqual(storeWeekAt(start.endsAt).id, start.id);
  assert.equal(storeWeekAt(monday - 1).endsAt, monday);
  for (const reward of PASS_TEMPLATES["rogue-week"].rewards) {
    assert.equal(storeRewardState(reward.wins, 500, false, false), "locked");
  }
});

test("Rogue Week is one $7.99 track with exact requested existing ability milestones and no class or skin grant", () => {
  const pass = PASS_TEMPLATES["rogue-week"];
  assert.equal(pass.priceCents, 799);
  const abilities = pass.rewards.filter(reward => ["talent", "spell", "ultimate"].includes(reward.kind));
  assert.deepEqual(abilities.map(reward => [reward.wins, reward.name, reward.itemId]), [
    [15, "Escape Artist", "rogue:escape"], [20, "Disorient", "ability:rogue"], [30, "Umbral Step", "ult:rogue"],
  ]);
  assert.ok(pass.rewards.every(reward => !["class", "skin"].includes(reward.kind)));
  assert.equal(pass.rewards.at(-1).kind, "badge");
  assert.equal(pass.rewards.at(-1).wins, pass.targetWins);
  assert.ok(pass.rewards.filter(reward => reward.kind === "gold").length >= 3);
});

test("milestone states are locked, claimable at exact threshold, and stay claimed", () => {
  assert.equal(storeRewardState(15, 14, true, false), "locked");
  assert.equal(storeRewardState(15, 15, true, false), "available");
  assert.equal(storeRewardState(15, 35, true, true), "claimed");
  assert.equal(storeRewardState(15, 0, false, true), "locked");
});

test("daily offers have exact prices, existing art, stable IDs until UTC rollover and distinct rotating identities", () => {
  const monday = Date.UTC(2026, 9, 5);
  const offers = storeOffersAt(monday);
  assert.deepEqual(offers.map(offer => offer.priceCents), [799, 799, 799, 500, 600]);
  assert.deepEqual(offers.filter(offer => offer.kind === "skin").map(offer => offer.itemId), ["wingedPaladin", "emberLord"]);
  assert.deepEqual(storeOffersAt(monday + STORE_DAY_MS - 1).map(offer => offer.id), offers.map(offer => offer.id));
  for (const kind of ["spell", "ultimate"]) {
    const before = offers.find(offer => offer.kind === kind);
    const after = storeOffersAt(monday + STORE_DAY_MS).find(offer => offer.kind === kind);
    assert.notEqual(before.id, after.id);
    assert.notEqual(before.itemId, after.itemId);
    assert.equal(Date.parse(before.rotatesAt), monday + STORE_DAY_MS);
  }
  for (let day = 0; day < 30; day++) {
    for (const offer of storeOffersAt(monday + day * STORE_DAY_MS)) {
      assert.ok(existsSync(new URL(`../../auto-battler-arena/public/${offer.art}`, import.meta.url)), offer.art);
    }
  }
});

test("test purchases and claims are disabled in production, never a substitute for real checkout", () => {
  assert.equal(storeTestFlowsEnabled("production"), false);
  assert.equal(storeTestFlowsEnabled(undefined), false);
  assert.equal(storeTestFlowsEnabled("staging"), false);
  assert.equal(storeTestFlowsEnabled("development"), true);
});

test("UTC resets remain exact across calendar, leap-year and daylight-saving boundaries, including dates before the anchor", () => {
  for (const midnight of [
    "2026-10-05T00:00:00.000Z", "2026-11-02T00:00:00.000Z",
    "2026-12-28T00:00:00.000Z", "2027-01-04T00:00:00.000Z",
    "2028-02-28T00:00:00.000Z", "2026-03-09T00:00:00.000Z",
    "2026-09-28T00:00:00.000Z",
  ]) {
    const at = Date.parse(midnight);
    const next = storeWeekAt(at);
    assert.equal(next.startsAt, at, midnight);
    assert.equal(next.endsAt - next.startsAt, STORE_WEEK_MS);
    assert.equal(storeWeekAt(at - 1).endsAt, at);
    assert.notEqual(storeWeekAt(at - 1).id, next.id);
    assert.equal(storeWeekAt(at + STORE_WEEK_MS - 1).id, next.id);
    assert.equal(storeWeekAt(at + STORE_WEEK_MS).startsAt, next.endsAt);
    for (const kind of ["spell", "ultimate"]) {
      const before = storeOffersAt(at - 1).find(offer => offer.kind === kind);
      const after = storeOffersAt(at).find(offer => offer.kind === kind);
      assert.notEqual(before.id, after.id);
      assert.equal(Date.parse(before.rotatesAt), at);
      assert.equal(Date.parse(after.rotatesAt), at + STORE_DAY_MS);
      assert.equal(storeOffersAt(at + STORE_DAY_MS - 1).find(offer => offer.kind === kind).id, after.id);
    }
  }
  const localSunday = Date.parse("2026-10-04T19:00:00-05:00");
  assert.equal(storeWeekAt(localSunday).startsAt, Date.UTC(2026, 9, 5));
});
