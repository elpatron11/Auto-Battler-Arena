import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import { transformSync } from "esbuild";
import {rankedModeFixture} from './rankedModeFixture.mjs';
import {prestigeFixture} from './prestigeFixture.mjs';

const require = createRequire(new URL("../package.json", import.meta.url));
const express = require("express");
const schemaSource = readFileSync(new URL("../../../lib/api-zod/src/generated/api.ts", import.meta.url), "utf8");
const schemaModule = { exports: {} };
vm.runInNewContext(transformSync(schemaSource, { loader: "ts", format: "cjs" }).code, {
  module: schemaModule, exports: schemaModule.exports,
  require: name => {
    assert.equal(name, "zod");
    return createRequire(new URL("../../../lib/api-zod/package.json", import.meta.url))("zod");
  },
});

const challengeId = "11111111-1111-4111-8111-111111111111";
const tables = {
  challenges: { id: "challenge.id" },
  profiles: { id: "profile.id" },
  rewards: { challengeId: "reward.challengeId" },
  wallets: { playerId: "wallet.playerId" },
  notifications: { id: "notification.id" },
  rankMilestones: {playerId:"milestone.playerId",challengeId:"milestone.challengeId",rank:"milestone.rank"},
};
const challenge = {
  teamSize:3,
  id: challengeId,
  attackerId: "attacker",
  defenderId: "defender",
  status: "completed",
  outcome: "win",
  localOutcome: null,
  attackerRatingDelta: 8,
  summary: null,
  attack: {},
  defense: {},
};
const attacker = { id: "attacker", rating: 1008, wins: 1, losses: 0 };
const defender = { id: "defender", name: "Defender", rating: 992, wins: 0, losses: 1, isBot: false };
const reward = {
  challengeId,
  gold: 30,
  drops: [{ kind: "spell", itemId: "ability:rogue", duplicate: false }],
  losses: [],
};
const wallets = new Map([["attacker", { playerId: "attacker", gold: 0 }], ["defender", { playerId: "defender", gold: 0 }]]);
let rewardWrites = 0;
let farmingHistory = [];
const notifications = [];
const duplicateRows = [];
const unlockRows = [];
const milestoneRows=[];
const tx = {
  select: () => ({
    from: table => ({
      where: condition => {
        if(table===tables.rankMilestones)return Promise.resolve(milestoneRows.filter(row=>
          condition.every(c=>row[c.field.split('.')[1]]===c.value)));
        if (table === tables.rewards && Array.isArray(condition)) {
          return { orderBy: () => ({ limit: async () => farmingHistory.length ? farmingHistory : rewardWrites ? [reward] : [] }) };
        }
        if (table === tables.notifications && Array.isArray(condition)) {
          return { orderBy: () => ({ limit: async () => farmingHistory }) };
        }
        const field = condition?.field;
        const row = table === tables.challenges ? challenge :
          table === tables.rewards ? reward :
          table === tables.wallets ? [...wallets.values()].find(item => item.playerId === condition?.value) :
          table === tables.notifications ? notifications :
          field === tables.profiles.id ? (condition.value === "attacker" ? attacker : defender) :
          field === tables.duplicates?.playerId ? duplicateRows :
          field === tables.unlocks?.playerId ? unlockRows : undefined;
        const rows = Array.isArray(row) ? row : row ? [row] : [];
        const query = Promise.resolve(rows);
        query.for = () => query;
        query.orderBy = () => ({ for: async () => [attacker, defender] });
        return query;
      },
    }),
  }),
  update: table => ({ set: values => ({
    where: async condition => {
      if (table === tables.challenges) Object.assign(challenge, values);
      if (table === tables.profiles) Object.assign(condition.value === "attacker" ? attacker : defender, values);
      if (table === tables.wallets) Object.assign(wallets.get(condition.value), values);
    },
  }) }),
  insert: table => ({
    values: values => ({
      onConflictDoNothing: () => {
        if(table===tables.rankMilestones)return {returning:async()=>{
          if(milestoneRows.some(row=>row.playerId===values.playerId&&row.rank===values.rank))return [];
          milestoneRows.push({...values});return [values];
        }};
        if (table === tables.unlocks) unlockRows.push(values);
        if (table === tables.duplicates) duplicateRows.push(values);
        return Promise.resolve();
      },
      then: (resolve, reject) => Promise.resolve().then(() => {
        if (table === tables.rewards) {
          rewardWrites++;
          Object.assign(reward, values);
        }
        if (table === tables.notifications) notifications.push(values);
        if (table === tables.unlocks) unlockRows.push(values);
      }).then(resolve, reject),
    }),
  }),
};
const module = { exports: {} };
const imports = {
  "../lib/prestigeRewards":prestigeFixture,
  "./prestigeRewards":prestigeFixture,
  "@clerk/express": { getAuth: req => ({ userId: req.header("x-user-id") }) },
  "@workspace/api-zod": schemaModule.exports,
  "@workspace/db": {
    arenaChallengesTable: tables.challenges,
    arenaEconomyRewardsTable: tables.rewards,
    arenaNotificationsTable: tables.notifications,
    economyDuplicatesTable: tables.duplicates = { playerId: "duplicate.playerId" },
    economyListingsTable: tables.listings = { sellerId: "listing.sellerId" },
    economyUnlocksTable: tables.unlocks = { playerId: "unlock.playerId" },
    economyWalletsTable: tables.wallets,
    arenaProfilesTable: tables.profiles,
    arenaRankMilestonesTable: tables.rankMilestones,
    db: {
      transaction: fn => fn(tx),
      update:()=>({set:()=>({where:async()=>undefined})}),
      insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
    },
  },
  "drizzle-orm": {
    and: (...conditions) => conditions,
    asc: value => value,
    desc: value => value,
    eq: (field, value) => ({ field, value }),
    gte: () => ({}),
    inArray: () => ({}),
    isNotNull: () => ({}),
    isNull: () => ({}),
    ne: () => ({}),
    or: () => ({}),
    sql: () => ({}),
  },
  express: { Router: () => express.Router() },
  "../lib/rankedBattle": { parseRankedTeam() {}, resolveRankedBattle() {} },
  "../lib/arenaAutoDefense": { autoDefenseCandidates: () => [] },
  "../lib/replayRetention": { pruneReplaysForPlayers: async () => undefined },
  "../lib/logger": { logger: { warn() {}, error() {} } },
  "../lib/economy": {
    CLASS_IDS: [], CLASS_TALENTS: {}, ECONOMY: {
      antiFarming: { windowMs: 60000, cooldownMs: 60000, repeatCount: 3 },
      arenaGold: { win: 25, loss: 5 },
    }, isCanonicalCollectible: () => false, lockEconomyAccounts: async () => undefined,
    boundedGoldCredit: (_balance, credit) => credit,
    MAX_GOLD: 2_147_483_647, RACIAL_IDS: [],
    rollArenaDrops: outcome => outcome === "win" ? [{ kind: "spell", itemId: "ability:rogue" }] : [],
    selectDuplicateLossCopy: () => null,
  },
  "./economy": { initializeEconomy: async () => undefined },
  "../lib/hourlyDungeon": { getDungeonStatus: async () => ({ activeBuff: null }) },
  "../lib/arenaMatchmaking": {
    ARENA_BOTS: [], botDefense: () => ({}), chooseRandomEligibleOpponent: () => null,
    DAILY_OPPONENT_CHALLENGE_LIMIT: 5, utcDayStart: () => new Date(),
  },
};
const source = readFileSync(new URL("../src/routes/arena.ts", import.meta.url), "utf8");
const squadModule={exports:{}};
vm.runInNewContext(transformSync(readFileSync(new URL("../src/lib/squadRatings.ts",import.meta.url),"utf8"),{loader:"ts",format:"cjs"}).code,{module:squadModule,exports:squadModule.exports});
imports["../lib/squadRatings"]=squadModule.exports;
const ranksModule={exports:{}};
vm.runInNewContext(transformSync(readFileSync(new URL("../src/lib/arenaRanks.ts",import.meta.url),"utf8"),{loader:"ts",format:"cjs"}).code,{
  module:ranksModule,exports:ranksModule.exports,
  require:name=>imports[name==="./economy"?"../lib/economy":name],
});
imports["../lib/arenaRanks"]=ranksModule.exports;
test("server rank thresholds match the frontend and divisions use rating, not position",()=>{
  const frontend=JSON.parse(readFileSync(new URL("../../auto-battler-arena/src/lib/arena-ranks.json",import.meta.url),"utf8"));
  assert.deepEqual(JSON.parse(JSON.stringify(ranksModule.exports.ARENA_RANKS)),frontend);
  for(const [rating,label]of [[1000,"Bronze I"],[1200,"Silver III"],[1267,"Silver II"],[1334,"Silver I"],[2000,"Master"],[2200,"Grandmaster"]])
    assert.equal(ranksModule.exports.arenaRankLabel(rating),label);
});
test("milestone claims pay once across repeated settlements and demotion/re-promotion",async()=>{
  wallets.set("milestone-test",{playerId:"milestone-test",gold:0});
  const rank=ranksModule.exports;
  await rank.awardRankMilestones(tx,"milestone-test",challengeId,1199,1201);
  assert.equal(wallets.get("milestone-test").gold,100);
  await rank.awardRankMilestones(tx,"milestone-test",challengeId,1199,1201);
  await rank.awardRankMilestones(tx,"milestone-test","22222222-2222-4222-8222-222222222222",1199,1201);
  assert.equal(wallets.get("milestone-test").gold,100);
  await rank.awardRankMilestones(tx,"milestone-test",challengeId,1399,1401);
  assert.equal(wallets.get("milestone-test").gold,300);
  assert.equal((await rank.rankMilestoneReceipt(tx,"milestone-test",challengeId)).length,2);
});
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

test("arena finish returns the contract-validated economy receipt on initial request and retry", async () => {
  const app = express();
  app.use(express.json());
  app.use(module.exports.default);
  const server = app.listen(0);
  try {
    await new Promise(resolve => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}/arena/challenges/${challengeId}/result`;
    const finish = () => fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": "attacker" },
      body: "{}",
    });
    const first = await finish();
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.deepEqual(firstBody.economy, {
      gold: reward.gold,
      balance:0,rating:1008,rankMilestones:[],
      drops: reward.drops,
      losses: reward.losses,
    });
    assert.doesNotThrow(() => schemaModule.exports.FinishArenaChallengeResponse.parse(firstBody));

    const retry = await finish();
    assert.equal(retry.status, 200);
    const retryBody = await retry.json();
    assert.deepEqual(retryBody, firstBody);
    assert.doesNotThrow(() => schemaModule.exports.FinishArenaChallengeResponse.parse(retryBody));
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("a new challenge scores the reported win once, including when retried with a conflicting result", async () => {
  challenge.status = "pending";
  challenge.outcome = null;
  challenge.localOutcome = null;
  challenge.attackerRatingDelta = 0;
  attacker.rating = defender.rating = 1000;
  attacker.wins = attacker.losses = 0;
  defender.wins = defender.losses = 0;
  defender.isBot = false;
  rewardWrites = 0;
  wallets.get("attacker").gold = 0;
  wallets.get("defender").gold = 0;
  notifications.length = 0;
  duplicateRows.length = 0;
  unlockRows.length = 0;
  const app = express();
  app.use(express.json());
  app.use(module.exports.default);
  const server = app.listen(0);
  try {
    await new Promise(resolve => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}/arena/challenges/${challengeId}/result`;
    const finish = localOutcome => fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": "attacker" },
      body: JSON.stringify({ localOutcome }),
    });
    const missing = await finish(undefined);
    assert.equal(missing.status, 400);
    assert.equal(challenge.status, "pending");
    const first = await finish("win");
    assert.equal(first.status, 200);
    const receipt = await first.json();
    assert.equal(receipt.outcome, "win");
    assert.equal(receipt.delta, 12);
    assert.equal(receipt.rating, 1012);
    assert.equal(receipt.economy.gold, 25);
    assert.equal(challenge.localOutcome, "win");
    assert.equal(defender.rating, 988);
    const second = await finish("loss");
    assert.equal(second.status, 200);
    assert.equal((await second.json()).outcome, "win");
    assert.equal(attacker.rating, 1012);
    assert.equal(attacker.losses, 0);
    assert.equal(rewardWrites, 1);
    assert.equal(wallets.get("attacker").gold, 25);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("defender win reward and only the passive defender notification are written once on retry", async () => {
  challenge.status = "pending";
  challenge.outcome = null;
  challenge.localOutcome = null;
  challenge.attackerRatingDelta = 0;
  attacker.rating = defender.rating = 1000;
  attacker.wins = attacker.losses = defender.wins = defender.losses = 0;
  defender.isBot = false;
  rewardWrites = 0;
  wallets.get("attacker").gold = 0;
  wallets.get("defender").gold = 0;
  notifications.length = 0;
  duplicateRows.length = 0;
  unlockRows.length = 0;
  const app = express();
  app.use(express.json());
  app.use(module.exports.default);
  const server = app.listen(0);
  try {
    await new Promise(resolve => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}/arena/challenges/${challengeId}/result`;
    const finish = () => fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": "attacker" },
      body: JSON.stringify({ localOutcome: "loss" }),
    });
    const first = await finish();
    assert.equal(first.status, 200);
    const receipt = await first.json();
    assert.equal(receipt.outcome, "loss");
    assert.equal(receipt.economy.gold, 5);
    assert.equal(wallets.get("attacker").gold, 5);
    assert.equal(wallets.get("defender").gold, 25);
    assert.equal(unlockRows.filter(row => row.playerId === "defender").length, 1);
    assert.equal(notifications.length, 1);
    assert.deepEqual(notifications.map(row => [row.playerId, row.direction, row.outcome]), [
      ["defender", "incoming", "win"],
    ]);
    assert.deepEqual(JSON.parse(JSON.stringify(notifications.find(row => row.playerId === "defender").drops)), [
      { kind: "spell", itemId: "ability:rogue", duplicate: false },
    ]);

    const retry = await finish();
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).economy.gold, 5);
    assert.equal(rewardWrites, 1);
    assert.equal(notifications.length, 1);
    assert.equal(wallets.get("attacker").gold, 5);
    assert.equal(wallets.get("defender").gold, 25);
    assert.equal(unlockRows.filter(row => row.playerId === "defender").length, 1);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("defender receives loss Gold without drops and attacker payouts remain unchanged", async () => {
  challenge.status = "pending";
  challenge.outcome = null;
  challenge.localOutcome = null;
  challenge.attackerRatingDelta = 0;
  attacker.rating = defender.rating = 1000;
  attacker.wins = attacker.losses = defender.wins = defender.losses = 0;
  defender.isBot = false;
  rewardWrites = 0;
  wallets.get("attacker").gold = 0;
  wallets.get("defender").gold = 0;
  notifications.length = 0;
  unlockRows.length = 0;
  const app = express();
  app.use(express.json());
  app.use(module.exports.default);
  const server = app.listen(0);
  try {
    await new Promise(resolve => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}/arena/challenges/${challengeId}/result`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": "attacker" },
      body: JSON.stringify({ localOutcome: "win" }),
    });
    assert.equal(response.status, 200);
    const receipt = await response.json();
    assert.equal(receipt.economy.gold, 25);
    assert.equal(wallets.get("attacker").gold, 25);
    assert.equal(wallets.get("defender").gold, imports["../lib/economy"].ECONOMY.arenaGold.loss);
    assert.equal(unlockRows.filter(row => row.playerId === "defender").length, 0);
    assert.equal(notifications.length, 1);
    const defenderNotice = notifications.find(row => row.playerId === "defender");
    assert.equal(defenderNotice.outcome, "loss");
    assert.equal(defenderNotice.gold, imports["../lib/economy"].ECONOMY.arenaGold.loss);
    assert.equal(defenderNotice.drops.length, 0);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("repeat-opponent farming limits never suppress win/loss Gold or permit duplicate payments", async () => {
  const rates=imports["../lib/economy"].ECONOMY.arenaGold;
  const app=express();app.use(express.json());app.use(module.exports.default);
  const server=app.listen(0);
  try {
    await new Promise(resolve=>server.once("listening",resolve));
    for(const localOutcome of ["win","loss"]) {
      challenge.status="pending";challenge.outcome=null;challenge.localOutcome=null;challenge.attackerRatingDelta=0;
      attacker.rating=defender.rating=1000;attacker.wins=attacker.losses=defender.wins=defender.losses=0;
      defender.isBot=false;rewardWrites=0;notifications.length=0;
      wallets.get("attacker").gold=wallets.get("defender").gold=0;
      farmingHistory=Array.from({length:3},()=>({...reward,createdAt:new Date()}));
      const finish=()=>fetch(`http://127.0.0.1:${server.address().port}/arena/challenges/${challengeId}/result`,{
        method:"POST",headers:{"content-type":"application/json","x-user-id":"attacker"},
        body:JSON.stringify({localOutcome}),
      });
      const response=await finish();assert.equal(response.status,200);
      const receipt=await response.json();
      const attackerGold=localOutcome==="win"?rates.win:rates.loss;
      const defenderGold=localOutcome==="win"?rates.loss:rates.win;
      assert.equal(receipt.economy.gold,attackerGold);
      assert.equal(wallets.get("attacker").gold,attackerGold);
      assert.equal(wallets.get("defender").gold,defenderGold);
      assert.equal(receipt.economy.drops.length,0,"collectible farming limits remain in place");
      await finish();
      assert.equal(wallets.get("attacker").gold,attackerGold);
      assert.equal(wallets.get("defender").gold,defenderGold);
      assert.equal(rewardWrites,1);
    }
  } finally {
    farmingHistory=[];
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});