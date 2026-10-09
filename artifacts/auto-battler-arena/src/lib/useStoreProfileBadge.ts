import { useEffect, type RefObject } from 'react';
import { getGetStoreQueryKey, useGetStore } from '@workspace/api-client-react';

/** Server-earned decoration; preview badges remain visibly identified as tests. */
export function useStoreProfileBadge(frame: RefObject<HTMLIFrameElement | null>, ready: boolean, owner: string | null | undefined) {
  const store = useGetStore({ query: {
    queryKey: getGetStoreQueryKey(), enabled: ready && !!owner,
    refetchOnWindowFocus: true, staleTime: 20_000,
  } });
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!ready || !doc) return;
    doc.getElementById('store-preview-profile-badge')?.remove();
    const earned = store.data?.earnedBadges?.includes('rogue-week');
    if (!owner || !store.data?.signedIn || (!earned && !store.data.previewBadges.includes('rogue-week'))) return;
    const anchor = doc.getElementById('profileName')?.parentElement;
    if (!anchor) return;
    const badge = doc.createElement('div');
    badge.id = 'store-preview-profile-badge';
    badge.dataset.testid = 'badge-profile-rogue-week';
    badge.textContent = earned ? 'Rogue Week · prestige badge' : 'Rogue Week · earned test badge';
    badge.title = earned ? 'Permanent prestige badge earned through your paid Rogue Week track.' : 'Preview prestige badge. Test claims do not grant real paid ownership.';
    badge.style.cssText = 'margin-top:6px;display:inline-block;color:#dfc4ff;border:1px solid #8963ad;background:#20162f;border-radius:6px;padding:5px 8px;font-size:11px;font-weight:700';
    anchor.appendChild(badge);
    return () => { badge.remove(); };
  }, [frame, ready, owner, store.data]);
}
