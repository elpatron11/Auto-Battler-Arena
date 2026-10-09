import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/mobile-game.js', import.meta.url), 'utf8');
const helper = (name, next) => source.slice(
  source.indexOf('  function ' + name + '('),
  source.indexOf('  function ' + next + '(')
);

test('choice updates touch only their group and retain existing controls', () => {
  const buttons = ['default', 'custom'].map(variant => ({
    dataset: { variant }, pressed: String(variant === 'default'), writes: 0,
    getAttribute() { return this.pressed; },
    setAttribute(name, value) { assert.equal(name, 'aria-pressed'); this.pressed = value; this.writes++; }
  }));
  const selectors = [];
  const content = { querySelectorAll(selector) { selectors.push(selector); return buttons; } };
  const context = vm.createContext({ $: () => content });
  vm.runInContext(helper('updateSlotChoiceStates', 'updateCaptainControls'), context);
  context.updateSlotChoiceStates('[data-build-kind="ability"]', 'custom');
  assert.deepEqual(selectors, ['[data-build-kind="ability"]']);
  assert.deepEqual(buttons.map(b => b.pressed), ['false', 'true']);
  context.updateSlotChoiceStates('[data-build-kind="ability"]', 'custom');
  assert.deepEqual(buttons.map(b => b.writes), [1, 1], 'unchanged attributes are not rewritten');
});

test('captain toggles reuse their button and racial section and retain sheet scroll', () => {
  const sheet = { scrollTop: 280 };
  const button = { setAttribute() {}, closest: () => sheet };
  const choices = { style: {} };
  const draft = { captain: false };
  const context = vm.createContext({ draft, $: id => id === 'mgCaptainChoice' ? button : choices });
  vm.runInContext(helper('updateCaptainControls', 'renderSlotSheet'), context);
  context.updateCaptainControls();
  assert.equal(choices.hidden, true);
  assert.equal(choices.style.display, 'none');
  draft.captain = true;
  context.updateCaptainControls();
  assert.equal(choices.hidden, false);
  assert.equal(choices.style.display, '');
  assert.equal(button.textContent, 'Captain selected');
  assert.equal(sheet.scrollTop, 280);
});

test('hidden Home skips all canvas and DOM work', () => {
  const classes = new Set();
  const hub = { style: { display: 'none' } };
  const context = vm.createContext({
    homePaintSuspended: 0,
    document: { body: { classList: { contains: name => classes.has(name) } } },
    $: () => hub,
    normalizePositions() { assert.fail('hidden Home must not start rendering'); }
  });
  vm.runInContext(helper('homeIsVisible', 'paintHomeParty'), context);
  const start = source.indexOf('  function paintHomeParty(');
  const end = source.indexOf('  renderSlots = function ()', start);
  vm.runInContext(source.slice(start, end), context);
  context.paintHomeParty();
  hub.style.display = 'block';
  classes.add('teamBuilderMode');
  context.paintHomeParty();
  classes.clear();
  classes.add('battleMode');
  context.paintHomeParty();
  classes.clear();
  context.homePaintSuspended = 1;
  context.paintHomeParty();
});

test('compact slot refresh retains captain persistence/eligibility exactly once without legacy rendering', () => {
  const calls = [];
  const context = vm.createContext({
    refreshCaptainUI: () => calls.push('captain'),
    paintSlots: () => calls.push('slots'),
    updateHubTeamSummary: () => calls.push('home'),
    originalRenderSlots: () => assert.fail('legacy slot rendering must not run')
  });
  const start = source.indexOf('  renderSlots = function ()');
  vm.runInContext(source.slice(start, source.indexOf('  renderHubParty =', start)), context);
  context.renderSlots();
  assert.deepEqual(calls, ['captain', 'slots', 'home']);
});