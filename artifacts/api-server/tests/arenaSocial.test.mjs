import assert from "node:assert/strict";
import { testAuth } from "./support/auth.mjs";
import {rankedModeFixture} from './rankedModeFixture.mjs';
import {squadRatingFixture} from './squadRatingFixture.mjs';
import {prestigeFixture} from './prestigeFixture.mjs';
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";

const require = createRequire(new URL("../package.json", import.meta.url));
const { transformSync } = require("esbuild");
const schemaSource = readFileSync(new URL("../../../lib/api-zod/src/generated/api.ts", import.meta.url), "utf8");
const schemaModule = { exports: {} };
vm.runInNewContext(transformSync(schemaSource, { loader: "ts", format: "cjs" }).code, {
  module: schemaModule,
  exports: schemaModule.exports,
  require: name => {
    assert.equal(name, "zod");
    return createRequire(new URL("../../../lib/api-zod/package.json", import.meta.url))("zod");
  },
});

const ids = Array.from({ length: 8 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
const now = new Date("2025-01-01T00:00:00.000Z");
const profile = (id, name) => ({ id, name, rating: 1200, wins: 4, losses: 2, defense: {}, isBot: false,
  rating2:1000,wins2:0,losses2:0,defense2:null,defenseUpdatedAt:null,defenseUpdatedAt2:null,state:{} });
const challenge = (id, attackerId, defenderId, n) => ({
  teamSize:3,
  id, attackerId, defenderId, status: "completed", outcome: n % 2 ? "win" : "loss",
  attackerRatingDelta: 12, createdAt: new Date(now.getTime() - n * 1000),
  resolvedAt: new Date(now.getTime() - n * 1000), recordingPath: `/replay/${id}`,
  recordingContentType: "application/vnd.arena.replay+json",
});

function setup({ featuredCount = 0, ownerDefense = undefined } = {}) {
  const tables = {
    challenges: { id: "challenge.id",teamSize:"challenge.teamSize", attackerId: "challenge.attackerId", defenderId: "challenge.defenderId",
      status: "challenge.status", recordingPath: "challenge.recordingPath", createdAt: "challenge.createdAt" },
    featured: { playerId: "featured.playerId", challengeId: "featured.challengeId", createdAt: "featured.createdAt" },
    profiles: { id: "profile.id", name: "profile.name", isBot: "profile.isBot", rating: "profile.rating", wins: "profile.wins" },
    notifications: { id: "notification.id", playerId: "notification.playerId", readAt: "notification.readAt",
      createdAt: "notification.createdAt",direction:"notification.direction" },
  };
  const profiles = [profile("viewer", "Viewer"), profile("owner", "Owner"), profile("opponent", "Opponent"),
    profile("stranger", "Stranger")];
  if (ownerDefense !== undefined) profiles[1].defense = ownerDefense;
  const matches = Array.from({ length: 6 }, (_, index) => challenge(ids[index], "owner", "opponent", index + 1));
  const saved = matches.slice(matches.length - featuredCount).map((match, index) => ({
    playerId: "owner", challengeId: match.id, createdAt: new Date(now.getTime() - index * 1000),
  }));
  const notifications = [
    { id: ids[5], challengeId: ids[0], playerId: "viewer", opponentId: "owner", opponentName: "Owner",
      direction: "incoming", outcome: "win", ratingDelta: 12, gold: 50, drops: [], losses: [], createdAt: now, readAt: null },
    { id: ids[6], challengeId: ids[1], playerId: "stranger", opponentId: "owner", opponentName: "Owner",
      direction: "incoming", outcome: "loss", ratingDelta: -12, gold: 0, drops: [], losses: [], createdAt: now, readAt: null },
    { id: ids[7], challengeId: ids[2], playerId: "viewer", opponentId: "owner", opponentName: "Owner",
      direction: "outgoing", outcome: "loss", ratingDelta: -12, gold: 5, drops: [], losses: [], createdAt: now, readAt: now },
  ];
  const tableByColumn = new Map();
  for (const table of Object.values(tables)) for (const field of Object.values(table)) tableByColumn.set(field, table);
  const getRows = table => table === tables.challenges ? matches : table === tables.profiles ? profiles :
    table === tables.featured ? saved : table === tables.notifications ? notifications : [];
  const rowForField = (context, field) => context.get(tableByColumn.get(field));
  const matchesCondition = (context, condition) => {
    if (condition == null) return true;
    if (Array.isArray(condition)) return condition.every(item => matchesCondition(context, item));
    const row = rowForField(context, condition.field);
    const value = row?.[condition.field?.split(".").at(-1)];
    switch (condition.op) {
      case "eq": return value === (tableByColumn.has(condition.value)
        ? rowForField(context, condition.value)?.[condition.value.split(".").at(-1)] : condition.value);
      case "ne": return value !== condition.value;
      case "in": return condition.values.includes(value);
      case "notNull": return value != null;
      case "isNull": return value == null;
      case "ilike": return condition.pattern.test(String(value ?? ""));
      case "or": return condition.items.some(item => matchesCondition(context, item));
      default: return true;
    }
  };
  const project = (projection, context) => {
    if (!projection) return [...context.values()][0];
    return Object.fromEntries(Object.entries(projection).map(([key, field]) => {
      if (field && typeof field === "object" && field.id && tableByColumn.has(field.id)) {
        return [key, rowForField(context, field.id)];
      }
      return [key, field && typeof field === "object" ?
        rowForField(context, field)?.[field.split(".").at(-1)] : undefined];
    }));
  };
  const makeQuery = (projection, base, initialContexts) => {
    let contexts = initialContexts;
    const query = {
      innerJoin: (table, on) => {
        contexts = contexts.flatMap(context => getRows(table).map(row => new Map(context).set(table, row))
          .filter(context => matchesCondition(context, on)));
        return query;
      },
      where: condition => { contexts = contexts.filter(context => matchesCondition(context, condition)); return query; },
      orderBy: (...sorts) => {
        contexts.sort((a, b) => {
          for (const sort of sorts) {
            const field = sort?.field;
            const left = rowForField(a, field)?.[field?.split(".").at(-1)];
            const right = rowForField(b, field)?.[field?.split(".").at(-1)];
            const result = left > right ? 1 : left < right ? -1 : 0;
            if (result) return sort.direction === "asc" ? result : -result;
          }
          return 0;
        });
        return query;
      },
      limit: amount => { contexts = contexts.slice(0, amount); return query; },
      for: () => query,
      then: (resolve, reject) => Promise.resolve(projection && "total" in projection
        ? [{ total: contexts.length }]
        : contexts.map(context => project(projection, context))).then(resolve, reject),
    };
    return query;
  };
  const db = {
    select: projection => ({
      from: table => makeQuery(projection, table, getRows(table).map(row => new Map([[table, row]]))),
    }),
    update: table => ({
      set: values => ({
        where: condition => ({
          returning: async projection => {
            const changed = [];
            for (const row of getRows(table)) {
              const context = new Map([[table, row]]);
              if (matchesCondition(context, condition) && row.readAt == null) {
                Object.assign(row, values);
                changed.push(projection ? project(projection, context) : row);
              }
            }
            return changed;
          },
        }),
      }),
    }),
    insert: table => ({
      values: values => ({
        onConflictDoNothing: async () => undefined,
        then: (resolve, reject) => Promise.resolve().then(() => {
          if (table === tables.featured) saved.push(...(Array.isArray(values) ? values : [values]));
        }).then(resolve, reject),
      }),
    }),
    transaction: fn => fn(db),
  };
  const router = {
    middleware: [],
    routes: new Map(),
    use(fn) { this.middleware.push(fn); },
    get(path, fn) { this.routes.set(`GET ${path}`, fn); },
    post(path, fn) { this.routes.set(`POST ${path}`, fn); },
    delete(path, fn) { this.routes.set(`DELETE ${path}`, fn); },
  };
  const module = { exports: {} };
  const imports = {
    "../lib/prestigeRewards":prestigeFixture,
    "@clerk/express": testAuth,
    "@workspace/api-zod": schemaModule.exports,
    "@workspace/db": {
      arenaChallengesTable: tables.challenges, arenaFeaturedMatchesTable: tables.featured,
      arenaNotificationsTable: tables.notifications, arenaProfilesTable: tables.profiles, db,
    },
    "drizzle-orm": {
      and: (...items) => items.filter(Boolean),
      desc: field => ({ field, direction: "desc" }),
      eq: (field, value) => ({ op: "eq", field, value }),
      ilike: (field, pattern) => ({ op: "ilike", field, pattern: new RegExp(`^${pattern.split("%").map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i") }),
      inArray: (field, values) => ({ op: "in", field, values }),
      isNotNull: field => field === undefined ? undefined : ({ op: "notNull", field }),
      isNull: field => ({ op: "isNull", field }),
      ne: (field, value) => ({ op: "ne", field, value }),
      or: (...items) => ({ op: "or", items }),
      sql: () => ({}),
    },
    express: { Router: () => router },
    "../lib/economy": { lockEconomyAccounts: async () => undefined },
    "../lib/rankedBattle": { parseRankedTeam: value =>
      Array.isArray(value.heroes) && value.heroes.length === 3 &&
      value.heroes.every(hero => typeof hero?.classId === "string") &&
      (value.captainClass == null || value.heroes.some(hero => hero.classId === value.captainClass))
        ? value : null },
    "../lib/replayRetention": { pruneReplayIfUnneeded: async () => undefined },
  };
  const source = readFileSync(new URL("../src/routes/arena-social.ts", import.meta.url), "utf8");
  imports["../lib/squadRatings"]=squadRatingFixture;
  imports["../lib/arenaMode"]=rankedModeFixture(tables.profiles);
  tables.challenges.teamSize=tables.challenges.id.replace(/\.id$/,'.teamSize');
  vm.runInNewContext(transformSync(source, { loader: "ts", format: "cjs" }).code, {
    module, exports: module.exports, require: name => {
      assert.ok(imports[name], `unexpected import ${name}`);
      return imports[name];
    },
  });
  async function request(method, path, { userId = "viewer", params = {}, query = {}, body = {} } = {}) {
    const req = { userId, params, query, body };
    const res = {
      locals: {}, statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };
    let allowed = true;
    for (const middleware of router.middleware) middleware(req, res, () => {});
    if (res.statusCode === 401) allowed = false;
    if (allowed) await router.routes.get(`${method} ${path}`)(req, res);
    return res;
  }
  return { request, saved, matches, notifications };
}

test("signed-in profile search and access expose only public profile data", async () => {
  const h = setup();
  assert.equal((await h.request("GET", "/arena/profiles", { userId: null })).statusCode, 401);
  const search = await h.request("GET", "/arena/profiles", { query: { search: "owner" } });
  assert.equal(search.statusCode, 200);
  assert.deepEqual([...search.body.map(player => player.playerId)], ["owner"]);
  const missing = await h.request("GET", "/arena/profiles/:playerId", { params: { playerId: "missing" } });
  assert.equal(missing.statusCode, 404);
  assert.equal((await h.request("GET", "/arena/profiles/:playerId", { userId: null, params: { playerId: "owner" } })).statusCode, 401);
  assert.equal("state" in (await h.request("GET", "/arena/profiles/:playerId", {
    params: { playerId: "owner" },
  })).body, false);
});

test("profile privacy shows only featured replays publicly and up to three recent replays to the owner", async () => {
  const h = setup({ featuredCount: 1 });
  const publicView = await h.request("GET", "/arena/profiles/:playerId", { userId: "viewer", params: { playerId: "owner" } });
  assert.equal(publicView.statusCode, 200);
  assert.equal(publicView.body.isOwnProfile, false);
  assert.equal(publicView.body.featuredMatches.length, 1);
  assert.deepEqual(publicView.body.recentMatches, []);
  const ownView = await h.request("GET", "/arena/profiles/:playerId", { userId: "owner", params: { playerId: "owner" } });
  assert.equal(ownView.statusCode, 200);
  assert.equal(ownView.body.isOwnProfile, true);
  assert.equal(ownView.body.recentMatches.length, 3);
  assert.equal(ownView.body.recentMatches.every(match => match.featured === false), true);
});

test("public profiles show only the published defender characters and captain", async () => {
  const h = setup({ ownerDefense: {
    heroes: [
      { classId: "priest", ability: "custom", ultimate: "custom", talents: ["private-talent"] },
      { classId: "warrior", ability: "default", ultimate: "custom" },
      { classId: "shaman", ability: "custom", ultimate: "default" },
    ],
    captainClass: "priest", captainRacial: "nightelf",
  } });
  const result = await h.request("GET", "/arena/profiles/:playerId", {
    userId: "viewer", params: { playerId: "owner" },
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.defensePublished, true);
  assert.deepEqual(result.body.defenseTeam, {
    heroes: [{ classId: "priest" }, { classId: "warrior" }, { classId: "shaman" }],
    captainClass: "priest",
  });
  assert.equal("state" in result.body, false);

  const noDefense = setup({ ownerDefense: null });
  const missing = await noDefense.request("GET", "/arena/profiles/:playerId", {
    userId: "viewer", params: { playerId: "owner" },
  });
  assert.equal(missing.body.defensePublished, false);
  assert.equal(missing.body.defenseTeam, null);
});

test("featured replay saves require authentication, ownership, and stay within a five-match quota", async () => {
  const fresh = setup();
  const saved = await fresh.request("POST", "/arena/challenges/:challengeId/feature", {
    userId: "owner", params: { challengeId: ids[0] },
  });
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(fresh.saved.map(row => [row.playerId, row.challengeId]), [
    ["owner", ids[0]],
  ]);

  const h = setup({ featuredCount: 5 });
  assert.equal((await h.request("POST", "/arena/challenges/:challengeId/feature", {
    userId: null, params: { challengeId: ids[5] },
  })).statusCode, 401);
  const unauthorized = await h.request("POST", "/arena/challenges/:challengeId/feature", {
    userId: "stranger", params: { challengeId: ids[0] },
  });
  assert.equal(unauthorized.statusCode, 404);
  const full = await h.request("POST", "/arena/challenges/:challengeId/feature", {
    userId: "owner", params: { challengeId: ids[0] },
  });
  assert.equal(full.statusCode, 409);
  assert.equal(h.saved.length, 5);
});

test("unread notifications are per-user and dismissal only marks that user's unread IDs", async () => {
  const h = setup();
  assert.equal((await h.request("GET", "/arena/notifications", { userId: null })).statusCode, 401);
  const unread = await h.request("GET", "/arena/notifications", { userId: "viewer" });
  assert.equal(unread.statusCode, 200);
  assert.deepEqual([...unread.body.map(row => row.id)], [ids[5]]);
  const dismissed = await h.request("POST", "/arena/notifications/read", {
    userId: "viewer", body: { ids: [ids[5], ids[6]] },
  });
  assert.equal(dismissed.statusCode, 200);
  assert.equal(dismissed.body.markedCount, 1);
  assert.ok(h.notifications.find(row => row.id === ids[5]).readAt);
  assert.equal(h.notifications.find(row => row.id === ids[6]).readAt, null);
});
test("profile search accepts the HTTP string 2v2 query and shows the independent duo record",async()=>{
  const h=setup();
  const result=await h.request("GET","/arena/profiles",{userId:"viewer",query:{teamSize:"2"}});
  assert.equal(result.statusCode,200);
  assert.ok(result.body.length>0);
  for(const row of result.body){
    assert.equal(row.rating,1000);assert.equal(row.wins,0);assert.equal(row.losses,0);
  }
});
test("legacy active-attacker notices remain hidden from the meaningful account notification list",async()=>{
  const h=setup();
  h.notifications.push({...h.notifications[0],id:ids[7],direction:"outgoing"});
  const result=await h.request("GET","/arena/notifications",{userId:"viewer"});
  assert.deepEqual([...result.body.map(row=>row.id)],[ids[5]]);
});