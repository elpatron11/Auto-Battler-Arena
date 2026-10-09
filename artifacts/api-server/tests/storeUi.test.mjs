// Fast behavior checks of the actual React handlers and badge effect.
// This is not a browser/accessibility or physical-phone test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { storeOffersAt, storeWeekAt } from "../src/lib/storeRules.ts";

const now = Date.UTC(2026, 9, 5, 12);
const frontend = new URL("../../auto-battler-arena/src/", import.meta.url);
const week = storeWeekAt(now);
function fixture() {
  return {
    signedIn: true, serverTime: new Date(now).toISOString(), testPurchasesEnabled: true,
    checkoutMode: "test", stripeCheckoutEnabled: true, earnedBadges: [],
    offers: storeOffersAt(now).map(offer => ({ ...offer, owned: false, testOwned: false })),
    pass: {
      ...week.template, id: week.id, offerId: week.offerId, purchasedAt: null,
      startsAt: new Date(week.startsAt).toISOString(), endsAt: new Date(week.endsAt).toISOString(),
      wins: 0, claimedGold: 0,
      rewards: week.template.rewards.map(reward => ({ ...reward, state: "locked" })),
    },
    previewBadges: [],
  };
}

// Minimal hooks/JSX runner: execute the original component, preserve hook state
// across renders, and invoke the callbacks attached to its actual buttons.
function harness({ signedIn = true, initialSection = "featured", state = fixture(), nativePrototype = false } = {}) {
  let cursor = 0, effects = [], data = state, purchases = [], claims = [], refetches = 0;
  const hooks = [], navigations = [], options = [], cacheWrites = [];
  const slots = initial => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = initial();
    return index;
  };
  const react = {
    useState(initial) {
      const index = slots(() => typeof initial === "function" ? initial() : initial);
      return [hooks[index], value => { hooks[index] = typeof value === "function" ? value(hooks[index]) : value; }];
    },
    useRef(initial) { return hooks[slots(() => ({ current: initial }))]; },
    useMemo(fn) { cursor++; return fn(); },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn, deps) {
      const index = cursor++;
      const prior = hooks[index];
      if (!prior || deps.some((value, i) => value !== prior.deps[i])) {
        effects.push(() => {
          prior?.cleanup?.();
          hooks[index] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const purchase = {
    isPending: false, reset() {},
    async mutateAsync(body) { purchases.push(body); return { sessionId: "cs_test_fixture", url: "https://checkout.stripe.com/c/pay/test-fixture" }; },
  };
  const claim = {
    async mutateAsync(body) { claims.push(body); return data; },
  };
  const refetch = () => { refetches++; return Promise.resolve(); };
  const api = {
    getGetStoreQueryKey: () => ["store"], getGetEconomyQueryKey: () => ["economy"],
    useGetStore: option => { options.push(option); return { data, refetch, isLoading: false, isError: false }; },
    useGetEconomy: () => ({ data: { gold: 321, unlocks: [], config: {} } }),
    useCreateStoreCheckout: () => purchase, useClaimStoreTestReward: () => claim,
    useClaimStoreReward: () => claim,
    getGetStoreCheckoutQueryKey: id => ["checkout", id],
    useGetStoreCheckout: () => ({ data: undefined, isError: false }),
  };
  const element = (type, props) => ({ type, props: props ?? {} });
  const icons = Object.fromEntries(["ArrowLeft", "Award", "Coins", "X"].map(name => [name, name]));
  const imports = {
    react, "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "@clerk/react": { useAuth: () => ({ isLoaded: true, isSignedIn: signedIn }) },
    "@tanstack/react-query": { useQueryClient: () => ({
      setQueryData(key, next) { cacheWrites.push({ key, next }); data = next; },
      invalidateQueries() { return Promise.resolve(); },
    }) },
    wouter: { Link: "a", useLocation: () => ["/store", path => navigations.push(path)] },
    "lucide-react": icons, "@workspace/api-client-react": api,
    "../data/itemCatalog": { classNames: { rogue: "Rogue" } },
    "../lib/gameError": { gameErrorMessage: error => error.message },
    "../lib/nativePrototype": { isAndroidPrototype: () => nativePrototype },
    "../components/StoreSkinArt": { StoreSkinArt: "skin-art" }, "./Store.css": {},
  };
  class ClockDate extends Date { static now() { return now; } }
  const module = { exports: {} };
  vm.runInNewContext(transformSync(readFileSync(new URL("pages/Store.tsx", frontend), "utf8"), {
    loader: "tsx", format: "cjs", jsx: "automatic", define: { "import.meta.env.BASE_URL": '"/"' },
  }).code, {
    module, exports: module.exports, Date: ClockDate, URL, URLSearchParams,
    window: { location: { search: "" }, open: () => null, setInterval: () => 1, clearInterval() {}, setTimeout: fn => fn() },
    document: { activeElement: { focus() {} } },
    require: name => { assert.ok(imports[name], `Unexpected UI import ${name}`); return imports[name]; },
  });
  let tree;
  const render = () => {
    cursor = 0; effects = [];
    tree = module.exports.default({ initialSection });
    for (const effect of effects) effect();
    return tree;
  };
  const find = id => {
    const walk = node => {
      if (!node || typeof node !== "object") return null;
      if (Array.isArray(node)) return node.map(walk).find(Boolean);
      if (node.props?.["data-testid"] === id) return node;
      return walk(node.props?.children);
    };
    return walk(tree) ?? null;
  };
  render();
  return {
    render, find, purchase, claims, purchases, cacheWrites, navigations, options,
    setData(next) { data = next; },
    get refetches() { return refetches; },
  };
}

test("Android prototype disables Store checkout without changing browser checkout", () => {
  const app = harness({ nativePrototype: true });
  const buy = app.find("button-buy-pass:rogue-week:2026-10-05");
  assert.ok(app.find("status-native-prototype"));
  assert.equal(buy.props.disabled, true);
  buy.props.onClick();
  app.render();
  assert.equal(app.find("dialog-store-buy"), null);
  assert.equal(app.purchases.length, 0);
});

test("Store Cancel grants nothing; confirmation opens verified hosted checkout without instant activation", async () => {
  const h = harness();
  h.find(`button-buy-${week.offerId}`).props.onClick();
  h.render();
  assert.ok(h.find("dialog-purchase"));
  h.find("button-cancel-purchase").props.onClick();
  h.render();
  assert.equal(h.find("dialog-purchase"), null);
  assert.equal(h.purchases.length, 0);
  h.find(`button-buy-${week.offerId}`).props.onClick();
  h.render();
  await h.find("button-confirm-purchase").props.onClick();
  await new Promise(setImmediate);
  h.render();
  assert.deepEqual(JSON.parse(JSON.stringify(h.purchases)), [{ data: { offerId: week.offerId } }]);
  assert.equal(h.cacheWrites.length, 0, "creating a session does not grant ownership");
  assert.equal(h.find("button-confirm-purchase"), null);
  assert.equal(h.find("link-stripe-checkout").props.href, "https://checkout.stripe.com/c/pay/test-fixture");
  assert.ok(h.find("text-checkout-ready"));
  h.find("button-cancel-purchase").props.onClick();
  h.render();
  assert.equal(h.find("dialog-purchase"), null);
});

test("Store prevents confirmation/cancel while pending and refreshes after rejected stale purchases", async () => {
  const h = harness();
  h.find(`button-buy-${week.offerId}`).props.onClick();
  h.purchase.isPending = true;
  h.render();
  assert.equal(h.find("button-confirm-purchase").props.disabled, true);
  assert.equal(h.find("button-cancel-purchase").props.disabled, true);
  h.find("button-cancel-purchase").props.onClick();
  h.render();
  assert.ok(h.find("dialog-purchase"));
  h.purchase.isPending = false;
  h.purchase.mutateAsync = async () => { throw new Error("This offer has rotated."); };
  h.render();
  await h.find("button-confirm-purchase").props.onClick();
  await new Promise(setImmediate);
  h.render();
  assert.match(h.find("text-purchase-error").props.children, /rotated/);
  assert.equal(h.cacheWrites.length, 0);
  assert.equal(h.refetches, 1);
});

test("Store guests navigate to sign-in, browsing-only disables activation, expired pass refreshes once", () => {
  const guest = harness({ signedIn: false });
  guest.find(`button-buy-${week.offerId}`).props.onClick();
  guest.render();
  assert.deepEqual(guest.navigations, ["/sign-in"]);
  assert.equal(guest.find("dialog-purchase"), null);
  const state = fixture();
  state.testPurchasesEnabled = false;
  state.checkoutMode = "off";
  const disabled = harness({ state });
  assert.equal(disabled.find(`button-buy-${week.offerId}`).props.disabled, true);
  assert.ok(disabled.find("status-store-disabled"));
  const expired = fixture();
  expired.pass.endsAt = new Date(now).toISOString();
  const h = harness({ state: expired, initialSection: "battle-pass" });
  h.render(); h.render();
  assert.equal(h.refetches, 1);
  const query = h.options[0].query;
  assert.equal(query.refetchOnMount, "always");
  assert.equal(query.refetchOnWindowFocus, true);
  assert.equal(query.refetchInterval, 30000);
});

test("claim buttons send the current pass and reward IDs and show returned preview state", async () => {
  const state = fixture();
  state.pass.purchasedAt = new Date(now).toISOString();
  state.pass.wins = 5;
  state.pass.rewards[0].state = "available";
  const h = harness({ state, initialSection: "battle-pass" });
  const next = structuredClone(state);
  next.pass.rewards[0].state = "claimed";
  next.pass.claimedGold = 75;
  h.setData(next);
  await h.find("button-claim-gold-5").props.onClick();
  await new Promise(setImmediate);
  h.render();
  assert.deepEqual(JSON.parse(JSON.stringify(h.claims)), [{ data: { passId: week.id, rewardId: "gold-5" } }]);
  assert.equal(h.find("button-claim-gold-5"), null);
  assert.equal(h.find("status-reward-gold-5").props.children, "Claimed (preview)");
  assert.ok(h.find("text-pass-claimed-gold"));
});

test("Profile displays an explicitly labelled test badge only for the signed-in owner; removes on logout", () => {
  let effect, current, state = fixture(), options;
  const anchor = { appendChild(node) { current = node; } };
  const doc = {
    getElementById(id) { return id === "profileName" ? { parentElement: anchor } : current; },
    createElement() {
      return { dataset: {}, style: {}, remove() { if (current === this) current = undefined; } };
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(transformSync(readFileSync(new URL("lib/useStoreProfileBadge.ts", frontend), "utf8"),
    { loader: "ts", format: "cjs" }).code, {
    module, exports: module.exports,
    require: name => name === "react" ? { useEffect: fn => { effect = fn; } } : {
      getGetStoreQueryKey: () => ["store"],
      useGetStore: option => { options = option; return { data: state }; },
    },
  });
  const run = (owner = "fixture", ready = true) => {
    module.exports.useStoreProfileBadge({ current: { contentDocument: doc } }, ready, owner);
    return effect();
  };
  run();
  assert.equal(current, undefined);
  state.previewBadges = ["rogue-week", "rogue-week"];
  const cleanup = run();
  assert.equal(current.dataset.testid, "badge-profile-rogue-week");
  assert.equal(current.textContent, "Rogue Week · earned test badge");
  assert.match(current.title, /do not grant real paid ownership/);
  cleanup();
  assert.equal(current, undefined);
  run();
  run(null);
  assert.equal(current, undefined);
  assert.equal(options.query.enabled, false);
  state.signedIn = false;
  run();
  assert.equal(current, undefined);
});
