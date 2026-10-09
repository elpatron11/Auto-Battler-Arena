(function (root) {
  'use strict';

  let histories = new WeakMap();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const smooth = (a, b, value) => {
    const x = clamp((value - a) / (b - a), 0, 1);
    return x * x * (3 - 2 * x);
  };

  function clockSeconds() {
    if (root.performance && typeof root.performance.now === 'function') return root.performance.now() / 1000;
    return Date.now() / 1000;
  }

  function attackTarget(e, attack, casting) {
    const castTarget = casting && (casting.target || casting.targetEntity || casting.targetUnit);
    if (castTarget && finite(castTarget.x) && finite(castTarget.y)) return castTarget;
    if (attack > 0.015 && e.lastTarget && finite(e.lastTarget.x) && finite(e.lastTarget.y)) return e.lastTarget;
    if (attack > 0.015 && e.target && finite(e.target.x) && finite(e.target.y)) return e.target;
    return null;
  }

  function pose(e, t, dt) {
    if (!e || (typeof e !== 'object' && typeof e !== 'function')) return null;
    const now = finite(t) ? t : clockSeconds();
    const x = finite(e.x) ? e.x : 0;
    const y = finite(e.y) ? e.y : 0;
    const status = e.status && typeof e.status === 'object' ? e.status : {};
    const history = histories.get(e);

    // Main can ask for the same pose before a dead-entity early return and
    // again from body drawing. Do not consume positional history twice.
    if (history && history.pose && history.lastPoseTime === now) return history.pose;

    const elapsed = history
      ? clamp(finite(dt) ? dt : now - history.lastPoseTime, 0, 0.25)
      : 0;
    const dx = history ? x - history.x : 0;
    const dy = history ? y - history.y : 0;
    const distance = Math.hypot(dx, dy);
    const speed = elapsed > 0 ? distance / elapsed : 0;

    const stunned = finite(status.stunTimer) && status.stunTimer > 0;
    const rooted = finite(status.rootTimer) && status.rootTimer > 0;
    const feared = finite(status.fearTimer) && status.fearTimer > 0;
    const disoriented = finite(status.disorientTimer) && status.disorientTimer > 0;
    const sapped = finite(status.sapTimer) && status.sapTimer > 0;
    const polymorphed = !!status.polymorphed;
    const silenced = finite(status.silenceTimer) && status.silenceTimer > 0;
    const immobilized = stunned || rooted || sapped || polymorphed;

    // A renderer's cached moveSpeed may be useful on a preview's first
    // sample, but only alongside actual cached coordinate movement. Never
    // interpret a nominal stat as travel.
    const cachedTravel = !history && finite(e.moveSpeed) && e.moveSpeed > 0 &&
      finite(e._lastDrawX) && finite(e._lastDrawY) &&
      Math.hypot(x - e._lastDrawX, y - e._lastDrawY) > 0.08;
    const observedSpeed = speed > 0 ? speed : (cachedTravel ? e.moveSpeed : 0);
    const move = immobilized || e.alive === false ? 0 : smooth(7, 92, observedSpeed);

    const attackAt = finite(e.atkAnimAt) ? e.atkAnimAt : 0;
    const attackDur = finite(e.atkAnimDur) && e.atkAnimDur > 0 ? e.atkAnimDur : 0.34;
    const attackElapsed = now * 1000 - attackAt;
    const attackProgress = attackElapsed >= 0 && attackElapsed < attackDur * 1000
      ? clamp(attackElapsed / (attackDur * 1000), 0, 1)
      : 0;
    const attack = attackProgress > 0 ? Math.sin(Math.PI * attackProgress) : 0;
    const windup = attackProgress > 0 && attackProgress < 0.28
      ? 1 - attackProgress / 0.28
      : 0;
    const followThrough = attackProgress > 0.55
      ? smooth(0.55, 1, attackProgress) * (1 - attackProgress)
      : 0;

    const casting = e.casting && typeof e.casting === 'object' ? e.casting : null;
    const castTotal = casting && finite(casting.total) && casting.total > 0 ? casting.total : 0;
    const castLeft = casting && finite(casting.timeLeft) ? clamp(casting.timeLeft, 0, castTotal) : castTotal;
    const cast = casting && castTotal > 0 ? clamp(1 - castLeft / castTotal, 0, 1) : (casting ? 0.12 : 0);
    const hitAt = finite(e.hitFlashAt) ? e.hitFlashAt : 0;
    const hitDur = finite(e.hitFlashDur) && e.hitFlashDur > 0 ? e.hitFlashDur : 0.18;
    const hitElapsed = now * 1000 - hitAt;
    const hit = hitElapsed >= 0 && hitElapsed < hitDur * 1000
      ? Math.sin(Math.PI * clamp(hitElapsed / (hitDur * 1000), 0, 1))
      : 0;

    const sample = history || {
      x, y, lastPoseTime: now, lastAlive: e.alive !== false, dead: e.alive === false,
      deathStart: e.alive === false ? now - 0.5 : null, facing: e.visualFacing === -1 ? -1 : (e.team === 'player' ? 1 : -1),
      stridePhase: 0, pose: null, heading: e.visualFacing === -1 ? -1 : (e.team === 'player' ? 1 : -1)
    };

    if (sample.lastAlive && e.alive === false && !sample.dead) {
      sample.dead = true;
      sample.deathStart = now;
    } else if (!sample.lastAlive && e.alive === false && !sample.dead) {
      sample.dead = true;
      sample.deathStart = now;
    }
    // Follow a real gameplay resurrection; never resurrect anything ourselves.
    if (sample.dead && e.alive === true) {
      sample.dead = false;
      sample.deathStart = null;
    }
    if (sample.dead && sample.deathStart === null) sample.deathStart = now;
    sample.lastAlive = sample.dead ? false : e.alive !== false;

    let wantedFacing = null;
    const target = attackTarget(e, attack, casting);
    if (target) {
      const toward = target.x - x;
      if (Math.abs(toward) > 0.6) wantedFacing = toward < 0 ? -1 : 1;
    }
    if (wantedFacing === null && attack > 0.015 && finite(e.atkAnimAng)) {
      const facingX = Math.cos(e.atkAnimAng);
      if (Math.abs(facingX) > 0.12) wantedFacing = facingX < 0 ? -1 : 1;
    }
    if (wantedFacing === null && Math.abs(dx) > 0.12 && !immobilized) wantedFacing = dx < 0 ? -1 : 1;
    if (wantedFacing !== null) {
      const blend = history ? 1 - Math.exp(-Math.max(elapsed, 1 / 120) * 11) : 1;
      const turned = sample.heading + (wantedFacing - sample.heading) * blend;
      sample.heading = turned;
      sample.facing = Math.sign(turned || wantedFacing) *
        Math.max(0.6, Math.abs(turned));
    }
    // Preserve a readable two-sided silhouette during a turn: facing never
    // approaches a zero-width edge-on state or flips on a vanished target.
    sample.facing = Math.sign(sample.facing || (e.team === 'player' ? 1 : -1)) *
      Math.max(0.6, Math.abs(sample.facing));

    if (history && distance > 0.08) {
      sample.stridePhase = (sample.stridePhase + Math.min(distance / Math.max(finite(e.radius) ? e.radius : 16, 8), 1.5)) % (Math.PI * 2);
    } else if (history && move > 0 && elapsed > 0) {
      sample.stridePhase = (sample.stridePhase + elapsed * (4 + move * 5)) % (Math.PI * 2);
    }

    const death = sample.dead
      ? smooth(0, 0.5, Math.max(0, now - sample.deathStart))
      : 0;
    const fade = sample.dead ? 1 - death : 1;
    const cc = {
      stunned, frozen: stunned && status.stunKind === 'freeze', rooted,
      feared, disoriented, sapped, polymorphed, silenced,
      locked: immobilized,
      intensity: (stunned || polymorphed || sapped ? 1 : 0) +
        (rooted ? 0.72 : 0) + (feared || disoriented ? 0.42 : 0) + (silenced ? 0.18 : 0)
    };
    const result = {
      move,
      stride: Math.sin(sample.stridePhase),
      attack,
      windup,
      followThrough,
      cast,
      hit,
      breath: 0.5 + 0.5 * Math.sin(now * 2.1 + (finite(e.id) ? e.id * 1.73 : 0)),
      facing: sample.facing,
      lean: clamp((dx / Math.max(elapsed * 150, 1)) * 0.08 + (wantedFacing === -1 ? -1 : 1) * (attack * 0.08 + cast * 0.035), -0.2, 0.2),
      cc,
      death,
      fade,
      ghost: Object.freeze({ dead: sample.dead, alpha: fade, tilt: death * (sample.facing || 1) * 0.9 })
    };

    sample.x = x;
    sample.y = y;
    sample.lastPoseTime = now;
    sample.pose = result;
    histories.set(e, sample);
    return result;
  }

  function reset() {
    // WeakMap cannot be cleared; replace it without touching entities.
    histories = new WeakMap();
  }

  root.RosterPolishMotion = Object.freeze({ pose, reset });
})(typeof window !== 'undefined' ? window : globalThis);