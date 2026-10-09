import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../public/game.html", import.meta.url), "utf8");
const adminScript = readFileSync(new URL("../public/admin-practice.js", import.meta.url), "utf8");
function gameFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  const body = html.indexOf("{", start);
  let depth = 1, end = body + 1;
  while (depth && end < html.length) {
    if (html[end] === "{") depth++;
    if (html[end] === "}") depth--;
    end++;
  }
  return html.slice(start, end);
}
function sandbox(practice = true) {
  const storage = new Map([["account", JSON.stringify({ name: "Original", ownedClasses: ["warrior"], gold: 37 })]]);
  const accesses = [], messages = [];
  const context = vm.createContext({
    PRACTICE_ONLY: practice, GUEST_TRIAL: practice, PROFILE_KEY: "account",
    CLASS_STATS: { warrior: {}, priest: {}, futureClass: {} },
    CLASS_TALENTS: { warrior: [{ id: "a" }, { id: "b" }], priest: [{ id: "c" }] },
    RACIAL_KEYS: ["nightelf", "orc"],
    CUSTOM_ABILITIES: { warrior: {}, priest: {} }, CUSTOM_ULTS: { warrior: {} },
    collectibleId: (kind, key) => `${kind}:${key}`,
    playerProfile: null, state: { _progressAwarded: false },
    localStorage: {
      getItem(key) { accesses.push(["get", key]); return storage.get(key) ?? null; },
      setItem(key, value) { accesses.push(["set", key]); storage.set(key, value); },
      removeItem(key) { accesses.push(["remove", key]); storage.delete(key); },
    },
    window: { parent: { postMessage(message) { messages.push(message); } } },
    location: { origin: "https://example.test" },
    updateAccountUI() {},
  });
  const names = ["createPracticeProfile", "loadPlayerProfile", "savePlayerProfile",
    "awardMatchProgress", "persistPendingTournament", "loadPendingTournament",
    "loadAIRivals", "saveAIRivals", "applyAuthoritativeProfile"];
  vm.runInContext(names.map(gameFunction).join("\n"), context);
  return { context, storage, accesses, messages };
}

test("practice grants every catalog entitlement without admin privileges or currency", () => {
  const { context } = sandbox();
  const profile = context.createPracticeProfile();
  assert.deepEqual(Array.from(profile.ownedClasses), ["warrior", "priest", "futureClass"]);
  assert.deepEqual(Array.from(profile.ownedRacials), ["nightelf", "orc"]);
  assert.deepEqual(Array.from(profile.ownedSpells), ["ability:warrior", "ability:priest"]);
  assert.deepEqual(Array.from(profile.ownedUltimates), ["ult:warrior"]);
  assert.deepEqual(Array.from(profile.unlockedTalents.warrior), ["a", "b"]);
  assert.deepEqual(Array.from(profile.unlockedTalents.priest), ["c"]);
  assert.equal(profile.gold, 0);
  assert.equal(profile.isAdmin, false);
  assert.equal(profile.activeBuild, undefined);
  assert.equal(profile.defenseTeam, null);
});

test("practice loads fresh in-memory state and never reads or saves account/guest storage", () => {
  const { context, storage, accesses, messages } = sandbox();
  const before = JSON.stringify([...storage]);
  context.loadPlayerProfile();
  const first = context.playerProfile;
  first.gold = 200;
  first.skins.warrior = "royalVanguard";
  context.savePlayerProfile();
  context.loadPlayerProfile();
  assert.notEqual(context.playerProfile, first);
  assert.equal(context.playerProfile.gold, 0);
  assert.equal(context.playerProfile.skins.warrior, undefined);
  assert.equal(JSON.stringify([...storage]), before);
  assert.deepEqual(accesses, []);
  assert.deepEqual(messages, []);
});

test("normal account load/save still uses its original persistence bridge", () => {
  const { context, accesses, messages } = sandbox(false);
  context.loadPlayerProfile();
  assert.equal(context.playerProfile.name, "Original");
  assert.equal(context.playerProfile.gold, 37);
  context.savePlayerProfile();
  assert.deepEqual(accesses.map(([action]) => action), ["get", "set"]);
  assert.equal(messages[0].type, "arena:profile-save");
});

test("practice does not load, clear or mutate shared tournament/ladder recovery", () => {
  const { context, accesses } = sandbox();
  context.persistPendingTournament({ serverTournamentId: "leave-me-alone" });
  context.persistPendingTournament(null);
  context.loadPendingTournament();
  assert.equal(context.loadAIRivals().length, 0);
  context.saveAIRivals([{ id: "practice" }]);
  assert.deepEqual(accesses, []);
});

test("practice ignores authoritative profile snapshots and never awards account progress", () => {
  const { context, accesses, messages } = sandbox();
  context.loadPlayerProfile();
  context.applyAuthoritativeProfile({ gold: 400, ownedClasses: ["warrior"] });
  assert.equal(context.playerProfile.gold, 0);
  assert.equal(context.playerProfile.ownedClasses.length, 3);
  context.awardMatchProgress("Victory!");
  assert.equal(context.playerProfile.battleWins, 0);
  assert.equal(context.awardMatchProgress("Victory!"), null);
  assert.deepEqual(accesses, []);
  assert.deepEqual(messages, []);
});

test("practice skips the guest three-match counter entirely", () => {
  const { context, accesses, messages } = sandbox();
  const script = html.match(/<script id="guest-quick-match-trial">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  vm.runInContext(script, context);
  assert.deepEqual(accesses, []);
  assert.deepEqual(messages, []);
});

test("practice allows local fights but rejects ranked and tournament starts", () => {
  const { context, messages } = sandbox();
  const calls = [], toasts = [];
  context.document = { querySelector: () => ({ textContent: "" }) };
  context.startBattle = opts => { calls.push(opts); return "local"; };
  context.startTournament = () => { throw new Error("Paid tournament must not start"); };
  context.showUnlockToast = text => toasts.push(text);
  vm.runInContext(adminScript, context);
  assert.equal(context.startBattle({ rematch: true }), "local");
  context.startBattle({ onlineChallenge: true });
  context.startBattle({ tournament: true });
  context.startTournament();
  assert.equal(calls.length, 1);
  assert.equal(toasts.length, 3);
  assert.deepEqual(messages.map(message => message.type), ["arena:practice-ready"]);
});