import { useEffect, useRef, type RefObject } from 'react';
import {
  createDungeonAttempt, finishDungeonAttempt, getDungeonStatus,
  type DungeonAttemptFinishInput,
} from '@workspace/api-client-react';

type Outcome = DungeonAttemptFinishInput['outcome'];
type PendingFinish = { owner: string; id: string; outcome: Outcome; cycle?: number };
const PENDING_KEY = 'arena:pending-hourly-dungeon:v1';
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const outcome = (value: unknown): value is Outcome =>
  value === 'win' || value === 'loss' || value === 'abandoned';

function allPending(): PendingFinish[] {
  try {
    const entries: unknown = JSON.parse(sessionStorage.getItem(PENDING_KEY) || '[]');
    return Array.isArray(entries) ? entries.filter((entry): entry is PendingFinish =>
      !!entry && typeof entry.owner === 'string' && entry.owner.length > 0 &&
      uuid(entry.id) && outcome(entry.outcome)) : [];
  } catch { return []; }
}

function readPending(owner: string): PendingFinish[] {
  return allPending().filter(entry => entry.owner === owner);
}

/** Keep completion recoverable, but never replace a reported win with an exit. */
function storePending(entry: PendingFinish) {
  const previous = allPending();
  const existing = previous.find(item => item.owner === entry.owner && item.id === entry.id);
  if (existing) return existing;
  sessionStorage.setItem(PENDING_KEY, JSON.stringify([...previous, entry]));
  return entry;
}

function clearPending(entry: PendingFinish) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(allPending().filter(item =>
    item.owner !== entry.owner || item.id !== entry.id)));
}

/**
 * The game cannot select an account or write hourly rewards. Only this
 * source-checked host bridge calls the authenticated, idempotent ledger API.
 */
export function useHourlyDungeonBridge(
  frame: RefObject<HTMLIFrameElement | null>,
  userId: string | null | undefined,
  generation: number,
  onGoldConfirmed?: () => void,
) {
  const goldHandler = useRef(onGoldConfirmed);
  goldHandler.current = onGoldConfirmed;
  useEffect(() => {
    if (!userId) return;
    let disposed = false;
    const abort = new AbortController();
    const finishing = new Map<string, Promise<Awaited<ReturnType<typeof finishDungeonAttempt>>>>();
    const registering = new Map<string, Promise<Awaited<ReturnType<typeof createDungeonAttempt>>>>();
    const claimErrors = new Map<string, string>();
    let statusRequest: Promise<Awaited<ReturnType<typeof getDungeonStatus>>> | null = null;
    const postStatus = (data: Awaited<ReturnType<typeof getDungeonStatus>>) => {
      if (!disposed) frame.current?.contentWindow?.postMessage({ type: 'arena:dungeon-status', data }, location.origin);
    };
    const postClaim = (
      entry: PendingFinish, state: 'pending' | 'confirmed' | 'error' | 'expired',
      data?: Awaited<ReturnType<typeof finishDungeonAttempt>>, error?: string,
    ) => {
      if (!disposed) frame.current?.contentWindow?.postMessage({
        type: 'arena:dungeon-claim-state', id: entry.id, outcome: entry.outcome,
        cycle: entry.cycle, state, data, error,
      }, location.origin);
    };
    const restoreClaimView = () => {
      readPending(userId).forEach(entry => postClaim(entry,
        claimErrors.has(entry.id) ? 'error' : 'pending', undefined, claimErrors.get(entry.id)));
    };
    const refresh = () => {
      if (!statusRequest) {
        statusRequest = getDungeonStatus({ signal: abort.signal })
          .then(data => { postStatus(data); return data; })
          .finally(() => { statusRequest = null; });
      }
      return statusRequest;
    };
    const finish = (entry: PendingFinish) => {
      let promise = finishing.get(entry.id);
      if (promise) return promise;
      claimErrors.delete(entry.id);
      postClaim(entry, 'pending');
      promise = finishDungeonAttempt(entry.id, { outcome: entry.outcome }, { signal: abort.signal })
        .then(data => {
          if (!disposed) {
            clearPending(entry);
            if (data.awarded || (data.gold && data.gold > 0)) goldHandler.current?.();
            postStatus(data.status);
            postClaim(entry, entry.outcome === 'win' && !data.status.activeBuff
              ? 'expired' : 'confirmed', data);
          }
          return data;
        }).catch(error => {
          // Expired or nonexistent attempts cannot be rewarded in another hour.
          const status = (error as { status?: number }).status;
          if (!disposed && (status === 404 || status === 410)) {
            clearPending(entry);
            postClaim(entry, 'expired', undefined, 'This dungeon attempt can no longer grant a buff.');
            void refresh().catch(() => {});
          } else if (!disposed) {
            const message = error instanceof Error ? error.message : 'The dungeon claim could not be confirmed.';
            claimErrors.set(entry.id, message);
            postClaim(entry, 'error', undefined, message);
          }
          throw error;
        }).finally(() => finishing.delete(entry.id));
      finishing.set(entry.id, promise);
      return promise;
    };
    const onMessage = (event: MessageEvent) => {
      const target = frame.current?.contentWindow;
      if (disposed || !target || event.source !== target || event.origin !== location.origin) return;
      const msg = event.data;
      if (msg?.type === 'arena:ready') {
        restoreClaimView();
        return;
      }
      if (!msg || msg.type !== 'arena:dungeon-request' || !uuid(msg.requestId)) return;
      let request: Promise<unknown>;
      if (msg.action === 'status') {
        restoreClaimView();
        request = refresh();
      } else if (msg.action === 'start') {
        let registered = registering.get(msg.requestId);
        if (!registered) {
          registered = createDungeonAttempt({ requestId: msg.requestId,heroes:msg.heroes }, { signal: abort.signal })
            .then(data => { postStatus(data.status); return data; })
            .finally(() => registering.delete(msg.requestId));
          registering.set(msg.requestId, registered);
        }
        request = registered;
      } else if (msg.action === 'finish' && uuid(msg.id) && outcome(msg.outcome)) {
        try {
          request = finish(storePending({
            owner: userId, id: msg.id, outcome: msg.outcome,
            cycle: Number.isSafeInteger(msg.cycle) ? msg.cycle : undefined,
          }));
        } catch {
          request = Promise.reject(new Error('Cannot preserve the dungeon result on this device. Enable browser storage and retry.'));
        }
      } else return;
      void request.then(data => {
        if (!disposed && target === frame.current?.contentWindow) target.postMessage({
          type: 'arena:dungeon-response', requestId: msg.requestId, ok: true, data,
        }, location.origin);
      }).catch(error => {
        if (!disposed && target === frame.current?.contentWindow) target.postMessage({
          type: 'arena:dungeon-response', requestId: msg.requestId, ok: false,
          error: error instanceof Error ? error.message : 'Dungeon request failed. Please retry.',
        }, location.origin);
      });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh().catch(() => {});
    };
    window.addEventListener('message', onMessage);
    document.addEventListener('visibilitychange', onVisible);
    // Server-authoritative status recovers across navigation, devices and resets.
    void refresh().catch(() => {});
    readPending(userId).forEach(entry => { void finish(entry).catch(() => {}); });
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh().catch(() => {});
      readPending(userId).forEach(entry => { void finish(entry).catch(() => {}); });
    }, 30_000);
    return () => {
      disposed = true;
      abort.abort();
      window.clearInterval(interval);
      window.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [frame, userId, generation]);
}