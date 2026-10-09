import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const mobile = readFileSync(new URL('../public/mobile-game.js', import.meta.url), 'utf8');
const game = readFileSync(new URL('../public/game.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/mobile-game.css', import.meta.url), 'utf8');
const section = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

test('build choices use the existing card-art resolver and retain locks and selected states', () => {
  const context = vm.createContext({
    draft: { ability: 'default', ultimate: 'custom' }, esc,
    ownsCustomAbility: () => false, ownsCustomUlt: () => true,
    variantLabel: (key, kind, variant) => `${kind} ${variant}`,
    variantDesc: () => 'Actual ability description',
    collectibleArtHtml: (key, name) => `<img src="${key}/${name}.webp" alt="">`
  });
  vm.runInContext(section(game, 'function variantArtName(', 'function renderMatchLoadout('), context);
  vm.runInContext(section(mobile, '  function buildChoices(', '  function updateSlotChoiceStates('), context);
  const ability = context.buildChoices('frostmage', 'ability', ['default', 'custom']);
  assert.match(ability, /data-variant="default" aria-pressed="true"/);
  assert.match(ability, /mg-build-choice locked/);
  assert.match(ability, /mg-choice-art/);
  assert.match(ability, /frostmage\/ability default\.webp/);
  const ultimate = context.buildChoices('frostmage', 'ult', ['default', 'polymorph', 'custom']);
  assert.match(ultimate, /frostmage\/Firestorm\.webp/, 'named variant uses its real art alias');
  assert.match(ultimate, /data-variant="custom" aria-pressed="true"/);
  assert.doesNotMatch(ultimate, /mg-build-choice locked/);
});

test('selected racial visibly includes team stats, active effect and cooldown and updates without replacing the sheet', () => {
  const detail = { innerHTML: '' };
  const context = vm.createContext({ draft: { racial: 'orc' }, $: () => detail, esc });
  vm.runInContext(section(game, 'const RACIALS = {', 'const RACIAL_KEYS'), context);
  vm.runInContext(section(mobile, '  function updateRacialDetails(', '  function renderSlotSheet('), context);
  context.updateRacialDetails();
  assert.match(detail.innerHTML, /Battleborn: all 3 heroes deal 10% more damage/);
  assert.match(detail.innerHTML, /Gain 40% damage and 20% attack speed for 6s/);
  assert.match(detail.innerHTML, /Cooldown: 75 seconds/);
  context.draft.racial = 'tauren';
  context.updateRacialDetails();
  assert.match(detail.innerHTML, /take 6% less damage and receive 5% more healing/);
  assert.doesNotMatch(detail.innerHTML, /Warcry/);
  context.draft.racial = null;
  context.updateRacialDetails();
  assert.match(detail.innerHTML, /Choose a racial below/);
});

test('character sheet shows captain stat bonus and class power, plus fixed-spell and talent images', () => {
  const nodes = {};
  const $ = id => nodes[id] ||= { innerHTML: '', querySelectorAll: () => [] };
  const context = vm.createContext({
    $, esc, draft: { key: 'warrior', position: 0, captain: true, racial: 'orc', talent: 'fortress' },
    positions: [0], selected: ['warrior'], teamSize: 3, playerProfile: {},
    CLASS_STATS: { warrior: { name: 'Warrior', role: 'Tank', hp: 100, dmg: 10, atkCd: 1, range: 20 } },
    CLASS_DESC: { warrior: [{ t: 'Slam (melee)', d: 'Attack nearby foes.' }] },
    CLASS_PORTRAIT_IMG: { warrior: '/portrait.webp' },
    CLASS_TALENTS: { warrior: [{ id: 'fortress', name: 'Fortress', desc: 'Extra armor.' }] },
    CUSTOM_ABILITIES: {}, CUSTOM_ULTS: {},
    ownsClass: () => true, ownsRacial: () => true, isTalentUnlocked: () => true,
    buildChoices: () => '', updateCaptainControls() {}, updateRacialDetails() {},
    collectibleArtHtml: (key, name) => `<img src="${key}/${name}.webp" alt="">`
  });
  vm.runInContext(section(game, 'const CAPTAIN_BONUS = {', 'const RACIAL_KEYS') +
    '\nconst RACIAL_KEYS = Object.keys(RACIALS);', context);
  vm.runInContext(section(mobile, '  function renderSlotSheet(', '  function commitSlot('), context);
  context.renderSlotSheet();
  const html = $('mgSlotContent').innerHTML;
  assert.match(html, /Captain bonus · \+10% all stats/);
  assert.match(html, /is reflected back at its source/);
  assert.match(html, /warrior\/Slam\.webp/);
  assert.match(html, /warrior\/Fortress\.webp/);
  assert.match(html, /id="mgRacialDetails"/);
});

test('small thumbnails do not expand the character picker or replace native sheet scrolling', () => {
  assert.match(css, /#mgSlotDialog \.mg-choice-art\s*\{[^}]*width:\s*32px; height:\s*32px;/);
  assert.match(mobile, /updateSlotChoiceStates\('\[data-racial\]', draft\.racial\);\s*updateRacialDetails\(\);/);
});