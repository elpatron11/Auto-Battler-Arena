import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const tipSource = readFileSync(new URL("../public/arena-tip.js", import.meta.url), "utf8");
const gameSource = readFileSync(new URL("../public/game.html", import.meta.url), "utf8");

function gameEntryHarness(arenaTip, document, window) {
  const elements = {
    mirrorToggle: { checked: false },
    mainHub: { style: { display: "block" } },
    selectScreen: { style: { display: "none" } }
  };
  const originalGetElementById = document.getElementById.bind(document);
  document.getElementById = id => elements[id] || originalGetElementById(id);
  window.ArenaTip = arenaTip;

  const generationStart = gameSource.indexOf("let arenaEntryGeneration = 0;");
  const startBattleStart = gameSource.indexOf("function startBattle(opts)", generationStart);
  const preparedCombat = gameSource.indexOf("// A prepared normal match carries its exact rolled opponent", startBattleStart);
  assert.ok(generationStart >= 0 && startBattleStart > generationStart && preparedCombat > startBattleStart);
  const showBuilderStart = gameSource.indexOf("function showTeamBuilder()");
  const showBuilderEnd = gameSource.indexOf("\n(function(){", showBuilderStart);
  assert.ok(showBuilderStart >= 0 && showBuilderEnd > showBuilderStart);

  const context = vm.createContext({
    window, document,
    setMusicMode() {},
    ensureAudio() { context.audioStarts++; },
    updateHubTeamSummary() {},
    audioStarts: 0
  });
  const actualEntryPrefix = [
    gameSource.slice(generationStart, startBattleStart),
    gameSource.slice(startBattleStart, preparedCombat),
    'return "direct";\n}',
    'globalThis.__entryGeneration = () => arenaEntryGeneration;'
  ].join("\n");
  vm.runInContext(actualEntryPrefix, context);
  vm.runInContext(gameSource.slice(showBuilderStart, showBuilderEnd), context);
  return { context, elements, generation: () => context.__entryGeneration() };
}

class FakeElement {
  constructor(tagName, document) {
    this.tagName = tagName;
    this.document = document;
    this.attributes = {};
    this.listeners = {};
    this.children = [];
    this.parentNode = null;
    this.className = "";
    this.textContent = "";
    this.innerHTML = "";
    this.style = { display: "", setProperty() {} };
    this.classList = { add() {}, remove() {} };
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, listener) {
    (this.listeners[type] ||= []).push(listener);
  }
  focus() { this.document.activeElement = this; }
  contains(node) { return this === node || this.children.includes(node); }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    if (this.tagName !== "div" || !html.includes('data-act="go"')) return;
    this.fill = new FakeElement("div", this.document);
    this.fill.className = "atip-fill";
    this.bar = new FakeElement("div", this.document);
    this.bar.className = "atip-bar";
    this.cancelButton = new FakeElement("button", this.document);
    this.cancelButton.setAttribute("data-act", "cancel");
    this.goButton = new FakeElement("button", this.document);
    this.goButton.setAttribute("data-act", "go");
    this.children.push(this.fill, this.bar, this.cancelButton, this.goButton);
  }
  get innerHTML() { return this._innerHTML; }
  querySelector(selector) {
    if (selector === ".atip-fill") return this.fill || null;
    if (selector === ".atip-bar") return this.bar || null;
    if (selector === '[data-act="cancel"]') return this.cancelButton || null;
    if (selector === '[data-act="go"]') return this.goButton || null;
    return null;
  }
  querySelectorAll(selector) {
    return selector === "button" ? [this.cancelButton, this.goButton].filter(Boolean) : [];
  }
  clickAction(action) {
    const target = action === "go" ? this.goButton : this.cancelButton;
    const event = {
      target: { closest: selector => selector === "[data-act]" ? target : null }
    };
    for (const listener of this.listeners.click || []) listener(event);
  }
}

function makeTimers() {
  let now = 0;
  let nextId = 1;
  const handles = new Map();
  function schedule(callback, delay, interval) {
    const id = nextId++;
    handles.set(id, { id, callback, due: now + delay, interval });
    return id;
  }
  return {
    now: () => now,
    setTimeout: (callback, delay) => schedule(callback, delay, 0),
    setInterval: (callback, delay) => schedule(callback, delay, delay),
    clearTimeout: id => handles.delete(id),
    clearInterval: id => handles.delete(id),
    activeCount: () => handles.size,
    advance(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const next = [...handles.values()]
          .filter(timer => timer.due <= end)
          .sort((a, b) => a.due - b.due || a.id - b.id)[0];
        if (!next) break;
        now = next.due;
        if (next.interval) next.due += next.interval;
        else handles.delete(next.id);
        next.callback();
      }
      now = end;
    }
  };
}

function arenaTipHarness() {
  const timers = makeTimers();
  const documentListeners = {};
  const windowListeners = {};
  const document = {
    activeElement: null,
    head: new FakeElement("head", null),
    body: new FakeElement("body", null),
    addEventListener(type, listener) { (documentListeners[type] ||= []).push(listener); },
    removeEventListener(type, listener) {
      documentListeners[type] = (documentListeners[type] || []).filter(fn => fn !== listener);
    },
    createElement(tagName) { return new FakeElement(tagName, document); },
    getElementById(id) {
      return this.head.children.find(child => child.id === id) || null;
    },
    dispatch(type, event) {
      for (const listener of [...(documentListeners[type] || [])]) listener(event);
    }
  };
  const window = {
    addEventListener(type, listener) { (windowListeners[type] ||= []).push(listener); },
    removeEventListener(type, listener) {
      windowListeners[type] = (windowListeners[type] || []).filter(fn => fn !== listener);
    },
    dispatch(type, event = {}) {
      for (const listener of [...(windowListeners[type] || [])]) listener(event);
    }
  };
  document.head.appendChild = element => {
    element.parentNode = document.head;
    document.head.children.push(element);
    return element;
  };
  const context = vm.createContext({
    window, document,
    Date: { now: timers.now },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    requestAnimationFrame(callback) { callback(); }
  });
  vm.runInContext(tipSource, context);
  return {
    api: window.ArenaTip, document, window, timers, documentListeners, windowListeners
  };
}

test("ArenaTip waits the full five seconds, shares duplicate pending entries, and starts exactly once", async () => {
  const { api, document, timers } = arenaTipHarness();
  let starts = 0;
  const first = api.beforeMatch(() => starts++);
  const duplicate = api.beforeMatch(() => assert.fail("duplicate callback must not replace the pending entry"));

  assert.equal(first, duplicate, "all callers share the pending promise");
  assert.equal(api.isPending(), true);
  assert.equal(starts, 0);
  timers.advance(4_999);
  assert.equal(starts, 0, "no start callback runs before the five-second deadline");
  assert.equal(api.isPending(), true);
  timers.advance(1);
  assert.equal(await first, "started");
  assert.equal(starts, 1);
  assert.equal(api.isPending(), false);
  assert.equal(document.body.children.length, 0);
  assert.equal(timers.activeCount(), 0, "timeout and progress interval are removed after completion");
});

test("Start now starts once and removes the deadline; Cancel, Escape, and pagehide never trigger start", async () => {
  {
    const { api, document, timers } = arenaTipHarness();
    let starts = 0;
    const promise = api.beforeMatch(() => starts++);
    const overlay = document.body.children[0];
    overlay.clickAction("go");
    assert.equal(await promise, "started");
    assert.equal(starts, 1);
    assert.equal(timers.activeCount(), 0, "Start now clears the scheduled timer and progress interval");
    timers.advance(10_000);
    assert.equal(starts, 1, "cleared deadline cannot start again");
  }

  for (const cancel of [
    ({ api }) => api.cancelAll(),
    ({ document }) => {
      let prevented = false, stopped = false;
      document.dispatch("keydown", {
        key: "Escape",
        preventDefault() { prevented = true; },
        stopPropagation() { stopped = true; }
      });
      assert.equal(prevented, true);
      assert.equal(stopped, true);
    },
    ({ window }) => window.dispatch("pagehide")
  ]) {
    const harness = arenaTipHarness();
    let starts = 0;
    const promise = harness.api.beforeMatch(() => starts++);
    cancel(harness);
    assert.equal(await promise, "cancelled");
    assert.equal(starts, 0);
    assert.equal(harness.api.isPending(), false);
    assert.equal(harness.document.body.children.length, 0);
    assert.equal(harness.timers.activeCount(), 0);
  }

  const cancelHarness = arenaTipHarness();
  let cancelStarts = 0;
  const cancelPromise = cancelHarness.api.beforeMatch(() => cancelStarts++);
  cancelHarness.document.body.children[0].clickAction("cancel");
  assert.equal(await cancelPromise, "cancelled");
  assert.equal(cancelStarts, 0, "the visible Cancel button does not begin a battle");
});

test("ArenaTip markup has six heroes, a Captain, escaped accessible labels, unique SVG IDs, and one stylesheet", () => {
  const { api, document } = arenaTipHarness();
  const first = api.markup({ label: 'A&B <hero> "captain"' });
  const second = api.markup({ label: "Another team" });
  const ids = html => [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const firstIds = ids(first);

  assert.equal((first.match(/<ellipse cx="\d+" cy="\d+" rx="22" ry="6"/g) || []).length, 6);
  assert.match(first, /class="atip-pulse"/, "Captain crown is shown above a hero");
  assert.match(first, /stroke="#ffd66e" stroke-width="2" stroke-dasharray="4 4"/,
    "Captain is emphasized with a distinct ring");
  assert.ok(first.includes("A&amp;B &lt;hero&gt; &quot;captain&quot;"));
  assert.ok(!first.includes('A&B <hero> "captain"'));
  assert.equal(new Set(firstIds).size, firstIds.length, "IDs within the first SVG are unique");
  assert.equal(new Set([...firstIds, ...ids(second)]).size, firstIds.length + ids(second).length,
    "repeated markup calls never reuse SVG IDs");
  assert.equal(document.head.children.filter(element => element.id === "arenaTipCss").length, 1,
    "repeated markup calls inject only one stylesheet");
});

test("loading rotates all twelve supplied tips without repeating before a full cycle", async () => {
  const { api, document } = arenaTipHarness();
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    const promise = api.beforeMatch(() => {});
    const overlay = document.body.children[0];
    const image = overlay.innerHTML.match(/src="\.\/assets\/match-tips\/(tip-\d+\.webp)"/)?.[1];
    assert.ok(image, "loading uses the supplied guide artwork");
    assert.equal(seen.has(image), false);
    seen.add(image);
    overlay.clickAction("go");
    assert.equal(await promise, "started");
  }
  assert.equal(seen.size, 12);
});

test("reserved matches offer Start now but cannot be cancelled by Escape", async () => {
  const { api, document } = arenaTipHarness();
  let starts = 0;
  const promise = api.beforeMatch(() => starts++, { cancellable: false });
  const overlay = document.body.children[0];
  assert.ok(!overlay.innerHTML.includes('data-act="cancel"'));
  document.dispatch("keydown", { key: "Escape", preventDefault() {}, stopPropagation() {} });
  assert.equal(api.isPending(), true);
  assert.equal(starts, 0);
  overlay.clickAction("go");
  assert.equal(await promise, "started");
  assert.equal(starts, 1);
});

test("game wiring loads both isolated modules before use and opts in only after orders are confirmed", () => {
  const monsterScript = gameSource.indexOf('<script src="./dungeon-monsters.js"></script>');
  const tipScript = gameSource.indexOf('<script src="./arena-tip.js"></script>');
  const gameInlineScript = gameSource.indexOf("<script>", tipScript);
  assert.ok(monsterScript >= 0 && tipScript > monsterScript && gameInlineScript > tipScript,
    "monster and tip modules load before the inline game integration");

  const ordersGate = gameSource.indexOf("if(!opts._ordersConfirmed){", gameSource.indexOf("function startBattle"));
  const tipGate = gameSource.indexOf("if(opts._showArenaTip && !opts._arenaTipShown && window.ArenaTip)", ordersGate);
  const preparedMatch = gameSource.indexOf("if(opts._priorityPrepared && opts.enemyTeam)", tipGate);
  assert.ok(ordersGate >= 0 && tipGate > ordersGate && preparedMatch > tipGate,
    "tip handling is after the orders-confirmation gate and before prepared combat");
  assert.match(gameSource.slice(tipGate, preparedMatch), /ArenaTip\.beforeMatch/);
  assert.ok(gameSource.slice(tipGate, preparedMatch).includes("_arenaTipShown:true"));
  assert.ok(gameSource.includes("getElementById('startBtn').onclick = ()=>{ ensureAudio(); startBattle({_showArenaTip:true});"),
    "ordinary local Arena start explicitly opts in");
  assert.equal((gameSource.match(/_showArenaTip:true/g) || []).length, 1,
    "the normal start button is the sole explicit opt-in");

  const tutorialRender = gameSource.indexOf("function renderBeginnerTutorial()");
  const tutorialMarkup = gameSource.indexOf("window.ArenaTip.markup()", tutorialRender);
  const helpHandler = gameSource.indexOf('getElementById(\'arenaHelpBtn\')?.addEventListener(\'click\',()=>openBeginnerTutorial())');
  assert.ok(tutorialMarkup > tutorialRender, "the existing tutorial embeds the arena tip on its first step");
  assert.ok(helpHandler > tutorialMarkup, "Arena Help continues to open the existing beginner tutorial");
});

test("host arena:show-team routes through showTeamBuilder and cancels a pending local tip", async () => {
  const branchStart = gameSource.indexOf("if(event.data.type==='arena:show-team')");
  const branchEnd = gameSource.indexOf("\n   if(event.data.type===", branchStart);
  const hostRoute = gameSource.slice(branchStart, branchEnd);
  assert.match(hostRoute, /showTeamBuilder\(\);/,
    "the host team-navigation message uses the same team-builder function as Arena navigation");

  const harness = arenaTipHarness();
  const game = gameEntryHarness(harness.api, harness.document, harness.window);
  const pending = game.context.startBattle({
    _showArenaTip: true, _ordersConfirmed: true, _priorityPrepared: true, enemyTeam: []
  });
  assert.equal(harness.api.isPending(), true);
  assert.equal(harness.timers.activeCount(), 2);

  game.context.showTeamBuilder();
  assert.equal(await pending, "cancelled");
  assert.equal(harness.api.isPending(), false);
  assert.equal(harness.timers.activeCount(), 0, "team navigation clears the actual tip timer and progress interval");
  assert.equal(game.elements.mainHub.style.display, "none");
  assert.equal(game.elements.selectScreen.style.display, "block");
});

test("duplicate local entry preserves generation and deadline; ranked replacement cancels without a new delay", async () => {
  const harness = arenaTipHarness();
  const game = gameEntryHarness(harness.api, harness.document, harness.window);
  const localOpts = {
    _showArenaTip: true, _ordersConfirmed: true, _priorityPrepared: true, enemyTeam: []
  };
  const pending = game.context.startBattle(localOpts);
  const initialGeneration = game.generation();
  assert.equal(harness.timers.activeCount(), 2);

  harness.timers.advance(2_000);
  game.context.startBattle({ ...localOpts });
  assert.equal(game.generation(), initialGeneration, "duplicate local entry does not advance or reset generation");
  assert.equal(harness.timers.activeCount(), 2, "duplicate local entry does not create another timer");
  harness.timers.advance(2_999);
  assert.equal(harness.api.isPending(), true, "duplicate entry did not restart the five-second deadline");

  const directResult = game.context.startBattle({
    onlineChallenge: true, enemyBuilds: [],
    _ordersConfirmed: true, _priorityPrepared: true, enemyTeam: []
  });
  assert.equal(directResult, "direct", "ranked/tournament replacement continues immediately instead of opening another tip");
  assert.equal(await pending, "cancelled");
  assert.equal(game.generation(), initialGeneration + 2,
    "replacement invalidates the old generation and establishes its own entry generation");
  assert.equal(harness.api.isPending(), false);
  assert.equal(harness.timers.activeCount(), 0, "replacement removes the old deadline without adding a new one");
  assert.equal(harness.document.body.children.length, 0);
});

test("a captured tip callback cannot start after actual team navigation invalidates its generation", () => {
  let pending = false;
  let staleCallback;
  let cancelCalls = 0;
  const interceptedTip = {
    isPending: () => pending,
    beforeMatch(callback) {
      staleCallback = callback;
      pending = true;
      return "captured-pending-promise";
    },
    cancelAll() {
      pending = false;
      cancelCalls++;
    }
  };
  const harness = arenaTipHarness();
  const game = gameEntryHarness(interceptedTip, harness.document, harness.window);
  assert.equal(game.context.startBattle({
    _showArenaTip: true, _ordersConfirmed: true, _priorityPrepared: true, enemyTeam: []
  }), "captured-pending-promise");
  const generationBeforeNavigation = game.generation();

  game.context.showTeamBuilder();
  assert.equal(cancelCalls, 1);
  assert.equal(game.generation(), generationBeforeNavigation + 1);
  staleCallback();
  assert.equal(game.context.audioStarts, 0, "stale callback exits before audio or recursive battle start");
  assert.equal(game.generation(), generationBeforeNavigation + 1,
    "stale callback cannot mutate the replacement entry generation");
});