/* Compact mobile interaction layer. Combat and server entry points remain owned
   by game.html; this file only edits their existing selection state and UI. */
(function () {
  'use strict';
  const body = document.body;
  const $ = id => document.getElementById(id);
  const esc = escapeHtml;
  let positions = selected.map((_, i) => i);
  let knownSelection = JSON.stringify(selected);
  let draft = null;
  let returnFocus = null;
  let homePaintSuspended = 0;
  let homeSummaryKey = null;
  const originalShowHub = showMainHub;
  const originalShowBuilder = showTeamBuilder;
  const originalStart = startBattle;
  const originalAccount = updateAccountUI;
  const originalDefenseSnapshot = currentDefenseSnapshot;
  currentDefenseSnapshot = function () {
    const snapshot = originalDefenseSnapshot();
    if (snapshot) snapshot.heroes = selected.map((key, index) => {
      const build = selectedBuilds[index]?.classId === key ? selectedBuilds[index] : {};
      return {
        classId: key, talents: defenseTalentSnapshot(key),
        ability: build.ability || abilityChoice[key] || 'default',
        ultimate: build.ultimate || ultChoice[key] || 'default'
      };
    });
    return snapshot;
  };

  function normalizePositions() {
    if (knownSelection !== JSON.stringify(selected)) positions = selected.map((_, i) => i);
    const used = new Set();
    positions = selected.map((_, i) => {
      let p = positions[i];
      if (!Number.isInteger(p) || p < 0 || p >= teamSize || used.has(p)) {
        p = Array.from({ length: teamSize }, (_, j) => j).find(j => !used.has(j));
      }
      used.add(p);
      return p;
    });
    knownSelection = JSON.stringify(selected);
  }
  function setPositions(next) {
    positions = Array.isArray(next) ? next.slice() : selected.map((_, i) => i);
    knownSelection = JSON.stringify(selected);
    normalizePositions();
  }
  function showOverlay(id) {
    returnFocus = document.activeElement;
    const overlay = $(id);
    overlay.hidden = false;
    body.classList.add('mobileGameDialogOpen');
    overlay.querySelector('button')?.focus();
  }
  function closeOverlay(id) {
    $(id).hidden = true;
    body.classList.toggle('mobileGameDialogOpen', !!document.querySelector('.mg-overlay:not([hidden])'));
    if (returnFocus?.isConnected) returnFocus.focus();
  }
  function overlay(id, title, content) {
    const node = document.createElement('div');
    node.id = id; node.className = 'mg-overlay'; node.hidden = true;
    node.innerHTML = '<section class="mg-sheet" role="dialog" aria-modal="true" aria-labelledby="' + id + 'Title">' +
      '<header class="mg-sheet-head"><h2 id="' + id + 'Title">' + title +
      '</h2><button type="button" class="mg-close" aria-label="Close">×</button></header>' + content + '</section>';
    node.querySelector('.mg-close').onclick = () => closeOverlay(id);
    node.addEventListener('click', event => { if (event.target === node) closeOverlay(id); });
    node.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeOverlay(id); }
      if (event.key === 'Tab') {
        const buttons = [...node.querySelectorAll('button:not(:disabled),input:not(:disabled),summary')]
          .filter(el => el.getClientRects().length);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    document.body.appendChild(node);
    return node;
  }

  overlay('mgMatchDialog', 'Choose your match', '<div class="mg-match-choices">' +
    '<button type="button" class="mg-match-option" data-kind="ai"><strong>Regular Match (AI)</strong><small>Fight a computer squad.</small></button>' +
    '<button type="button" class="mg-match-option" data-kind="tournament"><strong>Tournament Match (AI)</strong><small>3v3 bracket · 100 Gold entry.</small></button>' +
    '<button type="button" class="mg-match-option" data-kind="arena"><strong>Arena (PvP)</strong><small>Challenge another player.</small></button></div>');
  $('mgMatchDialog').querySelectorAll('[data-kind]').forEach(button => {
    button.onclick = () => {
      closeOverlay('mgMatchDialog');
      const kind = button.dataset.kind;
      if (kind === 'ai') {
        refreshBattleButtons();
        if ($('startBtn').disabled) {
          showTeamBuilder();
          showUnlockToast('Fill all ' + teamSize + ' squad slots before joining a regular match.');
          return;
        }
        $('startBtn').click();
      } else if (kind === 'tournament') {
        // A disabled legacy button cannot show validation. Call its original
        // action, which owns every team-size, ownership, Gold and server gate.
        if (teamSize !== 3) {
          showUnlockToast('Tournaments are played in 3v3 mode.'); return;
        }
        if (GUEST_TRIAL) showUnlockToast('Sign in to enter a Tournament Match.');
        startTournament();
      } else {
        $('hubOnlineActionBtn').click();
      }
    };
  });
  function installMatchChooser() {
    const old = $('hubJoinBtn');
    if (!old) return;
    if (!old.dataset.mobileChooser) {
      // Legacy observers own the old button's disabled state. The chooser is
      // always available: each selected match type runs its own eligibility.
      const next = old.cloneNode(true);
      next.dataset.mobileChooser = '1';
      old.replaceWith(next);
      new MutationObserver(() => {
        if (next.disabled) next.disabled = false;
      }).observe(next, { attributes: true, attributeFilter: ['disabled'] });
    }
    const button = $('hubJoinBtn');
    button.onclick = () => showOverlay('mgMatchDialog');
    button.disabled = false;
    button.dataset.modeCaption = 'AI · Tournament · PvP';
    button.setAttribute('aria-label', 'Find Battle: choose regular, tournament or Arena');
  }

  overlay('mgSlotDialog', 'Configure squad slot', '<div id="mgSlotContent"></div>' +
    '<div id="mgSlotError" role="status" aria-live="polite"></div>' +
    '<footer class="mg-sheet-footer"><button type="button" id="mgRemoveSlot">Remove</button>' +
    '<button type="button" id="mgSaveSlot" class="primary">Save hero</button></footer>');

  function openSlot(visualIndex) {
    normalizePositions();
    const index = positions.indexOf(visualIndex);
    const key = index >= 0 ? selected[index] : null;
    const build = index >= 0 ? selectedBuilds[index] || {} : {};
    draft = {
      position: visualIndex, key, ability: build.ability || (key && abilityChoice[key]) || 'default',
      ultimate: build.ultimate || (key && ultChoice[key]) || 'default',
      talent: key ? classTalents(key)[0] || null : null,
      captain: teamSize === 3 && !!key && key === captainClass,
      racial: key === captainClass ? captainRacial : null
    };
    $('mgSlotDialogTitle').textContent = 'Squad slot ' + (visualIndex + 1);
    renderSlotSheet();
    showOverlay('mgSlotDialog');
  }
  function buildChoices(key, kind, variants) {
    const current = kind === 'ability' ? draft.ability : draft.ultimate;
    return variants.map(variant => {
      const locked = variant !== 'default' && (kind === 'ability' ? !ownsCustomAbility(key) : !ownsCustomUlt(key));
      return '<button type="button" class="mg-build-choice' + (locked ? ' locked' : '') +
        '" data-build-kind="' + kind + '" data-variant="' + variant + '" aria-pressed="' + (current === variant) +
        '" title="' + esc(variantDesc(key, kind, variant)) + '"><span class="mg-choice-art">' +
        collectibleArtHtml(key, variantArtName(key, kind, variant)) + '</span><span class="mg-choice-copy"><strong>' +
        esc(variantLabel(key, kind, variant)) + '</strong><small>' +
        (locked ? 'Locked · Arena drop / Market' : esc(variantDesc(key, kind, variant))) + '</small></span></button>';
    }).join('');
  }
  function updateSlotChoiceStates(selector, choice) {
    $('mgSlotContent').querySelectorAll(selector).forEach(b => {
      const value = b.dataset.variant || b.dataset.talent || b.dataset.racial;
      const pressed = String(choice === value);
      if (b.getAttribute('aria-pressed') !== pressed) b.setAttribute('aria-pressed', pressed);
    });
  }
  function updateCaptainControls() {
    const button = $('mgCaptainChoice');
    const choices = $('mgRacialChoices');
    const scrollArea = $('mgSlotContent'), scrollTop = scrollArea?.scrollTop;
    if (button) {
      button.setAttribute('aria-pressed', String(draft.captain));
      button.textContent = draft.captain ? 'Captain selected' : 'Make this hero captain';
    }
    if (choices) {
      choices.hidden = !draft.captain;
      // The existing grid rule overrides the browser's user-agent [hidden] rule.
      choices.style.display = draft.captain ? '' : 'none';
    }
    if (scrollArea) scrollArea.scrollTop = scrollTop;
  }
  function updateRacialDetails() {
    const detail = $('mgRacialDetails');
    if (!detail) return;
    const racial = draft.racial && RACIALS[draft.racial];
    detail.innerHTML = racial ? '<strong>' + esc(racial.race + ' · ' + racial.name) +
      '</strong><p>' + esc(racial.passive) + '</p><p>' + esc(racial.desc) +
      '</p><small>Cooldown: ' + racial.cd + ' seconds</small>' :
      '<small>Choose a racial below to see its team stat bonus and active special effect.</small>';
  }
  function renderSlotSheet() {
    const key = draft.key;
    const picker = Object.keys(CLASS_STATS).map(k => {
      const owned = !playerProfile || ownsClass(k);
      return '<button type="button" class="mg-hero-option' + (owned ? '' : ' locked') + '" data-hero="' + k +
        '" aria-pressed="' + (k === key) + '"><img src="' + esc(CLASS_PORTRAIT_IMG[k] || '') +
        '" alt=""><span>' + esc(CLASS_STATS[k].name) + '</span>' + (owned ? '' : '<small>Locked</small>') + '</button>';
    }).join('');
    let html = '<details class="mg-hero-disclosure"' + (!key ? ' open' : '') +
      '><summary>' + (key ? 'Change hero / class' : 'Choose hero / class') +
      '</summary><div class="mg-hero-picker">' + picker + '</div></details>';
    if (key) {
      const first = CLASS_DESC[key].find(line => !line.p && !/^ULT:/.test(line.t));
      html += '<div class="mg-build-summary"><img src="' + esc(CLASS_PORTRAIT_IMG[key] || '') +
        '" alt=""><div><strong>' + esc(CLASS_STATS[key].name) + '</strong><small>' +
        esc(CLASS_STATS[key].role) + '</small></div></div>' +
        '<div class="mg-fixed-spell"><span class="mg-choice-art">' +
        collectibleArtHtml(key, (first?.t || 'Basic spell').replace(/\s*\([^)]*\)$/,'')) +
        '</span><span class="mg-choice-copy"><strong>' + esc(first?.t || 'Basic spell') +
        '</strong><small>Always equipped</small></span></div>' +
        '<section class="mg-build-section"><h3>Spell / ability</h3>' +
        buildChoices(key, 'ability', CUSTOM_ABILITIES[key] ? ['default', 'custom'] : ['default']) + '</section>' +
        '<section class="mg-build-section"><h3>Ultimate</h3>' +
        buildChoices(key, 'ult', ['default', ...(key === 'frostmage' ? ['polymorph'] : []), ...(CUSTOM_ULTS[key] ? ['custom'] : [])]) +
        '</section><section class="mg-build-section"><h3>Talent · choose one</h3><div class="mg-talent-choices">' +
        (CLASS_TALENTS[key] || []).map(t =>
          '<button type="button" class="mg-build-choice' + (!isTalentUnlocked(key, t.id) ? ' locked' : '') +
          '" data-talent="' + t.id + '" aria-pressed="' + (draft.talent === t.id) +
          '"><span class="mg-choice-art">' + collectibleArtHtml(key, t.name) +
          '</span><span class="mg-choice-copy"><strong>' +
          esc(t.name) + '</strong><small>' + esc(t.desc) +
          (!isTalentUnlocked(key, t.id) ? ' · Locked' : '') + '</small></span></button>').join('') + '</div>' +
        (selected.filter(k => k === key).length > 1 ? '<small>Talent is shared by copies of this class, as in the existing game.</small>' : '') +
        '</section>';
      html += '<details class="mg-hero-disclosure"><summary>Hero stats & spell details</summary><div class="mg-build-section">' +
        '<p>HP ' + CLASS_STATS[key].hp + ' · Damage ' + CLASS_STATS[key].dmg +
        ' · Attack interval ' + CLASS_STATS[key].atkCd + 's · Range ' + CLASS_STATS[key].range + '</p>' +
        CLASS_DESC[key].map(line => '<p><strong>' + esc(line.t) + '</strong><br>' +
          esc(line.d || line.short || '') + '</p>').join('') + '</div></details>';
      if (teamSize === 3) {
        html += '<section class="mg-build-section"><h3>Captain & racial</h3>' +
          '<button type="button" class="mg-captain-choice" id="mgCaptainChoice" aria-pressed="' + draft.captain +
          '">' + (draft.captain ? 'Captain selected' : 'Make this hero captain') + '</button>';
        if (selected.filter(k => k === key).length > 1) {
          html += '<small>Captain is class-based in the existing game; its first copy leads the squad.</small>';
        }
        html += '<div class="mg-racial-choices" id="mgRacialChoices"' +
          (draft.captain ? '' : ' hidden') + '><div class="mg-captain-bonus"><strong>Captain bonus · +10% all stats</strong><p>' +
          esc(CAPTAIN_BONUS[key] || '') + '</p></div><div class="mg-racial-details" id="mgRacialDetails"></div>' +
          RACIAL_KEYS.map(r => {
          const owned = !playerProfile || ownsRacial(r);
          return '<button type="button" class="mg-build-choice' + (owned ? '' : ' locked') +
            '" data-racial="' + r + '" aria-pressed="' + (draft.racial === r) +
            '" title="' + esc(RACIALS[r].desc + ' ' + RACIALS[r].passive) +
            '"><strong>' + esc(RACIALS[r].race) + '</strong><small>' +
            esc(RACIALS[r].name) + (owned ? '' : ' · Locked') + '</small></button>';
        }).join('') + '</div>';
        html += '</section>';
      }
    }
    $('mgSlotContent').innerHTML = html;
    $('mgSlotError').textContent = '';
    $('mgSaveSlot').disabled = !key;
    $('mgRemoveSlot').hidden = !positions.includes(draft.position);
    updateCaptainControls();
    updateRacialDetails();
    $('mgSlotContent').querySelectorAll('[data-hero]').forEach(b => b.onclick = () => {
      const k = b.dataset.hero;
      if (playerProfile && !ownsClass(k)) { $('mgSlotError').textContent = 'Unlock this hero in Collection first.'; return; }
      if (draft.key !== k) {
        draft.key = k; draft.ability = abilityChoice[k] || 'default'; draft.ultimate = ultChoice[k] || 'default';
        draft.talent = classTalents(k)[0] || null; draft.captain = false; draft.racial = null;
        renderSlotSheet();
      } else {
        $('mgSlotError').textContent = '';
      }
    });
    $('mgSlotContent').querySelectorAll('[data-build-kind]').forEach(b => b.onclick = () => {
      if (b.classList.contains('locked')) { $('mgSlotError').textContent = 'This build must be unlocked through Arena or the Player Market.'; return; }
      draft[b.dataset.buildKind === 'ability' ? 'ability' : 'ultimate'] = b.dataset.variant;
      $('mgSlotError').textContent = '';
      updateSlotChoiceStates('[data-build-kind="' + b.dataset.buildKind + '"]', b.dataset.variant);
    });
    $('mgSlotContent').querySelectorAll('[data-talent]').forEach(b => b.onclick = () => {
      if (!isTalentUnlocked(key, b.dataset.talent)) { $('mgSlotError').textContent = 'This talent must be unlocked through Arena or the Player Market.'; return; }
      draft.talent = draft.talent === b.dataset.talent ? null : b.dataset.talent;
      $('mgSlotError').textContent = '';
      updateSlotChoiceStates('[data-talent]', draft.talent);
    });
    if ($('mgCaptainChoice')) $('mgCaptainChoice').onclick = () => {
      draft.captain = !draft.captain;
      $('mgSlotError').textContent = '';
      updateCaptainControls();
    };
    $('mgSlotContent').querySelectorAll('[data-racial]').forEach(b => b.onclick = () => {
      if (playerProfile && !ownsRacial(b.dataset.racial)) { $('mgSlotError').textContent = 'Unlock this racial in Collection first.'; return; }
      draft.racial = b.dataset.racial;
      $('mgSlotError').textContent = '';
      updateSlotChoiceStates('[data-racial]', draft.racial);
      updateRacialDetails();
    });
  }
  function commitSlot(remove) {
    if (!draft) return;
    window.MobileSavedTeams?.markEdited();
    normalizePositions();
    const index = positions.indexOf(draft.position);
    const oldKey = index >= 0 ? selected[index] : null;
    if (remove) {
      if (index >= 0) { selected.splice(index, 1); selectedBuilds.splice(index, 1); positions.splice(index, 1); }
      if (oldKey === captainClass && !selected.includes(oldKey)) { captainClass = null; captainRacial = null; }
    } else {
      if (!draft.key || (playerProfile && !ownsClass(draft.key))) return;
      if ((draft.ability !== 'default' && !ownsCustomAbility(draft.key)) ||
          (draft.ultimate !== 'default' && !ownsCustomUlt(draft.key)) ||
          (draft.talent && !isTalentUnlocked(draft.key, draft.talent)) ||
          (draft.captain && draft.racial && !ownsRacial(draft.racial))) {
        $('mgSlotError').textContent = 'This loadout contains an item you have not unlocked.'; return;
      }
      const build = { classId: draft.key, ability: draft.ability, ultimate: draft.ultimate };
      if (index >= 0) { selected[index] = draft.key; selectedBuilds[index] = build; }
      else { selected.push(draft.key); selectedBuilds.push(build); positions.push(draft.position); }
      abilityChoice[draft.key] = draft.ability; ultChoice[draft.key] = draft.ultimate;
      if (playerProfile) {
        playerProfile.talents = playerProfile.talents || {};
        playerProfile.talents[draft.key] = draft.talent ? [draft.talent] : [];
      }
      if (teamSize === 3 && draft.captain) { captainClass = draft.key; captainRacial = draft.racial; }
      else if (oldKey === captainClass && (oldKey === draft.key || !selected.includes(oldKey))) { captainClass = null; captainRacial = null; }
      // Keep dense combat arrays in the same left-to-right order as visual slots.
      const order = positions.map((p, i) => ({ p, key: selected[i], build: selectedBuilds[i] })).sort((a, b) => a.p - b.p);
      selected = order.map(x => x.key); selectedBuilds = order.map(x => x.build); positions = order.map(x => x.p);
    }
    knownSelection = JSON.stringify(selected);
    renderSlots(); renderSavedTeams(); savePlayerProfile();
    closeOverlay('mgSlotDialog'); draft = null;
  }
  $('mgSaveSlot').onclick = () => commitSlot(false);
  $('mgRemoveSlot').onclick = () => commitSlot(true);

  function paintSlots() {
    normalizePositions();
    const wrap = $('teamSlots');
    if (wrap.style.getPropertyValue('--mg-slots') !== String(teamSize)) {
      wrap.style.setProperty('--mg-slots', String(teamSize));
    }
    // Keep slot buttons stable so focus survives unrelated account/UI updates.
    while (wrap.children.length > teamSize) wrap.lastElementChild.remove();
    for (let p = 0; p < teamSize; p++) {
      const index = positions.indexOf(p), key = index >= 0 ? selected[index] : null;
      let button = wrap.children[p];
      if (!button || !button.classList.contains('mg-slot')) {
        const next = document.createElement('button');
        next.type = 'button'; next.dataset.slot = String(p);
        next.onclick = () => openSlot(p);
        if (button) button.replaceWith(next);
        else wrap.appendChild(next);
        button = next;
      }
      const captain = teamSize === 3 && key === captainClass;
      const paintKey = JSON.stringify([key, captain]);
      if (button.dataset.paintKey === paintKey) continue;
      button.dataset.paintKey = paintKey;
      button.className = 'mg-slot' + (key ? ' filled' : ' empty');
      button.setAttribute('aria-label', 'Edit squad slot ' + (p + 1) + (key ? ': ' + CLASS_STATS[key].name : ': empty'));
      button.innerHTML = key ? '<span class="mg-slot-art"><img src="' + esc(CLASS_PORTRAIT_IMG[key] || '') +
        '" alt=""></span><span class="mg-slot-name">' + esc(CLASS_STATS[key].name) + '</span>' +
        (captain ? '<span class="mg-slot-captain">Captain</span>' : '') :
        '<span class="mg-slot-empty">+</span><span class="mg-slot-name">Slot ' + (p + 1) + '</span>';
    }
    const caption = document.querySelector('.ar-squad-active-head small');
    const hint = 'Tap a slot to choose its hero and build';
    if (caption && caption.textContent !== hint) caption.textContent = hint;
    refreshSquadSummary();
  }
  function refreshSquadSummary() {
    const count = selected.length;
    const active = count === teamSize && typeof findActiveSavedTeamV4464 === 'function' ? findActiveSavedTeamV4464() : null;
    const text = {
      teamCount: String(count),
      arSquadName: active?.name || (count ? 'Current ' + teamSize + 'v' + teamSize + ' squad' : 'No heroes selected'),
      arSquadCount: count + ' / ' + teamSize + ' SELECTED'
    };
    Object.entries(text).forEach(([id, value]) => {
      const el = $(id);
      if (el && el.textContent !== value) el.textContent = value;
    });
    document.querySelectorAll('.ar-squad-mode button').forEach(button => {
      const pressed = String(Number(button.dataset.size) === teamSize);
      if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
    });
  }
  function homeIsVisible() {
    return !homePaintSuspended && !document.body.classList.contains('teamBuilderMode') &&
      !document.body.classList.contains('battleMode') && $('mainHub').style.display !== 'none';
  }
  function paintHomeParty(force = false) {
    if (!homeIsVisible()) return;
    normalizePositions();
    const party = $('hubPartyVisual');
    if (party.style.getPropertyValue('--mg-slots') !== String(teamSize)) {
      party.style.setProperty('--mg-slots', String(teamSize));
    }
    while (party.children.length > teamSize) party.lastElementChild.remove();
    for (let p = 0; p < teamSize; p++) {
      const index = positions.indexOf(p), key = index >= 0 ? selected[index] : null;
      let face = party.children[p];
      if (!face) { face = document.createElement('div'); party.appendChild(face); }
      const captain = key === captainClass;
      const paintKey = JSON.stringify([key, captain, captain ? captainRacial : null,
        key && typeof equippedSkin === 'function' ? equippedSkin(key) : null, index]);
      if (!force && face.dataset.paintKey === paintKey &&
          (!key || (face.querySelector('canvas') && face.querySelector('.hubPreviewBadge')))) continue;
      const firstMobilePaint = face.dataset.paintKey === undefined;
      face.dataset.paintKey = paintKey;
      face.className = 'hubPartyFace livePreview' + (!key ? ' hubPartyEmpty' : '');
      if (key) {
        let cv = face.querySelector('canvas');
        if (!cv) {
          face.replaceChildren();
          cv = document.createElement('canvas'); cv.width = 180; cv.height = 220;
          const label = document.createElement('span'); label.className = 'hubPreviewBadge';
          face.append(cv, label);
        } else if (firstMobilePaint) {
          // Adopt the initial canvas, but not legacy race/pet decorations that
          // the approved compact Home does not display.
          const label = face.querySelector('.hubPreviewBadge') || document.createElement('span');
          label.className = 'hubPreviewBadge';
          face.replaceChildren(cv, label);
        }
        face.removeAttribute('aria-label');
        cv.setAttribute('aria-label', CLASS_STATS[key].name + ', squad slot ' + (p + 1));
        face.querySelector('.hubPreviewBadge').textContent = CLASS_STATS[key].name;
        drawHubLiveHero(cv, key, captain);
      } else { face.textContent = '+'; face.setAttribute('aria-label', 'Empty squad slot ' + (p + 1)); }
    }
    const art = $('hubTeamArt'), first = selected[0];
    const portrait = first && CLASS_PORTRAIT_IMG[first] || '';
    if (art && art.dataset.portrait !== portrait) {
      art.dataset.portrait = portrait;
      art.innerHTML = portrait ? '<img src="' + esc(portrait) + '" alt="">' : '';
    }
  }
  renderSlots = function () {
    // Retain captain/currentTeam persistence and match eligibility, but never
    // build the legacy slots just to replace them with the compact buttons.
    refreshCaptainUI(); paintSlots(); updateHubTeamSummary();
  };
  renderHubParty = paintHomeParty;
  updateHubTeamSummary = function () {
    if (!homeIsVisible()) return;
    paintHomeParty();
    const active = typeof findActiveSavedTeamV4464 === 'function' ? findActiveSavedTeamV4464() : null;
    const name = active?.name || (selected.length ? 'Current Squad' : 'Unprepared Squad');
    const stats = active?.stats || {};
    const wins = Number(active ? stats.wins : playerProfile?.battleWins) || 0;
    const losses = Number(active ? stats.losses : playerProfile?.battleLosses) || 0;
    const rating = Math.round(Number(playerProfile?.rating) || 1000), gold = Math.floor(Number(playerProfile?.gold) || 0);
    const summary = $('hubTeamSummary');
    const summaryKey = JSON.stringify([teamSize, selected.length, name, !!active, wins, losses, rating, gold]);
    if (homeSummaryKey !== summaryKey) {
      homeSummaryKey = summaryKey;
      summary.className = 'hubTeamBar ar-active-team';
      const record = active ? 'TEAM · ' + wins + ' W / ' + losses + ' L' : 'ACCOUNT · ' + wins + ' W &nbsp;/&nbsp; ' + losses + ' L';
      summary.innerHTML = '<div class="ar-team-head"><div><div class="ar-label">ACTIVE ' + teamSize + 'V' + teamSize +
        ' ' + (teamSize === 3 ? 'TEAM' : 'SQUAD') + '</div><div class="ar-team-name">' + esc(name) +
        '</div></div><div class="ar-record">' + record + '</div></div>' +
        '<div class="ar-team-meta"><div><strong>' + rating + '</strong><span>RATING</span></div><div><strong>' +
        selected.length + ' / ' + teamSize + '</strong><span>FIELDED</span></div><div><strong>' + gold.toLocaleString() +
        '</strong><span>GOLD</span></div><button type="button" class="ar-edit-squad" aria-label="Edit squad">Edit squad ↗</button></div>';
      summary.querySelector('.ar-edit-squad').onclick = () => showTeamBuilder();
    }
    installMatchChooser();
  };
  updateAccountUI = function () {
    homePaintSuspended++;
    try { originalAccount(); } finally { homePaintSuspended--; }
    updateHubTeamSummary();
  };
  showMainHub = function () {
    document.body.classList.add('mobileGameUX');
    homePaintSuspended++;
    try { originalShowHub(); } finally { homePaintSuspended--; }
    paintHomeParty(true);
    updateHubTeamSummary();
  };
  showTeamBuilder = function () {
    document.body.classList.add('mobileGameUX'); originalShowBuilder(); paintSlots();
  };
  startBattle = function (opts) {
    const result = originalStart(opts);
    if (document.body.classList.contains('battleMode')) document.body.classList.remove('mobileGameUX');
    return result;
  };
  const more = document.querySelector('#mainHub .ar-menu-more');
  if (more) {
    more.open = false;
    // Remove the lower services section from the menu, but keep its legacy
    // controls mounted for existing programmatic navigation handlers.
    more.hidden = true;
    more.querySelector('summary').textContent = 'More';
    ['defenseBtn', 'balanceBtn', 'classShopBtn', 'profileBtn'].forEach(id => {
      const button = $(id);
      if (button) more.appendChild(button);
    });
    // Tournament and Arena are match types, not secondary navigation tiles.
    ['hubTournamentBtn', 'hubArenaBtn'].forEach(id => { const el = $(id); if (el) more.appendChild(el); });
  }
  // Use the real Arena control and its existing bridge handler. Keep the old
  // Squad control for onboarding; the visible Edit squad action still works.
  if (!GUEST_TRIAL) {
    const nav = document.querySelector('#mainHub .ar-quick-nav');
    const squad = $('hubTeamBtn'), arena = $('hubArenaBtn');
    if (nav && more && squad?.parentNode === nav && arena) {
      arena.setAttribute('aria-label', 'Online Arena');
      arena.querySelector('b').textContent = 'Online Arena';
      arena.querySelector('.hi').innerHTML = '<svg class="mg-arena-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4 3 4 1 12 12-4 4L4 8 3 4Z"/><path d="m20 3-4 1-4 4m-4 4L4 16l4 4 4-4M3 21l4-4m10 0 4 4M2 16l6 6m8 0 6-6"/></svg>';
      nav.replaceChild(arena, squad);
      more.appendChild(squad);
    }
  }
  // Retain the Market's existing handler; only move and relabel its control.
  const market = $('marketBtn');
  const accountActions = $('accountBar')?.lastElementChild;
  if (market && accountActions) {
    accountActions.appendChild(market);
    market.classList.add('mg-market-icon');
    market.title = 'Market'; market.setAttribute('aria-label', 'Market');
    market.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 9h16l-1 12H5L4 9Z"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/></svg>';
  }
  const strategyHeading = document.querySelector('.ar-strategy-heading');
  const strategy = $('underTeamActions');
  if (strategy && strategyHeading) {
    const details = document.createElement('details'); details.className = 'mg-strategy';
    details.innerHTML = '<summary>Strategy & formation</summary>';
    strategyHeading.replaceWith(details); details.appendChild(strategy);
    const recommended = $('recTeamBtn') || document.querySelector('#savedTeamsPanel .stTools button');
    if (recommended) details.appendChild(recommended);
  }
  const savedTitle = document.querySelector('#savedTeamsPanel .stTitle');
  if (savedTitle) savedTitle.textContent = 'Saved squads';
  // These legacy controls registered listeners before this layer. Capture user
  // intent first so a late initial profile cannot undo a strategy edit.
  document.addEventListener('click', event => {
    if (event.target.closest('#recommendedTeamBtn, #formationApplyBtn, #formationDefaultBtn, #racialModal .racialCard')) {
      window.MobileSavedTeams?.markEdited();
    }
  }, true);
  const originalToggleTalent = toggleTalent;
  toggleTalent = function (key, id) {
    if (playerProfile && isTalentUnlocked(key, id)) window.MobileSavedTeams?.markEdited();
    const result = originalToggleTalent(key, id);
    renderSlots(); renderSavedTeams(); updateHubTeamSummary();
    return result;
  };
  loadSavedDefense = function () {
    const defense = playerProfile?.defenseTeam;
    if (!defense) return;
    if (!Array.isArray(defense.heroes) || defense.heroes.length !== 3) {
      showUnlockToast('A defense must contain a complete 3v3 squad.'); return;
    }
    const record = Object.assign({}, defense, { teamSize: 3, slotPositions: [0, 1, 2] });
    if (!window.MobileSavedTeams?.applySquadRecord(record, { quiet: true })) return;
    window.MobileSavedTeams.markEdited();
    savedTeamEditingIndex = null;
    priorityDraft = Object.assign({ focus: null, control: null, heal: null, switchLow: true }, defense.orders || {});
    teamOrders = Object.assign({}, priorityDraft);
    savePlayerProfile(); renderSlots(); renderSavedTeams();
    $('defenseModal').style.display = 'none';
    showTeamBuilder();
    showUnlockToast('Defense loaded for editing.');
  };
  $('loadDefenseBtn').onclick = loadSavedDefense;
  window.MobileGameUX = {
    getSlotPositions: () => { normalizePositions(); return positions.slice(); },
    setSlotPositions: setPositions,
    openSlot, paintHomeParty, refreshHome: () => updateHubTeamSummary(),
    refreshSquadSummary, refresh: () => renderSlots()
  };
  Object.defineProperty(window.MobileGameUX, 'slotPositions', { get: () => positions.slice(), set: setPositions });
  document.body.classList.add('mobileGameUX');
  renderSlots(); updateHubTeamSummary();
  // The legacy play installer runs on a timer; reinstall only the chooser,
  // retaining its server-backed match destinations.
  setTimeout(() => { installMatchChooser(); paintSlots(); }, 260);
})();