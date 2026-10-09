import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("database runner refuses non-development or missing opt-in before loading the database", () => {
  for (const [environment, optIn] of [
    ["production", "1"], ["staging", "1"], ["test", "1"], ["", "1"],
    [undefined, "1"], ["development", undefined], ["development", "0"],
  ]) {
    // No DATABASE_URL or credentials are supplied. A failure from the database
    // module would prove the guard ran too late.
    const env = {};
    if (environment !== undefined) env.NODE_ENV = environment;
    if (optIn !== undefined) env.STORE_DB_TESTS = optIn;
    const result = spawnSync(process.execPath,
      [new URL("storePreview.integration.mjs", import.meta.url).pathname],
      { env, encoding: "utf8", timeout: 10_000 });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, environment === "development"
      ? /Set STORE_DB_TESTS=1/ : /require explicit NODE_ENV=development/);
    assert.doesNotMatch(result.stderr, /DATABASE_URL must be set|Failed query/);
  }
});
