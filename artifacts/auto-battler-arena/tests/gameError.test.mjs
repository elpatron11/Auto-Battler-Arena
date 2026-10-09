import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/gameError.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
runInNewContext(javascript, { exports });
const { gameErrorMessage } = exports;

test('tournament limit and Gold errors keep useful details without showing response text', () => {
  assert.equal(
    gameErrorMessage({ status: 429, message: 'HTTP 429 : Tournament entry limit reached (3 per rolling 24-hour window).' }, 'tournament-entry'),
    'Tournament limit reached — try again later.',
  );
  assert.equal(
    gameErrorMessage({ status: 409, data: { error: 'Insufficient Gold for tournament entry.' } }, 'tournament-entry'),
    'Not enough Gold to enter this tournament.',
  );
  assert.equal(
    gameErrorMessage({ status: 403, data: { error: 'unowned_loadout' } }, 'tournament-entry'),
    'Check your 3v3 squad and try again.',
  );
  assert.equal(
    gameErrorMessage({ status: 429, message: 'HTTP 429', data: { error: 'Daily challenge limit reached for this opponent (3 per UTC day).' } }, 'challenge'),
    'Challenge limit reached for this opponent — try again tomorrow.',
  );
  assert.equal(gameErrorMessage({ status: 409, data: { error: 'Class already unlocked.' } }, 'unlock'), 'Already unlocked.');
});

test('unrecognized response details are never displayed in game notices', () => {
  const technical = { status: 500, message: 'HTTP 500: internal database error', data: { error: 'stack trace here' } };
  for (const action of ['tournament-entry', 'tournament-finish', 'local-reward', 'unlock', 'challenge', 'replay']) {
    assert.doesNotMatch(gameErrorMessage(technical, action), /HTTP|API|server|database|stack trace|500/i);
  }
  assert.equal(gameErrorMessage(technical, 'local-reward'), 'Gold could not be confirmed yet.');
});