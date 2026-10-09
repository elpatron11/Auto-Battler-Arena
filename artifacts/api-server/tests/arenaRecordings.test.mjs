import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";

const require = createRequire(new URL("../package.json", import.meta.url));
const { transformSync } = require("esbuild");
const schemaSource = readFileSync(new URL("../../../lib/api-zod/src/generated/api.ts", import.meta.url), "utf8");
const schemaModule = { exports: {} };
vm.runInNewContext(transformSync(schemaSource, { loader: "ts", format: "cjs" }).code, {
  module: schemaModule, exports: schemaModule.exports,
  require: name => {
    assert.equal(name, "zod");
    return createRequire(new URL("../../../lib/api-zod/package.json", import.meta.url))("zod");
  },
});
const schemas = schemaModule.exports;
const id = "11111111-1111-4111-8111-111111111111";
const replayRetentionSource = readFileSync(new URL("../src/lib/replayRetention.ts", import.meta.url), "utf8");
const path = "/objects/recording";
const snapshotType = "application/vnd.arena.replay+json";
const validReplay = () => Buffer.from(JSON.stringify({
  version: 1, durationMs: 1000, frames: [[0, "data:image/jpeg;base64,YQ=="], [1000, "data:image/jpeg;base64,Yg=="]],
}));

function setup({ challenge: changes = {}, bytes = validReplay(), size = bytes.length, missing = false, featured = false, eligible = true, retained = true } = {}) {
  const routes = new Map();
  const middlewares = [];
  const challenge = {
    id, attackerId: "attacker", defenderId: "defender", status: "completed",
    recordingUploadPath: path, recordingPath: null, recordingContentType: null, ...changes,
  };
  const challengeTable = { id: "id" };
  const featuredTable = { challengeId: "challengeId" };
  let metadataSet = 0;
  let updated = 0;
  const pruneCalls = [];
  const file = {
    getMetadata: async () => [{ size }],
    setMetadata: async () => { metadataSet++; },
    createReadStream: ({ start = 0, end = bytes.length - 1 } = {}) => Object.assign(
      (async function* () { yield bytes.subarray(start, end + 1); })(),
      { on() { return this; }, pipe(res) { res.piped = true; } },
    ),
  };
  class ObjectNotFoundError extends Error {}
  class ObjectStorageService {
    getObjectEntityUploadURL = async () => "https://storage.example/upload";
    normalizeObjectEntityPath = () => path;
    getObjectEntityFile = async () => {
      if (missing) throw new ObjectNotFoundError();
      return file;
    };
  }
  const tx = {
    select: () => ({ from: table => ({
      where: () => {
        const rows = table === featuredTable
          ? (featured ? [{ challengeId: id }] : [])
          : [challenge];
        const result = Promise.resolve(rows);
        result.for = () => Promise.resolve(rows);
        result.limit = () => Promise.resolve(rows.slice(0, 1));
        return result;
      },
    }) }),
    update: () => ({ set: values => ({ where: async () => {
      Object.assign(challenge, values); updated++;
    } }) }),
  };
  const router = {
    use: fn => middlewares.push(fn),
    post: (url, fn) => routes.set(`POST ${url}`, fn),
    get: (url, fn) => routes.set(`GET ${url}`, fn),
  };
  const source = readFileSync(new URL("../src/routes/arena-recordings.ts", import.meta.url), "utf8");
  const compiled = transformSync(source, { loader: "ts", format: "cjs" }).code;
  const module = { exports: {} };
  const imports = {
    "@clerk/express": { getAuth: req => ({ userId: req.userId }) },
    "@workspace/api-zod": schemas,
    "@workspace/db": { arenaChallengesTable: challengeTable, arenaFeaturedMatchesTable: featuredTable, db: { transaction: fn => fn(tx), ...tx } },
    "drizzle-orm": { eq: () => true },
    express: { Router: () => router },
    "../lib/objectStorage": { ObjectNotFoundError, ObjectStorageService },
    "../lib/replayRetention": {
      isReplayVisibleToPlayer: async () => retained,
      isReplayUploadEligible: async () => eligible,
      pruneReplaysForPlayers: async players => { pruneCalls.push(players); },
    },
  };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: name => {
    assert.ok(imports[name], `unexpected import ${name}`);
    return imports[name];
  }, Buffer });
  async function request(method, url, { userId = "attacker", body = {}, challengeId = id, range } = {}) {
    const req = { userId, params: { challengeId }, body, get: key => key === "Range" ? range : undefined };
    const res = {
      locals: {}, statusCode: 200, headers: {},
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
      setHeader(key, value) { this.headers[key] = value; },
      end() { this.ended = true; },
    };
    let authorized = false;
    middlewares[0](req, res, () => { authorized = true; });
    if (authorized) await routes.get(`${method} ${url}`)(req, res);
    return res;
  }
  const upload = (options = {}) => request("POST", "/arena/challenges/:challengeId/recording-upload", {
    ...options, body: { contentType: "video/webm", sizeBytes: 100, ...options.body },
  });
  const finish = (options = {}) => request("POST", "/arena/challenges/:challengeId/recording", {
    ...options, body: { objectPath: path, contentType: snapshotType, ...options.body },
  });
  const read = options => request("GET", "/arena/challenges/:challengeId/recording", options);
  return { upload, finish, read, challenge, pruneCalls, get metadataSet() { return metadataSet; }, get updated() { return updated; } };
}

function retentionHarness({ recordedMatches, completedMatches }) {
  const challenges = {
    id: {}, attackerId: {}, defenderId: {}, status: {}, recordingPath: {}, resolvedAt: {}, createdAt: {},
  };
  const featured = { challengeId: {} };
  const garbage = { queuedAt: {}, path: {} };
  const flatten = value => Array.isArray(value) ? value.flatMap(flatten) :
    value && typeof value === "object" && Array.isArray(value.conditions)
      ? [value, ...value.conditions.flatMap(flatten)]
      : [value];
  const orm = {
    and: (...conditions) => ({ op: "and", conditions }),
    or: (...conditions) => ({ op: "or", conditions }),
    eq: (column, value) => ({ op: "eq", column, value }),
    isNotNull: column => ({ op: "notNull", column }),
    desc: column => ({ op: "desc", column }),
    sql: Object.assign((strings, ...values) => ({ op: "sql", strings, values }), { raw: text => ({ op: "sql", text }) }),
  };
  const tx = {
    select: () => ({
      from(table) {
        let condition;
        const query = {
          where(value) { condition = value; return query; },
          orderBy() { return query; },
          limit(count) {
            if (table === featured) return Promise.resolve([]);
            const clauses = flatten(condition);
            const isRecordedOnly = clauses.some(clause => clause?.op === "notNull" && clause.column === challenges.recordingPath);
            const participant = clauses.find(clause =>
              clause?.op === "eq" && (clause.column === challenges.attackerId || clause.column === challenges.defenderId));
            const matches = isRecordedOnly ? recordedMatches[participant?.value] : completedMatches[participant?.value];
            return Promise.resolve((matches ?? []).slice(0, count));
          },
        };
        return query;
      },
    }),
  };
  const module = { exports: {} };
  const imports = {
    "@workspace/db": {
      arenaChallengesTable: challenges,
      arenaFeaturedMatchesTable: featured,
      arenaReplayGarbageTable: garbage,
      db: { transaction: fn => fn(tx) },
    },
    "drizzle-orm": orm,
    "./logger": { logger: { error() {}, warn() {} } },
    "./objectStorage": { ObjectNotFoundError: class {}, ObjectStorageService: class {} },
  };
  const code = transformSync(replayRetentionSource, { loader: "ts", format: "cjs" }).code;
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: name => {
      assert.ok(imports[name], `unexpected retention import ${name}`);
      return imports[name];
    },
    setInterval: () => ({ unref() {} }),
  });
  return {
    isReplayRetained: module.exports.isReplayRetained,
    isReplayVisibleToPlayer: module.exports.isReplayVisibleToPlayer,
    isReplayUploadEligible: module.exports.isReplayUploadEligible,
    tx,
    challenges,
  };
}

test("upload needs authentication, ownership, completed match and valid type/size", async () => {
  for (const options of [
    { userId: null, status: 401 },
    { userId: "stranger", status: 404 },
    { body: { contentType: "text/html" }, status: 400 },
    { body: { sizeBytes: 40_000_001 }, status: 400 },
    { body: { contentType: snapshotType, sizeBytes: 6_000_001 }, status: 400 },
    { challengeId: "bad-id", status: 400 },
  ]) {
    const { status, ...request } = options;
    const h = setup();
    assert.equal((await h.upload(request)).statusCode, status);
    assert.equal(h.updated, 0);
  }
  for (const [changes, status] of [[{ status: "pending" }, 409], [{ recordingPath: path }, 409]]) {
    assert.equal((await setup({ challenge: changes }).upload()).statusCode, status);
  }
  const h = setup({ challenge: { recordingUploadPath: null } });
  assert.equal((await h.upload({ body: { contentType: snapshotType, sizeBytes: 6_000_000 } })).statusCode, 200);
  assert.equal(h.challenge.recordingUploadPath, path);
});

test("expired replays cannot reserve uploads while an eligible in-flight replay can", async () => {
  const expired = setup({ eligible: false });
  const rejected = await expired.upload();
  assert.equal(rejected.statusCode, 410);
  assert.equal(expired.updated, 0);

  const inFlight = setup({ challenge: { recordingUploadPath: path } });
  const accepted = await inFlight.upload();
  assert.equal(accepted.statusCode, 200);
  assert.equal(inFlight.challenge.recordingUploadPath, path);
});

test("three newer unrecorded matches do not evict a participant's saved replay", async () => {
  const candidate = { id };
  const recorded = { attacker: [candidate, { id: "recorded-2" }, { id: "recorded-3" }, { id: "recorded-4" }],
    defender: [candidate, { id: "other-2" }, { id: "other-3" }] };
  const completed = { attacker: [{ id: "unrecorded-1" }, { id: "unrecorded-2" }, { id: "unrecorded-3" }, candidate],
    defender: [{ id: "unrecorded-a" }, { id: "unrecorded-b" }, { id: "unrecorded-c" }, candidate] };
  const helper = retentionHarness({ recordedMatches: recorded, completedMatches: completed });
  assert.equal(await helper.isReplayRetained(helper.tx, id, ["attacker", "defender"]), true);
  const shared = retentionHarness({ recordedMatches: {
    attacker: [{ id: "a" }, { id: "b" }, { id: "c" }, candidate],
    defender: [candidate, { id: "d" }, { id: "e" }],
  } });
  assert.equal(await shared.isReplayRetained(shared.tx, id, ["attacker", "defender"]), true);
  assert.equal(await shared.isReplayVisibleToPlayer(shared.tx, id, "attacker"), false);
  assert.equal(await shared.isReplayVisibleToPlayer(shared.tx, id, "defender"), true);

  const agedOut = retentionHarness({
    recordedMatches: {
      attacker: [{ id: "recorded-a" }, { id: "recorded-b" }, { id: "recorded-c" }, candidate],
      defender: [{ id: "recorded-x" }, { id: "recorded-y" }, { id: "recorded-z" }, candidate],
    },
    completedMatches: completed,
  });
  assert.equal(await agedOut.isReplayRetained(agedOut.tx, id, ["attacker", "defender"]), false);
  assert.equal(await agedOut.isReplayUploadEligible(agedOut.tx, id, ["attacker", "defender"]), false);
});

test("finalization rejects unauthorized, missing, mismatched, oversized and malformed objects", async () => {
  const scenarios = [
    [{}, { userId: null }, 401],
    [{}, { userId: "stranger" }, 404],
    [{}, { body: { contentType: "image/png" } }, 400],
    [{}, { body: { objectPath: "/objects/other" } }, 400],
    [{ challenge: { status: "pending" } }, {}, 409],
    [{ challenge: { recordingPath: path } }, {}, 409],
    [{ missing: true }, {}, 404],
    [{ size: 0 }, {}, 400],
    [{ size: 6_000_001 }, {}, 400],
    [{ bytes: Buffer.from('{"version":1,"durationMs":2,"frames":[[2,"bad"]]}') }, {}, 400],
    [{ bytes: Buffer.from('{"version":1,"durationMs":2,"frames":[[2,"data:image/jpeg;base64,YQ=="],[1,"data:image/jpeg;base64,YQ=="]]}') }, {}, 400],
  ];
  for (const [config, options, status] of scenarios) {
    const h = setup(config);
    assert.equal((await h.finish(options)).statusCode, status, JSON.stringify(config));
    assert.equal(h.metadataSet, 0);
    assert.deepEqual(h.pruneCalls, []);
  }
  const h = setup();
  const response = await h.finish();
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.available, true);
  assert.equal(h.challenge.recordingContentType, snapshotType);
  assert.equal(h.metadataSet, 1);
  assert.deepEqual(h.pruneCalls.map(ids => [...ids]), [["attacker", "defender"]]);
  assert.equal((await h.finish()).statusCode, 409);
});

test("video finalization enforces the 40 MB metadata limit", async () => {
  const oversized = setup({ size: 40_000_001 });
  assert.equal((await oversized.finish({ body: { contentType: "video/webm" } })).statusCode, 400);
  const valid = setup({ size: 40_000_000 });
  assert.equal((await valid.finish({ body: { contentType: "video/mp4" } })).statusCode, 200);
});

test("only match participants can read a finalized, bounded replay", async () => {
  const config = { challenge: { recordingPath: path, recordingContentType: snapshotType } };
  const h = setup(config);
  assert.equal((await h.read({ userId: null })).statusCode, 401);
  assert.equal((await h.read({ userId: "stranger" })).statusCode, 404);
  const defender = await h.read({ userId: "defender", range: "bytes=0-9" });
  assert.equal(defender.statusCode, 206);
  assert.equal(defender.headers["Content-Length"], "10");
  assert.equal(defender.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(defender.piped, true);
  assert.equal((await setup({ ...config, retained: false }).read({ userId: "defender" })).statusCode, 404);
  const invalidRange = await h.read({ range: "bytes=999999-" });
  assert.equal(invalidRange.statusCode, 416);
  assert.equal(invalidRange.ended, true);
  assert.equal((await setup({ ...config, size: 6_000_001 }).read()).statusCode, 404);
  assert.equal((await setup({ ...config, missing: true }).read()).statusCode, 404);
});

test("any authenticated player can read featured matches but not unrelated recordings", async () => {
  const config = { challenge: { recordingPath: path, recordingContentType: snapshotType } };
  assert.equal((await setup(config).read({ userId: "stranger" })).statusCode, 404);
  const featured = await setup({ ...config, featured: true }).read({ userId: "stranger" });
  assert.equal(featured.statusCode, 200);
  assert.equal(featured.piped, true);
});