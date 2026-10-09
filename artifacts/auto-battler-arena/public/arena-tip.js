/* Arena visual tip. Isolated module. Exposes window.ArenaTip. No dependency on game.html globals. */
(function () {
  'use strict';
  if (window.ArenaTip) return;

  var DURATION = 5000;
  var uid = 0;
  var pending = null; // { cancel, promise }
  var styleDone = false;
  var nextTip = Math.floor(Math.random() * 12);
  var TIPS = [
    ['Welcome to Arenas', 'Build your team, collect heroes and spells, and let your heroes fight automatically.'],
    ['Currencies & Gold', 'Use Gold to unlock characters, racials, spells and ultimates in the Market.'],
    ['Characters', 'Each class has its own role, spell and ultimate. Try different team combinations.'],
    ['Racials', 'Racials give your captain passive bonuses and an active racial ability during battle.'],
    ['Spells', 'Unlock spells and mix your equipped choices to create different playstyles.'],
    ['Ultimates', 'Coordinate powerful ultimates to create team strategies and combos.'],
    ['Talents', 'Choose one talent per class to change how that hero plays.'],
    ['The Market', 'Check each Market tab to find new classes, racials, spells and ultimates.'],
    ['PvP Challenges', 'Challenge real players and grow your spell collection.'],
    ['Tournaments', 'Compete through a series of battles for tournament rewards.'],
    ['Hourly Dungeon', 'Defeat the current boss for a chance at rewards. Bosses cannot be pushed or charged out of position.'],
    ['Build Your Team', 'Pick your heroes, equip spells and ultimates, choose talents, and set your formation.']
  ];

  var CSS = [
    '.atip{display:block;width:100%;max-width:420px;margin:0 auto;color:#e9eefc;font-family:inherit}',
    '.atip svg{display:block;width:100%;height:auto}',
    '.atip-panel{display:block;width:100%;height:auto;max-height:52vh;max-height:52dvh;object-fit:contain;border-radius:8px}',
    '.atip-topic{margin:0 0 8px;color:#ffd66e;font-size:16px;font-weight:900;text-align:center}',
    '.atip-cap{display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#f3cf72}',
    '.atip-cap span:last-child{color:#9fc4ff}',
    '.atip-arrow{stroke-dasharray:6 6;animation:atipDash 1.1s linear infinite}',
    '.atip-pulse{transform-box:fill-box;transform-origin:center;animation:atipPulse 1.6s ease-in-out infinite}',
    '@keyframes atipDash{to{stroke-dashoffset:-24}}',
    '@keyframes atipPulse{50%{transform:scale(1.12);opacity:.7}}',
    '.atip-ov{position:fixed;inset:0;box-sizing:border-box;z-index:99999;display:flex;align-items:center;justify-content:center;padding:max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom));background:rgba(4,8,18,.96);animation:atipIn .2s ease-out}',
    '@keyframes atipIn{from{opacity:0}}',
    '.atip-card{box-sizing:border-box;width:min(440px,100%);max-height:100%;overflow:auto;padding:16px;border:1px solid #c9a24a;border-radius:14px;background:linear-gradient(180deg,#14213d,#0a1221);box-shadow:0 12px 40px rgba(0,0,0,.6)}',
    '.atip-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}',
    '.atip-title{margin:0;font-size:18px;font-weight:900;color:#f3cf72}',
    '.atip-sub{margin:10px 0 0;text-align:center;font-size:14px;color:#c6d3ef}',
    '.atip-bar{height:6px;margin-top:12px;border-radius:4px;background:#0a1221;border:1px solid #42557c;overflow:hidden}',
    '.atip-fill{height:100%;width:100%;background:linear-gradient(90deg,#b8862b,#ffd66e);transform:scaleX(0);transform-origin:left}',
    '.atip-fill.run{animation:atipFill var(--atip-d,5000ms) linear forwards}',
    '@keyframes atipFill{to{transform:scaleX(1)}}',
    '.atip-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}',
    '.atip-btn{min-height:40px;padding:8px 16px;border-radius:10px;border:1px solid #42557c;background:#101b33;color:#dbe6ff;font-weight:800;cursor:pointer}',
    '.atip-btn.go{border-color:#c9a24a;color:#ffd66e}',
    '.atip-btn:focus-visible{outline:2px solid #ffd66e;outline-offset:2px}',
    '@media (max-height:480px) and (orientation:landscape){.atip-card{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;max-width:640px;width:min(640px,100%);padding:10px 14px}.atip-head,.atip-btns{grid-column:1/-1;margin:0}.atip-body{grid-row:2/4;grid-column:1}.atip-side{grid-column:2;grid-row:2}.atip-sub{margin-top:0;text-align:left}}',
    '@media (prefers-reduced-motion:reduce){.atip-arrow,.atip-pulse,.atip-ov{animation:none}.atip-fill.run{animation:none;transform:scaleX(1)}}'
  ].join('');

  function injectCSS() {
    if (styleDone || document.getElementById('arenaTipCss')) { styleDone = true; return; }
    var s = document.createElement('style');
    s.id = 'arenaTipCss';
    s.textContent = CSS;
    document.head.appendChild(s);
    styleDone = true;
  }

  // Hero silhouette: head + shoulders/body, centered at (cx, cy)
  function hero(cx, cy, fill, ring, role) {
    var weapon = role === 'tank'
      ? '<rect x="' + (cx + 15) + '" y="' + (cy - 6) + '" width="12" height="20" rx="3" fill="#6f84ad"/>'
      : role === 'dps'
        ? '<path d="M' + (cx + 18) + ' ' + (cy + 14) + 'L' + (cx + 26) + ' ' + (cy - 14) + '" stroke="#cfd8ee" stroke-width="3" stroke-linecap="round"/>'
        : '<circle cx="' + (cx + 22) + '" cy="' + (cy - 6) + '" r="5" fill="#7fe0b0"/><path d="M' + (cx + 22) + ' ' + (cy - 1) + 'V' + (cy + 16) + '" stroke="#b8862b" stroke-width="2.5"/>';
    return '<ellipse cx="' + cx + '" cy="' + (cy + 24) + '" rx="22" ry="6" fill="none" stroke="' + ring + '" stroke-width="2.5"/>' +
      '<path d="M' + (cx - 16) + ' ' + (cy + 22) + 'Q' + (cx - 16) + ' ' + (cy - 2) + ' ' + cx + ' ' + (cy - 2) + 'Q' + (cx + 16) + ' ' + (cy - 2) + ' ' + (cx + 16) + ' ' + (cy + 22) + 'Z" fill="' + fill + '"/>' +
      '<circle cx="' + cx + '" cy="' + (cy - 12) + '" r="9" fill="' + fill + '"/>' + weapon;
  }

  function markup(opts) {
    injectCSS();
    opts = opts || {};
    var id = 'atip' + (++uid);
    var t = id + 't', d = id + 'd', g = id + 'g', ar = id + 'a', ar2 = id + 'b';
    var label = String(opts.label || 'Build a team of three heroes with one Captain. Heroes fight automatically against the enemy team.')
      .replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    var svg =
      '<svg viewBox="0 0 360 150" role="img" aria-labelledby="' + t + ' ' + d + '" focusable="false">' +
      '<title id="' + t + '">Arena team tip</title><desc id="' + d + '">' + label + '</desc>' +
      '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14213d"/><stop offset="1" stop-color="#0a1221"/></linearGradient>' +
      '<marker id="' + ar + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ffd66e"/></marker>' +
      '<marker id="' + ar2 + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ff8585"/></marker></defs>' +
      '<rect x="1" y="1" width="358" height="148" rx="12" fill="url(#' + g + ')" stroke="#c9a24a" stroke-width="2"/>' +
      '<line x1="180" y1="14" x2="180" y2="136" stroke="#42557c" stroke-width="1.5" stroke-dasharray="3 5"/>' +
      // player team: tank front, dps, healer back
      hero(112, 52, '#3f7fd6', '#69b9ff', 'tank') +
      hero(60, 98, '#4a8fe6', '#69b9ff', 'dps') +
      hero(60, 40, '#3a74c4', '#69b9ff', 'heal') +
      // captain crown over tank
      '<g class="atip-pulse"><path d="M98 22L102 30L112 24L122 30L126 22L124 36H100Z" fill="#ffd66e" stroke="#b8862b" stroke-width="1.5"/></g>' +
      '<circle cx="112" cy="52" r="30" fill="none" stroke="#ffd66e" stroke-width="2" stroke-dasharray="4 4"/>' +
      // enemy team
      hero(250, 52, '#b4474f', '#ff8585', 'tank') +
      hero(300, 98, '#c25560', '#ff8585', 'dps') +
      hero(300, 40, '#a53d46', '#ff8585', 'heal') +
      // automatic battle arrows
      '<path class="atip-arrow" d="M142 62H216" stroke="#ffd66e" stroke-width="3" fill="none" marker-end="url(#' + ar + ')"/>' +
      '<path class="atip-arrow" d="M218 100H150" stroke="#ff8585" stroke-width="3" fill="none" marker-end="url(#' + ar2 + ')"/>' +
      '</svg>';
    return '<div class="atip" data-arena-tip="' + id + '">' + svg +
      '<div class="atip-cap"><span>Build your team</span><span>Heroes fight automatically</span></div></div>';
  }

  function cancelAll() {
    if (pending) pending.cancel('cancelled');
  }

  function beforeMatch(startCallback, opts) {
    opts = opts || {};
    if (pending) return pending.promise; // shared pending flag: duplicate entry ignored
    if (typeof startCallback !== 'function') startCallback = function () {};
    injectCSS();
    var duration = opts.duration > 0 ? opts.duration : DURATION;
    var tipIndex = nextTip;
    nextTip = (nextTip + 1) % TIPS.length;
    var tip = TIPS[tipIndex];
    var cancellable = opts.cancellable !== false;
    var prevFocus = document.activeElement;
    var ov = document.createElement('div');
    ov.className = 'atip-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'atipHeading');
    ov.innerHTML = '<div class="atip-card"><div class="atip-head"><h2 class="atip-title" id="atipHeading">Loading match…</h2></div>' +
      '<div class="atip-body"><img class="atip-panel" src="./assets/match-tips/tip-' +
      String(tipIndex + 1).padStart(2, '0') + '.webp" alt="' + tip[0] + ' guide" onerror="this.hidden=true"></div>' +
      '<div class="atip-side"><h3 class="atip-topic">' + tip[0] + '</h3><p class="atip-sub" aria-live="polite">' + tip[1] + '</p>' +
      '<div class="atip-bar" role="progressbar" aria-label="Battle starting" aria-valuemin="0" aria-valuemax="100"><div class="atip-fill"></div></div></div>' +
      '<div class="atip-btns">' + (cancellable ? '<button type="button" class="atip-btn" data-act="cancel">Cancel</button>' : '') +
      '<button type="button" class="atip-btn go" data-act="go">Start now</button></div></div>';
    var fill = ov.querySelector('.atip-fill');
    fill.style.setProperty('--atip-d', duration + 'ms');
    var bar = ov.querySelector('.atip-bar');
    var settled = false, timer = null, resolveFn;
    var entry = {};

    var promise = new Promise(function (res) { resolveFn = res; });

    function finish(status) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(tick);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pagehide', cancelAll);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      document.body.classList.remove('arenaTipOpen');
      if (pending === entry) pending = null;
      if (status === 'started') {
        try { startCallback(); } catch (e) { setTimeout(function () { throw e; }); }
      } else if (prevFocus && prevFocus.focus) {
        try { prevFocus.focus(); } catch (e) {}
      }
      resolveFn(status);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (cancellable) finish('cancelled'); return; }
      if (e.key === 'Tab') {
        var b = ov.querySelectorAll('button');
        var first = b[0], last = b[b.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (!ov.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      }
    }
    ov.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('[data-act]');
      if (!a) return;
      if (a.getAttribute('data-act') === 'go') finish('started');
      else if (cancellable) finish('cancelled');
    });
    entry.promise = promise;
    entry.cancel = finish;
    pending = entry;
    document.body.appendChild(ov);
    document.body.classList.add('arenaTipOpen');
    document.addEventListener('keydown', onKey, true);
    ov.querySelector(cancellable ? '[data-act="cancel"]' : '[data-act="go"]').focus();
    requestAnimationFrame(function () { fill.classList.add('run'); });
    // honest progress: only expose real time elapsed, no fake percentage text
    var t0 = Date.now();
    var tick = setInterval(function () {
      if (settled) return clearInterval(tick);
      bar.setAttribute('aria-valuenow', String(Math.min(100, Math.round((Date.now() - t0) / duration * 100))));
    }, 500);
    timer = setTimeout(function () { clearInterval(tick); finish('started'); }, duration);
    window.addEventListener('pagehide', cancelAll, { once: true });
    return promise;
  }

  window.ArenaTip = {
    markup: markup,
    beforeMatch: beforeMatch,
    cancelAll: cancelAll,
    isPending: function () { return !!pending; },
    injectCSS: injectCSS,
    duration: DURATION
  };
})();
