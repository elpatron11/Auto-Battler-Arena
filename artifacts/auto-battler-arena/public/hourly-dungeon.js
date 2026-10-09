(function (root) {
  'use strict';

  const listeners = new Set();
  const pending = new Map();
  const receipts = new Map();
  let status = null;
  let statusFlight = null;
  let busy = false;
  let error = null;
  let result = null;
  let claimPending = false;
  let localPractice = false;
  let attemptCounter = 0;
  let generation = 0;
  let activeEncounter = null;
  let previousArena = null;
  let serverClock = null;
  let originalStartBattle = null;
  let originalBackHandler = null;

  const STATUS_TIMEOUT_MS = 12000;
  const MAX_VALUE = { maxHp: 0.05, damage: 0.04, healing: 0.05 };
  const nowPerformance = () => root.performance && typeof root.performance.now === 'function'
    ? root.performance.now() : Date.now();

  function exposeLexical(name, getter, setter) {
    try {
      Object.defineProperty(root, name, {
        configurable: true,
        enumerable: false,
        get: getter,
        set: setter
      });
    } catch (ignored) { /* Existing browser globals may be non-configurable. */ }
  }

  function exposeGameBindings() {
    exposeLexical('state', () => state, value => { state = value; });
    exposeLexical('selected', () => selected);
    exposeLexical('selectedBuilds', () => selectedBuilds);
    exposeLexical('teamSize', () => teamSize);
    exposeLexical('abilityChoice', () => abilityChoice);
    exposeLexical('ultChoice', () => ultChoice);
    exposeLexical('captainClass', () => captainClass);
    exposeLexical('captainRacial', () => captainRacial);
    exposeLexical('playerCaptainRef', () => playerCaptainRef, value => { playerCaptainRef = value; });
    exposeLexical('entityIdCounter', () => entityIdCounter, value => { entityIdCounter = value; });
    exposeLexical('activeArena', () => activeArena);
    exposeLexical('ARENA_W', () => ARENA_W);
    exposeLexical('ARENA_H', () => ARENA_H);
    exposeLexical('ARENA_MAPS', () => ARENA_MAPS);
    exposeLexical('CLASS_STATS', () => CLASS_STATS);
    exposeLexical('rafId', () => rafId, value => { rafId = value; });
    exposeLexical('lastTime', () => lastTime, value => { lastTime = value; });
  }

  function parseTime(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
    if (typeof value === 'string' && value) {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function getNow() {
    if (serverClock) return serverClock.serverNow + Math.max(0, nowPerformance() - serverClock.perfNow);
    return Date.now();
  }

  function syncServerClock(candidate) {
    const serverNow = parseTime(candidate && candidate.serverNow);
    if (serverNow !== null) serverClock = { serverNow, perfNow: nowPerformance() };
  }

  function cloneBuff(buff) {
    return buff && typeof buff === 'object' ? Object.assign({}, buff) : null;
  }

  function confirmedRewardBuff(receipt, data) {
    const buff = data && data.status && data.status.activeBuff;
    if (!receipt.awarded || !buff ||
        (receipt.cycle != null && buff.cycle != null && receipt.cycle !== buff.cycle)) return null;
    return cloneBuff(buff);
  }

  function cloneStatus(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const copy = Object.assign({}, data);
    copy.activeBuff = cloneBuff(data.activeBuff);
    return copy;
  }

  function emit() {
    const view = getView();
    for (const listener of Array.from(listeners)) {
      try { listener(view); } catch (listenerError) { console.error('Hourly dungeon listener failed', listenerError); }
    }
    root.dispatchEvent && typeof root.dispatchEvent === 'function' &&
      root.dispatchEvent(new CustomEvent('hourly-dungeon:update', { detail: view }));
  }

  function setStatus(value) {
    const copy = cloneStatus(value);
    if (!copy) return;
    status = copy;
    syncServerClock(copy);
    emit();
  }

  function getStatus() {
    return cloneStatus(status);
  }

  function isPracticeClient() {
    let practice = false, guest = false;
    try {
      practice = typeof PRACTICE_ONLY !== 'undefined' && PRACTICE_ONLY;
      guest = typeof GUEST_TRIAL !== 'undefined' && GUEST_TRIAL;
    } catch (ignored) { /* Unit harnesses may not load the game's profile script. */ }
    return !!(practice || guest || root.parent === root);
  }

  function hasHostedBridge() {
    return !!(root.parent && root.parent !== root && !isPracticeClient());
  }

  function getView() {
    const normalBattleVisible = !!(root.state && !root.state.dungeon);
    return {
      status: getStatus(),
      busy,
      encounter: getEncounter(),
      // A recovered dungeon claim can wait until the player leaves a regular
      // battle; never put its result panel over that battle's own UI.
      result: !normalBattleVisible && result && Object.assign({}, result, { buff: cloneBuff(result.buff) }),
      error: normalBattleVisible ? null : error,
      claimPending,
      localPractice,
      practiceOnly: isPracticeClient() || localPractice
    };
  }

  function regularCombatActive() {
    return !!(root.state && !root.state.dungeon);
  }

  function canEnter() {
    if (busy || activeEncounter || regularCombatActive() || !status || !status.encounterId) return false;
    if (!isPracticeClient() && Array.from(receipts.values()).some(receipt =>
      receipt.payload.outcome === 'win' && receipt.state !== 'expired' &&
      (receipt.cycle === status.cycle ||
        (receipt.cycle == null && receipt.state !== 'settled')))) return false;
    return localPractice || isPracticeClient() || status.completed !== true;
  }

  function createRequestId() {
    attemptCounter += 1;
    try {
      if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    } catch (ignored) { /* Use a non-secret request identifier in older browsers. */ }
    const bytes = new Uint8Array(16);
    try {
      if (root.crypto && typeof root.crypto.getRandomValues === 'function') root.crypto.getRandomValues(bytes);
      else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    } catch (ignored) {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' +
      hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function requestBridge(action, fields, requestGeneration) {
    const requestId = fields && fields.requestId || createRequestId();
    const token = requestGeneration === undefined ? generation : requestGeneration;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('The arena host did not respond to the dungeon ' + action + ' request.'));
      }, STATUS_TIMEOUT_MS);
      pending.set(requestId, { resolve, reject, timer, action, generation: token });
      try {
        root.parent.postMessage(Object.assign({ type: 'arena:dungeon-request', requestId, action }, fields || {}), root.location.origin);
      } catch (postError) {
        clearTimeout(timer);
        pending.delete(requestId);
        reject(new Error('Unable to contact the arena host for the dungeon.'));
      }
    });
  }

  function responsePayload(message) {
    const data = message && message.data;
    if (data && typeof data === 'object') return data;
    return {};
  }

  function receiveMessage(event) {
    if (!event || event.origin !== root.location.origin || event.source !== root.parent || !event.data) return;
    const message = event.data;
    if (message.type === 'arena:dungeon-claim-state') {
      receiveClaimState(message);
      return;
    }
    if (message.type === 'arena:dungeon-status') {
      setStatus(message.data);
      return;
    }
    if (message.type !== 'arena:dungeon-response' || typeof message.requestId !== 'string') return;
    const request = pending.get(message.requestId);
    if (!request) return;
    pending.delete(message.requestId);
    clearTimeout(request.timer);
    if (message.ok === false) {
      request.reject(new Error(String(message.error || 'The dungeon request could not be completed.')));
      return;
    }
    const data = responsePayload(message);
    const statusValue = data.status || (request.action === 'status' ? data : null);
    if (statusValue && request.generation === generation) setStatus(statusValue);
    request.resolve({ data, status: statusValue || status, requestId: message.requestId });
  }

  function unwrapPublicStatus(body) {
    if (!body || typeof body !== 'object') return null;
    return cloneStatus(body.data || body.status || body);
  }

  async function requestPublicStatus(token) {
    if (typeof root.fetch !== 'function') throw new Error('Dungeon status is unavailable in this browser.');
    const response = await root.fetch('/api/dungeon/status', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    if (!response || !response.ok) {
      const detail = response && response.status ? ' (HTTP ' + response.status + ')' : '';
      throw new Error('Unable to load the current dungeon status' + detail + '.');
    }
    const body = await response.json();
    if (token !== generation) return null;
    const latest = unwrapPublicStatus(body);
    if (!latest) throw new Error('The dungeon status response was invalid.');
    setStatus(latest);
    return latest;
  }

  async function loadStatus(token) {
    if (token !== generation) return null;
    if (isPracticeClient() || !hasHostedBridge()) return requestPublicStatus(token);
    const response = await requestBridge('status', null, token);
    if (token !== generation) return null;
    const latest = response.status || status;
    if (!latest) throw new Error('The arena host returned no dungeon status.');
    return latest;
  }

  function refreshStatusFor(token) {
    if (token !== generation) return Promise.resolve(null);
    if (statusFlight) {
      if (statusFlight.generation === token) return statusFlight.promise;
      return statusFlight.promise.catch(() => null).then(() =>
        token === generation ? refreshStatusFor(token) : null);
    }
    const flight = { generation: token, promise: null };
    flight.promise = loadStatus(token).finally(() => {
      if (statusFlight === flight) statusFlight = null;
    });
    statusFlight = flight;
    return flight.promise;
  }

  function refreshStatus() {
    return refreshStatusFor(generation);
  }

  function validBuff(buff, nowMs) {
    if (!buff || typeof buff !== 'object' || !MAX_VALUE[buff.kind]) return null;
    const expiresAt = parseTime(buff.expiresAt);
    let value = Number(buff.value);
    if (!Number.isFinite(value) || value <= 0 || expiresAt === null || expiresAt <= nowMs) return null;
    if (value > 1) value /= 100;
    value = Math.min(MAX_VALUE[buff.kind], value);
    if (value <= 0) return null;
    return Object.assign({}, buff, { value, expiresAt });
  }

  function applyEntityBuff(entity, buff, nowMs) {
    if (!entity || entity._hourlyDungeonBuffApplied) return false;
    const active = validBuff(buff, nowMs === undefined ? getNow() : nowMs);
    if (!active) return false;
    const record = {
      id: active.id || null,
      cycle: active.cycle || null,
      kind: active.kind,
      value: active.value,
      expiresAt: active.expiresAt,
      active: true,
      beforeMaxHp: Number(entity.maxHp) || 0,
      fixedHpBonus: active.kind === 'maxHp' ? (Number(entity.maxHp) || 0) * active.value : 0
    };
    entity._hourlyDungeonBuffApplied = record;
    if (record.kind === 'maxHp') {
      const factor = 1 + record.value;
      entity.maxHp = record.beforeMaxHp * factor;
      entity.hp = Math.min(entity.maxHp, (Number(entity.hp) || 0) * factor);
    } else if (record.kind === 'damage') {
      entity._hourlyDungeonDamageFactor = 1 + record.value;
    } else if (record.kind === 'healing') {
      entity._hourlyDungeonHealingFactor = 1 + record.value;
    }
    return true;
  }

  function refreshEntityBuff(entity, nowMs) {
    if (!entity || !entity._hourlyDungeonBuffApplied) return false;
    const record = entity._hourlyDungeonBuffApplied;
    if (!record.active || (nowMs === undefined ? getNow() : nowMs) < record.expiresAt) return false;
    record.active = false;
    if (record.kind === 'maxHp' && record.beforeMaxHp > 0) {
      const fraction = entity.maxHp > 0 ? Math.max(0, Number(entity.hp) || 0) / entity.maxHp : 0;
      // Remove only the amount this buff added. Other systems (Second Wind,
      // Bear Form, etc.) may have changed max HP while the buff was active.
      entity.maxHp = Math.max(0, (Number(entity.maxHp) || 0) - record.fixedHpBonus);
      entity.hp = Math.min(entity.maxHp, fraction * entity.maxHp);
    }
    delete entity._hourlyDungeonDamageFactor;
    delete entity._hourlyDungeonHealingFactor;
    return true;
  }

  function applyTeamBuff(teamName, buff) {
    if (!root.state || !Array.isArray(root.state.entities)) return;
    const nowMs = getNow();
    root.state.entities.forEach(entity => {
      if (entity.team === teamName && !entity._dungeonBoss) applyEntityBuff(entity, buff, nowMs);
    });
  }

  function currentHeroes(team) {
    if (!root.state || !Array.isArray(root.state.entities)) return [];
    return root.state.entities.filter(entity => entity.alive && !entity.isPet && !entity._dungeonBoss &&
      !entity._dungeonAdd && entity.team === team).sort((a, b) => a.id - b.id);
  }

  function nextTarget(encounter, heroes) {
    if (!heroes.length) return null;
    const target = heroes[encounter.abilityIndex % heroes.length];
    encounter.abilityIndex += 1;
    return target;
  }

  function makeEncounter(id, boss, teamCount) {
    return {
      id,
      boss,
      elapsed: 0,
      hazards: [],
      adds: [],
      abilityIndex: 0,
      nextSpecialAt: 1.5,
      nextNovaAt: id === 'frost' ? 8.5 : null,
      nextAddAt: 1.5,
      teamCount: Math.max(1, Number(teamCount) || 3),
      nextHazardId: 1
    };
  }

  function addHazard(encounter, hazard) {
    hazard.id = encounter.nextHazardId++;
    encounter.hazards.push(hazard);
  }

  function spawnAdd(encounter) {
    root.state.entities = root.state.entities.filter(entity => !entity._dungeonAdd || entity.alive);
    const livingAdds = root.state.entities.filter(entity => entity._dungeonAdd && entity.alive);
    if (livingAdds.length >= 2) return;
    const source = encounter.boss;
    const add = root.createEntity('warrior', 'enemy',
      Math.min(root.ARENA_W - 65, source.x + (livingAdds.length ? 34 : -34)),
      Math.max(45, Math.min(root.ARENA_H - 45, source.y + (livingAdds.length ? 30 : -30))));
    add.name = livingAdds.length ? 'Demon Guard' : 'Demon Hound';
    add._dungeonAdd = true;
    // Summons are support units, not full-damage Warrior heroes. Budget all
    // damage (including Cleave, Charge and reflection), not just basic swings.
    add._dungeonAddDamageFactor = 0.8;
    add.hp = add.maxHp = Math.max(90, Math.min(125, (add.maxHp || 100) * 0.48));
    add.dmg = Math.min(11, Number(add.dmg) || 8);
    add.speed = Math.min(88, Number(add.speed) || 70);
    add.atkCd = Math.max(1.5, Number(add.atkCd) || 1.8);
    add.atkTimer = 0.7;
    root.state.entities.push(add);
    encounter.adds.push(add.id);
  }

  function beginSpecial(encounter) {
    const heroes = currentHeroes('player');
    if (!heroes.length) return;
    if (encounter.id === 'frost') {
      const target = nextTarget(encounter, heroes);
      addHazard(encounter, {
        kind: 'circle', effect: 'frostZone',
        x: target.x, y: target.y, radius: 112,
        duration: 3, remaining: 3, damage: 46
      });
      encounter.nextSpecialAt = encounter.elapsed + 1.5;
    } else if (encounter.id === 'temple') {
      const target = nextTarget(encounter, heroes);
      const angle = Math.atan2(target.y - encounter.boss.y, target.x - encounter.boss.x);
      addHazard(encounter, {
        kind: 'cone', effect: 'templeSlam', x: encounter.boss.x, y: encounter.boss.y,
        angle, spread: Math.PI * 0.66, radius: 252, duration: 1.5, remaining: 1.5, damage: 46
      });
      encounter.boss._dungeonFacing = angle;
      encounter.nextSpecialAt = encounter.elapsed + 3;
    }
  }

  function resolveHazard(encounter, hazard) {
    const heroes = currentHeroes('player');
    for (const hero of heroes) {
      let hit = false;
      if (hazard.kind === 'circle') {
        hit = Math.hypot(hero.x - hazard.x, hero.y - hazard.y) <= hazard.radius + (hero.radius || 0);
      } else if (hazard.kind === 'cone') {
        const dx = hero.x - hazard.x, dy = hero.y - hazard.y;
        const angle = Math.atan2(dy, dx);
        let delta = angle - hazard.angle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        hit = Math.hypot(dx, dy) <= hazard.radius + (hero.radius || 0) && Math.abs(delta) <= hazard.spread / 2;
      }
      if (!hit) continue;
      root.dealDamage(encounter.boss, hero, hazard.damage, { tag: hazard.effect });
      if ((hazard.effect === 'frostNova' || hazard.effect === 'frostZone') && hero.alive) {
        root.applyStun(hero, 0.6, 'impact');
      }
    }
    if (root.spawnAoe) root.spawnAoe(hazard.x, hazard.y, hazard.radius || 60,
      hazard.effect === 'frostNova' ? '#9eeaff' : '#ffd27a', 0.5);
  }

  function tickEncounter(dt) {
    const encounter = root.state && root.state.dungeonEncounter;
    if (!encounter || root.state.over) return;
    encounter.elapsed += dt;
    // Remove dead adds rather than accumulating unbounded corpses. Living adds
    // are still capped at two by spawnAdd().
    root.state.entities = root.state.entities.filter(entity => !entity._dungeonAdd || entity.alive);
    const bossStatus = encounter.boss && encounter.boss.status || {};
    const bossControlled = bossStatus.stunTimer > 0 || bossStatus.fearTimer > 0 ||
      bossStatus.sapTimer > 0 || bossStatus.disorientTimer > 0 || bossStatus.polymorphed;
    for (let i = encounter.hazards.length - 1; i >= 0; i -= 1) {
      const hazard = encounter.hazards[i];
      hazard.remaining -= dt;
      if (hazard.remaining <= 0) {
        resolveHazard(encounter, hazard);
        encounter.hazards.splice(i, 1);
      }
    }
    // Control blocks new boss mechanics; already telegraphed hazards are
    // intentionally allowed to finish and resolve as warned.
    if (!bossControlled && encounter.id === 'demon' && encounter.elapsed >= encounter.nextAddAt) {
      spawnAdd(encounter);
      encounter.nextAddAt = encounter.elapsed + 6.5;
    } else if (!bossControlled && encounter.id !== 'demon' && encounter.elapsed >= encounter.nextSpecialAt) {
      beginSpecial(encounter);
    }
    // Nova has its own timer so it never replaces a frequent ground-zone cast.
    if (!bossControlled && encounter.id === 'frost' && encounter.elapsed >= encounter.nextNovaAt) {
      addHazard(encounter, {
        kind: 'circle', effect: 'frostNova',
        x: encounter.boss.x, y: encounter.boss.y, radius: 195,
        duration: 3, remaining: 3, damage: 66
      });
      encounter.nextNovaAt = encounter.elapsed + 8.5;
    }
    encounter.adds = encounter.adds.filter(id => root.state.entities.some(entity => entity.id === id && entity.alive));
  }

  function tickBoss(boss, dt) {
    const encounter = root.state && root.state.dungeonEncounter;
    if (!encounter || encounter.boss !== boss || root.state.over) return;
    const heroes = currentHeroes('player').filter(hero =>
      !hero.status.untargetable && !(hero.status.sapTimer > 0) &&
      (!hero.status.invis || hero.status.markedTimer > 0));
    if (!heroes.length) return;
    const distance = hero => root.DungeonBodySpacing
      ? root.DungeonBodySpacing.distance(boss, hero)
      : Math.hypot(hero.x - boss.x, hero.y - boss.y);
    const centerDistance = hero => Math.hypot(hero.x - boss.x, hero.y - boss.y);
    const target = heroes.reduce((nearest, hero) => centerDistance(hero) < centerDistance(nearest) ? hero : nearest, heroes[0]);
    const d = distance(target);
    boss.lastTarget = target;
    boss._dungeonFacing = Math.atan2(target.y - boss.y, target.x - boss.x);
    if (d > boss.range) {
      if (!(boss.status.rootTimer > 0)) {
        const speed = boss.speed * (boss.status.slowFactor || 1) * (boss.status.hasteFactor || 1);
        const centerGap = centerDistance(target);
        root.moveEntity(boss, (target.x - boss.x) / centerGap, (target.y - boss.y) / centerGap, speed, dt);
      }
      // Demon can swing as soon as its chase closes the gap. Summoning is
      // handled independently and never consumes or resets its melee timer.
      if (encounter.id === 'demon' && distance(target) <= boss.range && boss.atkTimer <= 0) {
        root.autoAttack(boss, target);
      }
      return;
    }
    // Every boss uses Frost's proven melee routine, including shared timing,
    // animation and targeting. Encounter-specific spells remain separate.
    if (boss.atkTimer <= 0) root.autoAttack(boss, target);
  }

  function checkDungeonEnd() {
    if (!root.state || !root.state.dungeon || root.state.over) return true;
    const heroes = currentHeroes('player');
    const boss = root.state.dungeonEncounter && root.state.dungeonEncounter.boss;
    if (!heroes.length) {
      root.finishBattle('Defeat...');
      return true;
    }
    if (!boss || !boss.alive) {
      root.finishBattle('Victory!');
      return true;
    }
    if ((root.state._simElapsed || 0) >= 180) {
      root.finishBattle('Defeat...');
      return true;
    }
    return false;
  }

  function inCone(hero, hazard) {
    const dx = hero.x - hazard.x, dy = hero.y - hazard.y;
    let delta = Math.atan2(dy, dx) - hazard.angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return Math.hypot(dx, dy) <= hazard.radius + (hero.radius || 0) &&
      Math.abs(delta) <= hazard.spread / 2;
  }

  function dodgeHero(entity, dt) {
    if (!root.state || !root.state.dungeon || !entity || !entity.alive || entity.team !== 'player' ||
        entity.isPet || !entity.status || entity.status.stunTimer > 0 || entity.status.rootTimer > 0) return;
    const encounter = root.state.dungeonEncounter;
    if (!encounter) return;
    for (const hazard of encounter.hazards) {
      if (hazard.remaining <= 0.12) continue;
      let dx = 0, dy = 0, threatened = false;
      if (hazard.kind === 'circle') {
        const x = entity.x - hazard.x, y = entity.y - hazard.y;
        const d = Math.hypot(x, y);
        threatened = d < hazard.radius + (entity.radius || 0);
        if (threatened) { dx = x || 1; dy = y; }
      } else if (hazard.kind === 'cone' && inCone(entity, hazard)) {
        threatened = true;
        const direction = hazard.angle + (entity.y < hazard.y ? -1 : 1) * (hazard.spread / 2 + 0.15);
        dx = Math.cos(direction); dy = Math.sin(direction);
      }
      if (!threatened) continue;
      const length = Math.hypot(dx, dy) || 1;
      root.moveEntity(entity, dx / length, dy / length, entity.speed * 0.75, dt);
    }
  }

  function getEncounter() {
    if (!activeEncounter || !root.state || !root.state.dungeon || !root.state.dungeonEncounter) return null;
    const encounter = root.state.dungeonEncounter;
    return {
      id: encounter.id,
      boss: encounter.boss,
      hazards: encounter.hazards,
      elapsed: encounter.elapsed,
      adds: root.state.entities.filter(entity => entity.alive && entity._dungeonAdd)
    };
  }

  function setBusy(value) {
    busy = !!value;
    emit();
  }

  function showBattleScreen() {
    const body = root.document.body;
    body.classList.remove('teamBuilderMode');
    body.classList.add('battleMode');
    const hub = root.document.getElementById('mainHub');
    const select = root.document.getElementById('selectScreen');
    const account = root.document.getElementById('accountBar');
    const battle = root.document.getElementById('battleScreen');
    if (hub) hub.style.display = 'none';
    if (select) select.style.display = 'none';
    if (account) account.style.display = 'none';
    if (battle) battle.style.display = 'block';
    ['overlay', 'matchReward', 'matchStats'].forEach(id => {
      const element = root.document.getElementById(id);
      if (element) element.style.display = 'none';
    });
  }

  function startEncounter(start, latestStatus, attemptId, isLocal) {
    if (root.ArenaTip) root.ArenaTip.cancelAll();
    const party = Array.isArray(root.selected) ? root.selected.slice() : [];
    if (![2,3].includes(party.length)) throw new Error('Hourly Dungeon requires exactly 2 or 3 heroes.');
    const encounterId = start.encounterId || (latestStatus && latestStatus.encounterId);
    if (!['frost', 'demon', 'temple'].includes(encounterId)) {
      throw new Error('The current dungeon encounter is unavailable.');
    }
    if (typeof root.clearArenaChallengeStateForDungeon === 'function' &&
        root.clearArenaChallengeStateForDungeon() === false) {
      throw new Error('Leave the current battle before entering the dungeon.');
    }
    previousArena = root.activeArena || null;
    if (root.state && root.state.dungeon) cleanupCore(false, false);
    root.setMusicMode('battle');
    root.entityIdCounter = 0;
    root.applyArenaMap(root.chooseArenaMap({ dungeon: true }));
    const entities = [];
    const playerY = root.yPositionsFor(party.length);
    const playerInset = 90;
    party.forEach((classId, index) => {
      const build = root.selectedBuilds && root.selectedBuilds[index];
      entities.push(root.createEntity(classId, 'player', playerInset, playerY[index],
        build ? build.ability : root.abilityChoice[classId],
        build ? build.ultimate : root.ultChoice[classId]));
    });
    const bossClass = root.CLASS_STATS && root.CLASS_STATS.warrior
      ? 'warrior' : Object.keys(root.CLASS_STATS || {})[0];
    const boss = root.createEntity(bossClass, 'enemy', root.ARENA_W - 125, root.ARENA_H / 2);
    boss.name = encounterId === 'frost' ? 'Frostbound Colossus'
      : encounterId === 'demon' ? 'Ashen Demon' : 'Temple Guardian';
    boss._dungeonBoss = true;
    boss._dungeonEncounterId = encounterId;
    boss.radius = 34;
    boss.maxHp = 1860 + Math.max(0, party.length - 3) * 390;
    boss.hp = boss.maxHp;
    boss.dmg = 31;
    boss.speed = 48;
    boss.range = 85;
    boss.melee = true;
    boss.atkCd = 1.5;
    boss.atkTimer = 1;
    if (encounterId === 'demon') {
      // Frost's approved combat baseline stays untouched. Demon needs its
      // own stronger, gap-closing melee pressure alongside its summons.
      boss.maxHp = boss.hp = 2100 + Math.max(0, party.length - 3) * 440;
      boss.dmg = 42;
      boss.speed = 60;
      boss.range = 100;
      boss.atkCd = 1.4;
    }
    entities.push(boss);
    for (const entity of entities) {
      if (entity.classId === 'warlock' && !entity._dungeonBoss) entity.extra.summonStonePos = root.summonStonePosFor(entity);
    }

    root.state = {
      entities, log: [], effects: [], over: false, result: null, speed: 1,
      killFeed: [], recentKills: [], banner: null, startTime: root.performance.now(),
      traps: [], totems: [], fireZones: [], overlayAt: null, overlayShown: false,
      _simElapsed: 0, dungeon: true, _dungeonAttemptId: attemptId || null
    };
    root.applyDruidPackBuff(entities);
    const captain = root.teamSize === 3 && root.captainClass
      ? entities.find(entity => entity.team === 'player' && entity.classId === root.captainClass) : null;
    if (captain) {
      root.applyCaptainBuffs(captain, entities);
      if (root.captainRacial) {
        captain.racial = root.captainRacial;
        captain.racialManual = true;
        entities.filter(entity => entity.team === 'player' && !entity.isPet).forEach(entity => {
          entity.visualRace = root.captainRacial;
        });
      }
    }
    root.playerCaptainRef = captain || null;
    for (const entity of entities.slice()) {
      if (entity.classId === 'archer') {
        const pet = root.createPet(entity);
        pet.life = Infinity;
        entities.push(pet);
        if (entity.isCaptain && root.createTurtlePet) {
          const turtle = root.createTurtlePet(entity);
          turtle.life = Infinity;
          entities.push(turtle);
        }
      }
    }
    entities.forEach(entity => { entity.wasCreated = true; });
    root.state.dungeonEncounter = makeEncounter(encounterId, boss, party.length);
    const capturedBuff = isLocal ? null : cloneBuff((latestStatus && latestStatus.activeBuff) ||
      (status && status.activeBuff));
    if (capturedBuff) {
      root.state.dungeonCapturedBuff = capturedBuff;
      root.state._hourlyDungeonTeamBuffs = { player: capturedBuff };
      applyTeamBuff('player', capturedBuff);
    }
    activeEncounter = {
      id: start.id || null,
      cycle: start.cycle || (latestStatus && latestStatus.cycle) || null,
      encounterId,
      attemptId: attemptId || null,
      localPractice: !!isLocal,
      finished: false
    };
    localPractice = !!isLocal;
    result = null;
    claimPending = false;
    error = null;
    showBattleScreen();
    root.log('🗺️ Hourly Dungeon • ' + encounterId);
    root.log('⚔ Face the encounter!');
    root.renderSideBars();
    root.renderMatchLoadout();
    root.updateRacialBtn();
    if (root.rafId !== null) root.cancelAnimationFrame(root.rafId);
    root.lastTime = null;
    root.rafId = root.requestAnimationFrame(root.loop);
    emit();
  }

  function cancelPendingRequests() {
    for (const [requestId, request] of pending) {
      clearTimeout(request.timer);
      request.resolve({ cancelled: true, requestId });
    }
    pending.clear();
  }

  function cleanupCore(restoreArena, returnToHub) {
    const oldState = root.state;
    if (root.rafId !== null) {
      root.cancelAnimationFrame(root.rafId);
      root.rafId = null;
    }
    if (oldState && oldState.dungeon) {
      oldState.effects.length = 0;
      oldState.traps.length = 0;
      oldState.totems.length = 0;
      oldState.fireZones.length = 0;
      oldState.entities.length = 0;
      if (oldState.dungeonEncounter) {
        oldState.dungeonEncounter.hazards.length = 0;
        oldState.dungeonEncounter.adds.length = 0;
        oldState.dungeonEncounter.boss = null;
      }
      root.state = null;
      root.lastTime = null;
      root.playerCaptainRef = null;
    }
    if (restoreArena && previousArena) root.applyArenaMap(previousArena);
    else if (restoreArena && root.ARENA_MAPS && root.ARENA_MAPS.citadel) root.applyArenaMap(root.ARENA_MAPS.citadel);
    previousArena = null;
    activeEncounter = null;
    localPractice = false;
    claimPending = false;
    result = null;
    error = null;
    const body = root.document && root.document.body;
    if (body) body.classList.remove('hourlyDungeonDialogOpen', 'battleMode');
    ['overlay', 'matchReward', 'matchStats'].forEach(id => {
      const element = root.document && root.document.getElementById(id);
      if (element) element.style.display = 'none';
    });
    const battle = root.document && root.document.getElementById('battleScreen');
    if (battle) battle.style.display = 'none';
    if (returnToHub && typeof root.showMainHub === 'function') root.showMainHub();
  }

  function cleanupFinishedCombat(match) {
    if (!match || root.state !== match || !match.dungeon || !match.over) return;
    if (root.rafId !== null) {
      root.cancelAnimationFrame(root.rafId);
      root.rafId = null;
    }
    match.effects.length = 0;
    match.traps.length = 0;
    match.totems.length = 0;
    match.fireZones.length = 0;
    match.entities.length = 0;
    if (match.dungeonEncounter) {
      match.dungeonEncounter.hazards.length = 0;
      match.dungeonEncounter.adds.length = 0;
      match.dungeonEncounter.boss = null;
    }
    root.state = null;
    root.lastTime = null;
    root.playerCaptainRef = null;
    if (previousArena) root.applyArenaMap(previousArena);
    else if (root.ARENA_MAPS && root.ARENA_MAPS.citadel) root.applyArenaMap(root.ARENA_MAPS.citadel);
    previousArena = null;
    activeEncounter = null;
    const body = root.document && root.document.body;
    if (body) body.classList.remove('battleMode');
    const battle = root.document && root.document.getElementById('battleScreen');
    if (battle) battle.style.display = 'none';
    if (typeof root.showMainHub === 'function') root.showMainHub();
    emit();
  }

  async function enter() {
    exposeGameBindings();
    if(!Array.isArray(root.selected)||![2,3].includes(root.selected.length)){
      error='Hourly Dungeon requires exactly 2 or 3 heroes.';emit();return false;
    }
    if (busy || activeEncounter) return false;
    if (regularCombatActive()) {
      error = 'Leave the current battle before entering the dungeon.';
      emit();
      return false;
    }
    const token = ++generation;
    error = null;
    result = null;
    claimPending = false;
    setBusy(true);
    const isLocal = isPracticeClient() || !hasHostedBridge();
    localPractice = isLocal;
    try {
      let latest;
      latest = await refreshStatusFor(token);
      if (token !== generation) return false;
      if (!latest || !latest.encounterId) throw new Error('No hourly dungeon encounter is available right now.');
      if (!isLocal && (latest.completed === true || Array.from(receipts.values()).some(receipt =>
        receipt.payload.outcome === 'win' && receipt.state !== 'expired' && receipt.cycle === latest.cycle))) {
        throw new Error('This cycle is already complete. Return when the next dungeon opens.');
      }
      // Keep the entry busy and generation-checked while showing a tip.
      // Do this before reserving a hosted attempt so cancellation is harmless.
      if (root.ArenaTip && typeof root.ArenaTip.beforeMatch === 'function') {
        root.ArenaTip.cancelAll();
        const ready = await root.ArenaTip.beforeMatch(function () {});
        if (token !== generation || ready !== 'started') return false;
      }
      if (isLocal) {
        startEncounter({ encounterId: latest.encounterId, cycle: latest.cycle }, latest, null, true);
        busy = false;
        emit();
        return true;
      }

      // For hosted accounts the start request id is also the server's attempt
      // registration UUID; the host owns idempotency and durable finish retries.
      const attemptId = createRequestId();
      const startResponse = await requestBridge(
        'start', { requestId: attemptId, id: latest.encounterId,heroes:root.selected.slice() }, token);
      if (token !== generation) return false;
      const started = startResponse.data.start || startResponse.data;
      if (!started || !started.id) throw new Error('The arena host did not create a dungeon attempt.');
      const startedStatus = started.status || startResponse.status || status;
      if (startedStatus) setStatus(startedStatus);
      startEncounter(started, startedStatus, attemptId, false);
      busy = false;
      emit();
      return true;
    } catch (requestError) {
      if (token === generation) {
        error = requestError && requestError.message ? requestError.message : 'Unable to enter the dungeon.';
        busy = false;
        emit();
      }
      return false;
    } finally {
      if (token === generation && busy && !activeEncounter) {
        busy = false;
        emit();
      }
    }
  }

  function sendFinishReceipt(receipt) {
    const token = generation;
    receipt.state = 'pending';
    receipt.generation = token;
    const frozen = receipt.payload;
    if (result && result.attemptId === frozen.attemptId) {
      claimPending = true;
      result = Object.assign({}, result, { claimPending: true, claimError: null });
      emit();
    }
    requestBridge('finish', {
      requestId: frozen.attemptId,
      id: frozen.id,
      outcome: frozen.outcome,
      cycle: frozen.cycle
    }, token).then(response => {
      if (receipts.get(frozen.attemptId) !== receipt) return;
      if (response && response.cancelled) return;
      const data = response.data.finish || response.data;
      if (data.status && token === generation) setStatus(data.status);
      receipt.state = 'settled';
      receipt.awarded = Object.prototype.hasOwnProperty.call(data, 'awarded') ? data.awarded : null;
      receipt.buff = confirmedRewardBuff(receipt, data);
      if (token !== generation || !result || result.attemptId !== frozen.attemptId) return;
      claimPending = false;
      result = Object.assign({}, result, {
        awarded: receipt.awarded,
        claimed: !!receipt.awarded,
        buff: cloneBuff(receipt.buff),
        claimPending: false,
        claimError: null
      });
      emit();
    }).catch(finishError => {
      if (receipts.get(frozen.attemptId) !== receipt) return;
      receipt.state = 'error';
      receipt.error = finishError && finishError.message
        ? finishError.message : 'The dungeon result was not confirmed.';
      if (token !== generation || !result || result.attemptId !== frozen.attemptId) return;
      claimPending = false;
      result = Object.assign({}, result, { claimPending: false, claimError: receipt.error });
      emit();
    });
  }

  function receiptForClaimId(id) {
    for (const receipt of receipts.values()) {
      if (receipt.payload.id === id || receipt.payload.attemptId === id) return receipt;
    }
    return null;
  }

  function makeClaimResult(receipt) {
    const settled = receipt.state === 'settled';
    const failed = receipt.state === 'error' || receipt.state === 'expired';
    return {
      outcome: 'Victory!',
      localPractice: false,
      encounterId: receipt.encounterId || null,
      attemptId: receipt.payload.attemptId,
      message: null,
      awarded: receipt.awarded,
      gold: receipt.gold,
      balance: receipt.balance,
      claimed: settled && !!receipt.awarded,
      buff: cloneBuff(receipt.buff),
      claimPending: receipt.state === 'new' || receipt.state === 'pending',
      claimError: failed ? (receipt.error || (receipt.state === 'expired'
        ? 'This dungeon attempt can no longer grant a buff.' : 'The dungeon claim could not be confirmed.')) : null
    };
  }

  function latestWinReceipt() {
    return Array.from(receipts.values()).reverse()
      .find(receipt => receipt.payload.outcome === 'win') || null;
  }

  function restoreWinResult() {
    const receipt = latestWinReceipt();
    if (!receipt || regularCombatActive() || (root.state && !root.state.dungeon)) return false;
    result = makeClaimResult(receipt);
    claimPending = result.claimPending;
    return true;
  }

  function receiveClaimState(message) {
    if (!message || typeof message.id !== 'string' ||
        !['win', 'loss', 'abandoned'].includes(message.outcome) ||
        !['pending', 'confirmed', 'error', 'expired'].includes(message.state)) return;
    let receipt = receiptForClaimId(message.id);
    if (!receipt) {
      const payload = Object.freeze({
        id: message.id,
        attemptId: message.id,
        outcome: message.outcome,
        cycle: Number.isFinite(message.cycle) ? message.cycle : null
      });
      receipt = {
        payload, cycle: payload.cycle, state: 'new', generation, awarded: null,
        error: null, encounterId: null
      };
      receipts.set(payload.attemptId, receipt);
    }
    if (receipt.payload.outcome !== message.outcome) return;
    if (Number.isFinite(message.cycle)) receipt.cycle = message.cycle;
    const data = message.data && (message.data.finish || message.data);
    receipt.state = message.state === 'confirmed' ? 'settled' : message.state;
    if (message.state === 'confirmed') {
      receipt.awarded = data && Object.prototype.hasOwnProperty.call(data, 'awarded')
        ? data.awarded : false;
      receipt.buff = confirmedRewardBuff(receipt, data);
      receipt.gold = data && data.gold;
      receipt.balance = data && data.balance;
      receipt.error = null;
      if (data && data.status) setStatus(data.status);
    } else if (message.state === 'error' || message.state === 'expired') {
      receipt.error = typeof message.error === 'string' && message.error
        ? message.error : (message.state === 'expired'
          ? 'This dungeon attempt can no longer grant a buff.' : 'The dungeon claim could not be confirmed.');
    }
    if (message.outcome === 'win') {
      if (!regularCombatActive() && !(root.state && !root.state.dungeon)) {
        result = makeClaimResult(receipt);
      }
      claimPending = message.state === 'pending';
    }
    emit();
  }

  function retryClaim() {
    if (!result || result.outcome !== 'Victory!' || result.claimed || result.claimPending ||
        !result.claimError || !result.attemptId) return false;
    const receipt = receipts.get(result.attemptId);
    if (!receipt || receipt.payload.outcome !== 'win') return false;
    sendFinishReceipt(receipt);
    return true;
  }

  function finishBattle(outcome) {
    if (!root.state || !root.state.dungeon || root.state.over) return;
    const match = root.state;
    match.over = true;
    match.result = outcome;
    match.overlayAt = null;
    match.overlayShown = true;
    match.effects.length = 0;
    if (match.dungeonEncounter) {
      match.dungeonEncounter.hazards.length = 0;
      match.dungeonEncounter.adds.length = 0;
    }
    match.entities = match.entities.filter(entity => !entity._dungeonAdd);
    if (root.document) {
      ['overlay', 'matchReward', 'matchStats'].forEach(id => {
        const element = root.document.getElementById(id);
        if (element) element.style.display = 'none';
      });
    }
    if (typeof root.setMusicMode === 'function') root.setMusicMode('menu');
    const local = !activeEncounter || activeEncounter.localPractice;
    result = {
      outcome,
      localPractice: local,
      encounterId: activeEncounter && activeEncounter.encounterId,
      attemptId: activeEncounter && activeEncounter.attemptId,
      message: local ? 'Local practice only — no reward or persistent progress is claimed.' : null,
      awarded: null,
      claimed: false,
      claimPending: false,
      claimError: null
    };
    const finished = activeEncounter;
    if (finished) finished.finished = true;
    if (typeof root.setTimeout === 'function') root.setTimeout(() => cleanupFinishedCombat(match), 0);
    if (local || !finished || !finished.id || !hasHostedBridge()) {
      emit();
      return;
    }
    const serverOutcome = outcome === 'Victory!' ? 'win' : 'loss';
    const payload = Object.freeze({
      id: finished.id,
      attemptId: finished.attemptId,
      outcome: serverOutcome,
      cycle: finished.cycle || (status && status.cycle) || null
    });
    if (!payload.attemptId) {
      result.claimError = 'The dungeon attempt identifier is missing; this result cannot be retried.';
      emit();
      return;
    }
    const receipt = {
      payload, cycle: payload.cycle, state: 'new', generation: null, awarded: null,
      error: null, encounterId: result.encounterId || null
    };
    receipts.set(payload.attemptId, receipt);
    claimPending = true;
    result.claimPending = claimPending;
    emit();
    sendFinishReceipt(receipt);
  }

  function installHooks() {
    if (typeof root.startBattle === 'function') {
      originalStartBattle = root.startBattle;
      root.startBattle = function (opts) {
        opts = opts || {};
        if (busy || activeEncounter || (root.state && root.state.dungeon) || result) cleanupForNormalBattle();
        const started = originalStartBattle.apply(this, arguments);
        if (!opts._ordersConfirmed || !root.state || root.state.over || root.state.dungeon) {
          if (root.state && !root.state.dungeon) emit();
          return started;
        }
        if (opts.onlineChallenge) {
          syncServerClock(opts.attackBuff || opts.defenseBuff);
          root.state._hourlyDungeonTeamBuffs = {
            player: opts.attackBuff || null,
            enemy: opts.defenseBuff || null
          };
          applyTeamBuff('player', opts.attackBuff);
          applyTeamBuff('enemy', opts.defenseBuff);
        } else if (!opts.tournament) {
          const capturedBuff = cloneBuff(status && status.activeBuff);
          if (capturedBuff) {
            root.state._hourlyDungeonCapturedBuff = capturedBuff;
            root.state._hourlyDungeonTeamBuffs = { player: capturedBuff };
            applyTeamBuff('player', capturedBuff);
          }
        }
        emit();
        return started;
      };
    }
    const back = root.document && root.document.getElementById('backBtn');
    if (back) {
      originalBackHandler = back.onclick;
      back.onclick = function (event) {
        if (activeEncounter || (root.state && root.state.dungeon)) {
          exit();
          return;
        }
        if (typeof originalBackHandler === 'function') return originalBackHandler.call(this, event);
      };
    }
    if (typeof root.showMainHub === 'function') {
      const originalShowMainHub = root.showMainHub;
      root.showMainHub = function () {
        const shown = originalShowMainHub.apply(this, arguments);
        if (restoreWinResult()) emit();
        return shown;
      };
    }
    root.addEventListener('message', receiveMessage);
    root.addEventListener('pagehide', () => {
      generation += 1;
      cancelPendingRequests();
      cleanupCore(true, false);
      if (typeof root.stopGameMusic === 'function') root.stopGameMusic();
    });
    if (isPracticeClient() && typeof root.setTimeout === 'function') {
      root.setTimeout(() => {
        refreshStatus().catch(statusError => {
          if (generation !== 0 || status) return;
          error = statusError && statusError.message ? statusError.message : 'Unable to load dungeon status.';
          emit();
        });
      }, 0);
    }
  }

  function cleanupForNormalBattle() {
    abandonUnfinishedAttempt();
    generation += 1;
    if (root.ArenaTip) root.ArenaTip.cancelAll();
    cancelPendingRequests();
    cleanupCore(true, false);
    busy = false;
    emit();
  }

  function abandonUnfinishedAttempt() {
    const attempt = activeEncounter;
    if (!attempt || attempt.localPractice || attempt.finished || !attempt.id || !attempt.attemptId ||
        !hasHostedBridge() || attempt.abandonmentRequested) return;
    attempt.abandonmentRequested = true;
    // postMessage is sent synchronously before generation changes or teardown,
    // allowing the parent to durably record abandonment without awarding it.
    void requestBridge('finish', {
      requestId: attempt.attemptId,
      id: attempt.id,
      outcome: 'abandoned'
    }).catch(() => {});
  }

  function exit() {
    abandonUnfinishedAttempt();
    generation += 1;
    if (root.ArenaTip) root.ArenaTip.cancelAll();
    cancelPendingRequests();
    cleanupCore(true, true);
    if (typeof root.setMusicMode === 'function') root.setMusicMode('menu');
    busy = false;
    emit();
  }

  const api = {
    // Explicitly opt-in disposable guest practice only; never expose a shortcut
    // to hosted Dungeon attempts, rewards, or the player's hourly ledger.
    startPreviewEncounter(encounterId) {
      if (!isPracticeClient() || root.parent === root || !root.URLSearchParams) {
        throw new Error('Boss preview requires an embedded guest practice document.');
      }
      const query = new root.URLSearchParams(root.location && root.location.search || '');
      if (query.get('practice') !== '1' || query.get('guest') !== '1' ||
          query.get('rosterBattlePreview') !== '1') {
        throw new Error('Boss preview requires the explicit 3D practice flag.');
      }
      if (!['frost', 'demon', 'temple'].includes(encounterId)) throw new Error('Invalid boss preview.');
      // This document has no account match or ranked result to preserve.
      if (root.state && !root.state.dungeon) {
        if (root.rafId !== null) root.cancelAnimationFrame(root.rafId);
        root.rafId = null; root.state = null; root.lastTime = null; root.playerCaptainRef = null;
      }
      startEncounter({ encounterId }, null, null, true);
    },
    getStatus,
    getView,
    getEncounter,
    getNow,
    refreshStatus,
    canEnter,
    enter,
    retryClaim,
    exit,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      listener(getView());
      return () => listeners.delete(listener);
    },
    isActive() {
      return !!(activeEncounter || (root.state && root.state.dungeon));
    },
    cleanupForNormalBattle,
    refreshEntityBuff,
    tick(dt) {
      const nowMs = getNow();
      if (root.state && root.state._hourlyDungeonTeamBuffs) {
        applyTeamBuff('player', root.state._hourlyDungeonTeamBuffs.player);
        applyTeamBuff('enemy', root.state._hourlyDungeonTeamBuffs.enemy);
      }
      if (root.state && Array.isArray(root.state.entities)) {
        root.state.entities.forEach(entity => refreshEntityBuff(entity, nowMs));
      }
      if (!root.state || !root.state.dungeon || root.state.over) return;
      root.state._simElapsed = (root.state._simElapsed || 0) + dt;
      tickEncounter(dt);
    },
    tickBoss,
    dodgeHero,
    checkBattleEnd: checkDungeonEnd,
    finishBattle
  };

  api.__test = {
    applyEntityBuff,
    refreshEntityBuff,
    makeEncounter,
    tickEncounter,
    createRequestId
  };
  root.HourlyDungeon = api;
  exposeGameBindings();
  installHooks();
})(window);