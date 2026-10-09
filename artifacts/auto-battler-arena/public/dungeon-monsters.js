/* Dungeon monster body renderer (Frost Yeti, Horned Demon). Visual only: no RNG, no state writes.
   API: window.DungeonMonsters.drawBody(ctx, e, dt) -> true if handled (frost/demon), else false.
   Draws in LOCAL coords centered at 0,0 (caller already translated to e.x,e.y). */
(function () {
  'use strict';
  function bossId(e) {
    var d = e && e._dungeonBoss, id = '';
    if (d && typeof d === 'object') id = d.id || d.encounterId || '';
    else if (e) id = e._dungeonEncounterId || '';
    id = String(id || '').toLowerCase();
    if (id.indexOf('frost') >= 0 || id.indexOf('yeti') >= 0) return 'frost';
    if (id.indexOf('demon') >= 0) return 'demon';
    return '';
  }
  function poly(c, pts, close) {
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    if (close !== false) c.closePath();
  }
  function mirror(c, fn) { fn(1); c.save(); c.scale(-1, 1); fn(-1); c.restore(); }
  var walkMap = {};
  function fin(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function gait(e, t) {
    var k = String(e.id == null ? 'x' : e.id), w = walkMap[k], x = fin(e.x, 0), y = fin(e.y, 0);
    if (!w || t - w.t > 1 || t < w.t) w = walkMap[k] = { x: x, y: y, t: t, ph: 0, mv: 0 };
    if (t !== w.t) {
      var d = Math.sqrt((x - w.x) * (x - w.x) + (y - w.y) * (y - w.y)), dtt = Math.max(.001, t - w.t);
      var sp = Math.min(1, d / dtt / 120);
      w.mv += (sp - w.mv) * Math.min(1, dtt * 8); w.ph += Math.min(d, 12) * .09;
      w.x = x; w.y = y; w.t = t;
    }
    return { mv: w.mv, ph: w.ph };
  }
  // u: 0..1 progress through native atkAnimAt window, -1 if none
  function phase(e, t) {
    var a = atk(e, t), u = -1, an = e.anim || {};
    if (typeof an.attack !== 'number' && typeof an.attackT !== 'number' && e.atkAnimAt != null) {
      var el = (performance.now() - e.atkAnimAt) / 1000, dur = e.atkAnimDur || .34;
      if (el >= 0 && el < dur) u = el / dur;
    }
    var wind, strike, rec;
    if (u >= 0) {
      wind = u < .35 ? u / .35 : Math.max(0, 1 - (u - .35) / .1);
      strike = u >= .35 && u < .6 ? Math.sin(Math.PI * (u - .35) / .25) : 0;
      rec = u > .6 ? 1 - (u - .6) / .4 : 0;
    } else { wind = a * .5; strike = a * .5; rec = 0; }
    return { a: a, wind: wind, strike: strike, rec: rec };
  }
  function lg(c, x0, y0, x1, y1, stops) {
    var g = c.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }
  function atk(e, t) {
    var a = e.anim || {}, p = 0;
    if (typeof a.attack === 'number') p = a.attack;
    else if (typeof a.attackT === 'number') p = a.attackT;
    else if (e.atkAnimAt != null) {
      var el = (performance.now() - e.atkAnimAt) / 1000;
      var dur = e.atkAnimDur || .34;
      if (el >= 0 && el < dur) p = Math.sin(Math.PI * el / dur);
    }
    else if (e.cast && e.cast.remaining > 0) p = .7 + .3 * Math.sin(t * 14);
    return Math.max(0, Math.min(1, p));
  }


  function yeti(c, e, t) {
    var br = Math.sin(t * 1.8 + (e.id || 0)), P = phase(e, t), a = P.a, sw = a * a, g = gait(e, t);
    var f = e.visualFacing || 1, step = Math.sin(g.ph), bob = Math.abs(step) * 3 * g.mv;
    var INK = '#0d1a28';
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    c.fillStyle = 'rgba(0,0,0,.42)'; c.beginPath(); c.ellipse(0, 54, 58, 14, 0, 0, 6.283); c.fill();
    // legs (walk cycle)
    mirror(c, function (s) {
      var lift = Math.max(0, step * s) * 7 * g.mv;
      c.save(); c.translate(0, -lift);
      c.fillStyle = lg(c, 8, 28, 36, 58, [[0, '#dcecf7'], [1, '#8fb0c8']]); c.strokeStyle = INK; c.lineWidth = 3;
      c.beginPath(); c.moveTo(10, 26); c.quadraticCurveTo(38, 24, 38, 46); c.quadraticCurveTo(40, 58, 28, 58); c.lineTo(10, 58); c.quadraticCurveTo(4, 44, 10, 26); c.fill(); c.stroke();
      c.strokeStyle = '#f4fbff'; c.lineWidth = 1.5;
      for (var i = 0; i < 5; i++) { c.beginPath(); c.moveTo(14 + i * 5, 36 + (i % 2) * 6); c.lineTo(12 + i * 5, 46 + (i % 2) * 6); c.stroke(); }
      c.fillStyle = '#1c2836'; c.strokeStyle = INK; c.lineWidth = 1.2;
      for (var j = 0; j < 4; j++) { poly(c, [11 + j * 7, 56, 13 + j * 7, 64, 17 + j * 7, 56]); c.fill(); c.stroke(); }
      c.restore();
    });
    c.translate(0, br * 1.5 - sw * 5 - bob);
    // back fur spikes and ice crystals
    c.fillStyle = '#cfe4f2'; c.strokeStyle = INK; c.lineWidth = 2;
    for (var i = -4; i <= 4; i++) { var bx = i * 10; poly(c, [bx - 8, -26, bx + Math.sin(t * 2 + i) * 1.5, -48 - (4 - Math.abs(i)) * 3, bx + 8, -26]); c.fill(); c.stroke(); }
    c.fillStyle = 'rgba(120,215,255,.85)'; c.strokeStyle = '#eaffff'; c.lineWidth = 1.2;
    poly(c, [-14, -40, -8, -72, 0, -40]); c.fill(); c.stroke();
    poly(c, [2, -40, 12, -66, 18, -38]); c.fill(); c.stroke();
    // torso
    c.fillStyle = lg(c, -50, -30, 50, 50, [[0, '#f6fcff'], [.55, '#d6e8f4'], [1, '#8fb0c8']]); c.strokeStyle = INK; c.lineWidth = 3.5;
    c.beginPath(); c.moveTo(-36, -32); c.quadraticCurveTo(-64, 8, -44, 48); c.lineTo(44, 48);
    c.quadraticCurveTo(64, 8, 36, -32); c.quadraticCurveTo(0, -46, -36, -32); c.fill(); c.stroke();
    // pec / belly shading
    c.fillStyle = 'rgba(120,160,190,.45)';
    c.beginPath(); c.ellipse(-14, -4, 16, 14, -.2, 0, 6.283); c.ellipse(14, -4, 16, 14, .2, 0, 6.283); c.fill();
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.beginPath(); c.ellipse(-16, -9, 9, 5, -.3, 0, 6.283); c.ellipse(16, -9, 9, 5, .3, 0, 6.283); c.fill();
    c.fillStyle = 'rgba(130,170,200,.4)'; c.beginPath(); c.ellipse(0, 28, 22, 16, 0, 0, 6.283); c.fill();
    // layered fur strokes
    c.lineWidth = 2;
    for (var r = 0; r < 4; r++) for (var k = -4; k <= 4; k++) {
      var fx = k * 9 + (r % 2) * 4, fy = -22 + r * 16, sway = Math.sin(t * 1.5 + k + r) * 1;
      c.strokeStyle = r % 2 ? '#9dbdd3' : '#ffffff';
      c.beginPath(); c.moveTo(fx, fy); c.quadraticCurveTo(fx + 2 + sway, fy + 6, fx + 1 + sway, fy + 12); c.stroke();
    }
    // fur skirt tufts along hem
    c.fillStyle = '#e4f1fa'; c.strokeStyle = INK; c.lineWidth = 1.6;
    for (var h = -5; h <= 5; h++) { poly(c, [h * 8 - 5, 44, h * 8, 56, h * 8 + 5, 44]); c.fill(); c.stroke(); }
    // arms: windup raises, contact slams, recovery returns
    mirror(c, function (s) {
      var lead = s === f ? 1 : .2;
      var raise = (-P.wind * 38 + P.strike * 44) * lead + (s === f ? 0 : P.strike * 6), wob = br * 2 * s;
      var swing = -step * s * 6 * g.mv;
      c.save(); c.translate(P.strike * lead * 4, raise * .5 + swing * .4);
      c.fillStyle = lg(c, 24, -34, 70, 50, [[0, '#f6fcff'], [.5, '#d6e8f4'], [1, '#94b4cb']]); c.strokeStyle = INK; c.lineWidth = 3.5;
      c.beginPath(); c.moveTo(28, -36);
      c.quadraticCurveTo(76, -34, 72, 12 + wob); c.quadraticCurveTo(74, 36, 62, 52 + raise * .6);
      c.lineTo(34, 50 + raise * .6); c.quadraticCurveTo(40, 10, 22, -6); c.closePath(); c.fill(); c.stroke();
      // bicep / forearm shading
      c.fillStyle = 'rgba(110,150,180,.4)'; c.beginPath(); c.ellipse(50, 10, 8, 18, .1, 0, 6.283); c.fill();
      c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.ellipse(56, -10, 6, 10, .2, 0, 6.283); c.fill();
      c.strokeStyle = '#ffffff'; c.lineWidth = 1.6;
      for (var q = 0; q < 5; q++) { c.beginPath(); c.moveTo(40 + q * 6, 16 + (q % 2) * 5); c.lineTo(38 + q * 6, 28 + (q % 2) * 5); c.stroke(); }
      var fy = 52 + raise * .6;
      c.fillStyle = lg(c, 34, fy - 10, 62, fy + 14, [[0, '#e6f2fa'], [1, '#98b8ce']]); c.strokeStyle = INK; c.lineWidth = 3;
      c.beginPath(); c.ellipse(48, fy + 2, 17, 13, 0, 0, 6.283); c.fill(); c.stroke();
      c.fillStyle = '#e8f2f8'; c.strokeStyle = '#243447'; c.lineWidth = 1.4;
      var spread = P.strike * 3;
      for (var n = 0; n < 4; n++) { var cx = 36 + n * 8 + spread * (n - 1.5); poly(c, [cx - 3, fy + 10, cx + 1, fy + 24 + P.strike * 4, cx + 5, fy + 10]); c.fill(); c.stroke(); }
      // ice shoulder cluster
      c.fillStyle = 'rgba(140,220,255,.88)'; c.strokeStyle = '#eaffff'; c.lineWidth = 1.5;
      poly(c, [42, -32, 50, -64, 62, -28]); c.fill(); c.stroke();
      poly(c, [58, -26, 76, -48, 74, -14]); c.fill(); c.stroke();
      poly(c, [30, -34, 34, -52, 44, -32]); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1; c.beginPath(); c.moveTo(50, -60); c.lineTo(53, -34); c.stroke();
      c.restore();
    });
    // head
    c.save(); c.translate(0, -40 + sw * 7 - P.wind * 4 + P.strike * 3);
    c.rotate(P.strike * .05 * f);
    c.fillStyle = lg(c, -28, -36, 28, 20, [[0, '#ffffff'], [1, '#bcd6e8']]); c.strokeStyle = INK; c.lineWidth = 3.5;
    c.beginPath(); c.moveTo(-28, -6); c.quadraticCurveTo(-34, -36, 0, -36); c.quadraticCurveTo(34, -36, 28, -6);
    c.quadraticCurveTo(26, 18, 0, 20); c.quadraticCurveTo(-26, 18, -28, -6); c.fill(); c.stroke();
    // cheek fur
    c.fillStyle = '#e8f4fc'; c.lineWidth = 2;
    mirror(c, function () { poly(c, [24, -2, 38, 4, 30, 8, 36, 16, 22, 16]); c.fill(); c.stroke(); });
    // brow spikes + ice horns
    poly(c, [-24, -22, -18, -40, -8, -26]); c.fill(); c.stroke();
    poly(c, [24, -22, 18, -40, 8, -26]); c.fill(); c.stroke();
    c.fillStyle = 'rgba(140,220,255,.9)'; c.strokeStyle = '#eaffff'; c.lineWidth = 1.5;
    mirror(c, function () { poly(c, [14, -32, 24, -58, 22, -28]); c.fill(); c.stroke(); });
    c.fillStyle = '#7fa9c6'; c.beginPath(); c.ellipse(0, 2, 19, 15, 0, 0, 6.283); c.fill();
    c.fillStyle = '#6c97b5'; c.beginPath(); c.ellipse(0, -9, 17, 5, 0, 0, 6.283); c.fill();
    // eyes
    c.shadowColor = '#7fe3ff'; c.shadowBlur = 6 + a * 6; c.fillStyle = '#d8fbff';
    mirror(c, function () { poly(c, [4, -5, 16, -10, 14, -1, 5, -1]); c.fill(); });
    c.shadowBlur = 0; c.fillStyle = '#0b2a44';
    mirror(c, function () { c.fillRect(8, -7, 3, 4); });
    c.strokeStyle = '#13283c'; c.lineWidth = 3;
    mirror(c, function () { c.beginPath(); c.moveTo(2, -10); c.lineTo(18, -15 + a * 3 + P.wind * 2); c.stroke(); });
    c.fillStyle = '#243d52'; c.beginPath(); c.ellipse(0, 4, 4.5, 3, 0, 0, 6.283); c.fill();
    c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(-1, 3, 1.5, 1, 0, 0, 6.283); c.fill();
    // jaw / mouth
    var mo = 3 + a * 9 + P.wind * 3 + (br + 1) * .6;
    c.fillStyle = '#3a0f1e'; c.strokeStyle = INK; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-12, 9); c.quadraticCurveTo(0, 9 + mo * 2, 12, 9); c.quadraticCurveTo(0, 9 + mo * .3, -12, 9); c.fill(); c.stroke();
    c.fillStyle = '#c94a62'; c.beginPath(); c.ellipse(0, 11 + mo * .7, 5, Math.max(.5, mo * .35), 0, 0, 6.283); c.fill();
    c.fillStyle = '#fff6df'; c.strokeStyle = '#6c7a86'; c.lineWidth = 1.4;
    mirror(c, function () { poly(c, [6, 9, 13, 9, 11, 9 + 13 + a * 5]); c.fill(); c.stroke(); poly(c, [-1, 9, 3, 9, 1, 9 + 6]); c.fill(); });
    c.restore();
    // frost rime
    c.fillStyle = 'rgba(210,248,255,.9)';
    for (var j = 0; j < 8; j++) { var ph = t * 1.4 + j * 1.9; c.globalAlpha = .4 + .4 * Math.sin(ph); c.beginPath(); c.arc(-48 + j * 14, -20 + (j % 3) * 18, 1.8, 0, 6.283); c.fill(); }
    c.globalAlpha = 1;
    // V-art: frozen heart rune, rim frost and drifting snow motes (visual only)
    c.save(); c.globalCompositeOperation = 'lighter';
    var hg = c.createRadialGradient(0, 2, 1, 0, 2, 24); hg.addColorStop(0, 'rgba(150,235,255,' + (.35 + .15 * Math.sin(t * 3) + a * .25) + ')'); hg.addColorStop(1, 'rgba(60,160,255,0)');
    c.fillStyle = hg; c.beginPath(); c.arc(0, 2, 24, 0, 6.283); c.fill();
    c.strokeStyle = 'rgba(200,245,255,.55)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-60, -4); c.quadraticCurveTo(-66, 24, -46, 46); c.moveTo(60, -4); c.quadraticCurveTo(66, 24, 46, 46); c.stroke();
    for (var m = 0; m < 10; m++) { var mp = (t * .25 + m * .1) % 1; c.globalAlpha = .6 * (1 - mp); c.fillStyle = '#e6fbff'; c.beginPath(); c.arc(-60 + m * 13 + Math.sin(t + m) * 4, 50 - mp * 110, 1.6, 0, 6.283); c.fill(); }
    c.restore();
    c.globalAlpha = 1;
    c.restore();
  }

  function demon(c, e, t) {
    var br = Math.sin(t * 2 + (e.id || 0)), P = phase(e, t), a = P.a, g = gait(e, t);
    var f = e.visualFacing || 1, step = Math.sin(g.ph), bob = Math.abs(step) * 2.5 * g.mv;
    var INK = '#12040a';
    var flap = Math.sin(t * 2.6 + g.ph * .5) * .18 - P.wind * -.35 - P.strike * .55 + P.rec * .1;
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    c.save(); c.globalCompositeOperation = 'lighter';
    var gr = c.createRadialGradient(0, 0, 10, 0, 0, 90);
    gr.addColorStop(0, 'rgba(255,110,40,' + (.3 + a * .2) + ')'); gr.addColorStop(1, 'rgba(160,20,10,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(0, 0, 90, 0, 6.283); c.fill(); c.restore();
    c.fillStyle = 'rgba(0,0,0,.42)'; c.beginPath(); c.ellipse(0, 54, 48, 11, 0, 0, 6.283); c.fill();
    // wings: bone arm, finger spars, translucent membrane
    mirror(c, function () {
      c.save(); c.translate(14, -22); c.rotate(-flap);
      c.fillStyle = lg(c, 0, -60, 90, 30, [[0, '#7a1a22'], [.6, '#4a0f1a'], [1, '#2a060e']]); c.strokeStyle = INK; c.lineWidth = 3;
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(30, -50, 80, -66);
      c.quadraticCurveTo(72, -42, 100, -24); c.quadraticCurveTo(82, -16, 94, 12);
      c.quadraticCurveTo(68, 2, 68, 30); c.quadraticCurveTo(44, 10, 34, 36); c.quadraticCurveTo(20, 14, 0, 26);
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,120,50,.16)'; poly(c, [4, 2, 80, -64, 98, -22, 92, 10, 68, 28, 34, 34]); c.fill();
      c.strokeStyle = '#d0603a'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(2, 0); c.quadraticCurveTo(34, -42, 80, -66); c.stroke();
      c.lineWidth = 1.6; c.strokeStyle = '#a02a2a';
      [[100, -24], [94, 12], [68, 30], [34, 36]].forEach(function (p) { c.beginPath(); c.moveTo(4, 0); c.lineTo(p[0] - 4, p[1]); c.stroke(); });
      c.fillStyle = '#f2e6d2'; c.strokeStyle = '#3a2a22'; c.lineWidth = 1;
      poly(c, [78, -68, 90, -80, 84, -62]); c.fill(); c.stroke();
      c.restore();
    });
    // tail with spade
    var tw = Math.sin(t * 2.4) * 10 + P.strike * 14 * -f;
    c.strokeStyle = '#2a0a10'; c.lineWidth = 6;
    c.beginPath(); c.moveTo(-6, 34); c.bezierCurveTo(-40, 54, -50 + tw, 18, -64 + tw, 40); c.stroke();
    c.strokeStyle = '#8a1c26'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#ff6a2a'; c.strokeStyle = INK; c.lineWidth = 1.5; poly(c, [-62 + tw, 40, -80 + tw, 28, -72 + tw, 52]); c.fill(); c.stroke();
    c.translate(0, br * 1.2 - bob - P.strike * 2);
    // digitigrade legs
    mirror(c, function (s) {
      var lift = Math.max(0, step * s) * 6 * g.mv;
      c.save(); c.translate(0, -lift);
      c.fillStyle = lg(c, 4, 20, 26, 50, [[0, '#8a1c26'], [1, '#4a0c14']]); c.strokeStyle = INK; c.lineWidth = 3;
      c.beginPath(); c.moveTo(4, 18); c.quadraticCurveTo(28, 18, 26, 34); c.lineTo(18, 42); c.lineTo(20, 50); c.lineTo(2, 50); c.lineTo(8, 38); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,120,60,.35)'; c.beginPath(); c.ellipse(16, 26, 6, 8, .4, 0, 6.283); c.fill();
      c.fillStyle = '#f2e6d2'; c.strokeStyle = '#3a2a22'; c.lineWidth = 1;
      poly(c, [2, 49, 6, 58, 10, 49]); c.fill(); c.stroke(); poly(c, [11, 49, 16, 58, 20, 49]); c.fill(); c.stroke();
      c.restore();
    });
    // torso
    c.fillStyle = lg(c, -26, -26, 26, 36, [[0, '#b02a30'], [.5, '#8a1c26'], [1, '#4a0c14']]); c.strokeStyle = INK; c.lineWidth = 3.5;
    c.beginPath(); c.moveTo(-26, -26); c.quadraticCurveTo(-34, 6, -14, 34); c.lineTo(14, 34); c.quadraticCurveTo(34, 6, 26, -26); c.quadraticCurveTo(0, -34, -26, -26); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,130,70,.28)';
    c.beginPath(); c.ellipse(-10, -12, 10, 8, -.2, 0, 6.283); c.ellipse(10, -12, 10, 8, .2, 0, 6.283); c.fill();
    c.strokeStyle = '#d4552a'; c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(0, -20); c.lineTo(0, 28); c.stroke();
    for (var i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-13, -6 + i * 9); c.quadraticCurveTo(0, -1 + i * 9, 13, -6 + i * 9); c.stroke(); }
    var pulse = .55 + .3 * Math.sin(t * 5) + P.wind * .2;
    c.save(); c.globalCompositeOperation = 'lighter';
    var cg = c.createRadialGradient(0, 4, 1, 0, 4, 14); cg.addColorStop(0, 'rgba(255,200,80,' + pulse + ')'); cg.addColorStop(1, 'rgba(255,80,20,0)');
    c.fillStyle = cg; c.beginPath(); c.arc(0, 4, 14, 0, 6.283); c.fill(); c.restore();
    // arms
    mirror(c, function (s) {
      var lead = s === f ? 1 : .35;
      var up = (P.wind * 30 - P.strike * 26) * lead + a * 6;
      c.save();
      c.fillStyle = lg(c, 18, -22, 46, 14, [[0, '#a02430'], [1, '#5a1019']]); c.strokeStyle = INK; c.lineWidth = 3;
      c.beginPath(); c.moveTo(20, -24); c.quadraticCurveTo(48, -16 - up, 46, 10 - up * 1.4); c.lineTo(34, 12 - up * 1.4); c.quadraticCurveTo(32, -4 - up, 14, -8); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,130,70,.3)'; c.beginPath(); c.ellipse(38, -6 - up * .6, 5, 9, .2, 0, 6.283); c.fill();
      c.fillStyle = '#f2e6d2'; c.strokeStyle = '#3a2a22'; c.lineWidth = 1;
      for (var i = 0; i < 4; i++) { var bx = 33 + i * 4, by = 12 - up * 1.4; poly(c, [bx, by, bx + 2 + P.strike * 2, by + 15 + P.strike * 3, bx + 5, by - 1]); c.fill(); c.stroke(); }
      c.restore();
    });
    // head
    c.save(); c.translate(0, -36 + a * 3 - P.wind * 3);
    mirror(c, function () {
      c.fillStyle = lg(c, 8, -50, 40, -4, [[0, '#f4ead2'], [1, '#a8946e']]); c.strokeStyle = '#2a1a14'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(8, -12); c.quadraticCurveTo(28, -14, 32, -34); c.quadraticCurveTo(40, -52, 50, -54);
      c.quadraticCurveTo(42, -30, 30, -8); c.quadraticCurveTo(18, 0, 10, -2); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = '#8a7650'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(22, -14); c.lineTo(28, -11); c.moveTo(29, -24); c.lineTo(35, -20); c.moveTo(34, -34); c.lineTo(39, -31); c.stroke();
    });
    c.fillStyle = lg(c, -14, -18, 14, 14, [[0, '#b83036'], [1, '#6a1620']]); c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-14, -12); c.quadraticCurveTo(0, -20, 14, -12); c.lineTo(12, 8); c.quadraticCurveTo(0, 18, -12, 8); c.closePath(); c.fill(); c.stroke();
    mirror(c, function () { c.fillStyle = '#a02430'; poly(c, [13, -4, 26, -10, 14, 3]); c.fill(); c.stroke(); });
    c.strokeStyle = '#3a0a10'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -17); c.lineTo(0, -6); c.stroke();
    c.shadowColor = '#ffd23a'; c.shadowBlur = 8 + a * 6; c.fillStyle = '#ffe14a';
    mirror(c, function () { poly(c, [3, -6, 12, -10, 10, -2, 4, -3]); c.fill(); });
    c.shadowBlur = 0; c.fillStyle = '#1a0406';
    mirror(c, function () { c.fillRect(6, -7, 2, 4); });
    c.strokeStyle = '#1a0406'; c.lineWidth = 2.2;
    mirror(c, function () { c.beginPath(); c.moveTo(2, -10); c.lineTo(13, -13 + a * 2); c.stroke(); });
    var mo = 2 + a * 7 + P.wind * 2;
    c.fillStyle = '#2a0508'; c.beginPath(); c.moveTo(-8, 4); c.quadraticCurveTo(0, 4 + mo * 1.6, 8, 4); c.closePath(); c.fill();
    c.fillStyle = '#fff2d6';
    mirror(c, function () { poly(c, [3, 4, 7, 4, 5, 10]); c.fill(); });
    c.restore();
    // shoulder flames
    c.save(); c.globalCompositeOperation = 'lighter';
    for (var j = 0; j < 6; j++) {
      var sd = j < 3 ? -1 : 1, x = sd * (18 + (j % 3) * 8), ph = t * 6 + j * 1.3, h = 12 + 5 * Math.sin(ph) + P.wind * 6;
      c.fillStyle = j % 2 ? 'rgba(255,150,40,.7)' : 'rgba(255,80,30,.7)';
      poly(c, [x - 5, -26, x + Math.sin(ph) * 3, -26 - h, x + 5, -26]); c.fill();
    }
    c.restore();
    // V-art: lava fissures, horn-tip embers and rising sparks (visual only)
    c.save(); c.globalCompositeOperation = 'lighter';
    c.strokeStyle = 'rgba(255,170,60,' + (.45 + .25 * Math.sin(t * 4)) + ')'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(-18, -22); c.lineTo(-10, -8); c.lineTo(-16, 6); c.moveTo(18, -22); c.lineTo(11, -4); c.lineTo(17, 12); c.stroke();
    for (var k = 0; k < 9; k++) { var kp = (t * .35 + k * .111) % 1; c.globalAlpha = .8 * (1 - kp); c.fillStyle = k % 2 ? '#ffb347' : '#ff6a2a'; c.beginPath(); c.arc(-44 + k * 11 + Math.sin(t * 2 + k) * 5, 30 - kp * 100, 1.7, 0, 6.283); c.fill(); }
    c.globalAlpha = 1;
    var hx = [-1, 1];
    for (var q = 0; q < 2; q++) { var hgx = hx[q] * 50, hgy = -92; var hr = c.createRadialGradient(hgx, hgy, 0, hgx, hgy, 12); hr.addColorStop(0, 'rgba(255,190,80,' + (.5 + .2 * Math.sin(t * 5 + q)) + ')'); hr.addColorStop(1, 'rgba(255,80,20,0)'); c.fillStyle = hr; c.beginPath(); c.arc(hgx, hgy, 12, 0, 6.283); c.fill(); }
    c.restore();
    c.restore();
  }

  function getBodyFootprint(e) {
    var id = bossId(e);
    if (!id) return null;
    // Cover idle fists, fur and the head, not decorative wings or attack arcs.
    return id === 'frost' ? { rx: 76, ry: 88, cx: 0, cy: -9, power: 4 }
      : { rx: 64, ry: 78, cx: 0, cy: -4, power: 4 };
  }

  function drawBody(ctx, e, dt) {
    var id = bossId(e);
    if (!id || !ctx || !e) return false;
    var t = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
    ctx.save();
    if (id === 'frost') yeti(ctx, e, t); else demon(ctx, e, t);
    ctx.restore();
    return true;
  }
  window.DungeonMonsters = { drawBody: drawBody, isMonster: bossId, getBodyFootprint: getBodyFootprint };
})();
