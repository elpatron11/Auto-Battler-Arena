import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

function loadPublicScript(path, name) {
  const window = {};
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  runInNewContext(source, { window, Date, Math, Number, Object, WeakMap });
  return window[name];
}

function makeCanvas() {
  const calls = [];
  const ctx = {
    globalAlpha: 1,
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    beginPath() { calls.push('beginPath'); },
    moveTo() { calls.push('moveTo'); },
    lineTo() { calls.push('lineTo'); },
    stroke() { calls.push('stroke'); },
    fill() { calls.push('fill'); },
    arc() { calls.push('arc'); },
    ellipse() { calls.push('ellipse'); },
  };
  return { ctx, calls };
}

const motion = loadPublicScript('../public/roster-polish-motion.js', 'RosterPolishMotion');
const vfx = loadPublicScript('../public/roster-polish-vfx.js', 'RosterPolishVfx');

test('motion derives travel from positions, memoizes each timestamp, and handles omitted dt', () => {
  motion.reset();
  const e = { id: 7, team: 'player', x: 20, y: 10, radius: 16, moveSpeed: 500, alive: true, status: {} };
  const first = motion.pose(e, 1);
  assert.equal(first.move, 0, 'nominal moveSpeed alone must not animate stationary entities');
  e.x = 26;
  const moved = motion.pose(e, 1.1);
  assert.ok(moved.move > 0.6, 'coordinate history supplies movement when dt is omitted');
  assert.equal(motion.pose(e, 1.1), moved, 'multiple consumers share one pose per frame');
  assert.ok(Number.isFinite(moved.stride));
  assert.ok(Number.isFinite(moved.breath));
  assert.ok(Number.isFinite(moved.facing));
  assert.ok(Math.abs(moved.facing) >= 0.6);
});

test('motion follows attack, cast, hit, CC, death and actual resurrection without changing entity data', () => {
  motion.reset();
  const e = Object.freeze({
    id: 2, team: 'enemy', x: 40, y: 20, radius: 17, alive: true,
    atkAnimAt: 1000, atkAnimDur: 0.3, atkAnimAng: Math.PI,
    hitFlashAt: 1050, hitFlashDur: 0.18,
    casting: Object.freeze({ timeLeft: 0.4, total: 1 }),
    status: Object.freeze({ stunTimer: 0.5, stunKind: 'freeze', rootTimer: 0 }),
    lastTarget: Object.freeze({ x: 20, y: 20 }),
  });
  const before = JSON.stringify(e);
  const active = motion.pose(e, 1.1, 0.05);
  assert.ok(active.attack > 0);
  assert.ok(active.cast > 0);
  assert.ok(active.hit > 0);
  assert.equal(active.cc.frozen, true);
  assert.equal(active.move, 0);
  assert.ok(active.facing < 0);
  assert.equal(JSON.stringify(e), before);

  const dying = { id: 3, team: 'player', x: 10, y: 10, alive: true, status: {} };
  motion.reset();
  motion.pose(dying, 3);
  dying.alive = false;
  const start = motion.pose(dying, 3.1);
  assert.equal(start.death, 0);
  const falling = motion.pose(dying, 3.35);
  assert.ok(falling.death > 0.45 && falling.death < 0.55);
  dying.alive = true;
  const ghost = motion.pose(dying, 3.7);
  assert.equal(ghost.ghost.dead, false, 'follow an actual gameplay resurrection');
  assert.equal(ghost.fade, 1);
});

test('a turn crosses sides smoothly, keeps the last direction at rest, and stride swings both ways', () => {
  motion.reset();
  const e = { id:77, team:'player', x:100, y:10, radius:17, alive:true, status:{} };
  motion.pose(e,10,1/60);
  const strides=[];
  for(let i=1;i<=60;i++){
    e.x-=3;
    const pose=motion.pose(e,10+i/60,1/60);
    strides.push(pose.stride);
    assert.ok(Math.abs(pose.facing)>=.6);
    assert.ok(pose.stride>=-1 && pose.stride<=1);
  }
  const stopped=motion.pose(e,11.1,.1);
  assert.ok(stopped.facing<0, 'standing still must not turn back toward the default team direction');
  assert.equal(stopped.move,0);
  assert.ok(strides.some(x=>x>.1) && strides.some(x=>x<-.1));
});

test('motion accepts nulls and hostile timing values without producing NaN', () => {
  motion.reset();
  assert.equal(motion.pose(null, 2), null);
  const pose = motion.pose(Object.freeze({
    x: NaN, y: Infinity, alive: true, team: 'enemy',
    atkAnimAt: NaN, atkAnimDur: Infinity, casting: Object.freeze({ total: 0, timeLeft: NaN }),
    status: Object.freeze({ stunTimer: NaN }),
  }), NaN, NaN);
  for (const value of [pose.move, pose.stride, pose.attack, pose.cast, pose.hit, pose.breath, pose.facing, pose.lean]) {
    assert.ok(Number.isFinite(value));
  }
});

test('VFX overlays are read-only, bounded, and leave expired-effect ownership to caller', () => {
  const { ctx, calls } = makeCanvas();
  const frozenFx = Object.freeze({
    type: 'namedAbility', kind: 'frostbolt', x: 2, y: 3, x2: 42, y2: 23,
    t: 0.2, dur: 0.8, r: 24, color: '#bfeeff',
  });
  const before = JSON.stringify(frozenFx);
  vfx.beginFrame({ low: false });
  for (let i = 0; i < 20; i++) {
    assert.equal(vfx.drawEffect(ctx, frozenFx, Object.freeze({ low: false, t: 1 })), false);
  }
  const stats = vfx.metrics;
  assert.equal(stats.accentEffects, 12);
  assert.ok(stats.accentPrimitives <= 36, 'no more than three small accents per effect');
  assert.equal(JSON.stringify(frozenFx), before);
  assert.equal(calls.filter(call => call === 'save').length, calls.filter(call => call === 'restore').length);

  const countBeforeExpired = calls.length;
  assert.equal(vfx.drawEffect(ctx, Object.freeze({
    type: 'impact', x: 0, y: 0, size: 12, t: 1, dur: 1,
  }), { low: false, t: 2 }), false);
  assert.equal(calls.length, countBeforeExpired, 'an effect at its end receives no overlay');
});

test('VFX low mode disables accents but retains contact shadows and validates geometry', () => {
  const { ctx, calls } = makeCanvas();
  vfx.beginFrame({ low: true });
  assert.equal(vfx.drawEffect(ctx, Object.freeze({
    type: 'projectile', x1: 0, y1: 0, x2: 40, y2: 20, t: 0.2, dur: 1,
  }), { low: true, t: 3 }), false);
  assert.equal(vfx.metrics.accentEffects, 0);

  const entity = Object.freeze({
    x: 5, y: 8, radius: 16, classId: 'druid', status: Object.freeze({ invis: false }),
  });
  assert.equal(vfx.drawShadow(ctx, entity, 3, Object.freeze({ death: 0 }), { low: true, t: 3 }), true);
  assert.equal(vfx.metrics.shadows, 1);
  const callsBeforeInvalid = calls.length;
  assert.equal(vfx.drawEffect(ctx, Object.freeze({
    type: 'projectile', x1: NaN, y1: 0, x2: 40, y2: 20, t: 0.2, dur: 1,
  }), { low: false, t: 4 }), false);
  assert.equal(calls.length, callsBeforeInvalid);
});

test('entity accents and effect accents share one frame budget despite different time samples', () => {
  const {ctx}=makeCanvas();
  vfx.beginFrame({low:false});
  const entity={x:30,y:40,radius:17,classId:'frostmage',status:{}};
  for(let i=0;i<20;i++)vfx.drawEntity(ctx,entity,4+i/1000,{attack:.5,cast:0},{low:false});
  for(let i=0;i<30;i++)vfx.drawEffect(ctx,{type:'impact',x:30,y:40,size:12,t:.1,dur:.5},{low:false,t:4.01+i/1000});
  assert.equal(vfx.metrics.accentEffects,12);
});