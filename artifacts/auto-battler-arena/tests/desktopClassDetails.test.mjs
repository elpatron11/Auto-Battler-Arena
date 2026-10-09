import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../public/desktop-layout.css', import.meta.url), 'utf8');
const mon = readFileSync(new URL('../public/dungeon-monsters.js', import.meta.url), 'utf8');
test('druid portrait shows full image', () => assert.match(css, /alt="Druid"\][^}]*object-fit:contain/));
test('desktop rules are viewport gated', () => assert.match(css, /@media \(min-width:1024px\)/));
test('boss art adds no randomness', () => assert.ok(!/Math\.random/.test(mon)));
test('first ability tagging', () => {
  const mk = (cls) => ({ classList: { contains: c => cls.includes(c), add(c) { cls.push(c); }, remove(c) { const i = cls.indexOf(c); if (i >= 0) cls.splice(i, 1); } } });
  const lis = [mk(['passive']), mk([]), mk([])];
  const module = { exports: {} };
  new Function('module', readFileSync(new URL('../public/class-details.js', import.meta.url), 'utf8'))(module);
  assert.equal(module.exports.tagCard({ querySelectorAll: () => lis }), 1);
  assert.ok(!lis[0].classList.contains('firstAbility') && lis[1].classList.contains('firstAbility') && !lis[2].classList.contains('firstAbility'));
});
