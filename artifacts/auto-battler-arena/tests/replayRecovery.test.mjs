import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearReplays, loadReplays, removeReplay, saveReplay, validReplay } from '../src/lib/replayRecovery.ts';

// An asynchronous transaction stub: completion happens only after all queued writes.
const rows = new Map();
globalThis.indexedDB = {
  open() {
    const request = { result: {
      createObjectStore() {},
      close() {},
      transaction() {
        let pending = 0;
        let completed = false;
        const tx = {
          objectStore() {
            const operation = (action) => {
              pending++;
              const result = { onsuccess: null, result: undefined };
              queueMicrotask(() => {
                result.result = action();
                result.onsuccess?.();
                pending--;
                queueMicrotask(() => {
                  if (!pending && !completed) {
                    completed = true;
                    tx.oncomplete?.();
                  }
                });
              });
              return result;
            };
            return {
              getAll: () => operation(() => [...rows.values()]),
              get: id => operation(() => rows.get(id)),
              put: entry => operation(() => rows.set(entry.id, entry)),
              delete: id => operation(() => rows.delete(id)),
              clear: () => operation(() => rows.clear()),
            };
          },
        };
        return tx;
      },
    } };
    queueMicrotask(() => { request.onupgradeneeded?.(); request.onsuccess?.(); });
    return request;
  },
};

const video = new Blob(['fight'], { type: 'video/webm' });

test('unfinished replays are bounded, scoped to their owner, and removed after confirmation', async () => {
  await clearReplays();
  await saveReplay('player-a', 'one', video);
  assert.deepEqual((await loadReplays('player-a')).map(entry => entry.id), ['one']);
  await saveReplay('player-a', 'two', video);
  await saveReplay('player-a', 'three', video);
  assert.equal((await loadReplays('player-a')).length, 2);
  await removeReplay('player-b', 'three');
  assert.ok((await loadReplays('player-a')).some(entry => entry.id === 'three'));
  await removeReplay('player-a', 'three');
  assert.ok(!(await loadReplays('player-a')).some(entry => entry.id === 'three'));

  await saveReplay('player-b', 'private', video);
  assert.deepEqual(await loadReplays('player-a'), []);
  assert.equal(rows.size, 0, 'switching accounts purges the previous player’s private recording');
  await saveReplay('player-b', 'new', video);
  await clearReplays();
  assert.equal(rows.size, 0);
});

test('invalid and oversized files cannot enter recovery storage', async () => {
  assert.equal(validReplay(new Blob([], { type: 'video/webm' })), false);
  assert.equal(validReplay(new Blob(['text'], { type: 'text/plain' })), false);
  assert.equal(validReplay(new Blob([new Uint8Array(6_000_001)], { type: 'application/vnd.arena.replay+json' })), false);
  await assert.rejects(saveReplay('player-a', 'invalid', new Blob([], { type: 'video/webm' })));
});

test('recovery discards expired recordings', async () => {
  await clearReplays();
  rows.set('expired', { id: 'expired', userId: 'player-a', blob: video, savedAt: Date.now() - 25 * 60 * 60 * 1000 });
  assert.deepEqual(await loadReplays('player-a'), []);
  assert.equal(rows.size, 0);
});