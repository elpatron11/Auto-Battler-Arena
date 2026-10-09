import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import { transformSync } from "esbuild";
import {rankedModeFixture} from './rankedModeFixture.mjs';
import {squadRatingFixture} from './squadRatingFixture.mjs';
import {prestigeFixture} from './prestigeFixture.mjs';

const require = createRequire(new URL("../package.json", import.meta.url));
const express = require("express");
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

const tables = {
  challenges: {
    id: "challenge.id",
    attackerId: "challenge.attackerId",
    defenderId: "challenge.defenderId",
    status: "challenge.status",
    outcome: "challenge.outcome",
    resolvedAt: "challenge.resolvedAt",
  },
  profiles: { id: "profile.id", name: "profile.name" },
};

const profiles = [
  { id: "viewer-a", name: "Viewer A" },
  { id: "viewer-b", name: "Viewer B" },
  { id: "rival", name: "Mapped Rival" },
  { id: "viewer-b-opponent", name: "Viewer B's Opponent" },
];
const matches = [];
let sequence = 0;
function addMatch(attackerId, defenderId, outcome, status = "completed") {
  sequence += 1;
  matches.push({
    id: `match-${sequence}`,teamSize:3,
    attackerId,
    defenderId,
    outcome,
    status,
    resolvedAt: new Date(Date.UTC(2025, 0, 1, 0, 0, sequence)),
  });
}

// Both orientations contribute to viewer-a's local record, including draws.
addMatch("viewer-a", "rival", "win");
addMatch("viewer-a", "rival", "loss");
addMatch("viewer-a", "rival", "draw");
addMatch("rival", "viewer-a", "loss");
addMatch("rival", "viewer-a", "win");
addMatch("rival", "viewer-a", "draw");
// Push the lifetime record past the route's recent-match limit.
for (let i = 0; i < 23; i += 1) addMatch("viewer-a", "rival", "win");
for (let i = 0; i < 23; i += 1) addMatch("rival", "viewer-a", "win");
for (let i = 0; i < 2; i += 1) addMatch("viewer-a", "rival", "draw");
addMatch("viewer-a", "rival", "win", "pending");
addMatch("unrelated-player", "rival", "win");
addMatch("viewer-b", "viewer-b-opponent", "win");

function matchesCondition(row, condition) {
  if (!condition) return true;
  if (Array.isArray(condition)) return condition.every(item => matchesCondition(row, item));
  if (condition.op === "or") return condition.items.some(item => matchesCondition(row, item));
  if (condition.op === "eq") return row[condition.field.split(".").at(-1)] === condition.value;
  if (condition.op === "in") return condition.values.includes(row[condition.field.split(".").at(-1)]);
  return true;
}

function participantId(condition) {
  if (Array.isArray(condition)) {
    for (const item of condition) {
      const found = participantId(item);
      if (found) return found;
    }
  }
  if (condition?.op === "or") return participantId(condition.items);
  if (condition?.field === tables.challenges.attackerId || condition?.field === tables.challenges.defenderId) {
    return condition.value;
  }
  return undefined;
}

const db = {
  select: projection => ({
    from: table => {
      let condition;
      const query = {
        where(value) {
          condition = value;
          return query;
        },
        groupBy() {
          return query;
        },
        orderBy() {
          return query;
        },
        then(resolve, reject) {
          try {
            const rows = table === tables.challenges ? matches : profiles;
            const filtered = rows.filter(row => matchesCondition(row, condition));
            if (table === tables.challenges && projection && "opponentId" in projection) {
              const viewerId = participantId(condition);
              const byOpponent = new Map();
              for (const row of filtered) {
                const opponentId = row.attackerId === viewerId ? row.defenderId : row.attackerId;
                const record = byOpponent.get(opponentId) ?? {
                  opponentId, wins: 0, losses: 0, draws: 0, totalGames: 0,
                };
                record.totalGames += 1;
                if (row.outcome === "draw") record.draws += 1;
                else {
                  const viewerWon = row.attackerId === viewerId
                    ? row.outcome === "win"
                    : row.outcome === "loss";
                  if (viewerWon) record.wins += 1;
                  else record.losses += 1;
                }
                byOpponent.set(opponentId, record);
              }
              return Promise.resolve([...byOpponent.values()]).then(resolve, reject);
            }
            return Promise.resolve(filtered.map(row => ({ id: row.id, name: row.name }))).then(resolve, reject);
          } catch (error) {
            return Promise.reject(error).then(resolve, reject);
          }
        },
      };
      return query;
    },
  }),
  insert: () => ({
    values: () => ({ onConflictDoNothing: () => Promise.resolve() }),
  }),
};

const module = { exports: {} };
const imports = {
  "../lib/prestigeRewards":prestigeFixture,
  "@clerk/express": { getAuth: req => ({ userId: req.header("x-user-id") }) },
  "@workspace/api-zod": schemaModule.exports,
  "@workspace/db": {
    arenaChallengesTable: tables.challenges,
    arenaEconomyRewardsTable: {},
    arenaFeaturedMatchesTable: {},
    arenaNotificationsTable: {},
    economyDuplicatesTable: {},
    economyListingsTable: {},
    economyMigrationsTable: {},
    economyTournamentRunsTable: {},
    economyUnlocksTable: {},
    economyWalletsTable: {},
    arenaProfilesTable: tables.profiles,
    db,
  },
  "drizzle-orm": {
    and: (...items) => items,
    asc: value => value,
    desc: value => value,
    eq: (field, value) => ({ op: "eq", field, value }),
    gte: () => ({}),
    inArray: (field, values) => ({ op: "in", field, values }),
    isNotNull: () => ({}),
    isNull: () => ({}),
    ne: () => ({}),
    or: (...items) => ({ op: "or", items }),
    sql: () => ({}),
  },
  express: { Router: () => express.Router() },
  "../lib/rankedBattle": { parseRankedTeam() {}, resolveRankedBattle() {} },
  "../lib/arenaAutoDefense": { autoDefenseCandidates: () => [] },
  "../lib/replayRetention": { pruneReplaysForPlayers: async () => undefined },
  "../lib/logger": { logger: { warn() {}, error() {} } },
  "../lib/economy": {
    CLASS_IDS: [],
    CLASS_TALENTS: {},
    ECONOMY: { antiFarming: {}, arenaGold: {} },
    isCanonicalCollectible: () => false,
    lockEconomyAccounts: async () => undefined,
    boundedGoldCredit: (_balance, credit) => credit,
    MAX_GOLD: 2_147_483_647,
    RACIAL_IDS: [],
    rollArenaDrops: () => [],
    selectDuplicateLossCopy: () => null,
  },
  "./economy": { initializeEconomy: async () => undefined },
  "../lib/arenaMatchmaking": {
    ARENA_BOTS: [],
    botDefense: () => ({}),
    chooseRandomEligibleOpponent: () => null,
    DAILY_OPPONENT_CHALLENGE_LIMIT: 5,
    utcDayStart: () => new Date(),
  },
};
imports["../lib/hourlyDungeon"] = { getDungeonStatus: async () => ({ activeBuff: null }) };
imports["../lib/arenaRanks"] = {awardRankMilestones:async()=>undefined,rankMilestoneReceipt:async()=>[],arenaRankLabel:()=>''};
const source = readFileSync(new URL("../src/routes/arena.ts", import.meta.url), "utf8");
imports["../lib/squadRatings"]=squadRatingFixture;
imports["../lib/arenaMode"]=rankedModeFixture(tables.profiles);
tables.challenges.teamSize="challenge.teamSize";
vm.runInNewContext(transformSync(source, { loader: "ts", format: "cjs" }).code, {
  module,
  exports: module.exports,
  require: name => {
    assert.ok(imports[name], `unexpected import ${name}`);
    return imports[name];
  },
});

test("GET /arena/opponents returns isolated lifetime records with local outcomes and mapped names", async () => {
  const app = express();
  app.use(express.json());
  app.use(module.exports.default);
  const server = app.listen(0);
  try {
    await new Promise(resolve => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}/arena/opponents`;
    const request = userId => fetch(url, {
      headers: userId ? { "x-user-id": userId } : {},
    });

    assert.equal((await request(null)).status, 401);

    const viewerAResponse = await request("viewer-a");
    assert.equal(viewerAResponse.status, 200);
    const viewerARecords = await viewerAResponse.json();
    assert.deepEqual(viewerARecords, [{
      opponentId: "rival",
      opponentName: "Mapped Rival",
      wins: 25,
      losses: 25,
      draws: 4,
      totalGames: 54,
      winRate: 46,
    }]);

    const viewerBResponse = await request("viewer-b");
    assert.equal(viewerBResponse.status, 200);
    assert.deepEqual(await viewerBResponse.json(), [{
      opponentId: "viewer-b-opponent",
      opponentName: "Viewer B's Opponent",
      wins: 1,
      losses: 0,
      draws: 0,
      totalGames: 1,
      winRate: 100,
    }]);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});