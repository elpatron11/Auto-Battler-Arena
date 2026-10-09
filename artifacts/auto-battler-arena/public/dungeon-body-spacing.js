/* Large monster contact geometry. Combat stats and ordinary arena geometry stay unchanged. */
(function () {
  'use strict';
  function footprint(boss) {
    // Keep occupancy stable while polymorphed so restoring the large body
    // cannot engulf heroes held in place by roots.
    if (!boss || !boss.alive || !boss._dungeonBoss) return null;
    return window.DungeonMonsters && window.DungeonMonsters.getBodyFootprint
      ? window.DungeonMonsters.getBodyFootprint(boss) : null;
  }
  function geometry(boss, unit, x, y) {
    var f = footprint(boss);
    if (!f) return null;
    var radius = Number(unit.radius) || 17;
    var dx = x - boss.x - (f.cx || 0), dy = y - boss.y - (f.cy || 0);
    var rx = f.rx + radius + 2, ry = f.ry + radius + 2;
    var d = Math.hypot(dx, dy);
    var angle = d > 0.001 ? Math.atan2(dy, dx) : Math.PI + ((unit.id || 0) % 7 - 3) * 0.13;
    var c = Math.cos(angle), s = Math.sin(angle);
    var power = f.power || 2;
    var boundary = 1 / Math.pow(Math.pow(Math.abs(c) / rx, power) + Math.pow(Math.abs(s) / ry, power), 1 / power);
    return { dx: dx, dy: dy, d: d, angle: angle, boundary: boundary, gap: d - boundary };
  }
  function distance(attacker, target) {
    var raw = Math.hypot(attacker.x - target.x, attacker.y - target.y);
    if (!attacker.melee) return raw;
    // Only melee attacks against a large body need reach compensation.
    var g = geometry(target, attacker, attacker.x, attacker.y);
    if (g) {
      var oldContact = ((target.radius || 34) + (attacker.radius || 17)) * 0.86;
      // Preserve heroes' previous contact distance and ability policy (notably
      // Warrior Charge readiness). Short-range pets need their own edge reach.
      var contact = attacker.isPet
        ? Math.min(oldContact, (attacker.range || oldContact) * 0.9)
        : oldContact;
      return Math.max(0, g.gap + contact);
    }
    // A boss cannot walk through a rooted hero to reach an otherwise valid
    // melee target. Permit a swing at body contact, not additional open reach.
    g = geometry(attacker, target, target.x, target.y);
    if (g && g.gap <= 2) return Math.min(raw, attacker.range);
    return raw;
  }
  function canOccupy(entity, x, y, entities) {
    if (!entity || !entity.alive) return true;
    var own = footprint(entity);
    for (var i = 0; i < entities.length; i++) {
      var other = entities[i];
      if (other === entity || !other.alive) continue;
      var g, before;
      if (own && !other._dungeonBoss) {
        // Evaluate a prospective boss translation without changing the entity.
        g = geometry(entity, other, other.x - (x - entity.x), other.y - (y - entity.y));
        before = geometry(entity, other, other.x, other.y);
      } else if (!entity._dungeonBoss && footprint(other)) {
        g = geometry(other, entity, x, y);
        before = geometry(other, entity, entity.x, entity.y);
      }
      if (g && g.gap < -0.01 && (!before || g.gap < before.gap - 0.01)) return false;
    }
    return true;
  }
  function pinned(e) { return e._dungeonBoss || (e.status && e.status.rootTimer > 0); }
  function outsideAll(e, x, y, entities) {
    for (var i = 0; i < entities.length; i++) {
      if (entities[i] === e) continue;
      var g = geometry(entities[i], e, x, y);
      if (g && g.gap < 0) return false;
    }
    return true;
  }
  function destination(e, x, y, entities, legal) {
    if (outsideAll(e, x, y, entities)) return { x: x, y: y };
    legal = legal || function () { return true; };
    var best = null, cost = Infinity;
    for (var i = 0; i < entities.length; i++) {
      var boss = entities[i], f = footprint(boss);
      if (!f || boss === e) continue;
      var original = geometry(boss, e, x, y);
      if (original.gap >= 0) continue;
      // Search the nearest legal perimeter point rather than giving up when
      // the radial correction faces an arena edge or wall.
      for (var j = 0; j < 72; j++) {
        var angle = original.angle + (j === 0 ? 0 : (j % 2 ? 1 : -1) * Math.ceil(j / 2) * Math.PI / 36);
        var sample = geometry(boss, e, boss.x + (f.cx || 0) + Math.cos(angle),
          boss.y + (f.cy || 0) + Math.sin(angle));
        var px = boss.x + (f.cx || 0) + Math.cos(angle) * (sample.boundary + 0.05);
        var py = boss.y + (f.cy || 0) + Math.sin(angle) * (sample.boundary + 0.05);
        if (!legal(e, px, py) || !outsideAll(e, px, py, entities)) continue;
        if (j === 0) return { x: px, y: py };
        var d = (px - x) * (px - x) + (py - y) * (py - y);
        if (d < cost) { cost = d; best = { x: px, y: py }; }
      }
    }
    return best || { x: e.x, y: e.y };
  }
  function project(boss, e, move, entities, legal) {
    if (pinned(e)) return;
    var g = geometry(boss, e, e.x, e.y);
    if (g && g.gap < 0) {
      var point = destination(e, e.x, e.y, entities, legal);
      move(e, point.x - e.x, point.y - e.y);
    }
  }
  function slide(boss, e, angleDelta, move, entities, legal) {
    if (pinned(e)) return;
    var g = geometry(boss, e, e.x, e.y), f = footprint(boss);
    var angle = g.angle + angleDelta;
    var edge = geometry(boss, e, boss.x + (f.cx || 0) + Math.cos(angle),
      boss.y + (f.cy || 0) + Math.sin(angle));
    // Resolve peers along the perimeter, not outward into a second row
    // where short-range melee pets can no longer reach the boss.
    var r = edge.boundary + Math.max(0.05, g.gap);
    var x = boss.x + (f.cx || 0) + Math.cos(angle) * r;
    var y = boss.y + (f.cy || 0) + Math.sin(angle) * r;
    if ((!legal || legal(e, x, y)) && outsideAll(e, x, y, entities)) move(e, x - e.x, y - e.y);
  }
  function resolve(entities, move, legal) {
    var bosses = entities.filter(function (e) { return footprint(e); });
    for (var bi = 0; bi < bosses.length; bi++) {
      var boss = bosses[bi];
      var near = entities.filter(function (e) {
        if (!e.alive || e._dungeonBoss) return false;
        var g = geometry(boss, e, e.x, e.y);
        return g && g.gap < 34;
      }).sort(function (a, b) { return (a.id || 0) - (b.id || 0); });
      // Alternating contact and peer constraints spreads a scrum around the
      // perimeter rather than allocating teleporting, randomly shuffled slots.
      for (var pass = 0; pass < 6; pass++) {
        for (var i = 0; i < near.length; i++) project(boss, near[i], move, entities, legal);
        for (var ai = 0; ai < near.length; ai++) {
          for (var j = ai + 1; j < near.length; j++) {
            var a = near[ai], b = near[j];
            var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
            var min = (a.radius || 17) + (b.radius || 17) + 3;
            if (d >= min) continue;
            var ga = geometry(boss, a, a.x, a.y), gb = geometry(boss, b, b.x, b.y);
            var angleDifference = Math.atan2(Math.sin(gb.angle - ga.angle), Math.cos(gb.angle - ga.angle));
            var sign = angleDifference < -0.0001 ? -1 : 1;
            var push = min - d;
            var af = pinned(a), bf = pinned(b);
            if (!af) slide(boss, a, -sign * push * (bf ? 1 : 0.5) / ga.boundary, move, entities, legal);
            if (!bf) slide(boss, b, sign * push * (af ? 1 : 0.5) / gb.boundary, move, entities, legal);
          }
        }
      }
      // Last constraint is always the boss body; no peer pass may re-embed it.
      for (var k = 0; k < near.length; k++) project(boss, near[k], move, entities, legal);
    }
  }
  window.DungeonBodySpacing = { distance: distance, canOccupy: canOccupy, resolve: resolve, geometry: geometry, destination: destination };
})();