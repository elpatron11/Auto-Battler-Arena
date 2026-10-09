(function () {
  'use strict';
  var seen = {};          // id -> true once presented
  var queue = [];
  var timer = null;
  var tries = 0;
  var dismissTimer = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function fmt(n) { try { return Math.round(n).toLocaleString(); } catch (e) { return String(Math.round(n)); } }
  function reduced() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function ensureContainer(r) {
    if(r.containerId)return document.getElementById(r.containerId);
    var tournament = document.getElementById('tournamentModal');
    var overlay = document.getElementById('endOverlay');
    var endVisible = overlay && overlay.getClientRects().length &&
      (!tournament || !tournament.getClientRects().length);
    if (r.floating || !endVisible) {
      var floating = document.getElementById('floatingMatchReward');
      var host = document.fullscreenElement || document.body;
      if (!floating) {
        floating = el('div', 'floating-match-reward');
        floating.id = 'floatingMatchReward';
      }
      if (floating.parentNode !== host) host.appendChild(floating);
      floating.hidden = false;
      return floating;
    }
    var c = document.getElementById('matchReward');
    if (c) return c;
    var panel = document.querySelector('#endOverlay .endPanel');
    if (!panel) return null;
    c = document.createElement('div');
    c.id = 'matchReward';
    panel.appendChild(c);
    return c;
  }
  function milestones(list) {
    var out = [];
    if (!Array.isArray(list)) return out;
    list.forEach(function (m) {
      if (m == null) return;
      if (typeof m === 'string') { out.push({ name: m, gold: 0 }); return; }
      var name = m.label || m.name || m.rank || m.tier || '';
      if (m.division && String(name).indexOf(String(m.division)) < 0) name = name + ' ' + m.division;
      out.push({ name: String(name), gold: num(m.gold != null ? m.gold : m.amount) });
    });
    return out;
  }
  function build(r, animate) {
    var gold = Math.max(0, num(r.gold));
    var ms = milestones(r.rankMilestones);
    if(r.rankUp){
      const milestone=ms.find(m=>String(r.rankUp).startsWith(m.name));
      if(milestone)milestone.name=String(r.rankUp);
      else ms.push({name:String(r.rankUp),gold:0});
    }
    var card = el('div', 'confirmed-match-reward' + (animate ? ' cmr-live' : ''));
    card.setAttribute('data-receipt-id', String(r.id));
    var live = el('div', 'cmr-sr');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    var summary = [];
    var goldNode = null;
    if (gold > 0) {
      card.appendChild(el('div', 'cmr-label', 'Gold credited'));
      var row = el('div', 'cmr-gold');
      row.appendChild(el('span', 'cmr-coin'));
      goldNode = el('span', 'cmr-amt', '+' + fmt(animate && !reduced() ? 0 : gold));
      row.appendChild(goldNode);
      card.appendChild(row);
      summary.push(fmt(gold) + ' gold credited.');
    }
    if (r.balance != null && isFinite(Number(r.balance))) {
      var b = el('div', 'cmr-balance', 'Total balance: ');
      b.appendChild(el('b', null, fmt(num(r.balance)) + ' gold'));
      card.appendChild(b);
      summary.push('Total balance ' + fmt(num(r.balance)) + ' gold.');
    }
    if(Number.isFinite(r.rating))card.appendChild(el('div','cmr-balance','Arena rating: '+fmt(r.rating)+' RP'));
    ms.forEach(function (m) {
      var box = el('div', 'cmr-rank');
      box.appendChild(el('strong', null, 'Rank up' + (m.name ? ': ' + m.name : '')));
      if (m.gold > 0) box.appendChild(el('span', null, '+' + fmt(m.gold) + ' gold milestone reward'));
      card.appendChild(box);
      summary.push('Rank up' + (m.name ? ' to ' + m.name : '') + (m.gold > 0 ? ', ' + fmt(m.gold) + ' milestone gold.' : '.'));
    });
    live.textContent = summary.join(' ');
    card.appendChild(live);
    if (animate && !reduced()) {
      if (goldNode) {
        var start = null, dur = Math.min(1600, 600 + gold * 4);
        var step = function (t) {
          if (!card.isConnected) return;
          if (start == null) start = t;
          var p = Math.min(1, (t - start) / dur);
          goldNode.textContent = '+' + fmt(gold * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        for (var i = 0; i < 14; i++) {
          var s = el('span', 'cmr-spark');
          var a = (Math.PI * 2 * i) / 14, d = 50 + (i % 3) * 18;
          s.style.setProperty('--dx', Math.cos(a) * d + 'px');
          s.style.setProperty('--dy', Math.sin(a) * d + 'px');
          s.style.animationDelay = (i % 4) * 40 + 'ms';
          card.appendChild(s);
        }
      }
    }
    return { card: card, empty: gold <= 0 && !ms.length && r.balance==null };
  }
  function tryShow(r) {
    var c = ensureContainer(r);
    if (!c) return false;
    if (c.id === 'floatingMatchReward') {
      clearTimeout(dismissTimer);
      dismissTimer = setTimeout(function () { c.hidden = true; }, 9000);
    }
    var id = String(r.id);
    var existing = c.querySelector('.confirmed-match-reward');
    if (existing && existing.getAttribute('data-receipt-id') === id) { seen[id] = true; return true; }
    var replay = !!seen[id];
    var built = build(r, !replay);
    seen[id] = true;
    if (existing) existing.remove();
    if (!built.empty) c.appendChild(built.card);
    return true;
  }
  function flush() {
    queue = queue.filter(function (r) { return !tryShow(r); });
    if (!queue.length) { clearInterval(timer); timer = null; return; }
    if (++tries > 120) { queue = []; clearInterval(timer); timer = null; }
  }
  window.MatchRewards = {
    show: function (receipt) {
      if (!receipt || receipt.id == null || receipt.id === '') return false;
      if (tryShow(receipt)) return true;
      // late: end panel not built yet; retry briefly
      queue = queue.filter(function (q) { return String(q.id) !== String(receipt.id); });
      queue.push(receipt);
      tries = 0;
      if (!timer) timer = setInterval(flush, 500);
      return false;
    }
  };
})();
