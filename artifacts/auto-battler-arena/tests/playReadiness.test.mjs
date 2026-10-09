import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../src/pages/Play.tsx', import.meta.url), 'utf8');

test('Play scopes its readiness timeout to the live iframe, not profile/economy query updates', () => {
  const timeoutStart = source.indexOf('useEffect(() => {\n    if (ready || !frameElement) return;', source.indexOf('const attachIframeRef'));
  assert.notEqual(timeoutStart, -1, 'the mounted-frame timeout effect must exist');
  const timerStart = source.indexOf('useEffect(() => {', timeoutStart + 1);
  const timerEnd = source.indexOf('\n  const economyOperations', timerStart);
  assert.ok(timerStart > timeoutStart && timerEnd > timerStart);
  const timeoutEffect = source.slice(timerStart, timerEnd);

  assert.match(timeoutEffect, /iframe\.current === frameElement && frameElement\.isConnected && !iframeReady\.current/);
  assert.match(timeoutEffect, /\}, \[ready, frameElement\]\);/);
  assert.doesNotMatch(timeoutEffect, /profileQuery|economyQuery|loadAttempt/);
});

test('Play restarts readiness for a remounted frame and clears timeout on a ready handshake', () => {
  const refStart = source.indexOf('const attachIframeRef = useCallback(');
  const refEnd = source.indexOf('\n  useHourlyDungeonBridge', refStart);
  assert.ok(refStart >= 0 && refEnd > refStart);
  const refCallback = source.slice(refStart, refEnd);
  assert.match(refCallback, /iframeReady\.current = false/);
  assert.match(refCallback, /gameReadyForChallenge\.current = false/);
  assert.match(refCallback, /setReady\(false\)/);
  assert.match(refCallback, /setLoadTimedOut\(false\)/);

  const readyStart = source.indexOf("if (msg.type === 'arena:ready')");
  const readyEnd = source.indexOf("\n      if (msg.type === 'arena:return-to-arena')", readyStart);
  assert.ok(readyStart >= 0 && readyEnd > readyStart);
  const readyHandler = source.slice(readyStart, readyEnd);
  assert.match(readyHandler, /setReady\(true\)/);
  assert.match(readyHandler, /setLoadTimedOut\(false\)/);

  const listenerEffectStart = source.lastIndexOf('  useEffect(() => {', readyStart);
  const listenerEffectEnd = source.indexOf('\n  const retrySave =', listenerEffectStart);
  assert.ok(listenerEffectStart >= 0 && listenerEffectEnd > listenerEffectStart);
  assert.match(source.slice(listenerEffectStart, listenerEffectEnd), /\[profileQuery\.data\?\.playerId,[^\]]*frameElement\]/);
});