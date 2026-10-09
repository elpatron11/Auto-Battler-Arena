import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/hourly-dungeon-ui.js", import.meta.url), "utf8");
function presentation() {
  const window = {};
  vm.runInNewContext(source, {
    window,
    document: { readyState: "loading", addEventListener() {} },
  });
  return window.HourlyDungeonPresentation;
}

test("victory reward cards identify all three temporary buffs, effects, expiry and nonstacking limits", () => {
  const ui = presentation();
  for (const [kind, name, value, effect] of [
    ["maxHp", "Frostbound Guardian", 0.05, "+5% maximum HP"],
    ["damage", "Demon Lord", 0.04, "+4% damage"],
    ["healing", "Temple Sentinel", 0.05, "+5% outgoing healing"],
  ]) {
    const html = ui.rewardMarkup({ kind, name, value, expiresAt: 3_600_000 }, 3_000_000);
    assert.ok(html.includes(name));
    assert.ok(html.includes(effect));
    assert.ok(html.includes("TEMPORARY HOURLY BUFF REWARD"));
    assert.ok(html.includes("Active until the next hourly reset"));
    assert.ok(html.includes("10:00 remaining"));
    assert.ok(html.includes("Cannot be farmed again or stacked this cycle"));
    const expired = ui.rewardMarkup({ kind, name, value, expiresAt: 3_600_000 }, 3_600_000);
    assert.ok(expired.includes("Expired at the hourly reset"));
    assert.ok(!expired.includes("Active until"));
  }
  assert.equal(ui.rewardMarkup(null, 0), "");
  assert.equal(ui.rewardMarkup({ kind: "spell", value: 1, expiresAt: 1000 }, 0), "");
});

test("every engine encounter paints its own cached open arena background", () => {
  const images = [];
  const labels = [];
  const gradient = { addColorStop() {} };
  const context2d = new Proxy({}, {
    get(_object, key) {
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      if (key === "drawImage") return image => images.push(image);
      if (key === "strokeText") return text => labels.push(text);
      return () => {};
    },
    set() { return true; },
  });
  const window = {};
  vm.runInNewContext(source, {
    window, ARENA_W: 900, ARENA_H: 560,
    performance: { now: () => 1000 },
    document: {
      readyState: "loading", addEventListener() {},
      createElement: () => ({ width: 0, height: 0, getContext: () => context2d }),
    },
  });
  for (const id of ["frost", "demon", "temple"]) {
    assert.equal(window.HourlyDungeonPresentation.drawArena(context2d, {
      dungeon: true, dungeonEncounter: { id },
    }), true);
    window.HourlyDungeonPresentation.drawEncounter(context2d, {
      id, elapsed: 4, hazards: [],
      boss: { _dungeonBoss: true, alive: true, x: 775, y: 280, radius: 34 },
    });
  }
  assert.equal(images.length, 3);
  assert.equal(new Set(images).size, 3, "each theme has its own floor canvas");
  assert.deepEqual(labels, ["Frostbound Colossus", "Ashen Demon", "Temple Guardian"],
    "boolean engine boss tags still draw three distinct large boss overlays");
  window.HourlyDungeonPresentation.drawArena(context2d, { dungeon: true, dungeonEncounter: { id: "frost" } });
  assert.equal(images[3], images[0], "floors are reused instead of regenerated every frame");
});

test("Temple Guardian keeps its glow and name without square overlays", () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get(_object, key) {
      return (...args) => calls.push({ key, args });
    },
    set() { return true; },
  });
  const encounter = {
    id: "temple", elapsed: 4, hazards: [],
    boss: { _dungeonBoss: true, alive: true, x: 775, y: 280, radius: 34 },
  };
  const before = JSON.stringify(encounter);
  presentation().drawEncounter(ctx, encounter);
  assert.equal(calls.filter(call => call.key === "strokeRect").length, 0);
  assert.equal(calls.filter(call => call.key === "rotate").length, 0);
  assert.equal(calls.filter(call => call.key === "arc").length, 2,
    "the circular glow and overhead light remain");
  assert.ok(calls.some(call => call.key === "fillText" && call.args[0] === "Temple Guardian"));
  assert.equal(JSON.stringify(encounter), before, "appearance rendering does not change combat state");
});

test("dungeon briefing shows the active buff amount and this hour's reward", () => {
  const els = { dlg: { open: true }, body: { innerHTML: "" }, enter: {} };
  const context = vm.createContext({
    els, tab: "intro", view: {},
    st: () => ({
      encounterId: "temple",
      activeBuff: { kind: "healing", name: "Temple Sentinel", value: 0.05, expiresAt: 3_600_000 },
    }),
    canEnter: () => "done", remain: () => 1_800_000, now: () => 1_800_000,
    pid: id => id, isGuest: () => false, svg: () => "<svg></svg>",
  });
  vm.runInContext([
    source.slice(source.indexOf("var ARENAS ="), source.indexOf("var W =")),
    source.slice(source.indexOf("  function esc("), source.indexOf("  function svg(")),
    source.slice(source.indexOf("  function renderDlg("), source.indexOf("  function renderHome(")),
  ].join("\n"), context);
  context.renderDlg();
  assert.ok(els.body.innerHTML.includes("<strong>+5% outgoing healing (utility buff)</strong>"));
  assert.ok(els.body.innerHTML.includes("Reward: <b>25 Gold and +5% healing</b>"));
  assert.ok(els.body.innerHTML.includes("Already completed this hour"));
  assert.equal(els.enter.disabled, true);
  context.tab = "details";
  context.renderDlg();
  for (const amount of ["+5% max HP", "+4% damage", "+5% healing"]) {
    assert.ok(els.body.innerHTML.includes(amount), amount);
  }
});

test("dungeon dialog reserves a scrollable body between fixed-size controls", () => {
  const css = readFileSync(new URL("../public/hourly-dungeon.css", import.meta.url), "utf8");
  assert.match(css, /\.hdDlg\{[^}]*;height:min\(88dvh,760px\)/);
  assert.match(css, /\.hdDlg \.hdBody\{[^}]*min-height:0[^}]*overflow-y:auto[^}]*flex:1 1 auto/);
  for (const part of ["header", "footer"]) {
    assert.match(css, new RegExp(`\\.hdDlg ${part}\\{[^}]*flex-shrink:0`));
  }
  assert.match(css, /@media \(max-height:480px\)\{[\s\S]*?\.hdDlg\{height:calc\(100dvh - 16px\)/);
});