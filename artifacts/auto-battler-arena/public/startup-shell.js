/* Outer startup cover. Runs before React so no route/menu/login UI can paint. */
(function () {
  'use strict';
  var BRAND_MS = 1800, HOLD_MS = 450, DEADLINE_MS = 30000;
  var root = document.documentElement;
  root.classList.add('arena-starting');
  var base = (document.currentScript && document.currentScript.src || '').replace(/startup-shell\.js.*$/, '');
  var t0 = 0, isReady = false, shown = 0, done = false, failed = false, loadingAt = 0;
  var loadingReady = false;
  var el;
  function build() {
    el = document.createElement('div');
    el.id = 'arena-startup';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-busy', 'true');
    el.setAttribute('aria-label', 'Loading Arenas');
    el.innerHTML = '<div class="as-layer as-brand"><img alt="Superhealz Studios presents" src="' + base + 'startup/brand.webp" decoding="async"></div>' +
      '<div class="as-layer as-load"><div class="as-box"><img alt="Arenas" src="' + base + 'startup/loading.webp" decoding="async"><div class="as-track" aria-hidden="true"><i></i></div></div></div>' +
      '<div class="as-fail" role="alert"><p>Arenas could not finish starting.</p><button type="button">Retry</button></div>';
    el.querySelector('button').onclick = function () { location.reload(); };
    (document.body || root).appendChild(el);
    requestAnimationFrame(function () { el.querySelector('.as-brand').classList.add('on'); });
    var brand = el.querySelector('.as-brand img'), loading = el.querySelector('.as-load img');
    function brandPainted() {
      if (t0 || failed) return;
      // Measure the branding hold from its actual paint, not from the head
      // script: slow module/image downloads must not consume the whole intro.
      requestAnimationFrame(function () {
        if (t0 || failed) return;
        t0 = Date.now(); tick();
      });
    }
    function loadingLoaded() { loadingReady = true; tick(); }
    brand.addEventListener('load', brandPainted, {once:true});
    loading.addEventListener('load', loadingLoaded, {once:true});
    brand.addEventListener('error', fail, {once:true});
    loading.addEventListener('error', fail, {once:true});
    if (brand.complete && brand.naturalWidth) brandPainted();
    if (loading.complete && loading.naturalWidth) loadingLoaded();
  }
  function toLoading() {
    if (shown || !el || !loadingReady || !t0 || Date.now() - t0 < BRAND_MS) return;
    shown = 1; loadingAt = Date.now();
    el.querySelector('.as-load').classList.add('on');
    el.querySelector('.as-brand').classList.remove('on');
    tick();
  }
  function tick() {
    if (done || failed) return;
    if (!shown) {
      if (t0) setTimeout(toLoading, Math.max(0, BRAND_MS - (Date.now() - t0)));
      return;
    }
    if (isReady) {
      var wait = Math.max(0, HOLD_MS - (Date.now() - loadingAt));
      setTimeout(finish, wait);
    }
  }
  function finish() {
    if (done || failed || !isReady || !shown || !loadingReady) return;
    done = true;
    el.setAttribute('aria-busy', 'false');
    root.classList.remove('arena-starting');
    el.classList.add('is-leaving');
    var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(function () { el.hidden = true; if (el.parentNode) el.parentNode.removeChild(el); }, reduced ? 0 : 560);
  }
  function fail() {
    if (done) return;
    failed = true;
    if (!el) return;
    toLoading();
    el.classList.add('is-failed');
    el.setAttribute('aria-busy', 'false');
  }
  window.ArenaStartup = {
    ready: function () { if (isReady || done || failed) return; isReady = true; tick(); },
    wait: function () { if (!done) isReady = false; },
    fail: fail,
    get done() { return done; }
  };
  function init() {
    if (el) return;
    if (!document.body) { setTimeout(init, 20); return; }
    build();
    if (failed) fail(); else tick();
  }
  // Do not wait for DOMContentLoaded: deferred React/module downloads can
  // stall that event, but the cover/retry must already be visible.
  init();
  setTimeout(fail, DEADLINE_MS);
})();
