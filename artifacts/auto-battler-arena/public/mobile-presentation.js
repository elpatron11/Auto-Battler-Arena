(function () {
  'use strict';
  // Fullscreen requests must stay synchronous with a real click. In particular,
  // don't wait for a battle-start message or loading animation to finish.
  let host = window;
  try { if (window.parent.document) host = window.parent; } catch (_) {}
  const hostDoc = host.document;
  const root = hostDoc.documentElement;
  // Insets in an embedded document may be zero even when its host has a notch.
  const safeProbe = hostDoc.createElement('div');
  safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  hostDoc.body.appendChild(safeProbe);
  function syncInsets() {
    const style = host.getComputedStyle(safeProbe);
    ['top', 'right', 'bottom', 'left'].forEach(side => {
      const value = style.getPropertyValue('padding-' + side);
      const name = '--game-safe-' + side;
      if (document.documentElement.style.getPropertyValue(name) !== value)
        document.documentElement.style.setProperty(name, value);
    });
  }
  const mobile = () => host.matchMedia('(pointer:coarse), (max-width:700px), (orientation:landscape) and (max-height:600px)').matches;
  const standalone = () => host.matchMedia('(display-mode:standalone), (display-mode:fullscreen)').matches || host.navigator.standalone === true;
  const current = () => hostDoc.fullscreenElement || hostDoc.webkitFullscreenElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  const allowed = () => !!request && hostDoc.fullscreenEnabled !== false && hostDoc.webkitFullscreenEnabled !== false;
  const button = document.createElement('button');
  button.id = 'mobileFullscreenBtn';
  button.type = 'button';
  button.className = 'secondary';
  const note = document.createElement('div');
  note.id = 'mobileFullscreenNote';
  note.setAttribute('role', 'status');
  note.hidden = true;
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = 'Close';
  dismiss.addEventListener('click', () => { note.hidden = true; });
  const message = document.createElement('span');
  note.append(message, dismiss);
  document.body.appendChild(note);
  const rotateNote = document.createElement('div');
  rotateNote.id = 'mobileLandscapeNote';
  rotateNote.setAttribute('role', 'status');
  rotateNote.hidden = true;
  const rotateText = document.createElement('span');
  rotateText.textContent = 'Rotate your phone to landscape for the full arena view.';
  const rotateClose = document.createElement('button');
  rotateClose.type = 'button';
  rotateClose.textContent = 'Close';
  let rotateDismissed = false;
  rotateClose.addEventListener('click', () => { rotateDismissed = true; rotateNote.hidden = true; });
  rotateNote.append(rotateText, rotateClose);
  document.body.appendChild(rotateNote);
  const style = document.createElement('style');
  style.textContent = '#mobileFullscreenBtn{min-height:36px;padding:6px 10px;font-size:11px;touch-action:manipulation}#mainHub>#mobileFullscreenBtn{display:block;margin:8px auto}#mobileFullscreenNote{position:fixed;z-index:160;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));padding:12px;background:#152134;color:#f0e9d7;border:1px solid #718293;border-radius:10px;font-size:13px;box-shadow:0 4px 24px #0008}#mobileFullscreenNote[hidden],#mobileFullscreenBtn[hidden]{display:none!important}#mobileFullscreenNote button{margin-left:12px;min-height:36px}';
  document.head.appendChild(style);
  style.textContent += '#mobileLandscapeNote{position:fixed;z-index:161;left:12px;right:12px;top:max(52px,var(--game-safe-top,env(safe-area-inset-top)));padding:10px 12px;background:#152134f5;color:#f0e9d7;border:1px solid #718293;border-radius:10px;font-size:13px}#mobileLandscapeNote[hidden]{display:none!important}#mobileLandscapeNote button{margin-left:8px;min-height:32px}';
  style.textContent += 'body.battleMode #hdHud{top:max(6px,var(--game-safe-top,env(safe-area-inset-top)));right:max(6px,var(--game-safe-right,env(safe-area-inset-right)))}body.battleMode #hdBadge{bottom:max(6px,var(--game-safe-bottom,env(safe-area-inset-bottom)));left:max(6px,var(--game-safe-left,env(safe-area-inset-left)))}#mobileFullscreenNote{top:max(12px,var(--game-safe-top,env(safe-area-inset-top)));left:max(12px,var(--game-safe-left,env(safe-area-inset-left)));right:max(12px,var(--game-safe-right,env(safe-area-inset-right)))}';
  let pending = false;
  let orientationPending = false, orientationOwned = false, orientationGeneration = 0;
  function releaseLandscape() {
    orientationGeneration++;
    if (orientationOwned) {
      try { host.screen?.orientation?.unlock?.(); } catch (_) {}
      orientationOwned = false;
    }
  }
  function requestLandscape() {
    const orientation = host.screen?.orientation;
    if (!mobile() || !orientation?.lock || orientationOwned || orientationPending ||
        (!current() && !standalone())) return;
    orientationPending = true;
    const generation = orientationGeneration;
    try {
      Promise.resolve(orientation.lock('landscape')).then(() => {
        if (generation !== orientationGeneration || (!current() && !standalone())) {
          try { orientation.unlock?.(); } catch (_) {}
        } else orientationOwned = true;
      }).catch(() => {
        // Safari and some browsers prohibit orientation lock; rotation remains usable.
      }).finally(() => {
        orientationPending = false;
        if (generation !== orientationGeneration && (current() || standalone())) requestLandscape();
      });
    } catch (_) { orientationPending = false; }
  }
  function showFallback() {
    const ios = /iPhone|iPad|iPod/.test(host.navigator.userAgent) ||
      (host.navigator.platform === 'MacIntel' && host.navigator.maxTouchPoints > 1);
    message.textContent = ios
      ? 'For a browser-bar-free view, open this game in Safari, then Share → Add to Home Screen and launch it there.'
      : 'This browser did not allow fullscreen. You can retry Fullscreen, or install/add the game to your Home Screen from the browser menu. The game still fits the visible screen.';
    note.hidden = false;
  }
  function enter(explicit) {
    if (!mobile() || pending) return;
    if (current() || standalone()) { requestLandscape(); return; }
    if (!allowed()) { if (explicit) showFallback(); return; }
    pending = true;
    try {
      Promise.resolve(request.call(root, { navigationUI: 'hide' }))
        .then(() => { note.hidden = true; requestLandscape(); })
        .catch(() => { if (explicit) showFallback(); })
        .finally(() => { pending = false; update(); });
    } catch (_) {
      pending = false;
      if (explicit) showFallback();
    }
  }
  button.addEventListener('click', () => {
    if (current()) {
      const exit = hostDoc.exitFullscreen || hostDoc.webkitExitFullscreen;
      try { Promise.resolve(exit?.call(hostDoc)).catch(showFallback); } catch (_) { showFallback(); }
    } else enter(true);
  });
  // Capture runs before the existing handler, without stopping it, so cooldowns,
  // battle selection, and asynchronous pre-match dialogs remain untouched.
  const entryIds = new Set(['hubJoinBtn', 'hubBattleBtn', 'startBtn', 'priorityFightBtn',
    'againBtn', 'rematchBtn', 'tournamentBtn', 'hubJoinTournamentBtn', 'hubOnlineActionBtn']);
  document.addEventListener('click', event => {
    const target = event.target.closest?.('button');
    if (event.isTrusted && target && !target.disabled &&
        (entryIds.has(target.id) || target.matches('.hdDlg [data-a="enter"], #hdResult [data-a="again"]'))) enter(false);
  }, true);
  function update() {
    syncInsets();
    button.hidden = !mobile() || (standalone() && !current());
    button.textContent = current() ? 'Exit fullscreen' : allowed() ? 'Fullscreen' : 'App view';
    button.setAttribute('aria-label', button.textContent);
    const battle = document.body.classList.contains('battleMode');
    const portrait = host.matchMedia('(orientation:portrait)').matches;
    if (!portrait || !battle) rotateDismissed = false;
    rotateNote.hidden = !mobile() || !battle || !portrait || rotateDismissed;
    if (battle && standalone()) requestLandscape();
    const mount = document.getElementById(battle ? 'topBar' : 'mainHub');
    if (mount && button.parentElement !== mount) mount.appendChild(button);
  }
  const observer = new MutationObserver(update);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  function fullscreenChanged() {
    if (current()) requestLandscape(); else releaseLandscape();
    update();
  }
  hostDoc.addEventListener('fullscreenchange', fullscreenChanged);
  hostDoc.addEventListener('webkitfullscreenchange', fullscreenChanged);
  host.addEventListener('resize', update);
  host.addEventListener('orientationchange', update);
  host.visualViewport?.addEventListener('resize', update);
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    releaseLandscape();
    observer.disconnect();
    hostDoc.removeEventListener('fullscreenchange', fullscreenChanged);
    hostDoc.removeEventListener('webkitfullscreenchange', fullscreenChanged);
    host.removeEventListener('resize', update);
    host.removeEventListener('orientationchange', update);
    host.visualViewport?.removeEventListener('resize', update);
    safeProbe.remove();
  });
  update();
})();