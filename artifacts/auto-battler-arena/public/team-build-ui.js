/* Presentation layer for the squad builder. It only reads game state and
   forwards taps to MobileGameUX.openSlot and the existing slot dialog. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = escapeHtml;
  let focus = 0, panel = null, lastKey = '';

  function mount() {
    const host = document.querySelector('.ar-squad-active');
    if (!host || !$('teamSlots')) return null;
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'tbPanel'; panel.className = 'tb-panel';
      panel.setAttribute('aria-label', 'Selected hero build');
      $('teamSlots').insertAdjacentElement('beforebegin', panel);
    }
    return panel;
  }
  function pos() { return window.MobileGameUX ? window.MobileGameUX.slotPositions : selected.map((_, i) => i); }
  function entry(p) {
    const i = pos().indexOf(p);
    if (i < 0) return null;
    const key = selected[i], b = selectedBuilds[i]?.classId === key ? selectedBuilds[i] : {};
    const talentId = classTalents(key)[0];
    const talent = (CLASS_TALENTS[key] || []).find(t => t.id === talentId) || null;
    return { index: i, key, ability: b.ability || abilityChoice[key] || 'default', ult: b.ultimate || ultChoice[key] || 'default', talent };
  }
  function art(key, name) { return collectibleArtHtml(key, name); }
  // The engine appoints the first matching teammate, not every duplicate.
  function isCaptain(e) {
    return teamSize === 3 && e.key === captainClass && e.index === selected.indexOf(captainClass);
  }
  function icons(e, mini) {
    const cap = isCaptain(e);
    const basic = (CLASS_DESC[e.key] || []).find(line => !line.p && !/^ULT:/.test(line.t));
    const items = [
      ['basic', basic ? art(e.key, basic.t.replace(/\s*\([^)]*\)$/, '')) : '<i>-</i>', 'Class spell'],
      ['ability', art(e.key, variantArtName(e.key, 'ability', e.ability)), 'Spell'],
      ['ult', art(e.key, variantArtName(e.key, 'ult', e.ult)), 'Ultimate'],
      ['talent', e.talent ? art(e.key, e.talent.name) : '<i>-</i>', 'Talent']
    ];
    return items.map(([k, html, label]) => '<button type="button" class="tb-ico" data-tb="' + k + '" aria-label="' + label + (mini ? '' : ': change') + '">' + html + (mini ? '' : '<small>' + label + '</small>') + '</button>').join('') +
      (cap && !mini ? '<button type="button" class="tb-ico tb-cap" data-tb="captain" aria-label="Captain and racial"><b>C</b><small>' + (captainRacial && RACIALS[captainRacial] ? esc(RACIALS[captainRacial].race) : 'Captain') + '</small></button>' : '');
  }
  function describe(e) {
    const t = e.talent;
    const dup = selected.filter(k => k === e.key).length > 1;
    return '<p><strong>' + esc(variantLabel(e.key, 'ability', e.ability)) + '</strong> ' + esc(variantDesc(e.key, 'ability', e.ability)) + '</p>' +
      '<p><strong>' + esc(variantLabel(e.key, 'ult', e.ult)) + '</strong> ' + esc(variantDesc(e.key, 'ult', e.ult)) + '</p>' +
      (t ? '<p><strong>' + esc(t.name) + '</strong> ' + esc(t.desc) + '</p>' : '') +
      (dup ? '<p class="tb-note">Duplicate heroes share one talent choice. Spell and ultimate are chosen per copy. The team has a single Captain, picked by class.</p>' : '') +
      (teamSize === 3 ? '<p class="tb-note">One Captain leads the whole squad and carries the squad racial.</p>' : '');
  }
  function go(p, kind) {
    window.MobileGameUX.openSlot(p);
    const sel = { basic: '.mg-fixed-spell', ability: '[data-build-kind="ability"]', ult: '[data-build-kind="ult"]', talent: '[data-talent]', captain: '#mgCaptainChoice' }[kind];
    const target = sel && $('mgSlotContent').querySelector(sel);
    (target?.closest('section') || target)?.scrollIntoView({ block: 'start' });
  }
  function paint() {
    if (!document.body.classList.contains('teamBuilderMode')) return;
    const el = mount(); if (!el) return;
    if (focus >= teamSize) focus = 0;
    const p = pos();
    const sig = JSON.stringify([teamSize, selected, selectedBuilds, abilityChoice, ultChoice, captainClass, captainRacial, focus, p,
      selected.map(k => classTalents(k)), Object.keys(CLASS_STATS).map(k => !playerProfile || ownsClass(k))]);
    if (sig === lastKey) return; lastKey = sig;
    const party = Array.from({ length: teamSize }, (_, s) => {
      const e = entry(s);
      return '<div class="tb-member' + (s === focus ? ' on' : '') + (e && isCaptain(e) ? ' cap' : '') + '">' +
        '<button type="button" class="tb-face" data-focus="' + s + '" aria-pressed="' + (s === focus) + '" aria-label="' + (e ? esc(CLASS_STATS[e.key].name) + (isCaptain(e) ? ', team Captain' : '') : 'Empty slot ' + (s + 1)) + '">' +
        (e ? '<img src="' + esc(CLASS_PORTRAIT_IMG[e.key] || '') + '" alt="">' +
          (isCaptain(e) ? '<span class="tb-party-captain">Captain</span>' : '') : '<span>+</span>') + '</button>' +
        (e ? '<div class="tb-mini">' + icons(e, true).replace(/data-tb/g, 'tabindex="-1" aria-hidden="true" data-mini') + '</div>' : '') + '</div>';
    }).join('');
    const e = entry(focus);
    const stage = e ? '<div class="tb-stage"><div class="tb-art"><img src="' + esc(CLASS_PORTRAIT_IMG[e.key] || '') + '" alt="' + esc(CLASS_STATS[e.key].name) + '">' +
      (isCaptain(e) ? '<span class="tb-crown">Captain</span>' : '') + '</div>' +
      '<div class="tb-info"><h3>' + esc(CLASS_STATS[e.key].name) + '</h3><small>' + esc(CLASS_STATS[e.key].role) + '</small>' +
      '<div class="tb-icons">' + icons(e, false) + '</div><div class="tb-desc">' + describe(e) + '</div>' +
      '<button type="button" class="tb-edit" data-tb="ability">Edit build</button></div></div>' :
      '<div class="tb-stage tb-empty"><button type="button" class="tb-edit" data-tb="hero">Choose a hero for slot ' + (focus + 1) + '</button></div>';
    const roster = Object.keys(CLASS_STATS).map(k => {
      const locked = playerProfile && !ownsClass(k);
      return '<button type="button" class="tb-chip' + (selected.includes(k) ? ' in' : '') +
        (locked ? ' locked' : '') + '" data-roster="' + k + '" aria-label="' +
        esc(CLASS_STATS[k].name + (selected.includes(k) ? ', in squad' : '') + (locked ? ' (locked)' : '')) +
        '"><img src="' + esc(CLASS_PORTRAIT_IMG[k] || '') +
        '" alt=""><span>' + esc(CLASS_STATS[k].name) + '</span>' + (locked ? '<small>Locked</small>' : '') + '</button>';
    }).join('');
    el.innerHTML = '<div class="tb-party">' + party + '</div>' + stage + '<div class="tb-roster" role="group" aria-label="Hero roster">' + roster + '</div>';
    el.querySelectorAll('[data-focus]').forEach(b => b.onclick = () => { focus = +b.dataset.focus; lastKey = ''; paint(); });
    el.querySelectorAll('.tb-stage [data-tb]').forEach(b => b.onclick = () => {
      if (b.dataset.tb === 'hero') { window.MobileGameUX.openSlot(focus); return; }
      go(focus, b.dataset.tb);
    });
    el.querySelectorAll('[data-roster]').forEach(b => b.onclick = () => {
      window.MobileGameUX.openSlot(focus);
      $('mgSlotContent').querySelector('[data-hero="' + b.dataset.roster + '"]')?.click();
    });
  }
  const orig = renderSlots;
  renderSlots = function (...a) { const r = orig.apply(this, a); paint(); return r; };
  const origB = showTeamBuilder;
  showTeamBuilder = function (...a) { const r = origB.apply(this, a); lastKey = ''; paint(); return r; };
  if (typeof refreshCaptainUI === 'function') {
    const origCaptain = refreshCaptainUI;
    refreshCaptainUI = function (...a) { const r = origCaptain.apply(this, a); paint(); return r; };
  }
  paint();
})();
