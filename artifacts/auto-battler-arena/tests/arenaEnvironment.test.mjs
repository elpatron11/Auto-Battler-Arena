import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, statSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/game.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../public/arena-environment.js', import.meta.url), 'utf8');
const hook = '  if(window.ArenaEnvironment && window.ArenaEnvironment.draw(ctx,activeArena,WALLS,performance.now()/1000))return;\n';
const maps = vm.runInNewContext('(' + html.match(/const ARENA_MAPS = ([\s\S]*?);\nfunction applyArenaMap/)[1] + ')');
function freeze(value) {
  Object.values(value).forEach(child => { if (child && typeof child === 'object') freeze(child); });
  return Object.freeze(value);
}
freeze(maps);

function mockContext() {
  const counts = {};
  const values = {globalAlpha: 1, globalCompositeOperation: 'source-over', canvas: {width: 1080, height: 650}};
  const stack = [];
  return new Proxy(values, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'counts') return counts;
      if (key === 'save') return () => stack.push({...target});
      if (key === 'restore') return () => Object.assign(target, stack.pop() || {});
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({addColorStop() {}});
      if (key === 'measureText') return text => ({width: text.length * 5});
      return () => {counts[key] = (counts[key] || 0) + 1;};
    },
    set(target, key, value) {target[key] = value; return true;},
  });
}
function renderer() {
  const canvases = [], images = [];
  const window = {};
  const math = Object.create(Math);
  math.random = () => {throw new Error('Environment must not consume gameplay RNG');};
  const document = {
    currentScript: {src: 'https://game.test/arena/arena-environment.js'},
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const context = mockContext();
      const canvas = {width: 0, height: 0, getContext: () => context};
      canvas.context = context;
      canvases.push(canvas);
      return canvas;
    },
  };
  class Image {
    constructor() {images.push(this); this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0;}
  }
  vm.runInNewContext(source, {window, document, Image, URL, Math: math, console,
    performance: {now: () => 1000}});
  return {api: window.ArenaEnvironment, canvases, images};
}

test('environment hook stays isolated from the approved gameplay and reward baseline', () => {
  assert.equal(html.split(hook).length, 2, 'exactly one isolated rendering hook');
  const baseline = html.replace(hook, '');
  const bodies = [...baseline.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).filter(body => body.trim());
  assert.equal(createHash('sha256').update(JSON.stringify(bodies)).digest('hex'),
    '5c5615d934e16986b8b863a239067fc4413ad034535a0bd7d6a886622573c9b5');
  assert.ok(html.indexOf('HourlyDungeonPresentation.drawArena(ctx,state)') < html.indexOf(hook));
});

test('both actual arena definitions are read-only and rendered at their original dimensions', () => {
  const h = renderer();
  assert.equal(Object.isFrozen(h.api), true);
  for (const [id, width, height, wallCount] of [['citadel', 900, 560, 6], ['ruins', 1080, 650, 8]]) {
    const arena = maps[id], before = JSON.stringify(arena);
    assert.equal(arena.w, width); assert.equal(arena.h, height);
    assert.equal(arena.walls.length, wallCount);
    assert.equal(h.api.draw(mockContext(), arena, arena.walls, 1), true);
    assert.equal(JSON.stringify(arena), before);
  }
});

test('a warm arena frame blits cached artwork rather than rebuilding static scenery', () => {
  const h = renderer(), context = mockContext();
  const arena = maps.citadel;
  h.api.draw(context, arena, arena.walls, 0);
  const allocated = h.canvases.length;
  const before = context.counts.drawImage || 0;
  for (let frame = 0; frame < 120; frame++) h.api.draw(context, arena, arena.walls, frame / 60);
  assert.equal(h.canvases.length, allocated);
  assert.ok(allocated <= 2, 'bounded static canvas memory');
  const blits = (context.counts.drawImage || 0) - before;
  assert.ok(blits >= 120 && blits <= 120 * 5, 'one static blit, at most four optional sprite overlays');
  assert.equal(context.globalAlpha, 1);
  assert.equal(context.globalCompositeOperation, 'source-over');
});

test('the cache retains both maps rather than rebuilding when maps alternate', () => {
  const h = renderer(), context = mockContext();
  h.api.draw(context, maps.citadel, maps.citadel.walls, 0);
  h.api.draw(context, maps.ruins, maps.ruins.walls, 0);
  const allocated = h.canvases.length;
  for (let i = 0; i < 20; i++) {
    const arena = i % 2 ? maps.citadel : maps.ruins;
    h.api.draw(context, arena, arena.walls, i);
  }
  assert.equal(h.canvases.length, allocated);
  assert.ok(allocated <= 2);
});

test('unsupported maps keep their existing renderer and arena state', () => {
  const h = renderer(), context = mockContext();
  assert.equal(h.api.draw(context, maps.hourlyDungeon, maps.hourlyDungeon.walls, 0), false);
  assert.equal(context.counts.drawImage || 0, 0);
  assert.equal(h.canvases.length, 0);
});

test('image loading is artifact-relative and failed textures retain a working procedural floor', () => {
  const h = renderer();
  assert.equal(h.images.length, 0, 'only load the arena texture when that arena is used');
  h.api.draw(mockContext(), maps.citadel, maps.citadel.walls, 0);
  h.api.draw(mockContext(), maps.ruins, maps.ruins.walls, 0);
  assert.equal(h.images.length, 3, 'two arena backgrounds and one forest scenery atlas');
  for (const image of h.images) {
    assert.match(image.src, /^https:\/\/game\.test\/arena\/assets\/arena-environments\/(?:forest-ground|dungeon-ground|forest-props)\.webp(?:\?forest-scenery=2)?$/);
    image.onerror?.();
  }
  assert.equal(h.api.draw(mockContext(), maps.ruins, maps.ruins.walls, 1), true);
});

test('a successfully loaded texture rebakes its existing canvas only once', () => {
  const h = renderer(), context = mockContext(), arena = maps.citadel;
  h.api.draw(context, arena, arena.walls, 0);
  const allocated = h.canvases.length;
  const image = h.images[0];
  image.naturalWidth = 900; image.naturalHeight = 560; image.complete = true; image.onload();
  h.api.draw(context, arena, arena.walls, 1);
  h.api.draw(context, arena, arena.walls, 2);
  assert.equal(h.canvases.length, allocated);
});

test('loaded forest scenery paints dimensional sprites once and retains the warm-frame budget', () => {
  const h = renderer(), context = mockContext(), arena = maps.ruins;
  const before = JSON.stringify(arena);
  h.api.draw(context, arena, arena.walls, 0);
  assert.equal(h.images.length, 2, 'forest-only loads no dungeon art');
  for (const image of h.images) {
    image.naturalWidth = image.src.includes('forest-props') ? 1200 : 1080;
    image.naturalHeight = image.src.includes('forest-props') ? 800 : 650;
    image.complete = true;
    image.onload();
  }
  h.api.draw(context, arena, arena.walls, 1);
  const canvas = h.canvases[0];
  assert.ok((canvas.context.counts.drawImage || 0) >= 13, 'background plus original covers and four painted torch columns');
  const staticBlits = canvas.context.counts.drawImage, mainBlits = context.counts.drawImage;
  for (let frame = 0; frame < 120; frame++) h.api.draw(context, arena, arena.walls, frame / 60);
  assert.equal(h.canvases.length, 1);
  assert.equal(canvas.context.counts.drawImage, staticBlits, 'no sprite painting or texture work per warm frame');
  assert.equal(context.counts.drawImage - mainBlits, 120, 'one cached environment blit per frame');
  assert.equal(JSON.stringify(arena), before, 'art leaves all eight original collider definitions unchanged');
});

test('background asset sizes remain bounded for mobile', () => {
  for (const name of ['forest', 'dungeon']) {
    const file = new URL(`../public/assets/arena-environments/${name}-ground.webp`, import.meta.url);
    assert.ok(statSync(file).size <= 350_000, 'one optimized texture, not realtime geometry or a giant atlas');
  }
  assert.ok(statSync(new URL('../public/assets/arena-environments/forest-props.webp', import.meta.url)).size <= 450_000,
    'one bounded compressed atlas for all forest props');
  assert.doesNotMatch(source, /\b(?:requestAnimationFrame|setInterval|WebGLRenderer|fetch|rand)\s*\(/);
  assert.doesNotMatch(source, /(?:window|globalThis)\.(?:state|WALLS|ARENA_MAPS|GAP_POINT|activeArena)\s*=/);
});
