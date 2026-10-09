import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/match-loading.js', import.meta.url), 'utf8');
function harness() {
  const calls = [], tips = [];
  let pending = false;
  const window = {
    startBattle(opts) { calls.push(opts); return 'combat'; },
    ArenaTip: {
      isPending: () => pending,
      cancelAll() { pending = false; },
      beforeMatch(callback, options) {
        pending = true;
        tips.push({ callback: () => { pending = false; callback(); }, options });
        return 'waiting';
      }
    }
  };
  vm.runInNewContext(source, { window });
  return { window, calls, tips };
}

test('orders remain direct; every confirmed match waits before combat hooks run', () => {
  for (const mode of [{}, { onlineChallenge: true }, { tournament: true }, { rematch: true }]) {
    const { window, calls, tips } = harness();
    assert.equal(window.startBattle(mode), 'combat');
    assert.equal(tips.length, 0, 'orders are not delayed');
    calls.length = 0;
    const builds = [{ classId: 'warrior', ability: 'custom' }];
    const opts = { ...mode, _ordersConfirmed: true, enemyBuilds: builds, attackBuff: { strength: 1 } };
    assert.equal(window.startBattle(opts), 'waiting');
    assert.equal(calls.length, 0, 'no reward/buff/combat wrapper runs while loading');
    assert.equal(tips[0].options.cancellable, !mode.onlineChallenge && !mode.tournament);
    tips[0].callback();
    assert.equal(calls.length, 1);
    assert.equal(calls[0]._arenaTipShown, true);
    assert.equal(calls[0].enemyBuilds, builds, 'prepared builds are preserved');
    assert.equal(calls[0].attackBuff, opts.attackBuff);
  }
});

test('duplicate clicks do not create a second timer or combat start', () => {
  const { window, calls, tips } = harness();
  const opts = { _ordersConfirmed: true };
  window.startBattle(opts);
  window.startBattle({ ...opts });
  window.startBattle({});
  assert.equal(tips.length, 1);
  assert.equal(calls.length, 0);
  tips[0].callback();
  assert.equal(calls.length, 1);
});

test('all twelve supplied guide panels are shipped and rotated', () => {
  const tipSource = readFileSync(new URL('../public/arena-tip.js', import.meta.url), 'utf8');
  assert.match(tipSource, /nextTip = \(nextTip \+ 1\) % TIPS\.length/);
  assert.match(tipSource, /Loading match/);
  assert.match(tipSource, /classList\.add\('arenaTipOpen'\)/);
  assert.match(tipSource, /classList\.remove\('arenaTipOpen'\)/);
  for (let i = 1; i <= 12; i++) {
    assert.ok(existsSync(new URL(`../public/assets/match-tips/tip-${String(i).padStart(2, '0')}.webp`, import.meta.url)));
  }
  const html = readFileSync(new URL('../public/game.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('src="./match-loading.js"') > html.indexOf('src="./hourly-dungeon.js"'),
    'the loading gate must wrap all combat/reward/buff hooks');
});