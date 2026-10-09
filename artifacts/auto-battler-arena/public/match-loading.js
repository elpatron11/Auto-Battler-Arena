/* Last entry hook: delay combat, not orders, tickets, rewards or team buffs. */
(function () {
  'use strict';
  if (!window.ArenaTip || typeof window.startBattle !== 'function') return;
  var originalStart = window.startBattle;
  var waitingOpts = null;

  window.startBattle = function (opts) {
    opts = opts || {};
    if (opts._arenaTipShown) return originalStart.apply(this, arguments);
    if (window.ArenaTip.isPending()) {
      // Ignore repeated fight-button clicks. A newly prepared ranked matchup
      // can replace a local entry without allowing its stale timer to start.
      if (!opts._ordersConfirmed || waitingOpts === opts) return;
      if (waitingOpts && !!waitingOpts.onlineChallenge === !!opts.onlineChallenge &&
          !!waitingOpts.tournament === !!opts.tournament) return;
      if (typeof window.invalidateArenaEntry === 'function') window.invalidateArenaEntry();
      else window.ArenaTip.cancelAll();
    }
    if (!opts._ordersConfirmed) return originalStart.apply(this, arguments);
    waitingOpts = opts;
    var receiver = this;
    var prepared = Object.assign({}, opts, { _arenaTipShown: true });
    // Account/tournament tickets are already reserved: do not offer an
    // apparent cancellation that would leave that reservation unfinished.
    var pending = window.ArenaTip.beforeMatch(function () {
      waitingOpts = null;
      originalStart.call(receiver, prepared);
    }, { cancellable: !opts.onlineChallenge && !opts.tournament });
    // Static, cosmetic portraits only. Reuse the current equipped skin renderer;
    // no new animation loop, loading delay, order mutation or equipment change.
    var card=document.querySelector('.atip-ov .atip-card');
    if(card&&window.PrestigeVfx&&typeof drawProfileSkinPreview==='function'&&typeof selected!=='undefined'){
      var row=document.createElement('div');
      row.setAttribute('aria-hidden','true');
      row.style.cssText='display:flex;justify-content:center;gap:10px;pointer-events:none;max-height:112px;overflow:hidden';
      for(var cls of selected){
        var skin=equippedSkin(cls);
        if(!window.PrestigeVfx.theme({classId:cls,skinId:skin}))continue;
        var portrait=document.createElement('canvas');portrait.width=188;portrait.height=200;
        portrait.style.cssText='width:94px;height:100px;max-width:28vw';
        row.appendChild(portrait);drawProfileSkinPreview(portrait,cls,skin);
      }
      if(row.childNodes.length)card.appendChild(row);
    }
    return pending;
  };
})();