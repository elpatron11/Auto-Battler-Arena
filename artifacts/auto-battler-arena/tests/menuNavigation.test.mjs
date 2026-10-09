import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/game.html', import.meta.url), 'utf8');
const bridge = html.split('/* Same-origin host bridge. All combat, orders, build, audio and UI logic above remains native. */')[1]
  ?.split('</script>')[0];

test('the game menu opens Arena and Market through the same-origin host bridge', () => {
  assert.ok(bridge);
  assert.match(html, /id="marketBtn">Market<\/button>/);
  assert.doesNotMatch(html, /id="tutorialBtn"/);
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { style: {}, nextElementSibling: { style: {} }, click() { this.onclick?.(); } });
    return elements.get(id);
  };
  const messages = [];
  const listeners = [];
  let menuOpened = 0;
  let teamOpened = 0;
  const parent = { postMessage: data => messages.push(data) };
  const window = { parent, addEventListener: (type, handler) => {
    if (type === 'message') listeners.push(handler);
  } };
  const context = vm.createContext({
    PRACTICE_ONLY: false,
    window, document: { getElementById: get },
    location: { origin: 'https://arena.example' },
    state: null,
    startBattle() {}, createEntity() {}, showPriorityModal() {}, showOverlay() {},
    showMainHub() { menuOpened++; }, showTeamBuilder() { teamOpened++; },
    setInterval() {}, clearInterval() {}, setTimeout() {}, clearTimeout() {},
  });
  vm.runInContext(bridge, context);
  get('hubOnlineActionBtn').click();
  get('hubArenaBtn').click();
  get('marketBtn').click();
  get('hubMarketBtn').click();
  assert.deepEqual(messages.slice(-4).map(item => item.type),
    ['arena:open-online', 'arena:open-online', 'arena:open-market', 'arena:open-market']);
  const readyCount = messages.filter(item => item.type === 'arena:ready').length;
  listeners.forEach(listener => listener({ origin: 'https://arena.example', source: parent, data: { type: 'arena:ping' } }));
  assert.equal(messages.filter(item => item.type === 'arena:ready').length, readyCount + 1);
  listeners.forEach(listener => listener({ origin: 'https://untrusted.example', source: parent, data: { type: 'arena:ping' } }));
  assert.equal(messages.filter(item => item.type === 'arena:ready').length, readyCount + 1);

  for (const type of ['arena:show-menu', 'arena:show-team']) {
    listeners.forEach(listener => listener({ origin: 'https://arena.example', source: parent, data: { type } }));
  }
  assert.equal(menuOpened, 1);
  assert.equal(teamOpened, 1);
});