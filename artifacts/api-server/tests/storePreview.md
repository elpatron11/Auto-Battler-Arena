# Preview Store regressions

Fast rules, React-handler and Profile-badge checks (no database):

```sh
pnpm --filter @workspace/api-server run test
```

Opt-in development PostgreSQL checks:

```sh
NODE_ENV=development STORE_DB_TESTS=1 pnpm --filter @workspace/api-server run test:store-db
```

Use only the workspace's **development** database connection. The runner refuses
to load the database package unless both flags are explicit; never point it at a
production connection. It requires the existing Store/Arena/economy schema and
does not migrate the database, contact Clerk, take payments, publish, or call a
public API. Its synthetic auth helper is shared with the existing route tests
and cannot authenticate requests to the application.

Every fixture has a random `store-regression-` account ID. Profiles, matches,
local/tournament history, wallet, inventory, market listing and preview receipts
are inserted inside one transaction. Success deliberately throws to roll back;
any failure also rolls back. Post-rollback queries assert that no fixture rows
remain. No actual player is selected for mutation or used as a match opponent.

The real Store route code, generated request/response schemas, Drizzle queries,
primary keys and economy account locks are exercised with an injected route
clock. Coverage includes authentication, non-development mutation rejection,
invalid/stale offers, activation retries preserving `purchasedAt`, locked and
duplicate claims, each reward threshold, real-player attack/defense Duo/Trio
wins, bot/history/local/tournament/loss/pending/unsupported-mode exclusions,
inclusive activation and exclusive expiry, reload reconstruction, exact UTC
daily and Monday resets, week-scoped claims, persistent deduplicated test badges,
and unchanged real wallet/unlock/duplicate/listing rows.

The `test:store-db` command type-checks the integration suite before running it.
The workspace's `store-regressions` validation runs the fast API suite and this
explicitly opted-in development database suite together.

The UI checks execute the original component's callbacks and badge effect with
a small hook/JSX harness. They verify Cancel sends no purchase, in-flight controls,
activation/claim payloads and cache updates, stale-purchase refresh, guest and
disabled behavior, expiry refresh, reload query settings, and the explicit
“earned test badge” label/removal on logout.

Limits: rollback-only requests share one connection, so this is **not** proof of
multi-connection lock contention behavior. UI checks are not a real-browser
layout, focus/accessibility, or physical iPhone gesture test.
