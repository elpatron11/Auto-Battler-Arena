// Short-lived, device-local recovery for recordings awaiting server confirmation.
const DB_NAME = 'arena-replay-recovery';
const STORE = 'pending';
const MAX_ITEMS = 2;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_VIDEO_BYTES = 40_000_000;
const MAX_SNAPSHOT_BYTES = 6_000_000;

export interface PendingReplay {
  id: string;
  userId: string;
  blob: Blob;
  savedAt: number;
  order?: number;
}

export function validReplay(blob: Blob): boolean {
  return (blob.type === 'video/webm' || blob.type === 'video/mp4')
    ? blob.size > 0 && blob.size <= MAX_VIDEO_BYTES
    : blob.type === 'application/vnd.arena.replay+json'
      && blob.size > 0 && blob.size <= MAX_SNAPSHOT_BYTES;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Replay recovery storage is blocked.'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error: unknown) => void) => void): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let value: T;
    let received = false;
    tx.oncomplete = () => { db.close(); if (received) resolve(value); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
    try {
      run(tx.objectStore(STORE), result => { value = result; received = true; }, reject);
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

function keepOwnRecent(store: IDBObjectStore, entries: PendingReplay[], userId: string): PendingReplay[] {
  const now = Date.now();
  const owned = entries.filter(entry =>
    typeof entry.id === 'string' && entry.id.length > 0 &&
    entry.userId === userId && entry.blob instanceof Blob && validReplay(entry.blob) &&
    Number.isFinite(entry.savedAt) && entry.savedAt <= now && now - entry.savedAt < MAX_AGE_MS,
  ).sort((a, b) => b.savedAt - a.savedAt || (b.order ?? 0) - (a.order ?? 0)).slice(0, MAX_ITEMS);
  const retained = new Set(owned.map(entry => entry.id));
  for (const entry of entries) if (!retained.has(entry.id)) store.delete(entry.id);
  return owned;
}

export function loadReplays(userId: string): Promise<PendingReplay[]> {
  return withStore('readwrite', (store, resolve) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(keepOwnRecent(store, request.result as PendingReplay[], userId));
  });
}

export function saveReplay(userId: string, id: string, blob: Blob): Promise<void> {
  if (!userId || !id || !validReplay(blob)) return Promise.reject(new Error('Invalid replay.'));
  return withStore<void>('readwrite', (store, resolve) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const existing = request.result as PendingReplay[];
      const order = Math.max(0, ...existing.map(item => Number.isSafeInteger(item.order) ? item.order! : 0)) + 1;
      const entry = { userId, id, blob, savedAt: Date.now(), order };
      store.put(entry);
      keepOwnRecent(store, [...existing, entry], userId);
      resolve();
    };
  });
}

export function removeReplay(userId: string, id: string): Promise<void> {
  return withStore<void>('readwrite', (store, resolve) => {
    const request = store.get(id);
    request.onsuccess = () => {
      if ((request.result as PendingReplay | undefined)?.userId === userId) store.delete(id);
      resolve();
    };
  });
}

export function clearReplays(): Promise<void> {
  return withStore<void>('readwrite', (store, resolve) => { store.clear(); resolve(); });
}