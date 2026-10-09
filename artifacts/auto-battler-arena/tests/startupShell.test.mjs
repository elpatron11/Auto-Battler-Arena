import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const r = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const html = r('../index.html'), shell = r('../public/startup-shell.js'), app = r('../src/App.tsx'), css = r('../public/startup.css');
test('cover is installed before the React module and hides root', () => {
  assert.ok(html.indexOf('startup-shell.js') < html.indexOf('/src/main.tsx'));
  assert.match(css, /html\.arena-starting #root\{visibility:hidden!important/);
});
test('shell holds branding 1.8s, has no fake percentage, and a retry path', () => {
  assert.match(shell, /BRAND_MS = 1800/);
  assert.doesNotMatch(shell, /%/);
  assert.match(shell, /location\.reload/);
  assert.match(css, /prefers-reduced-motion/);
});
test('gate checks origin and source and pings for missed readiness', () => {
  assert.match(app, /e\.origin !== window\.location\.origin/);
  assert.match(app, /e\.source !== f\.contentWindow/);
  assert.match(app, /arena:startup-visible/);
  assert.match(app, /type:'arena:ping'/);
});
