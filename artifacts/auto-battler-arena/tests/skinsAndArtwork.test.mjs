import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/game.html', import.meta.url), 'utf8');
const publicDir = new URL('../public/', import.meta.url);

function section(start, end) {
  const from = html.indexOf(start), to = html.indexOf(end, from + start.length);
  assert.ok(from !== -1 && to !== -1, `Missing game section: ${start}`);
  return html.slice(from, to);
}

test('a selected skin is captured on the player combatant, not the opponent', () => {
  const game = {
    CLASS_STATS: { warrior: { name: 'Warrior', hp: 100, speed: 10, range: 20, dmg: 15, atkCd: 1, melee: true } },
    entityIdCounter: 0,
    rand: () => 0,
    makeStatus: () => ({}),
    playerProfile: { skins: { warrior: 'royalVanguard' } },
    equippedSkin: classId => classId === 'warrior' ? 'royalVanguard' : 'default',
    talentStatMods: () => ({ hp: 1, damage: 1, attackSpeed: 1, move: 1, healing: 1, shield: 1, dot: 1 }),
    applyTalentSpawnPassives: () => {},
  };
  vm.runInNewContext(section('function createEntity(', 'function createPet('), game);
  assert.equal(game.createEntity('warrior', 'player', 0, 0).skinId, 'royalVanguard');
  assert.equal(game.createEntity('warrior', 'enemy', 0, 0).skinId, 'default');
});

test('alternate skin details are drawn on the live renderer path', () => {
  const hero = section('function drawHeroBody(', 'function renderHeroSprite(');
  assert.match(hero, /drawWarriorV3[\s\S]*?drawDistinctSkin\(bctx,e,baseClass,skinId,t,castGlow,swingCurve,movingAmtV3\);\s*bctx\.restore\(\);\s*return;/);
  assert.match(hero, /drawClassV3[\s\S]*?drawDistinctSkin\(bctx,e,baseClass,skinId,t,castGlow,swingCurve,movingAmtV3\);\s*bctx\.restore\(\);\s*bctx\.restore\(\);\s*return;/);
  assert.match(html, /<script src="\.\/skin-armor\.js"><\/script>/);
  const skin = {};
  vm.runInNewContext(section('function drawSkinDetail(', 'function drawHeroBody('), skin);
  let strokes = 0;
  const ctx = Object.fromEntries(['save','restore','beginPath','moveTo','lineTo','closePath','arc','quadraticCurveTo','fill'].map(k => [k, () => {}]));
  ctx.stroke = () => { strokes++; };
  skin.drawSkinDetail(ctx, 'warrior', 'default', '#fff');
  assert.equal(strokes, 0);
  skin.drawSkinDetail(ctx, 'warrior', 'royalVanguard', '#fff');
  assert.ok(strokes > 0);
});

test('all 18 equipped skins have distinct combat-scale armor and keep canvas state balanced', () => {
  const skin = {};
  vm.runInNewContext(readFileSync(new URL('../public/skin-armor.js', import.meta.url), 'utf8'), skin);
  vm.runInNewContext(section('const CHARACTER_SKINS=', 'function equippedSkin(') + '\nthis.skins=CHARACTER_SKINS;', skin);
  const signatures = new Set();
  let count = 0;
  for (const [classId, options] of Object.entries(skin.skins)) {
    for (const skinId of Object.keys(options).filter(id => id !== 'default')) {
      const operations = [];
      let saves = 0;
      const ctx = {
        save: () => { saves++; },
        restore: () => { saves--; },
        beginPath: () => {},
        closePath: () => {},
        moveTo: (...args) => operations.push(['move', ...args]),
        lineTo: (...args) => operations.push(['line', ...args]),
        ellipse: (...args) => operations.push(['ellipse', ...args]),
        fill() { operations.push(['fill', this.fillStyle]); },
        stroke() { operations.push(['stroke', this.strokeStyle]); },
      };
      skin.drawDistinctSkin(ctx, { id: 1 }, classId, skinId, 1, 0.2, 0.3, 0.1);
      assert.equal(saves, 0, `${skinId} leaked a canvas transform`);
      assert.ok(operations.length > 18, `${skinId} has no substantial armor artwork`);
      signatures.add(JSON.stringify(operations));
      count++;
    }
  }
  assert.equal(count, 18);
  assert.equal(signatures.size, 18);
});

test('match cast names resolve to the same collectible art as the equipped build', () => {
  const game = {};
  vm.runInNewContext([
    section('const CLASS_DESC =', 'const CUSTOM_ABILITIES ='),
    section('const CUSTOM_ABILITIES =', 'const DEFAULT_ABILITY_ROLE ='),
    section('const MAGE_POLYMORPH_ULT =', 'const CAPTAIN_BONUS ='),
    section('const MATCH_ART_ALIASES=', 'function abilityLabel('),
    'this.resolveMatchArt=resolveMatchAbilityArtName;',
  ].join('\n'), game);
  const cases = {
    frostmage: [['Glacial Bolt — 1s', 'Glacial Bolt'], ['FIRESTORM!', 'Firestorm'], ['Hexform...', 'Hexform']],
    priest: [['UMBRAL ASCENSION!', 'Umbral Ascension'], ['Revive...', 'Revive'], ['Sanctuary Shield!', 'Sanctuary Shield']],
    warrior: [['STEEL CYCLONE!', 'Steel Cyclone'], ['Cleave!', 'Cleave']],
    rogue: [['UMBRAL STEP!', 'Umbral Step'], ['Smoke Veil!', 'Smoke Veil']],
    paladin: [['Divine Stand!', 'Divine Stand'], ['Blessing of Light!', 'Blessing of Light']],
    archer: [['Piercing Shot...', 'Piercing Shot'], ['BEAST COMMAND!', 'Beast Command']],
    warlock: [['Chaos Lance...', 'Umbral Bolt'], ['DARK PACT!', 'Dark Pact']],
    druid: [['Rebirth!', 'Wild Surge'], ['Tiger Form!', 'Tiger Form']],
    shaman: [['Spirit Mend...', 'Spirit Mend'], ['ELEMENTAL FURY!', 'Elemental Fury']],
  };
  for (const [classId, labels] of Object.entries(cases)) {
    for (const [label, expected] of labels) {
      assert.equal(game.resolveMatchArt({ classId }, label), expected, `${classId}: ${label}`);
      const slug = expected.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      assert.ok(existsSync(new URL(`collectibles/${classId}-${slug}.webp`, publicDir)), `${expected} has no match image`);
    }
  }
  assert.equal(game.resolveMatchArt({ classId: 'warrior', isPet: true }, 'Cleave!'), null);
  assert.match(html, /renderSideBars\(\);\s*renderMatchLoadout\(\);\s*updateRacialBtn\(\)/);
});

test('every spell, ultimate and talent card artwork resolves to an existing file', () => {
  const game = {};
  vm.runInNewContext(section('function collectibleArtUrl(', 'function renderProfileCollection('), game);
  vm.runInNewContext(section('const CLASS_DESC =', 'const CUSTOM_ABILITIES =') + '\nthis.classDescriptions=CLASS_DESC;', game);
  vm.runInNewContext(section('const CUSTOM_ABILITIES =', 'const DEFAULT_ABILITY_ROLE =') + '\nthis.customAbilities=CUSTOM_ABILITIES;', game);
  vm.runInNewContext(section('const MAGE_POLYMORPH_ULT =', 'const CAPTAIN_BONUS =') + '\nthis.customUltimates=CUSTOM_ULTS;', game);
  vm.runInNewContext(section('const CLASS_TALENTS=', 'let talentViewClass=null;') + '\nthis.talents=CLASS_TALENTS;', game);
  const names = [];
  for (const [classId, lines] of Object.entries(game.classDescriptions)) {
    for (const line of lines) {
      if (!line.p) names.push([classId, line.t.replace(/^ULT:\s*/, '').replace(/\s*\([^)]*\)$/, '')]);
    }
  }
  for (const [classId, ability] of Object.entries(game.customAbilities)) names.push([classId, ability.label]);
  for (const [classId, ultimate] of Object.entries(game.customUltimates)) {
    names.push([classId, classId === 'frostmage' ? 'Firestorm' : classId === 'shaman' ? 'Elemental Fury' : ultimate.label]);
  }
  names.push(['frostmage', 'Hexform']);
  for (const [classId, talents] of Object.entries(game.talents)) {
    for (const talent of talents) names.push([classId, talent.name]);
  }
  assert.equal(names.length, 68);
  const uniqueImages = new Set();
  for (const [classId, name] of names) {
    const url = game.collectibleArtUrl(classId, name);
    assert.ok(existsSync(new URL(url.slice(1), publicDir)), `Missing artwork: ${url}`);
    const image = readFileSync(new URL(url.slice(1), publicDir));
    assert.equal(image.toString('ascii', 0, 4), 'RIFF', `Not an image: ${url}`);
    assert.equal(image.toString('ascii', 8, 12), 'WEBP', `Not a WebP: ${url}`);
    uniqueImages.add(createHash('sha256').update(image).digest('hex'));
    assert.match(game.collectibleArtHtml(classId, name), /<img src="\/collectibles\/.+\.webp"/);
  }
  assert.equal(uniqueImages.size, 68, 'Each ability must have its own illustration');
  assert.match(game.spellCardHtml('🌟', 'Revive', 'Ultimate', 'Revives an ally', true, true, 'priest', 'Revive'), /priest-revive\.webp/);
});