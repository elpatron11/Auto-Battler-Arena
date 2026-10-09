import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../src/lib/useHourlyDungeonBridge.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const id = "a1000000-0000-4000-8000-000000000001";
const otherId = "b1000000-0000-4000-8000-000000000001";
const requestId = "c1000000-0000-4000-8000-000000000001";
const key = "arena:pending-hourly-dungeon:v1";
const status = { serverNow: Date.now(), cycle: 497000, resetAt: Date.now() + 3_600_000,
  encounterId: "frost", completed: false, activeBuff: null };
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(owner, storage = new Map(), finish = async () => ({
  status: { ...status, completed: true, activeBuff: { kind: "maxHp" } }, awarded: true,
})) {
  const posts = [], listeners = new Map(), calls = [];
  const target = { postMessage: message => posts.push(message) };
  let cleanup;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require(name) {
      if (name === "react") return { useEffect: effect => { cleanup = effect(); }, useRef: value => ({current:value}) };
      if (name === "@workspace/api-client-react") return {
        getDungeonStatus: async () => status,
        createDungeonAttempt: async () => { calls.push("start"); return { id, status }; },
        finishDungeonAttempt: async (...args) => { calls.push("finish"); return finish(...args); },
      };
      throw new Error(name);
    },
    AbortController, Promise, console,
    location: { origin: "https://arena.example" },
    sessionStorage: {
      getItem: k => storage.get(k) || null,
      setItem: (k, value) => storage.set(k, value),
    },
    window: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: name => listeners.delete(name),
      setInterval: () => 1, clearInterval() {},
    },
    document: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} },
    setInterval: () => 1, clearInterval() {},
  });
  module.exports.useHourlyDungeonBridge({ current: { contentWindow: target } }, owner, 0,
    () => calls.push("gold-refresh"));
  return {
    posts, calls, storage, dispose: () => cleanup(),
    send(message, source = target) {
      listeners.get("message")?.({ origin: "https://arena.example", source, data: message });
    },
  };
}

test("confirmed Dungeon Gold triggers account refresh and forwards the authoritative reward", async () => {
  const h = harness("owner-a", new Map(), async () => ({
    status: {...status, completed:true, activeBuff:{kind:"maxHp",percent:5}},
    awarded:true, gold:25, balance:125,
  }));
  h.send({type:"arena:dungeon-request",requestId,action:"finish",id,outcome:"win",cycle:status.cycle});
  await flush();
  assert.equal(h.calls.filter(call => call === "gold-refresh").length, 1);
  const receipt = h.posts.find(post => post.type === "arena:dungeon-claim-state" && post.state === "confirmed");
  assert.equal(receipt.data.gold, 25);
  assert.equal(receipt.data.balance, 125);
  h.dispose();
});

test("nested Admin practice cannot start or claim through the authenticated host bridge", async () => {
  const h = harness("owner-a");
  h.send({ type: "arena:dungeon-request", requestId, action: "start" }, {});
  h.send({ type: "arena:dungeon-request", requestId, action: "finish", id, outcome: "win" }, {});
  await flush();
  assert.deepEqual(h.calls, []);
  h.dispose();
});

test("a failed win claim survives reload and recovery reports its confirmed disposition", async () => {
  const storage = new Map();
  const offline = harness("owner-a", storage, async () => {
    throw Object.assign(new Error("offline"), { status: 503 });
  });
  offline.send({ type: "arena:dungeon-request", requestId, action: "finish", id, outcome: "win", cycle: status.cycle });
  await flush();
  assert.ok(offline.posts.some(p => p.type === "arena:dungeon-claim-state" && p.state === "error"));
  assert.equal(JSON.parse(storage.get(key))[0].id, id);
  offline.dispose();
  const recovered = harness("owner-a", storage);
  await flush();
  assert.ok(recovered.posts.some(p => p.type === "arena:dungeon-claim-state" && p.state === "pending" && p.cycle === status.cycle));
  assert.ok(recovered.posts.some(p => p.type === "arena:dungeon-claim-state" && p.state === "confirmed"));
  assert.deepEqual(JSON.parse(storage.get(key)), []);
  recovered.dispose();
});

test("expired recovered claims unblock the gate without claiming an active reward", async () => {
  const storage = new Map([[key, JSON.stringify([{ owner: "owner-a", id, outcome: "win" }])]]);
  const h = harness("owner-a", storage, async () => ({ status, awarded: false }));
  await flush();
  assert.ok(h.posts.some(p => p.type === "arena:dungeon-claim-state" && p.state === "expired"));
  assert.deepEqual(JSON.parse(storage.get(key)), []);
  h.dispose();
});

test("recovering another account never reads or removes the first account's pending clear", async () => {
  const original = { owner: "owner-a", id, outcome: "win" };
  const storage = new Map([[key, JSON.stringify([original])]]);
  const h = harness("owner-b", storage);
  await flush();
  assert.deepEqual(h.calls, []);
  h.send({ type: "arena:dungeon-request", requestId, action: "finish", id: otherId, outcome: "win" });
  await flush();
  assert.deepEqual(JSON.parse(storage.get(key)), [original]);
  assert.ok(h.posts.every(p => p.id !== id));
  h.dispose();
});

test("a repeated finish reuses the in-flight request and cannot downgrade a frozen win to abandonment", async () => {
  let resolve;
  const h = harness("owner-a", new Map(), () => new Promise(done => { resolve = done; }));
  h.send({ type: "arena:dungeon-request", requestId, action: "finish", id, outcome: "win" });
  h.send({ type: "arena:dungeon-request", requestId, action: "finish", id, outcome: "abandoned" });
  assert.equal(h.calls.filter(c => c === "finish").length, 1);
  assert.equal(JSON.parse(h.storage.get(key))[0].outcome, "win");
  resolve({ status: { ...status, activeBuff: { kind: "maxHp" } }, awarded: true });
  await flush();
  h.dispose();
});