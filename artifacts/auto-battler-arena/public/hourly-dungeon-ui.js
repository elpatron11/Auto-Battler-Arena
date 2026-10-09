(function () {
  'use strict';
  if (window.HourlyDungeonPresentation) return;

  /* ---------- data ---------- */
  var ARENAS = {
    frost: { name: 'Frost Cavern', boss: 'Frostbound Colossus', reward: '+5% max HP', rk: 'maxHp', col: '#7fd4ff',
      mech: ['Ice ground: a marked circle locks onto a hero’s position before it shatters.', 'Ice Nova: a wider warning appears around the Colossus before the burst.', 'Caught heroes take damage and are briefly frozen. Your heroes automatically try to evade.'] },
    demon: { name: 'Demon Crypt', boss: 'Ashen Demon', reward: '+4% damage', rk: 'damage', col: '#ff6a4a',
      mech: ['Summon call: the Demon periodically calls small guards into the arena.', 'At most two adds can be alive at once. Defeat them to reduce incoming pressure.', 'Defeat the Demon to end the encounter; remaining summons disappear.'] },
    temple: { name: 'Ancient Temple', boss: 'Temple Guardian', reward: '+5% healing', rk: 'healing', col: '#e6c36a',
      mech: ['Frontal Slam: the Guardian marks a wide cone before striking.', 'The direction locks when the warning starts, giving heroes time to move sideways.', 'Heroes caught in the cone take a heavy hit. Keep your squad healthy.'] }
  };
  var W = function () { return typeof ARENA_W === 'number' ? ARENA_W : 900; };
  var H = function () { return typeof ARENA_H === 'number' ? ARENA_H : 600; };

  function rng(seed) { var a = seed; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function pid(id) { id = String(id || '').toLowerCase(); if (id.indexOf('frost') >= 0) return 'frost'; if (id.indexOf('demon') >= 0 || id.indexOf('crypt') >= 0) return 'demon'; if (id.indexOf('temple') >= 0 || id.indexOf('ancient') >= 0) return 'temple'; return ''; }

  /* ---------- cached backgrounds ---------- */
  var cache = {};
  function edgePts(r, n, w, h, m) { // points along rim only
    var out = [], i, side, t;
    for (i = 0; i < n; i++) { side = i % 4; t = r();
      out.push(side === 0 ? [t * w, m * r()] : side === 1 ? [w - m * r(), t * h] : side === 2 ? [t * w, h - m * r()] : [m * r(), t * h]); }
    return out;
  }
  function build(id) {
    var w = W(), h = H(), c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'), r = rng(id === 'frost' ? 11 : id === 'demon' ? 23 : 37), i, p, x, y;
    var base = { frost: ['#27506b', '#0d1f33'], demon: ['#3b1a1c', '#120709'], temple: ['#4a4030', '#17130d'] }[id];
    var gr = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * .62);
    gr.addColorStop(0, base[0]); gr.addColorStop(1, base[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // floor tiles (flat decoration, no obstacles)
    g.lineWidth = 1; g.strokeStyle = id === 'frost' ? 'rgba(190,230,255,.07)' : id === 'demon' ? 'rgba(255,120,80,.07)' : 'rgba(255,225,150,.08)';
    g.beginPath(); for (x = 0; x <= w; x += 60) { g.moveTo(x, 0); g.lineTo(x, h); } for (y = 0; y <= h; y += 60) { g.moveTo(0, y); g.lineTo(w, y); } g.stroke();
    // floor texture patches
    for (i = 0; i < 40; i++) { x = r() * w; y = r() * h; g.fillStyle = 'rgba(' + (id === 'demon' ? '255,90,60' : id === 'frost' ? '200,240,255' : '255,220,140') + ',' + (.02 + r() * .035) + ')';
      g.beginPath(); g.ellipse(x, y, 14 + r() * 40, 8 + r() * 22, r() * 3, 0, 7); g.fill(); }
    if (id === 'frost') {
      g.strokeStyle = 'rgba(210,245,255,.16)'; g.lineWidth = 1.5; g.beginPath();
      for (i = 0; i < 14; i++) { x = r() * w; y = r() * h; g.moveTo(x, y); g.lineTo(x + (r() - .5) * 120, y + (r() - .5) * 120); } g.stroke();
      // faint centre rune ring
      g.strokeStyle = 'rgba(160,220,255,.14)'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) * .3, 0, 7); g.stroke();
    } else if (id === 'demon') {
      g.strokeStyle = 'rgba(255,100,50,.2)'; g.lineWidth = 2; g.beginPath(); // lava cracks near edges
      edgePts(r, 16, w, h, 120).forEach(function (q) { g.moveTo(q[0], q[1]); g.lineTo(q[0] + (r() - .5) * 90, q[1] + (r() - .5) * 90); }); g.stroke();
      g.strokeStyle = 'rgba(255,90,60,.16)'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) * .32, 0, 7); g.stroke();
      for (i = 0; i < 6; i++) { var a = i / 6 * 6.283; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 150, h / 2 + Math.sin(a) * 150); g.lineTo(w / 2 + Math.cos(a + 2.1) * 150, h / 2 + Math.sin(a + 2.1) * 150); g.stroke(); }
    } else {
      g.strokeStyle = 'rgba(235,200,100,.2)'; g.lineWidth = 2.5;
      [.34, .27].forEach(function (k) { g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) * k, 0, 7); g.stroke(); });
      g.lineWidth = 1.5; for (i = 0; i < 24; i++) { var b = i / 24 * 6.283, R = Math.min(w, h) * .3; g.beginPath(); g.moveTo(w / 2 + Math.cos(b) * R, h / 2 + Math.sin(b) * R); g.lineTo(w / 2 + Math.cos(b) * (R + 12), h / 2 + Math.sin(b) * (R + 12)); g.stroke(); }
      // engraved gold border band
      g.strokeStyle = 'rgba(230,195,106,.35)'; g.lineWidth = 3; g.strokeRect(14, 14, w - 28, h - 28); g.lineWidth = 1; g.strokeRect(22, 22, w - 44, h - 44);
      g.fillStyle = 'rgba(230,195,106,.3)';
      for (i = 0; i < 28; i++) { x = 40 + i * (w - 80) / 27; g.fillRect(x - 3, 28, 6, 3); g.fillRect(x - 3, h - 31, 6, 3); }
      for (i = 0; i < 18; i++) { y = 40 + i * (h - 80) / 17; g.fillRect(28, y - 3, 3, 6); g.fillRect(w - 31, y - 3, 3, 6); }
    }
    // rim decoration
    if (id === 'frost') {
      edgePts(r, 34, w, h, 46).forEach(function (q) { var s = 14 + r() * 26, a = (r() - .5) * .6;
        g.save(); g.translate(q[0], q[1]); g.rotate(a); g.fillStyle = 'rgba(140,215,255,.5)'; g.strokeStyle = 'rgba(230,250,255,.8)'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(0, -s * 1.6); g.lineTo(s * .45, 0); g.lineTo(0, s * .5); g.lineTo(-s * .45, 0); g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(0, -s * 1.6); g.lineTo(0, s * .5); g.stroke(); g.restore(); });
    } else if (id === 'demon') {
      for (i = 0; i < 12; i++) { p = i < 4 ? [w * (.1 + i * .27), 26] : i < 8 ? [w * (.1 + (i - 4) * .27), h - 26] : i < 10 ? [24, h * (.3 + (i - 8) * .4)] : [w - 24, h * (.3 + (i - 10) * .4)];
        var gg = g.createRadialGradient(p[0], p[1], 2, p[0], p[1], 56); gg.addColorStop(0, 'rgba(255,150,60,.5)'); gg.addColorStop(1, 'rgba(255,60,20,0)');
        g.fillStyle = gg; g.fillRect(p[0] - 56, p[1] - 56, 112, 112);
        g.fillStyle = '#2a1a1c'; g.strokeStyle = '#7a3a30'; g.beginPath(); g.moveTo(p[0] - 14, p[1] + 14); g.lineTo(p[0] - 9, p[1] - 3); g.lineTo(p[0] + 9, p[1] - 3); g.lineTo(p[0] + 14, p[1] + 14); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#ff7a30'; g.beginPath(); g.arc(p[0], p[1] - 6, 5, 0, 7); g.fill(); g.fillStyle = '#ffd070'; g.beginPath(); g.arc(p[0], p[1] - 6, 2.4, 0, 7); g.fill(); }
      for (i = 0; i < 40; i++) { p = edgePts(r, 1, w, h, 70)[0]; g.fillStyle = 'rgba(255,' + (80 + r() * 90 | 0) + ',40,.65)'; g.fillRect(p[0], p[1], 2, 2); }
    } else {
      for (i = 0; i < 8; i++) { p = i < 4 ? [w * (.14 + i * .24), 46] : [w * (.14 + (i - 4) * .24), h - 46];
        g.fillStyle = 'rgba(30,24,14,.8)'; g.strokeStyle = 'rgba(230,195,106,.7)'; g.lineWidth = 2; g.fillRect(p[0] - 11, p[1] - 11, 22, 22); g.strokeRect(p[0] - 11, p[1] - 11, 22, 22);
        g.fillStyle = 'rgba(255,220,130,.7)'; g.beginPath(); g.moveTo(p[0], p[1] - 6); g.lineTo(p[0] + 6, p[1]); g.lineTo(p[0], p[1] + 6); g.lineTo(p[0] - 6, p[1]); g.closePath(); g.fill(); }
    }
    // vignette
    var v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .45, w / 2, h / 2, Math.max(w, h) * .75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.5)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
    return c;
  }
  function getBg(id) { var k = id + W() + 'x' + H(); if (!cache[k]) cache[k] = build(id); return cache[k]; }

  function drawArena(ctx, state) {
    var d = state && (state.dungeonEncounter || state.encounter || state.dungeon) || {};
    var id = pid(d.id || d.encounterId || (state && state.dungeonId));
    if (!id) return false;
    ctx.drawImage(getBg(id), 0, 0);
    // tiny animated glow at rim (few ops)
    var t = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000, w = W(), h = H();
    ctx.save(); ctx.globalAlpha = .05 + .03 * Math.sin(t * 2);
    ctx.fillStyle = id === 'frost' ? '#9fe0ff' : id === 'demon' ? '#ff6a30' : '#ffd878';
    ctx.fillRect(0, 0, w, 8); ctx.fillRect(0, h - 8, w, 8); ctx.fillRect(0, 0, 8, h); ctx.fillRect(w - 8, 0, 8, h);
    ctx.restore();
    return true;
  }

  /* ---------- encounter overlays ---------- */
  function drawHazard(ctx, hz, col, t) {
    var dur = hz.duration > 0 ? hz.duration : 1.5, rem = Math.max(0, hz.remaining || 0);
    var p = Math.min(1, Math.max(0, 1 - rem / dur)), pulse = .75 + .25 * Math.sin(t * 9);
    ctx.save(); ctx.lineJoin = 'round';
    ctx.beginPath();
    if (hz.kind === 'cone') { var a = hz.angle || 0, s = (hz.spread || 1) / 2; ctx.moveTo(hz.x, hz.y); ctx.arc(hz.x, hz.y, hz.radius, a - s, a + s); ctx.closePath(); }
    else ctx.arc(hz.x, hz.y, hz.radius, 0, 7);
    ctx.fillStyle = 'rgba(255,40,40,' + (.14 + .26 * p) + ')'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,0,0,.7)'; ctx.stroke();
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,' + (rem < 0.6 ? 230 : 120) + ',90,' + pulse + ')'; ctx.setLineDash([10, 7]); ctx.stroke(); ctx.setLineDash([]);
    // filling inner marker
    ctx.beginPath();
    if (hz.kind === 'cone') { ctx.moveTo(hz.x, hz.y); ctx.arc(hz.x, hz.y, hz.radius * p, (hz.angle || 0) - (hz.spread || 1) / 2, (hz.angle || 0) + (hz.spread || 1) / 2); ctx.closePath(); }
    else ctx.arc(hz.x, hz.y, hz.radius * p, 0, 7);
    ctx.fillStyle = 'rgba(255,70,50,.28)'; ctx.fill();
    // countdown label
    var lx = hz.x, ly = hz.y;
    if (hz.kind === 'cone') { lx = hz.x + Math.cos(hz.angle || 0) * hz.radius * .6; ly = hz.y + Math.sin(hz.angle || 0) * hz.radius * .6; }
    ctx.font = '800 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 5; ctx.strokeStyle = '#1a0505'; ctx.fillStyle = '#fff1d0';
    var txt = rem.toFixed(1); ctx.strokeText(txt, lx, ly); ctx.fillText(txt, lx, ly);
    ctx.restore();
  }
  function bossGlow(ctx, b, id, el) {
    // These monsters have their own complete bodies and animated auras.
    // Do not superimpose the old skull/horn/ice-ring decorations.
    if (window.DungeonMonsters && window.DungeonMonsters.isMonster(b)) return;
    var x = b.x, y = b.y, r = Math.max(b.radius || b.r || 34, 30) * 1.15, t = el || 0, i, a;
    ctx.save();
    ctx.globalAlpha = .55 + .15 * Math.sin(t * 3);
    ctx.lineWidth = 4;
    if (id === 'frost') {
      ctx.strokeStyle = '#bfeaff'; ctx.fillStyle = 'rgba(130,210,255,.35)';
      for (i = 0; i < 8; i++) { a = i / 8 * 6.283 + t * .3; ctx.beginPath(); ctx.moveTo(x + Math.cos(a - .12) * r, y + Math.sin(a - .12) * r); ctx.lineTo(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6); ctx.lineTo(x + Math.cos(a + .12) * r, y + Math.sin(a + .12) * r); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    } else if (id === 'demon') {
      ctx.strokeStyle = '#ff7a3a'; ctx.beginPath(); ctx.arc(x, y, r * 1.1, 0, 7); ctx.stroke();
      ctx.fillStyle = '#ff5a2a'; ctx.beginPath(); ctx.moveTo(x - r * .7, y - r * .7); ctx.lineTo(x - r * 1.25, y - r * 1.5); ctx.lineTo(x - r * .2, y - r * .95); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + r * .7, y - r * .7); ctx.lineTo(x + r * 1.25, y - r * 1.5); ctx.lineTo(x + r * .2, y - r * .95); ctx.fill();
      ctx.globalAlpha = .9; ctx.fillStyle = '#f2e6d2'; ctx.beginPath(); ctx.arc(x, y - r * 1.55, 9, 0, 7); ctx.fill(); ctx.fillRect(x - 5, y - r * 1.55 + 6, 10, 6);
      ctx.fillStyle = '#2a0808'; ctx.fillRect(x - 5, y - r * 1.55 - 2, 3, 4); ctx.fillRect(x + 2, y - r * 1.55 - 2, 3, 4);
    } else {
      ctx.fillStyle = 'rgba(240,210,120,.25)'; ctx.beginPath(); ctx.arc(x, y, r * 1.3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - r * 1.6, 7, 0, 7); ctx.fillStyle = '#ffe9a8'; ctx.fill();
    }
    ctx.restore();
  }
  function drawEncounter(ctx, enc) {
    if (!enc) return;
    var id = pid(enc.id || enc.encounterId), col = (ARENAS[id] || {}).col || '#ff9a7a';
    var t = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
    var hz = enc.hazards || [], i;
    for (i = 0; i < hz.length; i++) if (hz[i] && hz[i].radius > 0 && hz[i].remaining >= 0) drawHazard(ctx, hz[i], col, t);
    var b = enc.boss, db = b && typeof b._dungeonBoss === 'object' ? b._dungeonBoss : null;
    if (db && db.boss) b = db.boss;
    if (b && b._dungeonBoss && b.alive !== false && !b.dead) {
      bossGlow(ctx, b, pid(db && db.id) || id, enc.elapsed || t);
      var nm = (ARENAS[pid(db && db.id) || id] || {}).boss;
      if (nm) { ctx.save(); ctx.font = '800 13px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#06080f'; ctx.fillStyle = '#ffe9b8';
        var body = window.DungeonMonsters && window.DungeonMonsters.getBodyFootprint && window.DungeonMonsters.getBodyFootprint(b);
        var ny = body ? b.y + (body.cy || 0) - body.ry - 12 : b.y - Math.max(b.radius || b.r || 34, 30) * 2.1 - 6;
        ctx.strokeText(nm, b.x, ny); ctx.fillText(nm, b.x, ny); ctx.restore(); }
    }
  }
  window.HourlyDungeonPresentation = { drawArena: drawArena, drawEncounter: drawEncounter, rewardMarkup: rewardMarkup };

  /* ---------- UI ---------- */
  if (window.__hdUiInit) return; window.__hdUiInit = true;
  var API = null, unsub = null, timer = 0, poll = 0, mo = null, offset = 0, lastNow = null;
  var view = {}, tab = 'intro', armed = 0, armT = 0;
  var els = {};

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mmss(ms) { ms = Math.max(0, ms); var s = Math.floor(ms / 1000), m = Math.floor(s / 60); return (m < 10 ? '0' : '') + m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function rewardExpiry(expiresAt, currentTime) {
    return expiresAt > currentTime
      ? 'Active until the next hourly reset · ' + mmss(expiresAt - currentTime) + ' remaining'
      : 'Expired at the hourly reset';
  }
  function buffEffect(buff) {
    if (!buff) return '';
    var effects = { maxHp: 'maximum HP (defensive buff)', damage: 'damage', healing: 'outgoing healing (utility buff)' };
    var value = Number(buff.value);
    if (!effects[buff.kind] || !Number.isFinite(value) || value <= 0) return '';
    var percent = Math.round((value <= 1 ? value * 100 : value) * 100) / 100;
    return '+' + percent + '% ' + effects[buff.kind];
  }
  function rewardMarkup(buff, currentTime) {
    if (!buff) return '';
    var effect = buffEffect(buff), expiresAt = Number(buff.expiresAt);
    if (!effect || !Number.isFinite(expiresAt)) return '';
    return '<div class="hdReward"><small class="hdRewardLabel">TEMPORARY HOURLY BUFF REWARD</small><div class="hdBuffLine">'
      + svg(buff.kind) + '<div><b>' + esc(buff.name || 'Dungeon buff') + '</b><strong>'
      + esc(effect) + '</strong></div></div><div class="hdRewardExpiry" data-expires="' + expiresAt + '">'
      + rewardExpiry(expiresAt, currentTime) + '</div><small>One active hourly buff. Cannot be farmed again or stacked this cycle.</small></div>';
  }
  function svg(kind) {
    var b = '<svg class="hdGlyph" viewBox="0 0 32 32" fill="none" stroke-linejoin="round" aria-hidden="true">';
    if (kind === 'maxHp') return b + '<path d="M16 28C6 20 4 14 4 10a6 6 0 0 1 12-1 6 6 0 0 1 12 1c0 4-2 10-12 18z" fill="#c9494f" stroke="#ffd0c8" stroke-width="1.6"/></svg>';
    if (kind === 'damage') return b + '<path d="M26 4L12 18l-2-2L24 2zM8 18l6 6-4 4-3-1-1-3z" fill="#f0a24a" stroke="#fff0c8" stroke-width="1.4"/><path d="M7 25l-3 3" stroke="#fff0c8" stroke-width="2"/></svg>';
    if (kind === 'healing') return b + '<path d="M12 4h8v8h8v8h-8v8h-8v-8H4v-8h8z" fill="#4fbf7a" stroke="#d6ffe0" stroke-width="1.6"/></svg>';
    return b + '<path d="M4 28V14l6-4 6 6 6-8 6 6v14z" fill="#5a4a7a" stroke="#ffe3a0" stroke-width="1.6"/><path d="M12 28v-8h8v8" stroke="#ffe3a0" stroke-width="1.6"/></svg>';
  }
  function now() { return API && API.getNow ? API.getNow() : Date.now() + offset; }
  function st() { return view.status || (API && API.getStatus && API.getStatus()) || null; }
  function isGuest() { var s = st() || {}; return document.body.classList.contains('guest-mode') || !!(s.practiceOnly || view.practiceOnly || view.localPractice || (API && API.practiceOnly)); }
  function syncClock(s) { if (s && typeof s.serverNow === 'number' && s.serverNow !== lastNow) { lastNow = s.serverNow; offset = s.serverNow - Date.now(); } }
  function remain() { var s = st(); return s && s.resetAt ? s.resetAt - now() : null; }

  function readView() { try { view = (API.getView && API.getView()) || {}; } catch (e) { view = { error: 'Dungeon state unavailable.' }; } if (!view.status) { try { view.status = API.getStatus && API.getStatus(); } catch (e2) {} } syncClock(view.status); }
  function canEnter() {
    var s = st(); if (view.busy || view.encounter) return 'busy';
    if (!s || !s.encounterId) return 'unavail'; if (s.completed && !isGuest()) return 'done'; return '';
  }

  function build_ui() {
    // home button
    var b = el('button', 'hdBtn'); b.type = 'button'; b.id = 'hdHomeBtn'; b.setAttribute('aria-haspopup', 'dialog');
    b.innerHTML = '<span class="hdIc"></span><span class="hdTxt"><span class="hdTtl">Hourly Dungeon</span><span class="hdSub"></span></span><span class="hdClock"><small>RESETS IN</small><span class="hdCv">--:--</span></span>';
    b.addEventListener('click', function () { tab = 'intro'; openDlg(); });
    els.home = b;
    els.badge = el('div'); els.badge.id = 'hdBadge'; els.badge.setAttribute('role', 'status'); document.body.appendChild(els.badge);
    els.hud = el('div'); els.hud.id = 'hdHud'; document.body.appendChild(els.hud);
    els.res = el('div'); els.res.id = 'hdResult'; els.res.setAttribute('role', 'status'); els.res.setAttribute('aria-live', 'polite'); document.body.appendChild(els.res);
    var d = document.createElement('dialog'); d.className = 'hdDlg'; d.setAttribute('aria-labelledby', 'hdDlgT');
    d.innerHTML = '<header><h2 id="hdDlgT">Hourly Dungeon</h2><button type="button" data-a="close" aria-label="Close overview">X</button></header><div class="hdBody"></div><footer><button type="button" class="hdS" data-a="close">Close overview</button><button type="button" class="hdP" data-a="enter">Enter Dungeon</button></footer>';
    document.body.appendChild(d); els.dlg = d; els.body = d.querySelector('.hdBody'); els.enter = d.querySelector('[data-a=enter]');
    d.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-a]'); var tb = e.target.closest && e.target.closest('[data-tab]');
      if (tb) { tab = tb.getAttribute('data-tab'); renderDlg(); return; }
      if (!a) return; var k = a.getAttribute('data-a');
      if (k === 'close') d.close();
      else if (k === 'enter') doEnter();
    });
    d.addEventListener('close', function () { document.body.classList.remove('hourlyDungeonDialogOpen'); });
    d.addEventListener('cancel', function () { document.body.classList.remove('hourlyDungeonDialogOpen'); });
    els.res.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-a]'); if (!a) return; var k = a.getAttribute('data-a');
      if (k === 'retryClaim') { try { (API.retryClaim || function () {}).call(API); } catch (x) {} }
      else if (k === 'again') { doEnter(); }
      else if (k === 'dismiss') { els.res.classList.remove('on'); dismissed = resultKey(view.result, view.error); }
      else if (k === 'details') { tab = 'details'; openDlg(); }
    });
    els.hud.addEventListener('click', function (e) {
      if (!e.target.closest('button')) return;
      if (!armed) { armed = 1; clearTimeout(armT); armT = setTimeout(function () { armed = 0; renderHud(); }, 4000); renderHud(); return; }
      armed = 0; clearTimeout(armT); try { var r = API.exit(); if (r && r.catch) r.catch(function () {}); } catch (x) {} renderHud();
    });
  }
  var dismissed = null;
  function resultKey(r, er) {
    return r ? String(r.attemptId || r.id || '') + ':' + String(r.outcome || r.status || r.won)
      : er ? 'error:' + String(er.message || er) : '';
  }
  function openDlg() { if (!els.dlg.open) { try { els.dlg.showModal(); } catch (e) { els.dlg.setAttribute('open', ''); } } document.body.classList.add('hourlyDungeonDialogOpen'); renderDlg(); }
  function doEnter() {
    if (canEnter()) return; dismissed = null;
    try { var r = API.enter(); if (r && r.catch) r.catch(function () {}); } catch (e) {}
    if (els.dlg.open) els.dlg.close();
  }

  function renderDlg() {
    if (!els.dlg.open) return; var s = st() || {}, h = '', cur = pid(s.encounterId), c = canEnter(), rem = remain();
    h += '<div class="hdTabs" role="tablist"><button role="tab" data-tab="intro" aria-selected="' + (tab === 'intro') + '">Briefing</button><button role="tab" data-tab="details" aria-selected="' + (tab === 'details') + '">Bosses</button></div>';
    h += '<div class="hdClockBig"><span>Dungeon rotates in</span><b>' + (rem == null ? '--:--' : mmss(rem)) + '</b></div>';
    var bf = s.activeBuff;
    if (bf && (!bf.expiresAt || bf.expiresAt > now())) h += '<div class="hdBuffLine">' + svg(bf.kind) + '<div><b>' + esc(bf.name) + '</b><strong>' + esc(buffEffect(bf)) + '</strong><small>Active buff, ' + (bf.expiresAt ? mmss(bf.expiresAt - now()) + ' left' : 'confirmed by server') + '</small></div></div>';
    if (tab === 'intro') {
      var A = ARENAS[cur];
      h += '<p>' + (A ? 'This hour the gate opens to <b>' + A.name + '</b>, held by the ' + A.boss + '.' : 'A new dungeon opens every hour.') + ' Clear it once per hour to earn a buff lasting until the next hourly reset, granted only when the server confirms your claim.</p>';
      h += '<p>Fight in an open arena with no walls. Red markers show danger at least 1.5 seconds ahead; cones are locked in direction.</p>';
      if (A) h += '<div class="hdNote">Reward: <b>25 Gold and ' + A.reward + '</b>. The buff lasts until the hourly reset. One completion per hour; only one hourly buff can be active, with no repeat farming or stacking.</div>';
      h += '<p>Hourly Dungeon clears award 25 Gold and a temporary buff—not permanent collection loot. Spell, ultimate, and talent drops are reserved for the future Daily Dungeon.</p>';
      if (isGuest()) h += '<div class="hdNote">Practice only: guests and Admin practice can fight this dungeon, but no account buff is saved or granted.</div>';
      if (c === 'done') h += '<div class="hdNote">Already completed this hour. Come back after the timer resets.</div>';
      if (c === 'unavail') h += '<div class="hdNote bad">Dungeon server is unavailable right now. Try again shortly.</div>';
      if (view.error) h += '<div class="hdNote bad">' + esc(view.error.message || view.error) + '</div>';
    } else {
      Object.keys(ARENAS).forEach(function (k) { var A = ARENAS[k];
        h += '<div class="hdArena' + (k === cur ? ' cur' : '') + '" data-id="' + k + '"><h3>' + A.name + (k === cur ? ' (now open)' : '') + '</h3><div class="hdRw">' + A.boss + ' / ' + A.reward + '</div><ul>' + A.mech.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></div>'; });
    }
    els.body.innerHTML = h;
    var lbl = c === 'busy' ? 'Entering...' : c === 'done' ? 'Completed this hour' : c === 'unavail' ? 'Unavailable' : isGuest() ? 'Enter (Practice)' : 'Enter Dungeon';
    els.enter.textContent = lbl; els.enter.disabled = !!c;
  }

  function renderHome() {
    var s = st() || {}, b = els.home, c = canEnter(), A = ARENAS[pid(s.encounterId)];
    b.querySelector('.hdIc').innerHTML = svg(A ? A.rk : '');
    b.querySelector('.hdSub').textContent = c === 'done' ? 'Cleared this hour. Buff running.' : c === 'unavail' ? 'Server unavailable' : A ? A.name + ' / ' + A.reward : 'Checking the gate...';
    b.classList.toggle('hdDone', c === 'done'); b.classList.toggle('hdBusy', c === 'busy');
    var r = remain(); b.querySelector('.hdCv').textContent = r == null ? '--:--' : mmss(r);
    b.querySelector('.hdClock small').textContent = 'RESETS IN';
  }
  function renderBadge() {
    var s = st() || {}, bf = s.activeBuff;
    if (!bf || (bf.expiresAt && bf.expiresAt <= now())) { els.badge.className = ''; els.badge.removeAttribute('data-kind'); return; }
    els.badge.className = 'on'; els.badge.setAttribute('data-kind', bf.kind || '');
    els.badge.title = (bf.name || 'Dungeon buff') + (bf.expiresAt ? ' · ' + mmss(bf.expiresAt - now()) + ' remaining' : '');
    els.badge.setAttribute('aria-label', els.badge.title);
    // A home status belongs in the account row, never over the avatar or
    // account name. In combat use a small corner chip instead.
    var battle = document.body.classList.contains('battleMode');
    var account = document.getElementById('accountBar');
    var market = document.getElementById('marketBtn');
    var parent = battle ? document.body : (account && market && account.contains(market) ? market.parentNode : account);
    if (parent && els.badge.parentNode !== parent) parent.appendChild(els.badge);
    els.badge.innerHTML = svg(bf.kind) + '<span class="hdBn">' + esc(bf.name || 'Dungeon buff') + '</span><span class="hdBt">' + (bf.expiresAt ? mmss(bf.expiresAt - now()) : '') + '</span>';
  }
  function renderHud() {
    var e = view.encounter; if (!e) { els.hud.className = ''; els.hud.innerHTML = ''; armed = 0; return; }
    var A = ARENAS[pid(e.id || (st() || {}).encounterId)];
    els.hud.className = 'on';
    els.hud.innerHTML = '<span>' + esc(A ? A.name : 'Dungeon') + (isGuest() ? ' (practice)' : '') + '</span><button type="button"' + (armed ? ' class="arm"' : '') + '>' + (armed ? 'Confirm exit' : 'Exit Dungeon') + '</button>';
  }
  function renderResult() {
    var r = view.result, er = view.error, e = view.encounter, box = els.res;
    var key = resultKey(r, er); if (e || !key || (dismissed && dismissed === key)) { box.className = ''; box.innerHTML = ''; return; }
    var cp = view.claimPending, h = '', cls = '';
    if (er && !r) { cls = 'err'; h = '<h4>Dungeon error</h4><div>' + esc(er.message || er) + '</div><div class="hdRow"><button class="hdS" data-a="dismiss">Dismiss</button></div>'; }
    else {
      var o = String(r.outcome || r.status || (r.won === true ? 'won' : r.won === false ? 'lost' : '')).toLowerCase();
      var won = /win|won|victory|clear|complete/.test(o), lost = /los|defeat|fail|dead/.test(o), exited = /exit|abandon|leave/.test(o);
      var claimed = r.claimed === true || /claimed/.test(String(r.claimStatus || '')) || (!cp && !view.error && (won) && (r.claimed !== false) && r.buff);
      var cerr = r.claimError || (view.error && won ? (view.error.message || view.error) : '');
      cls = won ? '' : 'lost';
      h = '<h4>' + (won ? 'Dungeon cleared' : exited ? 'You left the dungeon' : lost ? 'Defeated' : 'Dungeon finished') + '</h4>';
      if (won) {
        if (isGuest()) h += '<div>Practice clear. No Gold or account buff is granted for guests or Admin practice.</div>';
        else if (cp) h += '<div>Confirming your Gold and hourly buff with the server...</div>';
        else if (cerr) h += '<div>Reward confirmation failed: ' + esc(cerr) + '. Your clear is not lost; retry the claim.</div>';
        else if (claimed) h += rewardMarkup(r.buff, now()) || '<div>Your hourly buff was confirmed but is no longer active. It lasts only until the next hourly reset.</div>';
        else if (r.awarded === false) h += '<div>No new buff was awarded. The hour reset or this hour was already completed.</div>';
        else h += '<div>Waiting for the server to confirm your reward.</div>';
        if (!isGuest()) h += '<div class="hdLootNotice">25 Gold + a temporary buff per eligible hourly clear. No permanent spell, ultimate, or talent drops in Hourly Dungeons.</div>';
      } else if (lost) h += '<div>The boss held the arena. No reward. Try again if the hour is still open.</div>';
      else if (exited) h += '<div>No reward for an abandoned run.</div>';
      h += '<div class="hdRow">';
      if (won && !isGuest() && !cp && cerr) h += '<button class="hdP" data-a="retryClaim"' + (API.retryClaim ? '' : ' disabled') + '>Retry claim</button>';
      if ((!won || (r.awarded === false && !cerr)) && !canEnter()) h += '<button class="hdP" data-a="again">' + (lost ? 'Retry run' : 'New entry') + '</button>';
      h += '<button class="hdS" data-a="details">Bosses</button><button class="hdS" data-a="dismiss"' + (cp ? ' disabled' : '') + '>Dismiss</button></div>';
    }
    var rewardNode=box.querySelector('#dungeonMatchReward');
    if(r&&!isGuest()&&Number.isFinite(r.balance))h+='<div id="dungeonMatchReward"></div>';
    box.className = 'on ' + cls; box.innerHTML = h;
    var rewardSlot=box.querySelector('#dungeonMatchReward');
    if(rewardNode&&rewardSlot)rewardSlot.replaceWith(rewardNode);
    if(rewardSlot)window.MatchRewards?.show({id:'dungeon:'+r.attemptId,gold:r.gold,balance:r.balance,containerId:'dungeonMatchReward'});
  }
  function renderAll() { readView(); renderHome(); renderBadge(); renderHud(); renderResult(); renderDlg(); }
  var refreshing = false, nextRefresh = 0;
  function tick() {
    renderHome(); renderBadge();
    var expiry = els.res.querySelector('.hdRewardExpiry');
    if (expiry) expiry.textContent = rewardExpiry(Number(expiry.getAttribute('data-expires')), now());
    if (els.dlg && els.dlg.open) {
      var b = els.dlg.querySelector('.hdClockBig b'), r = remain();
      if (b) b.textContent = r == null ? '--:--' : mmss(r);
    }
    if ((!st() || remain() <= 0) && API.refreshStatus && !refreshing && now() >= nextRefresh) {
      refreshing = true;
      Promise.resolve(API.refreshStatus()).catch(function () {}).finally(function () {
        refreshing = false; nextRefresh = now() + 5000;
      });
    }
  }

  function place() {
    var hub = document.getElementById('mainHub'); if (!hub) return false;
    if (hub.contains(els.home)) return true;
    var pp = hub.querySelector('.hubPlayPanel');
    if (pp && pp.parentNode) pp.parentNode.insertBefore(els.home, pp.nextSibling);
    else { var j = document.getElementById('hubJoinBtn'); (j && j.parentNode ? j.parentNode : hub).appendChild(els.home); }
    return true;
  }
  function start() {
    API = window.HourlyDungeon; build_ui(); place();
    if (typeof MutationObserver !== 'undefined') { var hub = document.getElementById('mainHub'); if (hub) { mo = new MutationObserver(function () { if (!hub.contains(els.home)) place(); }); mo.observe(hub, { childList: true, subtree: true }); } }
    unsub = API.subscribe ? API.subscribe(renderAll) : null; renderAll();
    timer = setInterval(tick, 1000);
    window.addEventListener('pagehide', function () { clearInterval(timer); clearInterval(poll); if (mo) mo.disconnect(); if (typeof unsub === 'function') try { unsub(); } catch (e) {} });
  }
  function boot() {
    if (window.HourlyDungeon) return start();
    var n = 0; poll = setInterval(function () { if (window.HourlyDungeon) { clearInterval(poll); start(); } else if (++n > 40) clearInterval(poll); }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
