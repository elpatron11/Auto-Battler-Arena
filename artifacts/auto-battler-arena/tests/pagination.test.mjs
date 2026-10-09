import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate, clampPage, pageCount } from '../src/lib/pagination.ts';
test('bounds', () => {
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(11), 3);
  assert.equal(clampPage(9, 11), 3);
  assert.equal(clampPage(-2, 11), 1);
  assert.equal(paginate([], 4).page, 1);
});
test('global index start', () => {
  const r = paginate(Array.from({ length: 12 }, (_, i) => i), 3);
  assert.equal(r.start, 10);
  assert.deepEqual(r.items, [10, 11]);
});
test('reset when dataset shrinks', () => {
  assert.equal(paginate([1, 2, 3], 5).page, 1);
});
test('stored high page is clamped then stays valid after expansion', () => {
  const shrunk = paginate([1, 2], 7);
  assert.equal(shrunk.page, 1);
  assert.equal(paginate([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], shrunk.page).page, 1);
});
test('filtered leaderboard keeps global rank', () => {
  const ranked = ['a','me','c','d','e','f','g'].map((p, i) => ({ p, rank: i })).filter(x => x.p !== 'me');
  assert.equal(paginate(ranked, 2).items[0].rank, 6);
});
test('offer board: 100 listings give 20 pages; shrink after purchase clamps', () => {
  const offers = Array.from({ length: 100 }, (_, i) => i);
  assert.equal(paginate(offers, 1).items.length, 5);
  assert.equal(paginate(offers, 20).pages, 20);
  assert.equal(paginate(offers.slice(0, 96), 20).page, 20);
  assert.equal(paginate(offers.slice(0, 95), 20).page, 19);
  assert.equal(paginate([], 3).pages, 1);
});
