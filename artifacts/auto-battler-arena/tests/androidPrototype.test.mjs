import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import config from '../capacitor.config.ts';
import { isAndroidPrototype } from '../src/lib/nativePrototype.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Android prototype targets only the verified HTTPS game with local error assets', () => {
  assert.equal(config.server.url, 'https://auto-battler-arena.replit.app');
  assert.equal(config.server.cleartext, false);
  assert.equal(config.android.allowMixedContent, false);
  assert.equal(config.android.webContentsDebuggingEnabled, false);
  assert.equal(config.appId, 'com.fantasyworldarenas.prototype');
  assert.equal(config.appendUserAgent.trim(), 'FantasyWorldArenasAndroidPrototype/1.0');
  assert.ok(!config.server.allowNavigation?.includes('*'));
  for (const file of ['index.html', config.server.errorPath]) {
    assert.ok(existsSync(new URL(`../${config.webDir}/${file}`, import.meta.url)));
    assert.ok(read(`${config.webDir}/${file}`).includes(config.server.url));
  }
});

test('native-only UI guard leaves normal Android and desktop browsers unchanged', () => {
  assert.equal(isAndroidPrototype('Mozilla/5.0 (Linux; Android 16) Chrome/140.0'), false);
  assert.equal(isAndroidPrototype('Mozilla/5.0 (iPhone) Safari/604.1'), false);
  assert.equal(isAndroidPrototype('Mozilla/5.0 Chrome/140.0 FantasyWorldArenasAndroidPrototype/1.0'), true);
});

// General web tests can run before native assets are generated. android:check
// explicitly syncs first, so its dedicated pass always exercises this check.
test('synced Android configuration matches the source', {
  skip: !existsSync(new URL('../android/app/src/main/assets/capacitor.config.json', import.meta.url))
    ? 'Run android:check to generate and validate native assets' : false,
}, () => {
  const synced = JSON.parse(read('android/app/src/main/assets/capacitor.config.json'));
  assert.deepEqual(synced.server, config.server);
});

test('native request guard agrees with the hosted game without altering other requests', () => {
  const policy = read('android/app/src/main/java/com/fantasyworldarenas/prototype/PrototypePolicy.java');
  assert.ok(policy.includes(`"${new URL(config.server.url).hostname}".equals(host)`));
  const activity = read('android/app/src/main/java/com/fantasyworldarenas/prototype/MainActivity.java');
  assert.match(activity, /PrototypePolicy\.blocksCheckout/);
  assert.match(activity, /403, "Forbidden"/);
  assert.match(activity, /super\.shouldInterceptRequest/);
  assert.match(activity, /getOnBackPressedDispatcher/);
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /android:usesCleartextTraffic="false"/);
});
