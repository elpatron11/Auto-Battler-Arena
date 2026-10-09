import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { inArray, sql } from 'drizzle-orm';
import { pgTable, text, integer } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';

test('actual purchase wallet query binds two IDs as IN parameters and keeps ordered row locks', () => {
  const source = readFileSync(new URL('../src/routes/economy.ts', import.meta.url), 'utf8');
  const route = source.slice(source.indexOf('router.post("/market/listings/:listingId/purchase"'));
  const expression = route.match(/const wallets = await ([\s\S]*?);/)?.[1];
  assert.ok(expression, 'test compiles the production route query, not a copy');
  const ids = ['buyer-test', 'seller-test'].sort();
  const economyWalletsTable = pgTable('economy_wallets', { playerId: text('player_id'), gold: integer('gold') });
  const query = vm.runInNewContext(`(${expression})`, {
    tx: drizzle.mock(), economyWalletsTable, ids, inArray, sql,
  }).toSQL();
  assert.match(query.sql, /"player_id" in \(\$1, \$2\)/);
  assert.match(query.sql, /order by "economy_wallets"\."player_id" for update$/);
  assert.doesNotMatch(query.sql, /ANY/);
  assert.deepEqual(query.params, ids);
  assert.ok(route.indexOf('const wallets = await') < route.indexOf('await tx.update(economyWalletsTable)'),
    'both wallets are locked before any currency transfer');
});