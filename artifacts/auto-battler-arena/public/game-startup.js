/* Startup presentation only. Keep layout measurable while preventing legacy
   menus from painting. Engine readiness remains independent of UI readiness. */
(function () {
  'use strict';
  const accountHosted = window.parent !== window &&
    new URLSearchParams(location.search).get('startup') === 'account';
  let loaded = false;
  let accountReady = !accountHosted;
  let settling = false;
  let revealed = false;
  let timedOut = false;
  let deadline;

  function showRetry() {
    if (revealed) return;
    timedOut = true;
    const message = document.getElementById('game-startup-message');
    const retry = document.getElementById('game-startup-retry');
    if (message) message.textContent = 'The game is taking longer than expected.';
    if (retry) {
      retry.hidden = false;
      retry.onclick = () => location.reload();
    }
  }

  function announce() {
    window.parent.postMessage({type: 'arena:startup-visible'}, location.origin);
  }

  function finish() {
    if (revealed || settling || !loaded || !accountReady) return;
    // Never fall back to revealing an old menu if the current dashboard failed.
    if (!document.getElementById('alRoot') ||
        !document.body.classList.contains('alLobby')) {
      showRetry();
      return;
    }
    settling = true;
    try {
      if (typeof playerProfile !== 'undefined' && playerProfile &&
          typeof showMainHub === 'function' &&
          !(typeof PRACTICE_ONLY !== 'undefined' && PRACTICE_ONLY) &&
          !(typeof state !== 'undefined' && state && !state.over)) {
        showMainHub();
      }
      // Let final dashboard refreshes, host-state messages and previews paint
      // underneath the cover before releasing it. No arbitrary splash delay.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        revealed = true;
        clearTimeout(deadline);
        document.documentElement.classList.remove('game-starting');
        const splash = document.getElementById('game-startup');
        if (splash) {
          splash.setAttribute('aria-busy', 'false');
          splash.hidden = true;
        }
        announce();
      }));
    } catch (error) {
      settling = false;
      showRetry();
      console.error('Game dashboard startup failed', error);
    }
  }

  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    if (event.data?.type === 'arena:startup-commit' && accountHosted) {
      accountReady = true;
      finish();
    }
    // A lost visibility message must not strand a remounted host listener.
    if (event.data?.type === 'arena:ping' && revealed) announce();
  });
  document.addEventListener('DOMContentLoaded', () => {
    if (timedOut) showRetry();
  }, {once: true});
  // Begin before late scripts/modules finish so a stalled download is recoverable.
  deadline = setTimeout(showRetry, 9000);
  window.addEventListener('load', () => {
    const fonts = document.fonts?.ready || Promise.resolve();
    Promise.resolve(fonts).then(() => {
      loaded = true;
      finish();
    }).catch(showRetry);
  }, {once: true});
})();
