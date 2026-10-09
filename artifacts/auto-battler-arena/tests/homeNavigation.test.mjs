import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const mobile = readFileSync(new URL('../public/mobile-game.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/mobile-game.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/game.html', import.meta.url), 'utf8');

test('Home repaint repairs removed canvases and can force a redraw after combat', () => {
  class Node {
    constructor(tag = 'div') { this.tag = tag; this.children = []; this.dataset = {}; }
    append(...nodes) { this.children.push(...nodes); }
    querySelector(selector) {
      return this.children.find(node => selector === 'canvas' ? node.tag === 'canvas' : node.className === 'hubPreviewBadge') || null;
    }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute() {}
    removeAttribute() {}
  }
  const face = new Node(), party = new Node();
  party.children = [face];
  party.style = { getPropertyValue: () => '1' };
  face.dataset.paintKey = JSON.stringify(['warrior', false, null, null, 0]);
  let draws = 0;
  const context = vm.createContext({
    homeIsVisible: () => true, normalizePositions() {}, teamSize: 1,
    positions: [0], selected: ['warrior'], captainClass: null, captainRacial: null,
    CLASS_STATS: { warrior: { name: 'Warrior' } }, CLASS_PORTRAIT_IMG: {},
    $: id => id === 'hubPartyVisual' ? party : null,
    document: { createElement: tag => new Node(tag) },
    drawHubLiveHero() { draws++; }
  });
  const start = mobile.indexOf('  function paintHomeParty(');
  const end = mobile.indexOf('  renderSlots = function ()', start);
  vm.runInContext(mobile.slice(start, end), context);
  context.paintHomeParty();
  assert.equal(draws, 1, 'missing canvas is recreated even with an unchanged cached build');
  context.paintHomeParty();
  assert.equal(draws, 1, 'normal unchanged refresh remains cheap');
  context.paintHomeParty(true);
  assert.equal(draws, 2, 'returning from combat explicitly redraws the squad');
});

test('compact Home overrides the legacy landscape hide and keeps only canonical destinations', () => {
  assert.match(css, /#hubPartyVisual\s*\{[^}]*display:\s*flex !important/);
  for (const id of ['hubTournamentBtn', 'hubArenaBtn', 'hubJoinTournamentBtn', 'hubOnlineActionBtn', 'defenseBtn', 'profileBtn']) {
    assert.match(css, new RegExp('#' + id + '[^}]*display:\\s*none !important'));
  }
  assert.match(mobile, /accountActions\.appendChild\(market\)/);
  assert.match(mobile, /market\.setAttribute\('aria-label', 'Market'\)/);
  assert.match(html, /avatarV4464\.addEventListener\('click',\(\)=>openProfile\(\)\)/);
  assert.match(html, /portraitEditorV4464\.onclick=openProfilePortraitV4464/);
  assert.match(html, /portraitClass=b\.dataset\.k;savePlayerProfile\(\)/);
});

test('dungeon buff is a small corner indicator in combat, never over the result heading', () => {
  const buffCss = readFileSync(new URL('../public/hourly-dungeon.css', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../public/hourly-dungeon-ui.js', import.meta.url), 'utf8');
  assert.match(buffCss, /body\.battleMode #hdBadge\{top:auto;bottom:/);
  assert.match(buffCss, /#hdBadge svg\{[^}]*width:14px;height:14px/);
  assert.match(ui, /var parent = battle \? document\.body/);
  assert.match(ui, /els\.badge\.setAttribute\('aria-label'/);
});

test('the entire lower More section is hidden, while Market stays in the account row', () => {
  assert.match(css, /body\.mobileGameUX #mainHub \.ar-menu-more\s*\{\s*display:\s*none !important;/);
  assert.match(mobile, /more\.hidden = true;/);
  assert.match(mobile, /accountActions\.appendChild\(market\)/);
  assert.doesNotMatch(mobile, /more\.remove\(\)/, 'legacy destination handlers still have their controls');
});

test('signed-in shortcut replaces Squad with the original Online Arena button and handler', () => {
  const squad = {}, more = { appendChild(node) { assert.equal(node, squad); squad.parentNode = this; } };
  const label = {}, icon = {};
  const handler = () => 'existing arena bridge';
  const arena = { onclick: handler, setAttribute(name, value) { this[name] = value; },
    querySelector: selector => selector === 'b' ? label : icon };
  const nav = { replaceChild(next, old) {
    assert.equal(next, arena); assert.equal(old, squad); arena.parentNode = this;
  } };
  squad.parentNode = nav;
  const context = vm.createContext({ GUEST_TRIAL: false, more,
    document: { querySelector: () => nav }, $: id => id === 'hubTeamBtn' ? squad : arena });
  const start = mobile.indexOf('  if (!GUEST_TRIAL) {', mobile.indexOf('const more ='));
  const end = mobile.indexOf('  // Retain the Market', start);
  vm.runInContext(mobile.slice(start, end), context);
  assert.equal(arena.parentNode, nav);
  assert.equal(arena.onclick, handler, 'the actual Arena navigation is retained');
  assert.equal(arena['aria-label'], 'Online Arena');
  assert.equal(label.textContent, 'Online Arena');
  assert.match(icon.innerHTML, /mg-arena-icon/);
  assert.equal(squad.parentNode, more, 'legacy squad navigation is not destroyed');
});