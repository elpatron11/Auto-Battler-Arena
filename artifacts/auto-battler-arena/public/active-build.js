/* The selected squad is part of the account profile, not just this page's memory. */
(function () {
  function activeSnapshot() {
    if (!playerProfile || !selected.length) return null;
    return {
      teamSize,
      heroes: selected.map((classId, index) => {
        const slot = selectedBuilds[index];
        return {
          classId,
          ability: slot?.classId === classId ? slot.ability : abilityChoice[classId] || 'default',
          ultimate: slot?.classId === classId ? slot.ultimate : ultChoice[classId] || 'default',
          talents: defenseTalentSnapshot(classId),
        };
      }),
      captainClass: teamSize === 3 ? captainClass : null,
      captainRacial: teamSize === 3 ? captainRacial : null,
      formation: teamSize === 3 ? activeTeamFormation : null,
      orders: { ...teamOrders },
    };
  }

  function restoreBuild(build) {
    if (!build || ![1, 2, 3, 5].includes(build.teamSize) ||
        !Array.isArray(build.heroes) || !build.heroes.length ||
        build.heroes.length > build.teamSize ||
        !build.heroes.every(hero => hero && typeof hero.classId === 'string' && ownsClass(hero.classId))) {
      return false;
    }
    setTeamSize(build.teamSize);
    selected = build.heroes.map(hero => hero.classId);
    selectedBuilds = build.heroes.map(hero => {
      const classId = hero.classId;
      const ability = hero.ability === 'custom' && ownsCustomAbility(classId) ? 'custom' : 'default';
      const ultimate = (hero.ultimate === 'custom' || hero.ultimate === 'polymorph') && ownsCustomUlt(classId)
        ? hero.ultimate : 'default';
      abilityChoice[classId] = ability;
      ultChoice[classId] = ultimate;
      if (playerProfile.talents) {
        playerProfile.talents[classId] = (Array.isArray(hero.talents) ? hero.talents : [])
          .filter(id => isTalentUnlocked(classId, id)).slice(0, 2);
      }
      return { classId, ability, ultimate };
    });
    captainClass = teamSize === 3 && selected.includes(build.captainClass) ? build.captainClass : null;
    captainRacial = captainClass && ownsRacial(build.captainRacial) ? build.captainRacial : null;
    activeTeamFormation = teamSize === 3 && FORMATIONS[build.formation] ? build.formation : null;
    teamOrders = { focus: null, control: null, heal: null, switchLow: true, ...(build.orders || {}) };
    buildSelectScreen();
    renderSlots();
    refreshCaptainUI();
    refreshBattleButtons();
    if (typeof updateHubTeamSummary === 'function') updateHubTeamSummary();
    return true;
  }

  if (playerProfile) {
    const main = typeof mainLoadoutV4464 === 'function' ? mainLoadoutV4464() : null;
    const fallback = main && { teamSize: 3, ...main };
    if (!restoreBuild(playerProfile.activeBuild) && fallback) restoreBuild(fallback);
  }

  const originalSave = savePlayerProfile;
  function rememberBuild() {
    const snapshot = activeSnapshot();
    if (!snapshot || JSON.stringify(snapshot) === JSON.stringify(playerProfile.activeBuild)) return false;
    playerProfile.activeBuild = snapshot;
    return true;
  }
  savePlayerProfile = function () {
    rememberBuild();
    return originalSave();
  };
  const originalRenderSlots = renderSlots;
  renderSlots = function (...args) {
    const result = originalRenderSlots(...args);
    if (rememberBuild()) originalSave();
    return result;
  };
  const originalRefreshCaptain = refreshCaptainUI;
  refreshCaptainUI = function (...args) {
    const result = originalRefreshCaptain(...args);
    if (rememberBuild()) originalSave();
    return result;
  };
  const originalRefreshButtons = refreshBattleButtons;
  refreshBattleButtons = function (...args) {
    const result = originalRefreshButtons(...args);
    if (rememberBuild()) originalSave();
    return result;
  };
  const originalStartBattle = startBattle;
  startBattle = function (...args) {
    if (rememberBuild()) originalSave();
    window.parent.postMessage({ type: 'arena:flush-profile' }, location.origin);
    return originalStartBattle(...args);
  };
  const originalShowOverlay = showOverlay;
  showOverlay = function (...args) {
    const result = originalShowOverlay(...args);
    if (playerProfile) {
      savePlayerProfile();
      window.parent.postMessage({ type: 'arena:flush-profile' }, location.origin);
    }
    return result;
  };
})();