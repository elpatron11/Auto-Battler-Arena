import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const css = readFileSync(new URL("../public/mobile-game.css", import.meta.url), "utf8");
const mobileGame = readFileSync(new URL("../public/mobile-game.js", import.meta.url), "utf8");
const scrollingHook = readFileSync(new URL("../src/lib/useGameFrameScrolling.ts", import.meta.url), "utf8");

test("actual dialog open/close handlers set the host viewport signal without runtime errors", () => {
  const classes = new Set();
  const dialog = { hidden: true, querySelector: () => ({ focus() {} }) };
  const document = {
    body: { classList: {
      add: name => classes.add(name),
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }
    } },
    activeElement: { isConnected: true, focus() {} },
    getElementById: () => dialog,
    querySelector: () => dialog.hidden ? null : dialog
  };
  const start = mobileGame.indexOf("  function showOverlay(id)");
  const end = mobileGame.indexOf("  function overlay(id,", start);
  assert.match(mobileGame, /const body = document\.body;/);
  const context = vm.createContext({ document });
  vm.runInContext('const body = document.body; const $ = id => document.getElementById(id); let returnFocus;\n' +
    mobileGame.slice(start, end) + '\nshowOverlay("mgSlotDialog");', context);
  assert.equal(dialog.hidden, false);
  assert.equal(classes.has("mobileGameDialogOpen"), true);
  vm.runInContext('closeOverlay("mgSlotDialog");', context);
  assert.equal(dialog.hidden, true);
  assert.equal(classes.has("mobileGameDialogOpen"), false);
});

test("the slot dialog has a viewport-bounded flex scrollport for the character picker", () => {
  const sheet = css.match(/body\.mobileGameUX #mgSlotDialog \.mg-sheet\s*\{([^}]+)\}/)?.[1];
  assert.ok(sheet, "slot dialog should have its own bounded sheet rules");
  assert.match(sheet, /height:\s*min\(90vh,780px\);[\s\S]*height:\s*min\(90dvh,780px\);/);
  assert.match(sheet, /max-height:\s*min\(90vh,780px\);[\s\S]*max-height:\s*min\(90dvh,780px\);/);
  assert.match(sheet, /overflow:\s*hidden;/);

  const contentRules = [...css.matchAll(/body\.mobileGameUX #mgSlotContent\s*\{([^}]+)\}/g)]
    .map(match => match[1]).join("\n");
  assert.match(contentRules, /flex:\s*1 1 auto;/);
  assert.match(contentRules, /min-height:\s*0;/);
  assert.match(contentRules, /overflow-y:\s*auto;/);
  assert.match(contentRules, /-webkit-overflow-scrolling:\s*touch;/);
  assert.match(contentRules, /touch-action:\s*pan-y;/);

  assert.match(mobileGame, /'<details class="mg-hero-disclosure"[\s\S]*?class="mg-hero-picker"/);
  assert.match(mobileGame, /\$\('mgSlotContent'\)\.innerHTML = html;/);
  assert.match(mobileGame, /const scrollArea = \$\('mgSlotContent'\), scrollTop = scrollArea\?\.scrollTop;/);
  assert.match(mobileGame, /if \(scrollArea\) scrollArea\.scrollTop = scrollTop;/);
  assert.match(mobileGame, /body\.classList\.add\('mobileGameDialogOpen'\)/);
  assert.match(mobileGame, /body\.classList\.toggle\('mobileGameDialogOpen'/);
  assert.match(scrollingHook, /classList\.contains\('mobileGameDialogOpen'\)/,
    "opening the picker must shrink the expanded iframe to the visible phone height");
});

test("iOS keeps native iframe momentum while non-iOS retains menu gesture forwarding", () => {
  assert.match(scrollingHook, /const nativeFrameScroll = \/iPhone\|iPad\|iPod\/\.test\(navigator\.userAgent\)/);
  assert.match(scrollingHook, /navigator\.platform === 'MacIntel' && navigator\.maxTouchPoints > 1/);

  const registrationStart = scrollingHook.indexOf("if (!nativeFrameScroll) {");
  const registrationEnd = scrollingHook.indexOf("window.addEventListener('resize', refresh)", registrationStart);
  assert.ok(registrationStart >= 0 && registrationEnd > registrationStart);
  const touchRegistration = scrollingHook.slice(registrationStart, registrationEnd);
  assert.match(touchRegistration, /addEventListener\('touchstart'/);
  assert.match(touchRegistration, /addEventListener\('touchmove'/);
  assert.match(touchRegistration, /addEventListener\('wheel'/);

  assert.match(scrollingHook, /style\.overflowY === 'auto' \|\| style\.overflowY === 'scroll'/);
  assert.match(scrollingHook, /element\.scrollHeight > element\.clientHeight \+ 1/);
});