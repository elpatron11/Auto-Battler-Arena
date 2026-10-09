import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = readFileSync(new URL('../public/team-build-ui.js', import.meta.url), 'utf8');
const game = readFileSync(new URL('../public/game.html', import.meta.url), 'utf8');
// Exercise the real ID-returning accessor, not a fabricated object-returning one.
const talentAccessor = game.match(/function classTalents\(key\)\{[\s\S]*?\n\}/)[0];

function fixture({ size = 3, picks = ['warrior'], slots = [0], captain = 'warrior' } = {}) {
  const calls = [];
  const panel = {
    innerHTML: '', focusButtons: [], editButtons: [],
    setAttribute() {},
    querySelectorAll(selector) {
      if (selector === '[data-focus]') {
        this.focusButtons = [...this.innerHTML.matchAll(/data-focus="(\d+)"/g)]
          .map(m => ({ dataset: { focus: m[1] } }));
        return this.focusButtons;
      }
      if (selector === '.tb-stage [data-tb]') {
        this.editButtons = [...this.innerHTML.matchAll(/data-tb="([^"]+)"/g)]
          .map(m => ({ dataset: { tb: m[1] } }));
        return this.editButtons;
      }
      return [];
    },
  };
  const context = vm.createContext({
    document: {
      body: { classList: { contains: () => true } },
      querySelector: () => ({}),
      createElement: () => panel,
      getElementById: id => id === 'teamSlots' ? { insertAdjacentElement() {} }
        : { querySelector: selector => ({ closest: () => ({ scrollIntoView: () => calls.push(selector) }) }) },
    },
    window: { MobileGameUX: { slotPositions: slots, openSlot: p => calls.push(p) } },
    teamSize: size, selected: picks,
    selectedBuilds: picks.map((classId, index) => ({ classId, ability: index ? 'custom' : 'default', ultimate: 'default' })),
    captainClass: captain, captainRacial: null, RACIALS: {},
    playerProfile: { talents: { warrior: ['fortress'], rogue: ['precision'] } },
    CLASS_STATS: { warrior: { name: 'Warrior', role: 'Melee' }, rogue: { name: 'Rogue', role: 'Assassin' } },
    CLASS_PORTRAIT_IMG: { warrior: 'warrior.webp', rogue: 'rogue.webp' },
    CLASS_DESC: { warrior: [{ t: 'Cleave', d: 'Always equipped' }], rogue: [{ t: 'Stab', d: 'Always equipped' }] },
    CLASS_TALENTS: {
      warrior: [{ id: 'fortress', name: 'Fortress', desc: 'Defensive talent' }, { id: 'iron', name: 'Iron Body', desc: 'Another talent' }],
      rogue: [{ id: 'precision', name: 'Precision', desc: 'Rogue talent' }],
    },
    abilityChoice: {}, ultChoice: {},
    escapeHtml: value => String(value ?? ''),
    ownsClass: () => true, isTalentUnlocked: () => true,
    variantArtName: (key, kind, variant) => `${key}-${kind}-${variant}`,
    variantLabel: (key, kind, variant) => `${key}-${kind}-${variant}`,
    variantDesc: () => 'Existing description',
    collectibleArtHtml: (key, name) => {
      assert.equal(typeof name, 'string', 'art must receive a real name, not a talent ID treated as an object');
      return `<img alt="${name}" src="${key}-${name}.webp">`;
    },
    renderSlots: () => 'original slots', showTeamBuilder: () => 'original builder',
    refreshCaptainUI: () => 'original captain refresh',
  });
  vm.runInContext(talentAccessor, context);
  vm.runInContext(script, context);
  return { context, panel, calls };
}

test('focused build resolves actual talent IDs and refreshes when only the talent changes', () => {
  const { context, panel } = fixture();
  assert.match(panel.innerHTML, /Fortress/);
  context.playerProfile.talents.warrior = ['iron'];
  assert.equal(context.renderSlots(), 'original slots');
  assert.match(panel.innerHTML, /Iron Body/);
  assert.doesNotMatch(panel.innerHTML, /Fortress/);
});

test('duplicate classes have one Captain treatment and distinct per-copy spells', () => {
  const { context, panel } = fixture({ picks: ['rogue', 'rogue'], slots: [0, 1], captain: 'rogue' });
  assert.equal([...panel.innerHTML.matchAll(/class="tb-member[^"]*\bcap"/g)].length, 1);
  assert.equal([...panel.innerHTML.matchAll(/class="tb-party-captain"/g)].length, 1);
  panel.focusButtons[1].onclick();
  assert.doesNotMatch(panel.innerHTML, /class="tb-crown"/);
  assert.equal([...panel.innerHTML.matchAll(/class="tb-party-captain"/g)].length, 1);
  assert.match(panel.innerHTML, /rogue-ability-custom/);
  assert.match(panel.innerHTML, /Duplicate heroes share one talent choice/);
  assert.equal(context.selectedBuilds[0].ability, 'default');
  assert.equal(context.selectedBuilds[1].ability, 'custom');
});

test('sparse five-player slots retain their positions and forward edits to the native dialog', () => {
  const { context, panel, calls } = fixture({ size: 5, picks: ['warrior', 'rogue'], slots: [1, 4], captain: null });
  assert.equal(panel.focusButtons.length, 5);
  assert.match(panel.innerHTML, /Choose a hero for slot 1/);
  panel.focusButtons[4].onclick();
  assert.match(panel.innerHTML, /rogue-ability-custom/);
  panel.editButtons.find(b => b.dataset.tb === 'talent').onclick();
  assert.deepEqual(calls, [4, '[data-talent]']);
  assert.deepEqual(Array.from(context.selected), ['warrior', 'rogue']);
  assert.deepEqual(Array.from(context.window.MobileGameUX.slotPositions), [1, 4]);
});

test('legacy Captain refresh updates presentation without losing native side effects', () => {
  const { context, panel } = fixture({ picks: ['warrior', 'rogue'], slots: [0, 1] });
  assert.match(panel.innerHTML, /class="tb-crown"/);
  context.captainClass = 'rogue';
  assert.equal(context.refreshCaptainUI(), 'original captain refresh');
  assert.doesNotMatch(panel.innerHTML, /class="tb-crown"/);
  assert.equal([...panel.innerHTML.matchAll(/class="tb-member[^"]*\bcap"/g)].length, 1);
});
