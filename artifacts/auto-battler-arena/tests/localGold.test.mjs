import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../public/game.html", import.meta.url), "utf8");
const script = html.match(/<script id="arena-local-ai-rewards">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "local AI reward bridge must be installed");

function bridge() {
  const messages = [];
  const listeners = new Map();
  const box = {
    style: {}, children: [],
    replaceChildren() { this.children = []; },
    appendChild(child) { this.children.push(child); },
    prepend(child) { this.children.unshift(child); },
  };
  let battleState = null;
  let nextId = 0;
  const parent = { postMessage: message => messages.push(message) };
  const context = {
    GUEST_TRIAL: false,
    playerProfile: { name: "Challenger" }, tournament: { active: false },
    location: { origin: "https://example.test" },
    crypto: { randomUUID: () => `11111111-1111-4111-8111-${String(++nextId).padStart(12, "0")}` },
    window: { parent, addEventListener: (type, callback) => listeners.set(type, callback) },
    document: {
      getElementById: id => id === "matchReward" ? box : null,
      createElement: () => ({ style: {}, className: "", textContent: "" }),
    },
    showUnlockToast() {},
    queueMicrotask: callback => callback(),
    startBattle(opts) {
      if (opts._ordersConfirmed) context.state = battleState = { over: false };
    },
    renderMatchReward() {},
    state: null,
  };
  vm.runInNewContext(script, context);
  const fromParent = data => listeners.get("message")({
    origin: context.location.origin, source: parent, data,
  });
  return { context, box, messages, fromParent, get state() { return battleState; } };
}

test("local AI fight sends one ticket and one outcome; only server receipt shows Gold", () => {
  const game = bridge();
  game.context.startBattle({});
  assert.equal(game.messages.length, 0, "orders screen must not register a fight");
  game.context.startBattle({ _ordersConfirmed: true });
  assert.equal(game.messages[0].type, "arena:local-start");
  const id = game.messages[0].id;
  game.context.renderMatchReward("Victory!");
  game.context.renderMatchReward("Victory!");
  assert.equal(game.messages.length, 2);
  assert.equal(game.messages[1].type, "arena:local-finish");
  assert.equal(game.messages[1].id, id);
  assert.match(game.box.children[0].textContent, /Confirming/);
  game.fromParent({ type: "arena:local-reward", id, reward: { outcome: "win", gold: 35, localWins: 1 } });
  assert.match(game.box.children[0].textContent, /\+35 Gold/);
});

test("ranked and tournament starts never register local Gold matches", () => {
  const game = bridge();
  game.context.startBattle({ _ordersConfirmed: true, onlineChallenge: true });
  game.context.renderMatchReward("Victory!");
  game.context.startBattle({ _ordersConfirmed: true, tournament: true });
  game.context.renderMatchReward("Victory!");
  game.context.tournament.active = true;
  game.context.startBattle({ _ordersConfirmed: true });
  game.context.renderMatchReward("Victory!");
  assert.equal(game.messages.length, 0);
});