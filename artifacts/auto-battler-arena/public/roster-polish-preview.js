/* Opt-in development renderer. No progression, match or combat state is written. */
(function () {
  'use strict';
  const active = new URLSearchParams(location.search).get('visualPreview') === '1';
  let mode = 'polished';
  const report = () => {
    if (active && parent !== window) parent.postMessage({ type: 'arena:visual-status', mode }, location.origin);
  };
  const api = {
    get enabled() { return active && mode === 'polished'; },
    get active() { return active; },
    get mode() { return mode; },
    setMode(next) {
      if (!active || !['original', 'polished'].includes(next)) return;
      if (mode === next) { report(); return; }
      mode = next;
      window.RosterPolishMotion?.reset();
      if (next === 'original') window.RosterPolishArt?.clearCache();
      document.documentElement.dataset.visualPreview = mode;
      report();
    },
    // Used by the read-only roster comparison to measure identical render inputs.
    withMode(next, draw) {
      const previous = mode;
      try { mode = next === 'original' ? 'original' : 'polished'; return draw(); }
      finally { mode = previous; }
    },
    metrics() {
      return { active, mode, art: window.RosterPolishArt?.cacheStats(), effects: window.RosterPolishVfx?.metrics };
    }
  };
  window.RosterVisualPreview = Object.freeze(api);
  window.addEventListener('message', event => {
    if (!active || event.origin !== location.origin || event.source !== parent) return;
    if (event.data?.type === 'arena:visual-preview') api.setMode(event.data.mode);
    if (event.data?.type === 'arena:visual-ping') report();
  });
  if (active) document.documentElement.dataset.visualPreview = mode;
  report();
})();