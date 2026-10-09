/* Mobile saved squad slots and durable active-editable squad state.
   Loaded after the game and mobile UI scripts so these bindings are the final
   public implementations while keeping the original profile data intact. */
(function () {
  'use strict';

  const ALLOWED_SIZES = [1, 2, 3, 5];
  const SLOT_COUNT = 5;
  let hydrating = false;
  let persisting = false;
  let selectedSlotToSave = null;
  let userEditedSquad = false;
  let initialSyncSeen = false;
  let activePersistenceEnabled = false;
  let slotAccessErrorShown = false;
  let lastProfileIdentity = null;
  let savedNameInput = null;
  let savedSaveButton = null;
  let savedMissingMessage = null;

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const validSize = size => ALLOWED_SIZES.includes(Number(size));
  const profileIdentity = profile => {
    if (!profile) return null;
    const id = profile.userId || profile.playerId || profile.accountId || profile.id;
    return id != null ? String(id) : (profile.name ? String(profile.name) : null);
  };

  function teamHeroes(record) {
    return Array.isArray(record && record.heroes) ? record.heroes : [];
  }

  function inferredSize(record) {
    return Number(record && record.teamSize) || teamHeroes(record).length;
  }

  function profileOwnsHero(classId) {
    return !!(CLASS_STATS[classId] && (!playerProfile || ownsClass(classId)));
  }

  function validateRecord(record, allowPartial) {
    if (!record || typeof record !== 'object') return { ok: false, reason: 'Saved squad data is missing.' };
    const size = inferredSize(record);
    const heroes = teamHeroes(record);
    if (!validSize(size)) return { ok: false, reason: 'This squad uses an unsupported team size.' };
    if (heroes.length > size || (!allowPartial && heroes.length !== size)) {
      return { ok: false, reason: 'This squad does not contain a valid number of heroes for its mode.' };
    }
    const unavailableIndex = heroes.findIndex(hero => !hero || !profileOwnsHero(hero.classId));
    if (unavailableIndex !== -1) {
      const unavailable = heroes[unavailableIndex];
      return { ok: false, reason: 'Cannot load this squad: ' + (unavailable && unavailable.classId || 'a hero') + ' is unavailable or not owned.' };
    }
    for (const hero of heroes) {
      const ability = hero.ability || 'default';
      const ultimate = hero.ultimate || 'default';
      if (ability !== 'default' && ability !== 'custom') {
        return { ok: false, reason: 'Cannot load this squad: ' + hero.classId + ' has an invalid ability build.' };
      }
      if (ability === 'custom' && playerProfile && !ownsCustomAbility(hero.classId)) {
        return { ok: false, reason: 'Cannot load this squad: the custom ability for ' + hero.classId + ' is not owned.' };
      }
      if (!['default', 'custom', 'polymorph'].includes(ultimate) ||
          (ultimate === 'polymorph' && hero.classId !== 'frostmage')) {
        return { ok: false, reason: 'Cannot load this squad: ' + hero.classId + ' has an invalid ultimate build.' };
      }
      if (ultimate !== 'default' && playerProfile && !ownsCustomUlt(hero.classId)) {
        return { ok: false, reason: 'Cannot load this squad: the custom ultimate for ' + hero.classId + ' is not owned.' };
      }
      if (hero.talents !== undefined) {
        if (!Array.isArray(hero.talents)) {
          return { ok: false, reason: 'Cannot load this squad: ' + hero.classId + ' has invalid talent data.' };
        }
        for (const talentId of hero.talents) {
          const validTalent = (CLASS_TALENTS[hero.classId] || []).some(talent => talent.id === talentId);
          if (!validTalent || (playerProfile && !isTalentUnlocked(hero.classId, talentId))) {
            return { ok: false, reason: 'Cannot load this squad: a talent for ' + hero.classId + ' is not owned or unlocked.' };
          }
        }
      }
    }
    if (size === 3) {
      if (record.captainClass && !heroes.some(hero => hero.classId === record.captainClass)) {
        return { ok: false, reason: 'Cannot load this squad: its captain is not in the selected heroes.' };
      }
      if (record.captainRacial && (!record.captainClass || !RACIALS[record.captainRacial] ||
          (playerProfile && !ownsRacial(record.captainRacial)))) {
        return { ok: false, reason: 'Cannot load this squad: its captain racial is unavailable or not owned.' };
      }
      if (record.formation && !FORMATIONS[record.formation]) {
        return { ok: false, reason: 'Cannot load this squad: its formation is invalid.' };
      }
    }
    return { ok: true, size, heroes };
  }

  function mobileGameUX() {
    return typeof MobileGameUX !== 'undefined' ? MobileGameUX : window.MobileGameUX;
  }

  function mobileSlotAccessorsAvailable() {
    const ux = mobileGameUX();
    return !!(ux && typeof ux.getSlotPositions === 'function' &&
      typeof ux.setSlotPositions === 'function');
  }

  function reportMissingSlotAccessors() {
    if (slotAccessErrorShown) return;
    slotAccessErrorShown = true;
    showUnlockToast('Mobile squad slot-position controls are unavailable; slot positions cannot be preserved.');
  }

  function readSlotPositions() {
    if (!mobileSlotAccessorsAvailable()) {
      reportMissingSlotAccessors();
      return [];
    }
    const positions = mobileGameUX().getSlotPositions();
    return Array.isArray(positions) ? positions.slice(0, selected.length) : [];
  }

  function writeSlotPositions(values) {
    if (!mobileSlotAccessorsAvailable()) {
      reportMissingSlotAccessors();
      return false;
    }
    mobileGameUX().setSlotPositions(Array.isArray(values) ? values.slice() : [], { render: false });
    return true;
  }

  function currentSquadRecord() {
    const heroes = selected.map((classId, index) => {
      const candidate = selectedBuilds[index] || {};
      const build = candidate.classId === classId ? candidate : {};
      return {
        classId,
        ability: build.ability || abilityChoice[classId] || 'default',
        ultimate: build.ultimate || ultChoice[classId] || 'default',
        talents: defenseTalentSnapshot(classId).slice()
      };
    });
    return {
      teamSize,
      heroes,
      captainClass: teamSize === 3 && captainClass && selected.includes(captainClass) ? captainClass : null,
      captainRacial: teamSize === 3 && captainClass && selected.includes(captainClass) ? captainRacial || null : null,
      formation: activeTeamFormation || null,
      orders: typeof teamOrders !== 'undefined' ? clone(teamOrders) : null,
      slotPositions: readSlotPositions()
    };
  }

  function markEdited() {
    userEditedSquad = true;
    activePersistenceEnabled = true;
    persistActive();
    return true;
  }

  function refreshModeSummary() {
    const mode = Number(teamSize) || 3;
    document.querySelectorAll('.ar-squad-mode button').forEach(button => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.size) === mode));
    });
    const count = Array.isArray(selected) ? selected.length : 0;
    const saved = count === mode ? findActiveSavedTeamV4464() : null;
    const name = document.getElementById('arSquadName');
    const counter = document.getElementById('arSquadCount');
    if (name) name.textContent = saved && saved.name || (count ? 'Current ' + mode + 'v' + mode + ' squad' : 'No heroes selected');
    if (counter) counter.textContent = count + ' / ' + mode + ' SELECTED';
  }

  function persistActive() {
    if (!playerProfile || hydrating || persisting || !activePersistenceEnabled) return false;
    if (!mobileSlotAccessorsAvailable()) {
      reportMissingSlotAccessors();
      return false;
    }
    const snapshot = currentSquadRecord();
    if (!validSize(snapshot.teamSize) || snapshot.heroes.length > snapshot.teamSize) {
      showUnlockToast('Could not save the active squad: its mode or hero count is invalid.');
      return false;
    }
    persisting = true;
    playerProfile.activeSquad = snapshot;
    persisting = false;
    return true;
  }

  function applySquadRecord(record, options) {
    if(playerProfile&&record&&(record.id||record.squadId)){
      const id=record.id||record.squadId;
      if(ensureSavedTeamsSafe().some(team=>team&&team.id===id))
        playerProfile.activeRankedSquads=Object.assign({},playerProfile.activeRankedSquads,{[record.teamSize||record.heroes?.length]:id});
    }
    const validation = validateRecord(record, true);
    if (!validation.ok) {
      if (!(options && options.quiet)) showUnlockToast(validation.reason);
      return false;
    }
    if (!mobileSlotAccessorsAvailable()) {
      reportMissingSlotAccessors();
      return false;
    }
    const sourceHeroes = validation.heroes;
    hydrating = true;
    teamSize = validation.size;
    selected = sourceHeroes.map(hero => hero.classId);
    selectedBuilds = sourceHeroes.map(hero => ({
      classId: hero.classId,
      ability: hero.ability || 'default',
      ultimate: hero.ultimate || 'default'
    }));
    sourceHeroes.forEach(hero => {
      abilityChoice[hero.classId] = hero.ability || 'default';
      ultChoice[hero.classId] = hero.ultimate || 'default';
      if (playerProfile) {
        playerProfile.talents = playerProfile.talents || {};
        playerProfile.talents[hero.classId] = Array.isArray(hero.talents) ? hero.talents.slice() : [];
      }
    });
    captainClass = validation.size === 3 && sourceHeroes.some(hero => hero.classId === record.captainClass)
      ? record.captainClass : null;
    captainRacial = validation.size === 3 && captainClass ? record.captainRacial || null : null;
    activeTeamFormation = record.formation || null;
    if (record.orders && typeof teamOrders !== 'undefined') teamOrders = clone(record.orders);
    const positionsSet = writeSlotPositions(record.slotPositions || []);

    document.getElementById('teamSizeLabel').textContent = teamSize;
    document.body.classList.toggle('mode3v3', teamSize === 3);
    document.body.classList.toggle('mode5v5', teamSize === 5);
    document.querySelectorAll('.modeBtn').forEach(button => {
      button.classList.toggle('selected', Number(button.dataset.size) === teamSize);
    });
    document.querySelectorAll('.card').forEach(card => {
      card.classList.toggle('selected', selected.includes(card.dataset.key));
    });
    if (!positionsSet) {
      hydrating = false;
      return false;
    }
    buildSelectScreen();
    renderSlots();
    refreshCaptainUI();
    refreshBattleButtons();
    hydrating = false;
    if (playerProfile) {
      playerProfile.activeSquad = currentSquadRecord();
      renderSlots();
      activePersistenceEnabled = true;
      savePlayerProfile();
    }
    refreshModeSummary();
    updateHubTeamSummary();
    if (!(options && options.quiet)) {
      showUnlockToast('Active squad loaded · ' + selected.length + ' / ' + teamSize + ' heroes.');
    }
    return true;
  }

  function candidateFromProfile(profile) {
    if (!profile || typeof profile !== 'object') return null;
    if (Object.prototype.hasOwnProperty.call(profile, 'activeSquad')) {
      const active = validateRecord(profile.activeSquad, true);
      if (active.ok) return profile.activeSquad;
    }
    const currentRecord = profile.currentTeam;
    const current = validateRecord(currentRecord, false);
    if (current.ok && current.size === 3 && current.heroes.length === 3) {
      return Object.assign({}, currentRecord, { teamSize: 3 });
    }
    const saved = Array.isArray(profile.savedTeams) ? profile.savedTeams : [];
    const main = saved.find(team => team && team.id === profile.mainLoadoutId);
    const mainValidation = validateRecord(main, false);
    if (mainValidation.ok) return Object.assign({ teamSize: mainValidation.size }, main);
    return null;
  }

  function restoreActive(options) {
    if (!playerProfile) return false;
    const activeValidation = playerProfile.activeSquad == null
      ? null : validateRecord(playerProfile.activeSquad, true);
    if (activeValidation && !activeValidation.ok) {
      showUnlockToast('Your saved active squad cannot be restored: ' + activeValidation.reason);
    }
    if (!candidateFromProfile(playerProfile)) {
      if (playerProfile.currentTeam) {
        const current = validateRecord(playerProfile.currentTeam, false);
        if (!current.ok) showUnlockToast('Your current team cannot be restored: ' + current.reason);
      }
      if (playerProfile.mainLoadoutId) {
        const main = ensureSavedTeamsSafe().find(team => team && team.id === playerProfile.mainLoadoutId);
        if (main && !validateRecord(main, false).ok) {
          showUnlockToast('Your main loadout cannot be restored: ' + validateRecord(main, false).reason);
        }
      }
    }
    const candidate = candidateFromProfile(playerProfile);
    if (candidate) return applySquadRecord(candidate, options);
    return false;
  }

  function ensureSavedTeamsSafe() {
    if (!playerProfile) return [];
    if (!Array.isArray(playerProfile.savedTeams)) playerProfile.savedTeams = [];
    return playerProfile.savedTeams;
  }

  function savedTeamSize(team) {
    return inferredSize(team);
  }

  function savedLoadoutMissingMobile() {
    if (!validSize(teamSize) || selected.length !== teamSize) {
      return ['complete ' + teamSize + '-hero squad'];
    }
    const ownership = validateRecord(currentSquadRecord(), true);
    if (!ownership.ok) return [ownership.reason];
    if (teamSize === 3) {
      const required = baseSavedLoadoutMissing();
      return required;
    }
    return [];
  }

  function buildSavedTeamSnapshot(name) {
    const snapshot = currentSquadRecord();
    const missing = savedLoadoutMissingMobile();
    if (missing.length) return null;
    return {
      version: 3,
      id: 'team_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: String(name || 'Saved Team').trim().slice(0, 22) || 'Saved Team',
      savedAt: Date.now(),
      teamSize: snapshot.teamSize,
      heroes: snapshot.heroes,
      captainClass: snapshot.captainClass,
      captainRacial: snapshot.captainRacial,
      formation: snapshot.formation,
      behavior: typeof teamBehaviorMode !== 'undefined' ? teamBehaviorMode : null,
      orders: snapshot.orders,
      slotPositions: snapshot.slotPositions,
      stats: { games: 0, wins: 0, losses: 0, draws: 0, totalScore: 0, bestScore: 0, streak: 0, bestStreak: 0 }
    };
  }

  function updateSaveRow() {
    const row = document.getElementById('savedTeamSaveRow');
    const button = savedSaveButton || document.getElementById('saveTeamBtn');
    const input = savedNameInput || document.getElementById('savedTeamNameInput');
    const index = Number.isInteger(savedTeamEditingIndex) ? savedTeamEditingIndex : null;
    const record = index == null ? null : ensureSavedTeamsSafe()[index];
    if (row) row.classList.toggle('editing', !!record);
    if (button) button.textContent = record ? 'Update Loaded Team' : 'Save in an empty slot';
    if (input && record && !input.value) input.value = record.name || '';
  }

  function saveIntoSlot(index, explicitOverwrite) {
    if (!playerProfile) {
      showOnboarding();
      return false;
    }
    if (!Number.isInteger(index) || index < 0) {
      showUnlockToast('Choose one of the five saved-team slots first.');
      return false;
    }
    const missing = savedLoadoutMissingMobile();
    if (missing.length) {
      showSavedLoadoutMissing(missing);
      showUnlockToast('Loadout incomplete — ' + missing.join(', '));
      return false;
    }
    const list = ensureSavedTeamsSafe();
    const existing = list[index] || null;
    const updatingLoaded = !explicitOverwrite && Number.isInteger(savedTeamEditingIndex) &&
      savedTeamEditingIndex === index;
    if (existing && !explicitOverwrite && !updatingLoaded) {
      showUnlockToast('This slot is occupied. Use its explicit Overwrite action to replace it.');
      return false;
    }
    if (existing && explicitOverwrite &&
        !window.confirm('Overwrite "' + (existing.name || 'Saved Team') + '" with the current squad? This replaces that slot only.')) {
      return false;
    }
    const existingSize = existing && savedTeamSize(existing);
    if (existing && updatingLoaded && existingSize !== teamSize &&
        !window.confirm('Replace the saved ' + existingSize + 'v' + existingSize + ' team with the current ' +
          teamSize + 'v' + teamSize + ' squad? Cancel to preserve the exact saved record.')) {
      return false;
    }
    const input = document.getElementById('savedTeamNameInput');
    const target = index;
    const previous = list[target] || null;
    const name = input && input.value || (previous && previous.name) || ('Team ' + (target + 1));
    const snapshot = buildSavedTeamSnapshot(name);
    if (!snapshot) return false;
    if (previous) {
      snapshot.id = previous.id || snapshot.id;
      snapshot.savedAt = previous.savedAt || snapshot.savedAt;
      snapshot.stats = clone(previous.stats || snapshot.stats);
      list[target] = Object.assign({}, previous, snapshot);
    } else {
      list[target] = snapshot;
    }
    if (playerProfile.mainLoadoutId && previous && playerProfile.mainLoadoutId === previous.id) {
      playerProfile.mainLoadoutId = list[target].id;
    }
    playerProfile.activeRankedSquads=Object.assign({},playerProfile.activeRankedSquads,{[teamSize]:list[target].id});
    savedTeamEditingIndex = null;
    selectedSlotToSave = null;
    if (input) input.value = '';
    showSavedLoadoutMissing([]);
    savePlayerProfile();
    renderSavedTeams();
    refreshSavedTeamEditor();
    updateHubTeamSummary();
    showUnlockToast(list[target].name + (previous ? ' updated!' : ' saved in slot ' + (target + 1) + '!'));
    return true;
  }

  function saveCurrentSquad() {
    const editing = Number.isInteger(savedTeamEditingIndex) ? savedTeamEditingIndex : null;
    const list = ensureSavedTeamsSafe();
    if (editing !== null && list[editing]) return saveIntoSlot(editing, false);
    const requested = selectedSlotToSave;
    if (requested !== null) return saveIntoSlot(requested, false);
    for (let index = 0; index < SLOT_COUNT; index++) {
      if (!list[index]) return saveIntoSlot(index, false);
    }
    showUnlockToast('All five primary slots are occupied. Choose an explicit overwrite action or an empty legacy slot.');
    return false;
  }

  function loadSavedTeamMobile(index) {
    const list = ensureSavedTeamsSafe();
    const team = list[index];
    if (!team) return false;
    const validation = validateRecord(team, false);
    if (!validation.ok) {
      showUnlockToast('Cannot load ' + (team.name || 'this team') + ': ' + validation.reason);
      return false;
    }
    const record = Object.assign({}, team, { teamSize: validation.size });
    if(playerProfile)playerProfile.activeRankedSquads=Object.assign({},playerProfile.activeRankedSquads,{[validation.size]:team.id});
    if (record.behavior && typeof teamBehaviorMode !== 'undefined') teamBehaviorMode = record.behavior;
    userEditedSquad = true;
    return applySquadRecord(record, { quiet: true }) && (
      renderSavedTeams(),
      updateHubTeamSummary(),
      showUnlockToast((team.name || 'Saved team') + ' loaded · ' + validation.size + 'v' + validation.size + '.'),
      true
    );
  }

  function loadSavedTeamForEditMobile(index) {
    if (!loadSavedTeamMobile(index)) return false;
    savedTeamEditingIndex = index;
    const team = ensureSavedTeamsSafe()[index];
    const input = document.getElementById('savedTeamNameInput');
    if (input) input.value = team.name || '';
    refreshSavedTeamEditor();
    renderSavedTeams();
    showSavedLoadoutMissing([]);
    showUnlockToast((team.name || 'Saved team') + ' loaded for editing.');
    return true;
  }

  function removeSavedTeam(index) {
    const list = ensureSavedTeamsSafe();
    if (!list[index]) return;
    const removed = list[index];
    if (!window.confirm('Delete "' + (removed.name || 'Saved Team') + '" from this slot?')) return;
    list[index] = null; // Preserve every other team's original slot and order.
    if (playerProfile.mainLoadoutId === removed.id) delete playerProfile.mainLoadoutId;
    if(playerProfile.activeRankedSquads)for(const size of [2,3])if(playerProfile.activeRankedSquads[size]===removed.id)delete playerProfile.activeRankedSquads[size];
    if (savedTeamEditingIndex === index) {
      savedTeamEditingIndex = null;
      const input = document.getElementById('savedTeamNameInput');
      if (input) input.value = '';
    }
    savePlayerProfile();
    renderSavedTeams();
    refreshSavedTeamEditor();
  }

  function renderSavedTeamsMobile() {
    const box = document.getElementById('savedTeamCards');
    if (!box) return;
    const list = playerProfile ? ensureSavedTeamsSafe() : [];
    box.className = 'savedTeamCards mobileSavedTeamCards';
    box.replaceChildren();

    const primary = document.createElement('section');
    primary.className = 'mobileSavedPrimary';
    primary.setAttribute('aria-label', 'Five saved squad slots');
    for (let index = 0; index < SLOT_COUNT; index++) {
      const team = list[index] || null;
      const row = document.createElement('div');
      row.className = 'mobileSavedSlot' + (team ? ' occupied' : ' empty') +
        (savedTeamEditingIndex === index ? ' loadoutEditing' : '');
      const label = document.createElement('div');
      label.className = 'mobileSavedSlotLabel';
      label.textContent = 'SLOT ' + (index + 1);
      const summary = document.createElement('div');
      summary.className = 'mobileSavedSlotSummary';
      if (team) {
        const heroNames = teamHeroes(team).map(hero =>
          CLASS_STATS[hero.classId] ? CLASS_STATS[hero.classId].icon + ' ' + CLASS_STATS[hero.classId].name : hero.classId
        );
        summary.textContent = (team.name || 'Saved Team') + ' · ' + (savedTeamSize(team) || teamHeroes(team).length) +
          'v' + (savedTeamSize(team) || teamHeroes(team).length) + (heroNames.length ? ' · ' + heroNames.join(' / ') : '');
      } else {
        summary.textContent = 'Empty slot';
      }
      const action = document.createElement('button');
      action.type = 'button';
      action.className = team ? 'primary mobileSlotLoad' : 'secondary mobileSlotSave';
      action.textContent = team ? 'Load / Edit' : 'Save here';
      action.onclick = () => {
        if (team) loadSavedTeamForEditMobile(index);
        else {
          selectedSlotToSave = index;
          saveIntoSlot(index, false);
        }
      };
      row.append(label, summary, action);
      primary.appendChild(row);
    }
    box.appendChild(primary);

    const legacy = document.createElement('details');
    legacy.className = 'mobileSavedManagement';
    const legacySummary = document.createElement('summary');
    legacySummary.textContent = 'Team details · formation, main loadout, overwrite & delete';
    legacy.appendChild(legacySummary);
    const content = document.createElement('div');
    content.className = 'mobileSavedManagementContent';
    const nameLabel = document.createElement('label');
    nameLabel.className = 'mobileSavedNameLabel';
    nameLabel.textContent = 'Name for new or updated team';
    content.appendChild(nameLabel);

    for (let index = 0; index < list.length; index++) {
      const team = list[index];
      if (!team) continue;
      const item = document.createElement('details');
      item.className = 'mobileSavedDetail';
      const title = document.createElement('summary');
      title.textContent = (index < SLOT_COUNT ? 'Slot ' + (index + 1) : 'Legacy team ' + (index + 1)) +
        ' · ' + (team.name || 'Saved Team') + (playerProfile && playerProfile.mainLoadoutId === team.id ? ' · Main' : '');
      item.appendChild(title);
      const actions = document.createElement('div');
      actions.className = 'mobileSavedDetailActions';
      const makeButton = (text, className, handler) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = text;
        button.onclick = handler;
        actions.appendChild(button);
      };
      makeButton('Load / Edit', 'primary', () => loadSavedTeamForEditMobile(index));
      makeButton('Formation', 'secondary', () => {
        if (loadSavedTeamForEditMobile(index)) openFormationPicker(null);
      });
      makeButton('Overwrite with current', 'secondary', () => saveIntoSlot(index, true));
      makeButton(playerProfile && playerProfile.mainLoadoutId === team.id ? 'Main loadout' : 'Set main loadout',
        'secondary', () => {
          if (typeof setMainLoadoutV4464 === 'function') setMainLoadoutV4464(index);
        });
      makeButton('Unload edit', 'secondary', unloadCurrentTeamV4463);
      makeButton('Delete', 'secondary', () => removeSavedTeam(index));
      const heroLine = document.createElement('div');
      heroLine.className = 'mobileSavedHeroLine';
      heroLine.textContent = teamHeroes(team).map(hero =>
        CLASS_STATS[hero.classId] ? CLASS_STATS[hero.classId].icon + ' ' + CLASS_STATS[hero.classId].name : hero.classId
      ).join(' · ') || 'No heroes';
      actions.appendChild(heroLine);
      const stats = team.stats || {};
      const games = Number(stats.games) || 0;
      const statsLine = document.createElement('div');
      statsLine.className = 'mobileSavedHeroLine';
      statsLine.textContent = games + ' games · ' +
        (games ? ((Number(stats.wins) || 0) / games * 100).toFixed(1) : '0.0') + '% wins · ' +
        (games ? Math.round((Number(stats.totalScore) || 0) / games) : 0) + ' avg score · best streak ' +
        (Number(stats.bestStreak) || 0);
      actions.appendChild(statsLine);
      item.appendChild(actions);
      content.appendChild(item);
    }
    if (!list.some(Boolean)) {
      const empty = document.createElement('div');
      empty.className = 'mobileSavedEmpty';
      empty.textContent = 'No saved squads yet. Fill a squad and use Save here.';
      content.appendChild(empty);
    }

    // Keep the existing editor controls and its cloned button so the old
    // listener captured by game.html can never run.
    const saveRow = document.getElementById('savedTeamSaveRow');
    if (saveRow) {
      const input = savedNameInput || document.getElementById('savedTeamNameInput');
      const button = savedSaveButton || document.getElementById('saveTeamBtn');
      if (input) {
        input.className = 'mobileSavedTeamName';
        input.placeholder = 'Squad name';
        input.setAttribute('aria-label', 'Saved squad name');
        nameLabel.appendChild(input);
      }
      if (button) {
        button.textContent = Number.isInteger(savedTeamEditingIndex) ? 'Update loaded team' : 'Save in an empty slot';
        nameLabel.appendChild(button);
      }
      saveRow.style.display = 'none';
    }
    const missing = savedMissingMessage || document.getElementById('savedTeamMissing');
    if (missing) content.appendChild(missing);
    const statsNote = document.createElement('p');
    statsNote.className = 'mobileSavedStatsNote';
    statsNote.textContent = 'Saved-team stats and IDs stay attached when a slot is updated. Teams beyond the five primary slots remain available below.';
    content.appendChild(statsNote);
    const buildNote = document.createElement('p');
    buildNote.className = 'mobileSavedStatsNote';
    buildNote.textContent = 'Ability and ultimate builds are saved per hero slot. Talent choices remain shared by class, including duplicate heroes.';
    content.appendChild(buildNote);
    legacy.appendChild(content);
    box.appendChild(legacy);
    refreshSavedTeamEditor();
    // Saves/renames can change the active squad label without changing slots.
    window.MobileGameUX?.refreshSquadSummary();
  }

  function initializeSavedTeamUI() {
    const panel = document.getElementById('savedTeamsPanel');
    const details = document.getElementById('savedTeamsDetails');
    const row = document.getElementById('savedTeamSaveRow');
    const box = document.getElementById('savedTeamCards');
    savedNameInput = document.getElementById('savedTeamNameInput');
    const originalSaveButton = document.getElementById('saveTeamBtn');
    savedMissingMessage = document.getElementById('savedTeamMissing');
    if (originalSaveButton) {
      savedSaveButton = originalSaveButton.cloneNode(true);
      savedSaveButton.addEventListener('click', saveCurrentSquad);
      originalSaveButton.parentNode.replaceChild(savedSaveButton, originalSaveButton);
      savedSaveButton.id = 'saveTeamBtn';
    }
    if (panel && details && row) {
      const head = panel.querySelector('.stHead');
      if (head) head.insertAdjacentElement('afterend', row);
      row.style.display = 'none';
      const hint = details.querySelector('.savedTeamsContent > .stHint');
      if (hint) hint.textContent = 'Choose 1v1, 2v2, 3v3 or 5v5, then save complete squads into one of five fixed slots.';
      const summary = details.querySelector('summary');
      if (summary) {
        summary.firstChild.textContent = 'Saved squads & team details ';
      }
    }
    if (box) {
      box.innerHTML = '';
      renderSavedTeamsMobile();
    }
    updateSaveRow();
  }

  const baseSavedLoadoutMissing = savedLoadoutMissing;
  const baseSavePlayerProfile = savePlayerProfile;
  const baseRenderSlots = renderSlots;
  const baseSetTeamSize = setTeamSize;
  const baseToggleSelect = toggleSelect;
  const baseRenderDefense = renderSavedDefense;
  const baseApplyFormationChoice = applyFormationChoice;
  const baseClearFormationChoice = clearFormationChoice;

  savedLoadoutMissing = savedLoadoutMissingMobile;
  savePlayerProfile = function () {
    if (!hydrating && !persisting) persistActive();
    return baseSavePlayerProfile();
  };
  renderSlots = function () {
    const result = baseRenderSlots();
    if (!hydrating) persistActive();
    return result;
  };
  applyFormationChoice = function () {
    const editsCurrentSquad = formationEditingIndex == null;
    if (editsCurrentSquad && FORMATIONS[formationDraft]) markEdited();
    return baseApplyFormationChoice();
  };
  clearFormationChoice = function () {
    if (formationEditingIndex == null) markEdited();
    return baseClearFormationChoice();
  };
  setTeamSize = function (size) {
    if (!validSize(size)) {
      showUnlockToast('Choose a supported mode: 1v1, 2v2, 3v3 or 5v5.');
      return;
    }
    userEditedSquad = true;
    activePersistenceEnabled = true;
    const result = baseSetTeamSize(Number(size));
    persistActive();
    savePlayerProfile();
    refreshModeSummary();
    renderSavedTeams();
    return result;
  };
  toggleSelect = function (key, card) {
    if (playerProfile && !ownsClass(key)) {
      showUnlockToast((CLASS_STATS[key]?.name || key) + ' is not owned by this profile.');
      return;
    }
    userEditedSquad = true;
    activePersistenceEnabled = true;
    const result = baseToggleSelect(key, card);
    persistActive();
    savePlayerProfile();
    refreshModeSummary();
    return result;
  };
  currentSavedTeamSnapshot = function (name) {
    const snapshot = buildSavedTeamSnapshot(name);
    return snapshot || null;
  };
  savedTeamSignatureV4464 = function (team) {
    return JSON.stringify({
      size: savedTeamSize(team),
      heroes: teamHeroes(team).map(hero => [
        hero.classId, hero.ability || 'default', hero.ultimate || 'default',
        (hero.talents || []).slice().sort()
      ]),
      captain: team && team.captainClass || null,
      racial: team && team.captainRacial || null,
      formation: team && team.formation || null
    });
  };
  currentTeamSignatureV4464 = function () {
    if (!validSize(teamSize) || selected.length !== teamSize) return '';
    const current = currentSquadRecord();
    return savedTeamSignatureV4464(current);
  };
  findActiveSavedTeamV4464 = function () {
    if (!validSize(teamSize) || selected.length !== teamSize) return null;
    const signature = currentTeamSignatureV4464();
    return ensureSavedTeamsSafe().find(team => team && savedTeamSignatureV4464(team) === signature) || null;
  };
  mainLoadoutV4464 = function () {
    const team = playerProfile && ensureSavedTeamsSafe().find(record =>
      record && record.id === playerProfile.mainLoadoutId
    );
    return team && savedTeamSize(team) === 3 && teamHeroes(team).length === 3 ? team : null;
  };
  const baseSetMainLoadoutV4464 = setMainLoadoutV4464;
  setMainLoadoutV4464 = function (index) {
    const team = ensureSavedTeamsSafe()[index];
    if (!team || savedTeamSize(team) !== 3 || teamHeroes(team).length !== 3) {
      showUnlockToast('Arena main loadout requires a complete 3v3 squad.');
      return false;
    }
    return baseSetMainLoadoutV4464(index);
  };
  renderSavedDefense = function () {
    const main = playerProfile && ensureSavedTeamsSafe().find(team =>
      team && team.id === playerProfile.mainLoadoutId && savedTeamSize(team) === 3 && teamHeroes(team).length === 3
    );
    const oldId = playerProfile && playerProfile.mainLoadoutId;
    const ret = baseRenderDefense();
    if (oldId && !main) {
      document.querySelectorAll('.defenseMainLoadout').forEach(element => element.remove());
    }
    return ret;
  };
  teamRecordV4464 = function (team) {
    if (!team || typeof team !== 'object') {
      return { games: 0, wins: 0, losses: 0, draws: 0, totalScore: 0, bestScore: 0, streak: 0, bestStreak: 0 };
    }
    if (!team.stats) team.stats = { games: 0, wins: 0, losses: 0, draws: 0, totalScore: 0, bestScore: 0, streak: 0, bestStreak: 0 };
    return team.stats;
  };
  loadSavedTeam = loadSavedTeamMobile;
  loadSavedTeamForEdit = loadSavedTeamForEditMobile;
  deleteSavedTeam = removeSavedTeam;
  saveCurrentTeam = saveCurrentSquad;
  saveCurrentTeamV4463 = saveCurrentSquad;
  renderSavedTeams = renderSavedTeamsMobile;
  refreshSavedTeamEditor = updateSaveRow;

  window.MobileSavedTeams = {
    persistActive,
    restoreActive,
    applySquadRecord,
    markEdited,
    refresh: renderSavedTeamsMobile,
    openSlot(index) {
      const list = ensureSavedTeamsSafe();
      if (!Number.isInteger(index) || index < 0 || index >= SLOT_COUNT) {
        showUnlockToast('Saved-team slot must be between 1 and 5.');
        return false;
      }
      return list[index] ? loadSavedTeamForEditMobile(index) : (selectedSlotToSave = index, true);
    }
  };
  const mainMobileUX = mobileGameUX();
  if (mainMobileUX) mainMobileUX.markEdited = markEdited;
  initializeSavedTeamUI();

  // The persisted editable selection is authoritative, even when deliberately
  // empty. Do not seed squads from the account's owned-class roster.
  let localProfileRestored = false;
  if (playerProfile) {
    lastProfileIdentity = profileIdentity(playerProfile);
    localProfileRestored = restoreActive({ quiet: true });
    if (localProfileRestored) activePersistenceEnabled = true;
  }
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent || !event.data ||
        event.data.type !== 'arena:sync-profile' || !event.data.profile) return;
    const incoming = event.data.profile;
    const identity = profileIdentity(incoming);
    const initial = !initialSyncSeen;
    const switched = !initial && !!identity && !!lastProfileIdentity && identity !== lastProfileIdentity;
    initialSyncSeen = true;
    if (identity) lastProfileIdentity = identity;
    if (!initial && !switched) return;
    const busy = (state && !state.over) || tournamentEntryPending || tournamentFinishPending ||
      (typeof tournament !== 'undefined' && tournament && tournament.active && !tournament.finished);
    if (busy || userEditedSquad) return;
    const incomingActiveValidation = incoming.activeSquad == null
      ? null : validateRecord(incoming.activeSquad, true);
    if (incomingActiveValidation && !incomingActiveValidation.ok) {
      showUnlockToast('The account active squad was not restored: ' + incomingActiveValidation.reason);
    }
    const candidate = candidateFromProfile(incoming);
    if (!candidate) {
      // Do not persist defaults before the parent has had a chance to supply
      // its initial active/current/main selection.
      if (initial && !localProfileRestored) activePersistenceEnabled = true;
      return;
    }
    const validation = validateRecord(candidate, true);
    if (!validation.ok) {
      showUnlockToast('Account squad was not restored: ' + validation.reason);
    } else if (applySquadRecord(candidate, { quiet: true })) {
      activePersistenceEnabled = true;
      playerProfile.activeSquad = currentSquadRecord();
      savePlayerProfile();
    }
  });

  const styles = document.createElement('style');
  styles.id = 'mobile-saved-team-slots-style';
  styles.textContent = `
    .mobileSavedTeamCards{display:block!important;margin-top:10px}
    .mobileSavedPrimary{display:grid;gap:6px}
    .mobileSavedSlot{display:grid;grid-template-columns:56px minmax(0,1fr) auto;align-items:center;gap:8px;padding:7px 9px;border:1px solid #34445e;border-radius:9px;background:#0c1423}
    .mobileSavedSlot.occupied{border-color:#3b506d}
    .mobileSavedSlotLabel{font-size:9px;font-weight:900;letter-spacing:.5px;color:#89a2c5}
    .mobileSavedSlotSummary{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#dce6f7;font-size:11px}
    .mobileSavedSlot button{min-height:44px;padding:6px 9px;font-size:10px}
    .mobileSavedManagement{margin-top:8px;border-top:1px solid #2a3956}
    .mobileSavedManagement>summary,.mobileSavedDetail>summary{display:flex;align-items:center;box-sizing:border-box;min-height:44px;cursor:pointer;padding:9px 4px;color:#dce6f7;font-size:11px;font-weight:800}
    .mobileSavedManagementContent{display:grid;gap:7px;padding:4px}
    .mobileSavedNameLabel{display:grid;gap:4px;color:#98a9c4;font-size:10px}
    .mobileSavedTeamName{box-sizing:border-box;width:100%;min-width:0;padding:8px;border:1px solid #334565;border-radius:8px;background:#080d18;color:#fff;font-size:16px}
    .mobileSavedDetail{border:1px solid #273750;border-radius:8px;background:#0b1220}
    .mobileSavedDetail>summary{padding:8px}
    .mobileSavedDetailActions{display:flex;flex-wrap:wrap;gap:5px;padding:0 7px 8px}
    .mobileSavedManagementContent button{min-height:44px}
    .mobileSavedDetailActions button{min-height:44px;padding:6px 8px;font-size:10px}
    .mobileSavedHeroLine,.mobileSavedStatsNote,.mobileSavedEmpty{width:100%;color:#91a0bb;font-size:10px;line-height:1.4}
    .mobileSavedStatsNote{margin:2px 0}
    .mobileSavedEmpty{padding:8px}
    @media(max-width:520px){.mobileSavedSlot{grid-template-columns:43px minmax(0,1fr) auto;gap:5px;padding:6px}.mobileSavedSlot button{padding:5px 6px;font-size:9px}}
  `;
  document.head.appendChild(styles);

  // Render once more with the mobile-enhanced render function after all
  // existing wrappers have been rebound.
  renderSavedTeamsMobile();
  updateSaveRow();
})();