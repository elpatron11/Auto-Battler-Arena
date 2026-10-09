// This runner never loads a production database or contacts Stripe.
import assert from "node:assert/strict";
import { buildSync, transformSync } from "esbuild";
import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

assert.equal(process.env.NODE_ENV, "development", "Live-logic fixtures require explicit NODE_ENV=development.");
assert.equal(process.env.STORE_DB_TESTS, "1", "Set STORE_DB_TESTS=1 for rolled-back development fixtures.");
const dir = fileURLToPath(new URL("../", import.meta.url));
const output = buildSync({
  entryPoints: [dir + "tests/storeLive.integration.ts"], bundle: true,
  platform: "node", format: "cjs", write: false, external: ["pg-native"], logLevel: "error",
});
const filename = dir + "tests/store-live-check.cjs", mod = new Module(filename);
mod.filename = filename;
mod.paths = createRequire(import.meta.url).resolve.paths("pg");
mod._compile(output.outputFiles[0].text, filename);
function load(path, dependencies, clock) {
  const module = { exports: {} };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const code = transformSync(readFileSync(dir + path, "utf8"), { loader: "ts", format: "cjs" }).code;
  vm.runInNewContext(code, {
    module, exports: module.exports, Date: ClockDate,
    process: { env: { NODE_ENV: "production", REPLIT_DOMAINS: "store-live-fixture.replit.app" } },
    require: name => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
  });
  return module.exports;
}
await mod.exports.verifyLive(load);
