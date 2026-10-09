import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { transformSync } from "esbuild";
import * as rules from "../src/lib/storeRules.ts";
import * as stripeRules from "../src/lib/storeStripeRules.ts";
import { gameErrorMessage } from "../../auto-battler-arena/src/lib/gameError.ts";

const require = createRequire(new URL("../package.json", import.meta.url));
const orm = require("drizzle-orm");
const { PgDialect } = require("drizzle-orm/pg-core");
const dialect = new PgDialect();
const now = Date.UTC(2026, 9, 5, 12);

function load(file, dependencies) {
  const module = { exports: {} };
  class ClockDate extends Date { static now() { return now; } }
  const code = transformSync(readFileSync(new URL(`../src/lib/${file}`, import.meta.url), "utf8"),
    { loader: "ts", format: "cjs" }).code;
  vm.runInNewContext(code, {
    module, exports: module.exports, Date: ClockDate,
    process: { env: { NODE_ENV: "production", REPLIT_DOMAINS: "fixture.replit.app", DATABASE_URL: "fixture" } },
    require: name => { assert.ok(name in dependencies, `Unexpected catalog dependency ${name}`); return dependencies[name]; },
  });
  return module.exports;
}

function checkSelection(query, sku, amount) {
  assert.match(query.sql, /ORDER BY pr\.created ASC NULLS LAST, pr\.id ASC\s+LIMIT 1/);
  assert.match(query.sql, /p\.active = true AND pr\.active = true/);
  assert.match(query.sql, /p\.livemode = \$\d+ AND pr\.livemode = \$\d+/);
  assert.match(query.sql, /pr\.unit_amount = \$\d+ AND pr\.currency = 'usd' AND pr\.type = 'one_time'/);
  assert.match(query.sql, /p\.metadata->>'arena_store' = 'fantasy-world-arenas'/);
  assert.deepEqual(query.params, [sku, true, true, amount]);
}

test("live checkout selects one stable equivalent price without weakening payment checks", async () => {
  let query;
  const stop = new Error("Captured price selection; no transaction or Stripe call.");
  const mod = load("storeStripeCheckout.ts", {
    "node:crypto": { randomUUID() {} }, "drizzle-orm": orm,
    "@workspace/db": { db: { execute: async sql => { query = dialect.sqlToQuery(sql); throw stop; } } },
    "./economy": {}, "./storePreview": {}, "./storeRules": rules,
    "./stripeClient": {}, "./storeStripeRules": stripeRules,
  });
  await assert.rejects(mod.createStripeStoreCheckout("fixture", rules.storeWeekAt(now).offerId),
    error => error === stop);
  checkSelection(query, "pass:rogue-week", 799);
});

test("startup uses the same duplicate-tolerant exact-price selection for every active offer", async () => {
  const queries = [], state = { ready: false };
  const mod = load("storeStripeInit.ts", {
    "stripe-replit-sync": { runMigrations: async () => {} },
    "./stripeClient": {
      getUncachableStripeClient: async () => ({
        balance: { retrieve: async () => ({ livemode: true }) },
        accounts: { retrieve: async () => ({ charges_enabled: true }) },
      }),
      getStripeSync: async () => ({ findOrCreateManagedWebhook: async () => {}, syncBackfill: async () => {} }),
    },
    "./storeStripeState": { storeStripeState: state }, "./storeStripeRules": stripeRules,
    "./logger": { logger: { info() {}, error() {} } },
    "@workspace/db": { db: { execute: async sql => {
      queries.push(dialect.sqlToQuery(sql));
      return { rows: [{ id: "price_oldest_exact_match" }] };
    } } },
    "drizzle-orm": orm, "./storeRules": rules,
  });
  await mod.initializeStoreStripe();
  assert.equal(state.ready, true);
  const offers = rules.storeOffersAt(now);
  assert.equal(queries.length, offers.length);
  offers.forEach((offer, index) => checkSelection(queries[index], stripeRules.stripeStoreSku(offer), offer.priceCents));
});

test("Store failures never describe live payments as preview actions", () => {
  assert.equal(gameErrorMessage({ status: 503 }, "store"),
    "Stripe checkout is temporarily unavailable. Please try again shortly.");
  for (const status of [400, 403, 409, 500, undefined]) {
    const message = gameErrorMessage({ status }, "store");
    assert.doesNotMatch(message, /preview|test checkout|real payments are not available/i);
  }
});
