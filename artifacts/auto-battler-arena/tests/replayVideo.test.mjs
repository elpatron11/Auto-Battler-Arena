import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../src/components/ReplayVideo.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;

function mount() {
  const slots = [];
  let cursor = 0;
  const element = (type, props, key) => ({ type, props: props || {}, key });
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: name => ({
      react: {
        useState(initial) {
          const index = cursor++;
          if (!(index in slots)) slots[index] = initial;
          return [slots[index], value => {
            slots[index] = typeof value === 'function' ? value(slots[index]) : value;
          }];
        },
      },
      'react/jsx-runtime': { jsx: element, jsxs: element },
      '@workspace/api-client-react': { getGetArenaRecordingUrl: id => `/api/arena/challenges/${id}/recording` },
      './VideoShare': {VideoShare:()=>null},
    })[name],
  });
  return (contentType = 'video/webm') => {
    cursor = 0;
    return module.exports.ReplayVideo({ id: 'fight-1', opponentName: 'Opponent', contentType }).props.children[0];
  };
}

test('unreadable video shows an authorized download and retry remounts the player', () => {
  const render = mount();
  const video = render();
  assert.equal(video.type, 'video');
  assert.equal(video.props.src, '/api/arena/challenges/fight-1/recording');
  assert.equal(video.props['aria-label'], 'Replay against Opponent');

  video.props.onError();
  const error = render();
  assert.equal(error.props.role, 'alert');
  const [message, actions] = error.props.children;
  assert.match(message.props.children, /could not play the saved fight video/i);
  const [retry, download] = actions.props.children;
  assert.equal(retry.props.children, 'Try again');
  assert.equal(download.props.href, video.props.src);
  assert.equal(download.props.download, 'fight-fight-1.webm');

  retry.props.onClick();
  const retried = render();
  assert.equal(retried.type, 'video');
  assert.equal(retried.props.src, video.props.src);
  assert.notEqual(retried.key, video.key);
  retried.props.onError();
  assert.equal(render().props.role, 'alert');
});

test('MP4 recordings keep their format when downloaded', () => {
  const render = mount();
  render('video/mp4').props.onError();
  const [, actions] = render('video/mp4').props.children;
  assert.equal(actions.props.children[1].props.download, 'fight-fight-1.mp4');
});