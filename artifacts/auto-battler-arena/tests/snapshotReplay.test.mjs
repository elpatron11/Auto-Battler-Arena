import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../src/components/SnapshotReplay.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;
const replay = {
  version: 1, durationMs: 2000,
  frames: [[0, 'data:image/jpeg;base64,YQ=='], [800, 'data:image/jpeg;base64,Yg=='], [1600, 'data:image/jpeg;base64,Yw==']],
};

function mount(body = JSON.stringify(replay)) {
  let slots = [], effects = [], cursor = 0, tree, now = 0, interval;
  const elements = (type, props) => ({ type, props: props || {} });
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => {
        slots[index] = typeof value === 'function' ? value(slots[index]) : value;
      }];
    },
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = effects[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i]))
        effects[index] = { deps, fn, pending: true, cleanup: previous?.cleanup };
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: name => ({
      react,
      'react/jsx-runtime': { jsx: elements, jsxs: elements },
      '@workspace/api-client-react': { getGetArenaRecordingUrl: id => `/api/arena/challenges/${id}/recording` },
    })[name],
    fetch: async (_url, { signal }) => ({ ok: true, text: async () => body, signal }),
    AbortController, JSON, Number, String, Math, Array,
    performance: { now: () => now },
    window: { setInterval: fn => { interval = fn; return 1; }, clearInterval: () => { interval = null; } },
  });
  const render = (id = 'fight-1') => {
    cursor = 0;
    tree = module.exports.SnapshotReplay({ id, opponentName: 'Opponent' });
    for (const effect of effects) {
      if (!effect?.pending) continue;
      effect.cleanup?.();
      effect.pending = false;
      effect.cleanup = effect.fn();
    }
    return tree;
  };
  function find(type, node) {
    if (arguments.length === 1) node = tree;
    if (!node || typeof node !== 'object') return null;
    if (node.type === type) return node;
    const children = [node.props?.children].flat(Infinity);
    return children.map(child => find(type, child)).find(Boolean) || null;
  }
  return {
    render, find,
    tick(ms) { now += ms; assert.ok(interval, 'playback timer is active'); interval(); },
  };
}

test('snapshot seek picks the latest captured frame and pauses playback', async () => {
  const h = mount();
  assert.equal(h.render().props.children, 'Loading snapshot replay…');
  await new Promise(resolve => setImmediate(resolve));
  h.render();
  assert.equal(h.find('img').props.src, replay.frames[0][1]);
  h.find('input').props.onChange({ target: { value: '1200' } });
  h.render();
  assert.equal(h.find('img').props.src, replay.frames[1][1]);
  assert.match(h.find('img').props.alt, /0:01/);
  h.find('input').props.onChange({ target: { value: '1900' } });
  h.render();
  assert.equal(h.find('img').props.src, replay.frames[2][1]);
  assert.equal(h.find('button').props.children, 'Play');
});

test('play, pause, end and replay from the beginning', async () => {
  const h = mount();
  h.render();
  await new Promise(resolve => setImmediate(resolve));
  h.render();
  h.find('button').props.onClick();
  h.render();
  assert.equal(h.find('button').props.children, 'Pause');
  h.tick(900);
  h.render();
  assert.equal(h.find('img').props.src, replay.frames[1][1]);
  h.find('button').props.onClick();
  h.render();
  assert.equal(h.find('button').props.children, 'Play');
  h.find('button').props.onClick();
  h.render();
  h.tick(1200);
  h.render();
  assert.equal(h.find('button').props.children, 'Play');
  assert.equal(h.find('img').props.src, replay.frames[2][1]);
  h.find('button').props.onClick();
  h.render();
  assert.equal(h.find('img').props.src, replay.frames[0][1]);
});

test('invalid or oversized replays show a load error', async () => {
  for (const body of ['{"version":1,"frames":[]}', 'x'.repeat(6_000_001)]) {
    const h = mount(body);
    h.render();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.render().props.role, 'alert');
  }
});