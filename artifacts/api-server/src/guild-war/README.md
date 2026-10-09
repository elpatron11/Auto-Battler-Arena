# Unpublished Guild Wars siege stage

## Scope and safety

Guild hall: `/guilds`. Lobby, playable rooms and spectators: `/guild-wars`.
Both require the existing Clerk session. The client sends objectives, not
positions, damage, scores or another player's identity.

Wars are enabled only with `NODE_ENV=development`. They do not write to wallets,
reward settlements, unlocks or existing Arena results. No automatic publishing
or production database migration is included.

The existing Arena and other game source files are unchanged. New rooms use
trusted original Arena combat/talent/captain code in an isolated room-local VM,
with actual class AI, attacks, casts, healing, CC and summons. Equipped slots
are selected from the server-held active build and ledger-checked; clients
cannot submit builds or combat outcomes. Missing equipped classes explicitly
use an owned standard kit. Legacy participants retain their reduced rules.
The Arena source is bundled into the worker, not read from missing production
source files. Do not claim complete numerical or lifecycle parity.

The 3D renderer imports actual Arena premium/prestige factories, with actual
classic models for adaptive far-view LOD, not generic character proxies.
It adds castle masonry, keep, towers, ramparts, ramps, camps and guild flags;
positions and named cast/damage/healing/effect events come from the server.
Pinch/drag/wheel, fit, follow and 1×/2×/3× controls are implemented. Castle
additions are presentation, not new collision/gameplay geometry.
The labelled 2D fallback normalizes large-map positions into its retained
1200×800 drawing space without changing server data.

Actual 3D visuals and cost remain unverified: the current screenshot/testing
browser could not create WebGL. A passing 2D fallback is not a 3D pass.
Physical-device FPS, thermal/memory behavior and phone gestures are unverified.
Unsupported Arena skins/racial meshes are not invented. Server VFX are bounded
presentations, not exact Arena 2D spell-art reproduction; polymorph is signalled
as CC rather than a newly invented sheep model.

## Room behavior

- Scheduled windows start at 00:00, 03:00, 06:00, etc. UTC and last 20 minutes.
- Practice has a shared immediate 20-minute window so the prototype can be tried
  without waiting for a scheduled event.
- Allocation fills the oldest eligible current-combat-generation room. New
  extracted rooms use a 2400×1600 map; existing legacy rooms are not rewritten.
  Maximum five participating guilds,
  five active heroes per guild and 25 heroes in a room; one room per player.
  Additional members of the same ten-member guild can use another room.
- One slot is reserved for a single server-controlled **Iron Wardens** AI guild.
  Real guilds fill the other four slots first; the fifth real guild spills into
  another room with its own AI opponent. The AI mirrors the largest human squad,
  with 1–5 distinct characters, counted within the 25-character cap. Warrior
  anchors each AI squad; its other classes rotate through all eight remaining
  classes in new rooms. Existing rooms keep their previous lineup. Squad
  shrinking preserves retired bots' HP,
  death deadlines and ability cooldowns; reconnects and checkpoint restore
  retain the same guild rather than spawning duplicates.
- Bot heroes use the same camps, stats, LOS, movement, damage, class specials,
  attack/defense roles, ten-second death respawn, captures and scores as humans.
  One cheap tactical pass per second chooses siege, boss, banner or regroup
  objectives; combat stays at the existing 20 Hz. Empty rooms keep one bot
  regrouped rather than five active bots. Bots do not create player accounts,
  guild foundation records, wallets or market inventories. A bot opponent does
  not count as another real guild for contested classification.
- One guild can still capture a neutral castle, but a joining human is no longer
  alone: its AI opponent can also capture it. A single neutral boss remains;
  no unrelated waves, guards or boss spawns are introduced. Actual original
  Arena class summons are part of the later full-combat extraction request.
- Castle and boss claim follow greatest actual damage, not last hit. Castles
  repair their structures on capture; ownership changes roles and spawns.
- Leaving/kicking from a guild removes its member from battles. Network drops
  do not remove a hero: their server AI keeps playing and reload reconnects.
- Commands retain their objective through local survival retreat. A two-second
  server cooldown applies. Camp protection and repeat-victim reward limits
  prevent simple spawn/kill farming.
- Holding pays completed minutes, with the final three completions worth 50
  instead of 25. Ownership changes restart the holding timer.

## Runtime

A bundled worker advances all rooms at 20 Hz, independent of spectators or
browser tabs. Authenticated SSE sends complete shared snapshots at 5 Hz;
rendering interpolates those positions and never resolves combat locally.
Only observed rooms broadcast. Slow consumers are disconnected rather than
building unbounded response buffers; reconnect receives a complete snapshot.
Streams require periodic authenticated reconnects after five minutes.

A PostgreSQL session advisory lease prevents two coordinators owning the same
rooms. Membership mutations use a separate transaction-scoped lock to protect
the ten-member cap, single membership and leadership transitions.

This prototype has a 20-active-room safety limit and a 100-stream-per-room
limit, **not verified production capacity**. It is not a distributed simulation
service, and these limits are not a performance guarantee.

Checkpoints are saved approximately every five seconds. An abrupt crash may
lose that interval. Recovery restores the checkpoint and current event clock;
it does not replay every attack that would have occurred during downtime.
Extraction checkpoints preserve hero wounds, primitive status/extra fields,
cooldowns, first-freeze history and resolvable hero DoTs/HoTs. Callback-based
casts are interrupted; the full pet/trap/totem/fire-zone and objective-status
graph is not restored. Do not describe this as full checkpoint parity.
Finished rooms stay available to watch for one hour. Stale checkpoints are
pruned from development storage after 24 hours without updates. Guild records
persist separately and are not pruned by room cleanup.

## Checks

```sh
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run test:guild-db
pnpm --filter @workspace/api-server run test:guild-performance
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/auto-battler-arena run typecheck
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/auto-battler-arena run build
```

The development-only database check creates randomly isolated fixtures and
removes only those fixtures. It covers guild permissions and concurrent joins.
The API/engine tests cover authentication, disabled production behavior,
commands, room allocation, castles, channels, class specials, respawn and scores.

The performance script measures synthetic simulation CPU and snapshot sizes,
including 1/5/10 rooms with 20 human heroes plus five bots and a complete
accelerated event. The bot checks include real one-human-vs-one-bot play,
unattended-opponent capture, role/respawn/score parity, capacity, persistence,
reconciliation and empty-path corner recovery. It does
**not** measure real network fan-out, physical phone FPS, mobile WebView behavior,
production Autoscale contention, database latency or distributed failover.
Those remain release verification gaps. Browser viewport checks must not be
reported as physical iPhone/Android tests.

For the new extracted engine, run:

```sh
node --test artifacts/api-server/tests/guildWarArena.test.mjs
node artifacts/api-server/tests/guildWarArena.benchmark.mjs
```

These cover all-nine-class variant smoke simulations with 25 heroes and boss,
real cast/damage/healing events, selected owned slots, wound/shield/CC/CD
restoration, summons/cleanup/respawn, captain racials, siege gate geometry and
protected castle behavior. They are not exhaustive golden parity tests for
every spell/talent/captain interaction, five-guild mind-control attribution or
one-time effects.

The Vite-only `/guild-war-benchmark.html` is explicitly labelled synthetic
25-character/boss/pet/event data, with no server writes or matchmaking, and
is absent from production build entries. It renders the real map component.
`window.__guildWar3DStats` reports draw calls, geometry and frame percentiles
only when WebGL runs. Server tick numbers are not rendering FPS or real-network
fan-out measurements.

Legacy live checkpoints already containing five human guilds cannot accept an
AI slot without displacing a real guild. They reject new joins rather than break
caps or silently move existing players; new allocations reserve the AI slot.
Finished historical rooms are not rewritten.

The four new tables were applied additively to **development only**. Production
guild deployment needs an explicit additive schema migration before exposing
the guild foundation; do not use startup DDL or a broad schema push.
