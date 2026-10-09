import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/game.html', import.meta.url), 'utf8');
const begin = html.indexOf('let tournamentEntryApproved=');
const end = html.indexOf("const AI_LADDER_KEY=", begin);
assert.ok(begin >= 0 && end > begin, 'Tournament settlement code is present');
const settlementCode = html.slice(begin, end);

test('a completed local bracket waits until server settlement is eligible, then retries once', () => {
  let now = Date.parse('2026-09-29T15:00:30Z');
  let nextId = 0;
  const timers = new Map();
  const requests = [];
  class Clock extends Date {
    static now() { return now; }
  }
  const context = vm.createContext({
    PRACTICE_ONLY: false,
    Date: Clock,
    Math,
    Number,
    JSON,
    String,
    tournament: null,
    setTimeout(fn, delay) {
      const id = ++nextId;
      timers.set(id, { fn, at: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    localStorage: { setItem() {}, removeItem() {} },
    document: { getElementById() { return null; } },
    requestEconomyAction(action, payload) { requests.push({ action, payload }); },
    renderTournament() {},
  });
  vm.runInContext(settlementCode, context);
  vm.runInContext(`persistPendingTournament({
    serverTournamentId:'00000000-0000-4000-8000-000000000001',
    phase:'finish-pending',
    serverResult:{createdAt:'2026-09-29T15:00:00Z'}
  }); retryPendingTournamentFinish();`, context);
  assert.equal(requests.length, 0, 'the client must not request a finish before the 90-second lock expires');

  function advance(milliseconds) {
    const endTime = now + milliseconds;
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > endTime) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = endTime;
  }
  advance(59_000);
  assert.equal(requests.length, 0);
  advance(2_000);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].action, 'tournament:finish');
  assert.equal(requests[0].payload.tournamentId, '00000000-0000-4000-8000-000000000001');

  vm.runInContext('tournamentFinishPending=false;persistPendingTournament(null)', context);
  context.localStorage.getItem = () => JSON.stringify({
    serverTournamentId:'00000000-0000-4000-8000-000000000001',
    phase:'finish-pending',
    serverResult:{createdAt:'2026-09-29T15:00:00Z'},
  });
  vm.runInContext('loadPendingTournament()', context);
  advance(2_000);
  assert.equal(requests.length, 1, 'a recovered finish waits for the account bridge');
  advance(2_000);
  assert.equal(requests.length, 2, 'an interrupted finish retries automatically after reload');
});