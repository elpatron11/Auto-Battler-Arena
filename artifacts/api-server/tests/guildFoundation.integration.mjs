// Explicitly opt-in and development-only, before opening any database connection.
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
assert.equal(process.env.NODE_ENV,"development","Development database required.");
assert.equal(process.env.GUILD_DB_TESTS,"1","Opt in with GUILD_DB_TESTS=1.");
const dir=fileURLToPath(new URL("../",import.meta.url));
const output=buildSync({entryPoints:[dir+"tests/guildFoundation.integration.ts"],bundle:true,platform:"node",format:"cjs",write:false,external:["pg-native"],logLevel:"error"});
const filename=dir+"tests/guild-foundation-check.cjs",mod=new Module(filename);
mod.filename=filename;mod.paths=createRequire(import.meta.url).resolve.paths("pg");mod._compile(output.outputFiles[0].text,filename);
