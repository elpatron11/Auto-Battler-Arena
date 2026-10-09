// Opt-in only. Refuse BEFORE loading the database package or opening a connection.
import assert from "node:assert/strict";
import { buildSync, transformSync } from "esbuild";
import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { testAuth } from "./support/auth.mjs";

assert.equal(process.env.NODE_ENV, "development",
  "Store database regressions require explicit NODE_ENV=development; no database was opened.");
assert.equal(process.env.STORE_DB_TESTS, "1",
  "Set STORE_DB_TESTS=1 to opt into rolled-back development fixtures.");

const dir = fileURLToPath(new URL("../", import.meta.url));
const output = buildSync({
  entryPoints: [dir + "tests/storePreview.integration.ts"],
  bundle: true, platform: "node", format: "cjs", write: false,
  external: ["pg-native"], logLevel: "error",
});
const filename = dir + "tests/store-preview-check.cjs";
const mod = new Module(filename);
mod.filename = filename;
mod.paths = createRequire(import.meta.url).resolve.paths("pg");
mod._compile(output.outputFiles[0].text, filename);

// Use the existing VM/auth route-testing pattern, but keep real Drizzle queries,
// generated contracts, account locks and Store business logic.
const routeCode = transformSync(readFileSync(new URL("../src/routes/store.ts", import.meta.url), "utf8"),
  { loader: "ts", format: "cjs" }).code;
function routeHarness(imports, clock, environment = "development") {
  const handlers = new Map();
  const router = {
    use() {},
    get: (path, fn) => handlers.set(`GET ${path}`, fn),
    post: (path, fn) => handlers.set(`POST ${path}`, fn),
  };
  class ClockDate extends Date {
    static now() { return clock.now; }
  }
  const module = { exports: {} };
  const dependencies = {
    ...imports, "@clerk/express": testAuth, express: { Router: () => router },
  };
  vm.runInNewContext(routeCode, {
    module, exports: module.exports, Date: ClockDate,
    process: { env: { NODE_ENV: environment } },
    require: name => {
      assert.ok(dependencies[name], `Unexpected Store route dependency: ${name}`);
      return dependencies[name];
    },
  });
  return async (method, path, body = {}, userId = null) => {
    const response = {
      statusCode: 200, headers: {}, body: undefined,
      setHeader(name, value) { this.headers[name] = value; },
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };
    assert.ok(handlers.has(`${method} ${path}`), "Store route must still exist");
    await handlers.get(`${method} ${path}`)({ userId, body }, response);
    return response;
  };
}
await mod.exports.verify(routeHarness);
