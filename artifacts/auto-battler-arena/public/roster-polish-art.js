/* Fantasy World Arenas - roster polish art (preview). ASCII only.
 * window.RosterPolishArt.draw(ctx,e,cls,{col,dark,light,team,skin?},time,pose) -> bool
 * Parts are rasterised once per identity (class+skin+race+palette) into one 384x192
 * atlas (8 slots of 96x96, 2x raster of 48x48 world units). Never keyed by time/id.
 * Slots: 0 head 1 torso 2 armL 3 armR 4 legL 5 legR 6 cape/back 7 weapon.
 */
(function (root) {
  'use strict';
  var SLOT = 96, COLS = 4, ATLAS_W = 384, ATLAS_H = 192, MAX_ENTRIES = 16;
  var MAX_BYTES = 8 * 1024 * 1024, ENTRY_BYTES = ATLAS_W * ATLAS_H * 4;
  var CLASSES = ['frostmage', 'priest', 'warrior', 'rogue', 'paladin', 'archer', 'warlock', 'druid', 'shaman'];
  var SKINS = {
    frostmage: ['winterSovereign', 'emberScholar'], priest: ['sunlitOracle', 'duskConfessor'],
    warrior: ['royalVanguard', 'ashWarlord'], rogue: ['nightViper', 'scarletPhantom'],
    paladin: ['dawnBastion', 'obsidianOath'], archer: ['thornRanger', 'stormHawkeye'],
    warlock: ['voidRegent', 'cinderOccultist'], druid: ['groveWarden', 'moonclaw'],
    shaman: ['tempestCaller', 'magmaBinder']
  };
  // kind: robe|plate|leather ; gear per variant ; weapon ; off-hand
  var SPEC = {
    frostmage: { kind: 'robe', hair: '#e6f1f7', eye: '#6fd0ff', trim: ['#a6ecf5', '#e9a35f'], gear: ['crown', 'hat'], weapon: 'frost', off: 'none' },
    priest: { kind: 'robe', hair: '#e8d9a6', eye: '#ffe08a', trim: ['#ffe9a0', '#c8b5dc'], gear: ['halo', 'cowl'], weapon: 'holy', off: 'none' },
    warrior: { kind: 'plate', hair: '#6b3f2a', eye: '#8fb4d8', trim: ['#f0d685', '#e2764a'], gear: ['helm', 'spikes'], weapon: 'axe', off: 'none' },
    rogue: { kind: 'leather', hair: '#25222c', eye: '#b6e86c', trim: ['#8fd08a', '#f08a82'], gear: ['hood', 'brim'], weapon: 'dagger', off: 'dagger' },
    paladin: { kind: 'plate', hair: '#d8c27a', eye: '#9cd6ff', trim: ['#fff0a8', '#e4b060'], gear: ['crest', 'visor'], weapon: 'hammer', off: 'shield' },
    archer: { kind: 'leather', hair: '#8a5a34', eye: '#8fd6a8', trim: ['#b8dc92', '#bcd8e8'], gear: ['hood', 'beak'], weapon: 'bow', off: 'none' },
    warlock: { kind: 'robe', hair: '#1d1626', eye: '#9bff6a', trim: ['#b894ec', '#e08a5c'], gear: ['horns', 'cowl'], weapon: 'fel', off: 'tome' },
    druid: { kind: 'leather', hair: '#7a5a38', eye: '#c8f08a', trim: ['#b4dc7e', '#bfe8dc'], gear: ['antlers', 'crescent'], weapon: 'nature', off: 'none' },
    shaman: { kind: 'plate', hair: '#2b2a33', eye: '#8ff0f0', trim: ['#aeeef0', '#f0a468'], gear: ['feathers', 'brow'], weapon: 'totem', off: 'none' }
  };

  var cache = new Map(); // insertion order == LRU order
  var stats = { hits: 0, misses: 0, builds: 0, evictions: 0, failures: 0 };
  var factory = null;

  function makeCanvas(w, h) {
    if (factory) return factory(w, h);
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    if (typeof document !== 'undefined' && document.createElement) {
      var c = document.createElement('canvas'); c.width = w; c.height = h; return c;
    }
    return null;
  }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hexMix(a, b, t) {
    var A = parseHex(a), B = parseHex(b);
    if (!A || !B) return a;
    var r = Math.round(A[0] + (B[0] - A[0]) * t), g = Math.round(A[1] + (B[1] - A[1]) * t), bl = Math.round(A[2] + (B[2] - A[2]) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  function parseHex(s) {
    if (typeof s !== 'string') return null;
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim());
    if (!m) { var q = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(s); return q ? [+q[1], +q[2], +q[3]] : null; }
    var h = m[1]; if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function lit(c, t) { return hexMix(c, '#ffffff', t); }
  function shade(c, t) { return hexMix(c, '#0a0c16', t); }

  // ---- painter helpers (atlas build only) ----
  function P(c, pts, fill, edge, lw) {
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath(); c.fillStyle = fill; c.fill();
    if (edge) { c.strokeStyle = edge; c.lineWidth = lw || .7; c.stroke(); }
  }
  function L(c, pts, col, w) {
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.strokeStyle = col; c.lineWidth = w || 1; c.stroke();
  }
  function O(c, x, y, rx, ry, fill, edge, lw) {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill();
    if (edge) { c.strokeStyle = edge; c.lineWidth = lw || .6; c.stroke(); }
  }
  function D(c, x, y, rx, ry, fill, edge) { P(c, [x, y - ry, x + rx, y, x, y + ry, x - rx, y], fill, edge, .6); }
  function VG(c, x0, y0, x1, y1, a, b) {
    var g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g;
  }
  // faceted plate: base poly + light top-left facet + dark lower facet
  function facet(c, pts, base, edge) {
    P(c, pts, VG(c, pts[0], pts[1], pts[pts.length - 2], pts[pts.length - 1], lit(base, .22), shade(base, .28)), edge || shade(base, .55), .8);
  }

  // ---- palette ----
  function colors(cls, pal, variant, skin, activeTint) {
    var S = SPEC[cls];
    var col = (pal && pal.col) || '#5a7ac0', dark = (pal && pal.dark) || shade(col, .45), light = (pal && pal.light) || lit(col, .35);
    if (!activeTint && (!pal || !pal.skinId || pal.skinId === 'default')) {
      col = ({ warrior:'#778391', paladin:'#d6a83f', rogue:'#3a1821', archer:'#355b2d',
        frostmage:'#295a9b', warlock:'#5b2378', priest:'#f0e8d8', druid:'#4d6b35', shaman:'#355f73' })[cls];
      dark = shade(col,.48); light = lit(col,.4);
    }
    var trim = S.trim[variant];
    var base = S.kind === 'plate' ? hexMix(col, '#8a93a0', .45) : col;
    return { col: col, dark: dark, light: light, base: base, trim: trim, trim2: S.trim[1 - variant], skin: skin,
      hair: S.hair, eye: S.eye, steel: '#b9c3cf', steelD: '#566274', wood: '#6e4a2c', woodL: '#a07446', v: variant };
  }

  // ---- head ----
  function paintHead(c, cls, K, race) {
    var S = SPEC[cls], g = S.gear[K.v], sk = K.skin, skD = shade(sk, .3), skL = lit(sk, .2);
    // back hair / hood layer
    if (cls === 'priest' || cls === 'frostmage' || cls === 'druid' || cls === 'warlock')
      P(c, [-6.5, -4, -7, 4, -4.5, 8, 4.5, 8, 7, 4, 6.5, -4], shade(K.hair, .15), shade(K.hair, .5));
    if (g === 'hood' || g === 'cowl' || g === 'brim')
      P(c, [-7.5, -3, -7, 6, 0, 8, 7, 6, 7.5, -3, 3, -9, -3, -9], K.v ? shade(K.dark, .1) : K.base, shade(K.dark, .6));
    // face
    c.beginPath(); c.moveTo(-5, -4); c.quadraticCurveTo(-5.6, 4.2, 0, 6.6); c.quadraticCurveTo(5.6, 4.2, 5, -4);
    c.quadraticCurveTo(0, -7, -5, -4); c.closePath();
    c.fillStyle = VG(c, -5, -5, 5, 6, skL, skD); c.fill(); c.strokeStyle = shade(sk, .6); c.lineWidth = .7; c.stroke();
    P(c, [1.2, -5, 5, -3.8, 5.2, 0, 4.2, 4, 2.6, 5.4, 2.4, 0], 'rgba(30,20,30,.17)'); // shadow facet
    P(c, [-4.6, -3.8, -1.5, -4.8, -2, -1.4, -4.4, -1], 'rgba(255,255,255,.14)');
    // ears
    if (race === 'nightelf' || race === 'bloodelf') { P(c, [-5, -2, -9, -4.5, -5, 1.2], sk, shade(sk, .5)); P(c, [5, -2, 9, -4.5, 5, 1.2], skD, shade(sk, .5)); }
    else { O(c, -5.2, 0, 1, 1.6, sk, shade(sk, .5)); O(c, 5.2, 0, 1, 1.6, skD, shade(sk, .5)); }
    // eyes
    for (var s = -1; s <= 1; s += 2) {
      var x = s * 2.4;
      O(c, x, -.6, 1.55, 1.05, '#f4f1ea', shade(sk, .55), .4);
      O(c, x + s * .1, -.6, .85, .9, K.eye, '#10141c', .3);
      O(c, x + s * .1, -.6, .38, .42, '#0a0c12');
      c.fillStyle = '#fff'; c.fillRect(x - .35, -1.15, .45, .45);
      L(c, [x - s * 1.9, -2.5 + (cls === 'warrior' || cls === 'warlock' ? .7 * s * -1 * 0 + .4 : 0), x + s * 1.6, -2.9 - (s < 0 ? 0 : 0)], shade(K.hair, .2), .9);
    }
    L(c, [0, -.2, -.5, 2.2, .7, 2.4], shade(sk, .4), .6); // nose
    L(c, [-1.4, 4.3, 0, 4.6, 1.4, 4.3], shade(sk, .6), .6);
    if (cls === 'warrior') { L(c, [-3.8, 2, -2.4, 3.6], '#d7d1cc', .5); }
    // hair fringe
    if (g !== 'helm' && g !== 'visor' && g !== 'spikes') {
      P(c, [-5.8, -3.5, -5, -7, 0, -8.4, 5, -7, 5.8, -3.5, 2.5, -5.4, -.5, -4.4, -3.4, -5.6], K.hair, shade(K.hair, .6));
      L(c, [-3, -7, -.5, -7.6, 2.5, -6.8], lit(K.hair, .4), .6);
    }
    var T = K.trim, M = K.base, Dk = shade(K.dark, .3);
    switch (g) {
      case 'crown': P(c, [-5, -7, -4, -12, -1.6, -8.5, 0, -13, 1.6, -8.5, 4, -12, 5, -7], '#bde8ee', '#2c5a78'); D(c, 0, -8.6, 1, 1.4, '#effdff', '#3a8a9a'); break;
      case 'hat': P(c, [-9, -6.5, -4, -8, -2, -15, 3, -17, 4, -8, 9, -6.5, 0, -5], '#4a3039', '#1d1620'); L(c, [-8, -6.8, 8, -6.8], '#ec9d5c', .9); D(c, 1, -7, 1, 1, '#ffcf7a'); break;
      case 'halo': c.beginPath(); c.ellipse(0, -11, 6.5, 2, 0, 0, 6.3); c.strokeStyle = '#fff0b0'; c.lineWidth = 1.4; c.stroke();
        c.strokeStyle = '#d4a940'; c.lineWidth = .5; c.stroke(); P(c, [-5, -6.5, 0, -8, 5, -6.5, 0, -7], '#e5c363', '#7a5a22'); break;
      case 'cowl': P(c, [-7, -4, -6, -10, 0, -12, 6, -10, 7, -4, 4.5, -6.5, 0, -8, -4.5, -6.5], K.v ? '#5a4868' : '#3a2a52', Dk); L(c, [-4, -8.4, 0, -9.6, 4, -8.4], T, .7); D(c, 0, -7.6, .9, 1.2, T); break;
      case 'helm': facet(c, [-6, -3, -6, -9, -2, -11.5, 2, -11.5, 6, -9, 6, -3, 4.5, -5.2, 0, -6.2, -4.5, -5.2], '#aab4c0'); P(c, [-.8, -11.5, 0, -15, 2, -11.5], T, shade(T, .5)); L(c, [-5, -8, 5, -8], lit('#aab4c0', .5), .7); break;
      case 'spikes': facet(c, [-6, -3, -6, -9, 6, -9, 6, -3, 4.5, -5.2, 0, -6.2, -4.5, -5.2], '#3a3d42'); for (var i = -2; i <= 2; i++) P(c, [i * 2.4 - 1, -9, i * 2.4, -13 - (i === 0 ? 2 : 0), i * 2.4 + 1, -9], '#44464a', '#15181a'); L(c, [-4, -6, -1, -6.4, 1, -6, 4, -6.4], '#eb7a49', .8); break;
      case 'hood': break;
      case 'brim': P(c, [-9, -6.5, -4, -10, 3, -11, 8, -7.5, 5, -5.5, -8, -5.5], '#692d39', '#251c25'); L(c, [-8, -6.5, 6, -6.5], T, .8); P(c, [-5.8, -2, 5.8, -2, 5, 1.4, -5, 1.4], 'rgba(40,24,30,.55)'); break;
      case 'crest': facet(c, [-6, -3, -6, -9, -2, -11.5, 2, -11.5, 6, -9, 6, -3, 4, -5, -4, -5], '#e0d8b1'); P(c, [-1, -11.5, 0, -16, 1, -11.5], '#fff0a8', '#ac8338'); L(c, [-5, -8, 5, -8], '#fff7d0', .7); D(c, 0, -9.5, .9, 1.1, T); break;
      case 'visor': facet(c, [-6, -3, -6, -9, 6, -9, 6, -3, 3, -5, 0, -4, -3, -5], '#343238'); L(c, [-4, -6, 4, -6], '#e2aa55', .9); P(c, [-6, -9, -4, -12, 4, -12, 6, -9], '#43404a', '#15151d'); break;
      case 'beak': P(c, [-7, -4, -5, -9, 2, -10, 7, -6, 3, -4, 0, -5], '#5c7482', '#243848'); P(c, [2, -8, 9, -5, 3, -4.6], '#d1dfe0', '#415769'); break;
      case 'horns': P(c, [-5, -8, -9, -12, -8, -16, -4, -10], '#c9bda6', '#2b2036'); P(c, [5, -8, 9, -12, 8, -16, 4, -10], '#aca088', '#2b2036'); L(c, [-8, -13, -6, -9], '#f0e6d0', .5); break;
      case 'antlers': for (s = -1; s <= 1; s += 2) { L(c, [s * 4, -8, s * 6, -13, s * 9, -16], '#8a6a44', 1.3); L(c, [s * 5.4, -11.5, s * 4, -15], '#8a6a44', .9); L(c, [s * 7, -14, s * 10, -13], '#8a6a44', .8); L(c, [s * 6, -12, s * 7.6, -11.5], lit('#8a6a44', .4), .4); } break;
      case 'crescent': P(c, [-5, -8, -2, -11, 0, -9, 2, -11, 5, -8, 2, -7.4, 0, -8, -2, -7.4], '#a8d0d0', '#35626b'); D(c, 0, -9, .8, 1.2, '#eefcf6'); break;
      case 'feathers': for (s = -1; s <= 1; s += 2) { P(c, [s * 3, -8, s * 6, -15, s * 8, -13, s * 5, -7], s < 0 ? '#c9d8dc' : '#a8bcc2', '#3a5560'); L(c, [s * 4, -8, s * 7, -13], '#fff', .4); } P(c, [-4, -7.5, 0, -9, 4, -7.5, 3, -6, -3, -6], '#8aa0a6', '#344c58'); break;
      case 'brow': P(c, [-6, -4, -5, -8, 0, -9, 5, -8, 6, -4, 3, -5.5, 0, -6, -3, -5.5], K.v ? '#514a46' : '#a6c0c2', '#27292a'); L(c, [-4, -7, 4, -7], K.v ? '#ec9c5c' : '#d5f6ef', .8); break;
    }
    if (g === 'hood') { P(c, [-7.5, -3, -3, -9.5, 0, -10, 3, -9.5, 7.5, -3, 5.5, -5.5, 0, -7, -5.5, -5.5], K.v ? '#1d2927' : K.base, shade(K.dark, .6)); L(c, [-4, -8, 0, -8.8, 4, -8], T, .6); if (K.v) { P(c, [-2, -10, 0, -14, 2, -10], K.base, shade(K.dark, .6)); } }
  }

  // ---- torso ----
  function paintTorso(c, cls, K) {
    var S = SPEC[cls], kind = S.kind, M = K.base, T = K.trim, Dk = shade(K.dark, .35);
    if (kind === 'robe') {
      P(c, [-7, 4, 7, 4, 10, 16, 3, 17.5, 0, 15.5, -4, 17.5, -10, 16], VG(c, 0, 4, 0, 17, M, shade(M, .4)), Dk, .9);
      P(c, [-1, 5, 3, 5, 6, 16, 3, 17, 1, 8], 'rgba(10,12,30,.28)');
      L(c, [-9.4, 15, -4, 16.2, 0, 14.6, 4, 16.2, 9.4, 15], T, .8);
      for (var i = -2; i <= 2; i++) D(c, i * 3.6, 15.2, .55, .8, T);
      P(c, [-6, -5, 0, -6.5, 6, -5, 7, 5, 0, 6.5, -7, 5], VG(c, -6, -5, 6, 6, lit(M, .22), shade(M, .25)), Dk, .9);
      P(c, [-5, -4.5, -1, -5.5, -2, 5, -6, 4.5], 'rgba(255,255,255,.14)');
      P(c, [-1.5, -6, 1.5, -6, 2.2, 6, 0, 8, -2.2, 6], K.trim, shade(T, .5), .6);
      L(c, [0, -5.5, 0, 7], lit(T, .5), .5);
      c.fillStyle = shade(K.dark, .1); c.fillRect(-6.5, 3.4, 13, 1.8); L(c, [-6.5, 4.3, 6.5, 4.3], T, .5);
      D(c, 0, 4.3, 1.6, 1.9, K.eye, shade(T, .5));
      for (var s = -1; s <= 1; s += 2) { P(c, [s * 5, -6, s * 9.5, -6.5, s * 10.5, -3, s * 7, -2.5], K.v ? shade(M, .15) : lit(M, .08), Dk); L(c, [s * 5.5, -5.8, s * 9.4, -6.2], lit(T, .4), .6); }
    } else if (kind === 'plate') {
      P(c, [-6, 3, 6, 3, 8, 9, 0, 11, -8, 9], VG(c, 0, 3, 0, 11, shade(M, .1), shade(M, .5)), Dk, .9);
      for (i = -2; i <= 2; i++) L(c, [i * 3, 4, i * 3.4, 10], 'rgba(0,0,0,.25)', .5);
      L(c, [-7, 9, 7, 9], T, .7);
      P(c, [-6.5, -5, 0, -6.5, 6.5, -5, 6.5, 4, 0, 6.5, -6.5, 4], VG(c, -6, -5, 6, 6, lit(M, .3), shade(M, .35)), Dk, 1);
      P(c, [-5.5, -4.5, -.6, -5.8, -1.2, 5, -5.5, 3.5], 'rgba(255,255,255,.18)');
      P(c, [.5, -5.8, 6, -4.6, 6, 3.6, 1.2, 5.4], 'rgba(8,10,24,.2)');
      L(c, [-5, -3, 0, -.5, 5, -3], T, 1); L(c, [0, -5.5, 0, 6], shade(M, .5), .6);
      if (cls === 'paladin') { O(c, 0, -.5, 2.4, 2.4, T, '#7a5a22'); for (i = 0; i < 8; i++) { var a = i * .785; L(c, [Math.cos(a) * 3, -.5 + Math.sin(a) * 3, Math.cos(a) * 4.8, -.5 + Math.sin(a) * 4.8], lit(T, .3), .7); } }
      else if (cls === 'warrior') { P(c, [-2.4, -4, 2.4, -4, 1.6, 2, 0, 4, -1.6, 2], K.v ? '#602c26' : '#a83a3a', shade(T, .5)); D(c, 0, -.5, 1.1, 1.5, T); }
      else { L(c, [-3, -4, 1, -1.5, -1.6, 1.2, 2.4, 3.6], K.v ? '#e4884b' : '#a8e7e9', 1); D(c, 0, 2.4, 1, 1.4, T); }
      for (s = -1; s <= 1; s += 2) {
        facet(c, [s * 5, -7, s * 9, -9.5, s * 13, -6.5, s * 13.5, -2, s * 8, -.5, s * 5, -3], K.v ? shade(M, .12) : lit(M, .05));
        L(c, [s * 6, -6.5, s * 9.5, -8.4, s * 12.4, -6], lit(T, .5), .8);
        D(c, s * 10, -4, 1, 1.4, T, shade(T, .5));
        if (cls === 'warrior' && K.v) for (i = 0; i < 2; i++) P(c, [s * (11 + i), -9 + i * 2, s * (13 + i), -12 + i * 2, s * (13 + i), -7 + i * 2], '#414241', '#15181a');
        if (cls === 'paladin' && !K.v) P(c, [s * 9, -9.5, s * 10, -11.5, s * 12, -10.5, s * 13, -6.5], lit(M, .1), Dk);
      }
      c.fillStyle = '#5a4030'; c.fillRect(-6.5, 3.2, 13, 1.8); L(c, [-6.5, 4.1, 6.5, 4.1], T, .5); D(c, 0, 4.1, 1.5, 1.7, T, shade(T, .5));
    } else { // leather
      P(c, [-6, 3, 6, 3, 8, 11, 2, 12.5, 0, 11, -2, 12.5, -8, 11], VG(c, 0, 3, 0, 12, shade(M, .1), shade(M, .5)), Dk, .8);
      L(c, [-7.4, 10.4, -2, 11.8, 0, 10.4, 2, 11.8, 7.4, 10.4], T, .7);
      P(c, [-6, -5, 0, -6.2, 6, -5, 6.5, 4, 0, 6, -6.5, 4], VG(c, -6, -5, 6, 6, lit(M, .22), shade(M, .35)), Dk, .9);
      P(c, [-5, -4.5, -1, -5.5, -1.5, 4.5, -5.6, 3.6], 'rgba(255,255,255,.14)');
      for (i = -1; i <= 1; i++) L(c, [i * 3.2 - 2, -3, i * 3.2 + 1, 1], 'rgba(0,0,0,.2)', .5);
      L(c, [-5, -4, 5, 3], '#6b4a30', 1.5); L(c, [-5, -4, 5, 3], T, .4);
      c.fillStyle = '#4a3828'; c.fillRect(-6.5, 3.2, 13, 1.7); D(c, 0, 4, 1.4, 1.6, T, shade(T, .5));
      for (s = -1; s <= 1; s += 2) {
        P(c, [s * 5, -7, s * 9, -8.6, s * 12.4, -6, s * 11, -2.4, s * 8, -2.6, s * 5, -3.4], K.v ? shade(M, .1) : lit(M, .1), Dk);
        for (i = 0; i < 3; i++) L(c, [s * (6 + i * 2), -6.6 + i * .4, s * (7 + i * 2), -3.4], 'rgba(255,255,255,.22)', .5);
        if (cls === 'druid') P(c, [s * 8, -7, s * 13, -9, s * 11, -4], '#a8ca79', '#314d34', .5);
      }
      if (cls === 'rogue') { O(c, -6.2, 5, 1.2, 1.7, '#76b35e', '#203d2c'); O(c, 6.2, 5, 1.2, 1.7, '#76b35e', '#203d2c'); }
    }
  }

  // ---- limbs ----
  function sleeve(c, K, s, cls) {
    var kind = SPEC[cls].kind, M = K.base, cuff = K.trim;
    var sleeveCol = kind === 'plate' ? hexMix(M, '#6c7480', .3) : M;
    P(c, [-2.2, 0, 2.2, 0, 2.6, 8, 2, 10, -2, 10, -2.6, 8], VG(c, -2, 0, 2, 0, lit(sleeveCol, .2), shade(sleeveCol, .35)), shade(K.dark, .5), .8);
    if (kind === 'robe') P(c, [-2.6, 6.5, 2.6, 6.5, 4.2, 11.5, -3.8, 11.5], shade(sleeveCol, .1), shade(K.dark, .5), .7);
    P(c, [-2.5, 8.4, 2.5, 8.4, 2.4, 10.4, -2.4, 10.4], shade(K.trim, .2), shade(K.trim, .6), .5);
    L(c, [-2.2, 8.6, 2.2, 8.6], lit(cuff, .4), .5);
    O(c, 0, 11.2, 1.6, 1.7, K.skin, shade(K.skin, .5), .5);
  }
  function paintArm(c, cls, K, side) {
    var S = SPEC[cls];
    if (side > 0) { sleeve(c, K, 1, cls); return; }
    if (S.off === 'shield') { // buckler held at the forearm
      c.save(); c.translate(-3, 8);
      facet(c, [-6, -6, 6, -6, 6, 2, 0, 9, -6, 2], K.v ? '#3d3b40' : '#e0d8b1');
      L(c, [-5, -4.6, 5, -4.6], lit(K.trim, .3), .8); L(c, [0, -5, 0, 7], K.trim, .8); L(c, [-4.6, -1, 4.6, -1], K.trim, .8);
      D(c, 0, -1, 1.7, 2, K.v ? '#ffe0a0' : '#fff1a5', shade(K.trim, .4)); c.restore(); sleeve(c, K, -1, cls);
      c.save(); c.translate(0, 0); c.restore(); return;
    }
    sleeve(c, K, -1, cls);
    if (S.off === 'tome') { c.save(); c.translate(-2, 10); c.rotate(-.2);
      P(c, [-5, -4, 4, -5, 5, 4, -4, 5], '#3a2a52', '#140e20'); P(c, [-4, -3, 3, -4, 3.6, 3, -3, 3.8], '#eadcb8', '#6a5a3a', .4);
      L(c, [-3, -1, 2, -1.6], '#8a7a5a', .4); L(c, [-3, 1, 2, .6], '#8a7a5a', .4); D(c, 0, -4.4, 1, 1, K.eye, '#1d2a10'); L(c, [-5, -3, -5, 4], K.trim, .8); c.restore(); }
    if (S.off === 'dagger') { c.save(); c.translate(0, 11); c.rotate(2.6); dagger(c, K, .85); c.restore(); }
  }
  function paintLeg(c, cls, K, side) {
    var kind = SPEC[cls].kind, M = K.base;
    var cloth = kind === 'plate' ? shade(hexMix(M, '#58606c', .5), .2) : shade(M, .3);
    P(c, [-2.4, 0, 2.4, 0, 2.2, 6, 2.6, 9.4, -2.6, 9.4, -2.2, 6], VG(c, -2, 0, 2, 0, lit(cloth, .15), shade(cloth, .3)), shade(K.dark, .6), .8);
    P(c, [-2.8, 5.5, 2.8, 5.5, 2.4, 7.2, -2.4, 7.2], shade(K.trim, .15), shade(K.trim, .6), .5);
    P(c, [-2.8, 7, 2.8, 7, 3.4, 10, 3, 11.4, -3.6, 11.4, -3, 9.6], VG(c, 0, 7, 0, 11, '#5a4636', '#241a16'), '#120e0c', .7);
    L(c, [-2.6, 7.8, 2.6, 7.8], lit(K.trim, .3), .5); L(c, [-3.3, 11, 3, 11], 'rgba(255,255,255,.2)', .5);
    if (kind === 'plate') { D(c, 0, 4, 1.5, 1.4, lit(K.base, .3), shade(K.base, .5)); }
  }

  // ---- back / cape ----
  function paintBack(c, cls, K) {
    var kind = SPEC[cls].kind, T = K.trim, C = K.v ? K.dark : K.col;
    if (cls === 'archer') { // quiver
      c.save(); c.rotate(.28); P(c, [-3, 0, 3, 0, 3.4, 15, -3.4, 15], '#604b32', '#2b2017'); L(c, [-3, 4, 3, 4], T, .6); L(c, [-3.2, 11, 3.2, 11], T, .6);
      for (var i = -1; i <= 1; i++) { L(c, [i * 1.6, 0, i * 2.2, -6], '#d8c88e', .7); P(c, [i * 2.2 - 1, -6, i * 2.2, -9, i * 2.2 + 1, -6], K.v ? '#e8f2f0' : '#c9442e'); } c.restore();
      P(c, [-6, 0, 6, 0, 8, 12, 0, 14, -8, 12], 'rgba(40,60,45,.7)', shade(K.dark, .4), .7); return;
    }
    var len = kind === 'robe' ? 19 : kind === 'plate' ? 17 : 14;
    P(c, [-6, 0, 6, 0, 9, len * .6, 8, len, 3, len - 2, 0, len + 1, -3, len - 2, -8, len, -9, len * .6], VG(c, 0, 0, 0, len, lit(C, .08), shade(C, .5)), shade(K.dark, .7), .9);
    L(c, [-3, 2, -4, len - 3], 'rgba(0,0,0,.22)', .6); L(c, [3, 2, 4, len - 3], 'rgba(255,255,255,.1)', .6);
    L(c, [-8, len - .5, -3, len - 2.2, 0, len + .2, 3, len - 2.2, 8, len - .5], T, .8);
    if (kind === 'plate' && cls === 'shaman') D(c, 0, len * .5, 1.5, 2.5, T, shade(T, .5));
    if (cls === 'priest' || cls === 'paladin') D(c, 0, len * .55, 1.8, 2.6, lit(T, .3), shade(T, .5));
  }

  // ---- weapons (origin at grip, pointing up) ----
  function dagger(c, K, sc) {
    c.save(); c.scale(sc || 1, sc || 1);
    P(c, [0, -17, 1.8, -7, 1.2, -4, -1.2, -4, -1.8, -7], VG(c, -2, 0, 2, 0, '#f3f7fa', '#7d8a98'), '#2a3038', .6);
    L(c, [0, -16, 0, -5], 'rgba(255,255,255,.6)', .4); L(c, [-1.3, -9, 0, -15], K.v ? '#f18f84' : '#a6d56d', .4);
    P(c, [-3.2, -4, 3.2, -4, 2.6, -2.8, -2.6, -2.8], K.trim, shade(K.trim, .6), .5); P(c, [-.9, -2.8, .9, -2.8, .9, 2, -.9, 2], '#3a2a26', '#150f0d', .4); O(c, 0, 2.6, 1.1, 1.1, K.trim, shade(K.trim, .6), .4); c.restore();
  }
  function shaft(c, y0, y1, w, a, b) { P(c, [-w, y0, w, y0, w * .8, y1, -w * .8, y1], VG(c, -w, 0, w, 0, a, b), '#1e140e', .5); }
  function paintWeapon(c, cls, K) {
    var T = K.trim, s;
    switch (SPEC[cls].weapon) {
      case 'axe':
        shaft(c, -23, 8, .9, K.woodL, K.wood); L(c, [-.4, -20, -.4, 6], 'rgba(255,255,255,.2)', .4);
        for (var i = 0; i < 4; i++) L(c, [-.9, -3 + i * 2.2, .9, -2 + i * 2.2], '#2a1c12', .5);
        facet(c, [.6, -23, 4, -24.5, 9.5, -22, 10.5, -14, 8, -9, 4, -8, .6, -12], K.v ? '#4a4a4c' : '#b9c3cf');
        P(c, [-.6, -22, -5, -21, -7, -17, -4, -15, -.6, -16], K.v ? '#3a3a3c' : '#8e9aa8', '#1a1e24', .5);
        L(c, [10, -21.5, 9.8, -14.5], '#ffffff', .8); L(c, [3, -20, 7, -18, 3, -12], K.v ? '#eb7a49' : T, .6); D(c, 3, -16.4, .8, 1.2, T); O(c, 0, 6.4, 1.3, 1.3, T, '#5a4020', .4); break;
      case 'hammer':
        shaft(c, -17, 9, 1, K.woodL, K.wood); L(c, [0, -14, 0, 8], T, .35);
        facet(c, [-7.5, -26, 7.5, -26, 8.5, -17, -8.5, -17], K.v ? '#4a484e' : '#d8d0a8');
        P(c, [-9.5, -25, -7.5, -26, -7.5, -17, -9.5, -18], T, shade(T, .5), .5); P(c, [9.5, -25, 7.5, -26, 7.5, -17, 9.5, -18], shade(T, .1), shade(T, .5), .5);
        L(c, [-6.8, -24.5, 6.8, -24.5], 'rgba(255,255,255,.65)', .6); D(c, 0, -21.5, 2.4, 3, K.v ? '#ffe0a0' : '#fff4b0', shade(T, .5));
        L(c, [-6, -18.4, 6, -18.4], T, .5); O(c, 0, 9, 1.4, 1.4, T, '#5a4020', .4); break;
      case 'dagger': dagger(c, K, 1); break;
      case 'bow':
        c.save(); c.translate(-1, -2); c.beginPath(); c.moveTo(0, -21); c.bezierCurveTo(-10, -12, -10, 12, 0, 21);
        c.strokeStyle = '#2a1a10'; c.lineWidth = 2.6; c.stroke(); c.strokeStyle = K.v ? '#6b8ea0' : '#9b6c3c'; c.lineWidth = 1.7; c.stroke();
        c.beginPath(); c.moveTo(-1.5, -17); c.bezierCurveTo(-8, -10, -8, 10, -1.5, 17); c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = .5; c.stroke();
        L(c, [0, -21, 3.6, 0, 0, 21], '#e8e2cc', .4); L(c, [-3, 0, 12, 0], '#d8c88e', .7); P(c, [12, 0, 9.6, -1.3, 9.6, 1.3], '#c9d2d8', '#333', .3);
        P(c, [-3, 0, -5, -1.6, -5, 1.6], K.v ? '#e8f2f0' : '#c9442e'); L(c, [-1.5, -3, -1.5, 3], T, 1.4); c.restore(); break;
      case 'frost':
        shaft(c, -17, 12, .9, '#8aa8c0', '#3e556e'); for (i = 0; i < 3; i++) L(c, [-.9, -6 + i * 5, .9, -5 + i * 5], '#cff6ff', .5);
        P(c, [0, -29, 3.4, -22, 2.6, -16, 0, -14, -2.6, -16, -3.4, -22], VG(c, -3, -28, 3, -15, '#f2ffff', '#4fa6c8'), '#1f5a78', .7);
        P(c, [0, -29, 3.4, -22, 0, -20], 'rgba(255,255,255,.45)'); L(c, [0, -29, 0, -14], 'rgba(255,255,255,.5)', .4);
        P(c, [-4.8, -19, -2.6, -22, -2.6, -16], '#a6ecf5', '#2c5a78', .5); P(c, [4.8, -19, 2.6, -22, 2.6, -16], '#8bd0e0', '#2c5a78', .5);
        D(c, 0, -13, 1.2, 1.6, T, '#2c5a78'); D(c, 0, -4, .7, 1.2, '#cff6ff'); break;
      case 'holy':
        shaft(c, -17, 12, .9, '#f0dc9a', '#a08040'); L(c, [-.3, -15, -.3, 10], 'rgba(255,255,255,.5)', .4);
        c.beginPath(); c.ellipse(0, -22, 5, 5.6, 0, 0, 6.3); c.strokeStyle = '#7a5a22'; c.lineWidth = 2.4; c.stroke(); c.strokeStyle = K.v ? '#d6d5e7' : '#ffe9a0'; c.lineWidth = 1.5; c.stroke();
        O(c, 0, -22, 2.2, 2.2, '#fffbe0', '#a17e38', .5); L(c, [0, -29, 0, -27], T, .8); L(c, [-6.5, -22, -8.4, -22], T, .8); L(c, [6.5, -22, 8.4, -22], T, .8);
        D(c, 0, -15.5, 1.8, 2, T, '#7a5a22'); P(c, [-2, -14, 0, -12, 2, -14, 0, -16], T); break;
      case 'fel':
        shaft(c, -19, 12, 1, '#4a3a5a', '#1a1226'); for (i = 0; i < 3; i++) L(c, [-1, -8 + i * 6, 1, -6 + i * 6], K.v ? '#d57a53' : '#9ac85a', .5);
        P(c, [-4.8, -28, -2.6, -22, -3.4, -17, 0, -15, 3.4, -17, 2.6, -22, 4.8, -28, 0, -20], '#3a2a46', '#120a1c', .6);
        P(c, [-1.6, -26, 1.6, -26, 2, -21, 0, -19, -2, -21], '#cbbfa8', '#2a1c30', .5); c.fillStyle = '#10080c'; c.fillRect(-1.2, -24, .9, 1.2); c.fillRect(.3, -24, .9, 1.2);
        D(c, 0, -17.5, .8, 1.1, K.eye); L(c, [-4.5, -27, -3, -22], K.eye, .5); L(c, [4.5, -27, 3, -22], K.eye, .5); break;
      case 'nature':
        shaft(c, -17, 12, 1, '#a07a4a', '#4e3620'); L(c, [-.4, -15, -.4, 10], 'rgba(255,255,255,.2)', .4);
        for (s = -1; s <= 1; s += 2) { L(c, [s * .6, -17, s * 4, -22, s * 5, -28], '#8a6a44', 1.3); L(c, [s * 3.4, -21.4, s * 7, -22.6], '#8a6a44', .9); L(c, [s * 4.4, -25, s * 2.6, -29], '#8a6a44', .8);
          P(c, [s * 5, -28, s * 8, -30, s * 6.6, -26], '#a8ca79', '#314d34', .4); }
        O(c, 0, -21, 2.4, 2.8, K.v ? '#bfe8dc' : '#b4d685', '#3e5c34', .5); L(c, [-1, -22, 1, -20], 'rgba(255,255,255,.7)', .4);
        P(c, [-2, -9, 0, -11, 2, -9, 0, -7], '#6f9a54', '#2a4326', .4); break;
      case 'totem':
        shaft(c, -14, 12, 1.1, '#9a7648', '#4a321c');
        facet(c, [-4.4, -30, 4.4, -30, 4.8, -14, -4.8, -14], K.v ? '#4b4545' : '#8a9aa0');
        P(c, [-3.4, -27, -1, -27.6, -1, -25.6, -3.4, -25.6], '#14181c'); P(c, [1, -27.6, 3.4, -27, 3.4, -25.6, 1, -25.6], '#14181c');
        D(c, -2.2, -26.6, .5, .5, K.eye); D(c, 2.2, -26.6, .5, .5, K.eye);
        P(c, [-1, -24.4, 1, -24.4, 1.4, -22, -1.4, -22], '#2a2e32'); L(c, [-3, -19.4, 3, -19.4], K.v ? '#ec9c5c' : '#aeeef0', .9); L(c, [-3, -17, 3, -17], T, .6);
        for (s = -1; s <= 1; s += 2) { L(c, [s * 4.6, -26, s * 6.4, -22, s * 5.8, -17], '#d8e4e0', 1); L(c, [s * 5, -23, s * 6.6, -20], T, .6); }
        P(c, [-3.6, -30, 0, -33, 3.6, -30], K.v ? '#3a3636' : '#6c7e86', '#1a1e22', .5); break;
    }
  }

  // ---- atlas ----
  var PAINT = [
    function (c, cls, K, r) { paintHead(c, cls, K, r); }, function (c, cls, K) { paintTorso(c, cls, K); },
    function (c, cls, K) { paintArm(c, cls, K, -1); }, function (c, cls, K) { paintArm(c, cls, K, 1); },
    function (c, cls, K) { paintLeg(c, cls, K, -1); }, function (c, cls, K) { paintLeg(c, cls, K, 1); },
    function (c, cls, K) { paintBack(c, cls, K); }, function (c, cls, K) { paintWeapon(c, cls, K); }
  ];
  function buildAtlas(cls, K, race) {
    var cv = makeCanvas(ATLAS_W, ATLAS_H); if (!cv) return null;
    var c = cv.getContext('2d'); if (!c) return null;
    for (var i = 0; i < 8; i++) {
      c.save();
      c.beginPath(); c.rect((i % COLS) * SLOT, (i >> 2) * SLOT, SLOT, SLOT); c.clip();
      // Staves extend above their grip. Offset their slot origin rather than
      // enlarging the atlas (bow/daggers retain a centered origin).
      var originY = i === 7 && cls !== 'archer' && cls !== 'rogue' ? 68 : 48;
      c.translate((i % COLS) * SLOT + 48, (i >> 2) * SLOT + originY); c.scale(2, 2);
      c.lineJoin = 'round'; c.lineCap = 'round';
      try { PAINT[i](c, cls, K, race); } finally { c.restore(); }
    }
    return cv;
  }

  function raceInfo(e) {
    var rv = null;
    try { if (typeof root.raceVisual === 'function') rv = root.raceVisual(e); } catch (x) { rv = null; }
    var race = (e && (e.racial || e.visualRace)) || '';
    return { race: String(race), skin: (rv && rv.skin) || '#d7a078', sx: num(rv && rv.sx, 1), sy: num(rv && rv.sy, 1) };
  }
  function variantOf(cls, pal, e) {
    var id = (pal && (pal.skinId || pal.skin)) || (e && (e.skinId || e.equippedSkin || e.skin));
    if (typeof id !== 'string' || id === 'default') return 0;
    var i = SKINS[cls].indexOf(id); if (i >= 0) return i;
    var h = 0; for (var k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) | 0;
    return (h & 1);
  }
  function getEntry(cls, e, pal) {
    var ri = raceInfo(e), v = variantOf(cls, pal, e);
    // Preserve existing ability-state recolors (notably Shadow Form/Rampage).
    // Only the finite palette, never its countdown, participates in identity.
    var activeTint = !!(e.extra && ((cls === 'priest' && e.extra.shadowForm > 0) ||
      (cls === 'warrior' && e.extra.rampage > 0)));
    var base = !activeTint && (!pal || !pal.skinId || pal.skinId === 'default');
    var key = [cls, v, ri.race, ri.skin, base ? 'base' : pal.col, base ? '' : pal.dark, base ? '' : pal.light].join('|');
    var ent = cache.get(key);
    if (ent) { cache.delete(key); cache.set(key, ent); stats.hits++; return ent; }
    stats.misses++;
    var K = colors(cls, pal, v, ri.skin, activeTint), atlas;
    try { atlas = buildAtlas(cls, K, ri.race); } catch (x) { atlas = null; }
    if (!atlas) { stats.failures++; return null; }
    stats.builds++;
    while (cache.size >= MAX_ENTRIES || (cache.size + 1) * ENTRY_BYTES > MAX_BYTES) {
      var oldest = cache.keys().next().value; if (oldest === undefined) break;
      cache.delete(oldest); stats.evictions++;
    }
    ent = { atlas: atlas, bytes: ENTRY_BYTES };
    cache.set(key, ent); return ent;
  }

  function part(ctx, img, slot, x, y, rot, sx, sy, originY) {
    ctx.save();
    try {
      ctx.translate(x, y); if (rot) ctx.rotate(rot); if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
      ctx.drawImage(img, (slot % COLS) * SLOT, (slot >> 2) * SLOT, SLOT, SLOT, -24, -(originY || 24), 48, 48);
    } finally { ctx.restore(); }
  }

  function draw(ctx, e, cls, pal, time, pose) {
    if (!ctx || SPEC[cls] === undefined || !SKINS[cls]) return false;
    if(e && (e.isPet || e.isDungeonMonster || e.extra && e.extra.form ||
      e.form && e.form !== 'humanoid' || e.status && e.status.polymorphed)) return false;
    var ent = getEntry(cls, e || {}, pal || {});
    if (!ent) return false;
    var p = pose || {}, t = num(time, 0), img = ent.atlas;
    var move = clamp(num(p.move, 0), 0, 1), stride = clamp(num(p.stride, 0), -1, 1);
    var atk = clamp(num(p.attack, 0), 0, 1), wind = clamp(num(p.windup, 0), 0, 1), ft = clamp(num(p.followThrough, 0), 0, 1);
    var cast = clamp(num(p.cast, 0), 0, 1), hit = clamp(num(p.hit, 0), 0, 1), lean = clamp(num(p.lean, 0), -1, 1);
    var cc = p.cc && (typeof p.cc !== 'object' || p.cc.locked || p.cc.stunned || p.cc.sapped) ? 1 : 0;
    var death = clamp(num(p.death, 0), 0, 1);
    var f = num(p.facing, 1), face = f < 0 ? -1 : 1, yaw = Math.max(.18, Math.min(1, Math.abs(f)));
    var br = Math.sin(t * 2.1) * .012 * (1 - death) * (p.breath === 0 ? 0 : 1);
    var ri = raceInfo(e || {});
    var walk = cc ? 0 : stride * move;
    var rec = hit * 1.6, crouch = cc ? .7 : 0;
    var bow = cls === 'archer';
    var caster = cls === 'frostmage' || cls === 'priest' || cls === 'warlock' || cls === 'druid' || cls === 'shaman';
    // Ranged attacks use a bow release or staff gesture, never a melee swing.
    var swing = caster ? -.5 * wind - .35 * atk + .15 * ft :
      -1.45 * wind + 2.4 * atk * (1 - ft * .15) - .4 * ft;
    var armR = .1 + swing - cast * 1.7 + (cc ? 0 : -walk * .5);
    var armL = -.1 + (cc ? 0 : walk * .5) - cast * 1.4 + wind * -.3;
    var wRot = armR + (cast ? -.3 * cast : 0) - .1;
    if (caster) wRot = .1 + cast * .2 - atk * .15;
    if (bow) {
      armR = -.35 - wind * .1 + atk * .15;
      armL = -1 - wind * .35 + atk * .2;
      wRot = -.3 - wind * .08 + atk * .08;
    }
    var ang = death * 1.35 * face + lean * .08 - hit * .06;
    ctx.save();
    try {
      ctx.scale(face * yaw * ri.sx, ri.sy);
      ctx.translate(-rec * .6 + death * 3, death * 6 + crouch);
      if (ang) ctx.rotate(ang);
      ctx.globalAlpha = num(ctx.globalAlpha,1) * (1 - death * .35);
      var bob = Math.abs(Math.sin(t * 9)) * move * (cc ? 0 : .6);
      ctx.translate(0, -bob);
      var back = Math.sin(t * 2.4) * .04 + walk * .12 - atk * .1 + wind * .12;
      part(ctx, img, 6, 0, -11, back, 1, 1 + move * .03);
      var lstep = walk * .65, rstep = -walk * .65;
      part(ctx, img, 4, -3, 3 - crouch * .6, lstep, 1, 1);
      part(ctx, img, 5, 3, 3 - crouch * .6, rstep, 1, 1);
      part(ctx, img, 2, -6.3, -10, armL, 1, 1);
      part(ctx, img, 1, 0, -6 + crouch * .2, lean * .04 + atk * .05 * face, 1, 1 + br);
      part(ctx, img, 0, 0, -17 + br * 18 + crouch * .3, lean * .05 - hit * .08 - wind * .04, 1, 1);
      // right arm + weapon (weapon grip at hand, 11.2 below shoulder)
      ctx.save();
      try {
        ctx.translate(6.3, -10); ctx.rotate(armR);
        part(ctx, img, 3, 0, 0, 0, 1, 1);
        ctx.translate(0, 11.2); ctx.rotate(wRot - armR + .3);
        part(ctx, img, 7, 0, 0, 0, 1, 1, cls === 'archer' || cls === 'rogue' ? 24 : 34);
      } finally { ctx.restore(); }
    } finally { ctx.restore(); }
    return true;
  }

  function drawFormDetail(ctx,e,cls,pal,t) {
    var form=e.extra && e.extra.form;
    if(cls!=='druid' || !form) return false;
    ctx.save();
    try {
      ctx.scale(e.visualFacing || 1,1);
      ctx.strokeStyle=e.skinId==='moonclaw'?'#b7e6ec':'#d1c59e';ctx.lineWidth=.6;ctx.globalAlpha*=.65;
      if(form==='bear' || form==='tiger'){
        // Fine fur planes and shoulder/muzzle highlights, without ambient particles.
        for(var i=0;i<5;i++){ctx.beginPath();ctx.moveTo(-9+i*3,-3);ctx.lineTo(-7+i*3,-6);ctx.stroke();}
        ctx.beginPath();ctx.moveTo(10,-6);ctx.lineTo(15,-3);ctx.lineTo(17,0);ctx.stroke();
        ctx.fillStyle='#f5eacb';ctx.beginPath();ctx.arc(12,-5,1,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='#e3d4ad';
        for(var j=0;j<3;j++){ctx.beginPath();ctx.moveTo(8+j*1.4,11);ctx.lineTo(9+j*1.4,12.5);ctx.stroke();}
      }else{
        // Bark grain and leaf rim-light on Tree Form.
        ctx.strokeStyle='#c4d590';
        for(var k=0;k<4;k++){ctx.beginPath();ctx.moveTo(-4+k*2,-11);ctx.lineTo(-3+k*2,4);ctx.stroke();}
        ctx.beginPath();ctx.moveTo(-10,-16);ctx.lineTo(-4,-20);ctx.lineTo(3,-19);ctx.stroke();
      }
    } finally {ctx.restore();}
    return true;
  }

  function cacheStats() {
    var bytes = 0; cache.forEach(function (v) { bytes += v.bytes; });
    return { entries: cache.size, maxEntries: MAX_ENTRIES, bytes: bytes, maxBytes: MAX_BYTES, entryBytes: ENTRY_BYTES,
      hits: stats.hits, misses: stats.misses, builds: stats.builds, evictions: stats.evictions, failures: stats.failures };
  }
  function clearCache() { cache.clear(); }
  function setCanvasFactory(fn) { factory = typeof fn === 'function' ? fn : null; }

  var api = { draw: draw, drawFormDetail: drawFormDetail, cacheStats: cacheStats, clearCache: clearCache,
    setCanvasFactory: setCanvasFactory, classes: CLASSES.slice(), skins: SKINS };
  root.RosterPolishArt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
