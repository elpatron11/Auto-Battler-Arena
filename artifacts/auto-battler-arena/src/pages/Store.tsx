import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, Award, Coins, X } from 'lucide-react';
import { getGetEconomyQueryKey, getGetStoreQueryKey, getGetStoreCheckoutQueryKey, useClaimStoreReward, useClaimStoreTestReward, useGetEconomy, useGetStore, useCreateStoreCheckout, useGetStoreCheckout } from '@workspace/api-client-react';
import type { StoreOffer, StoreReward, StoreState } from '@workspace/api-client-react';
import { classNames } from '../data/itemCatalog';
import { gameErrorMessage } from '../lib/gameError';
import { isAndroidPrototype } from '../lib/nativePrototype';
import { StoreSkinArt } from '../components/StoreSkinArt';
import './Store.css';

export type StoreSection = 'featured' | 'battle-pass';
type Tab = 'featured' | 'battle-pass' | 'classes' | 'spells' | 'cosmetics';
type Props = { embedded?: boolean; onClose?: () => void; onOpenClasses?: () => void; initialSection?: StoreSection };

const TABS: [Tab, string][] = [['featured', 'Featured'], ['battle-pass', 'Battle Pass'], ['classes', 'Classes'], ['spells', 'Spells'], ['cosmetics', 'Cosmetics']];
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
const asset = (p: string) => `${import.meta.env.BASE_URL}${p.replace(/^\/+/, '')}`;
const portrait = (classId: string) => classId === 'druid' ? `${base}/class-portraits/druid-full.png` : `${base}/class-portraits/${classId}.jpg`;

function fmt(ms: number) {
  if (ms <= 0) return 'Ended';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${String(m).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`;
}

/** Offset between server and device clocks, so timers follow the server. */
function useServerNow(serverTime: string | undefined) {
  const offset = useRef(0);
  useEffect(() => { if (serverTime) offset.current = Date.parse(serverTime) - Date.now(); }, [serverTime]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  return now + offset.current;
}

function Art({ offer }: { offer: StoreOffer }) {
  if (offer.kind === 'skin' && (offer.classId === 'paladin' || offer.classId === 'warrior'))
    return <StoreSkinArt id={offer.classId} label={offer.name} />;
  return <div className="st-art st-card-art"><img src={asset(offer.art)} alt="" onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = portrait(offer.classId); }} /></div>;
}

function Timer({ at, now, onExpire }: { at: string | null; now: number; onExpire: () => void }) {
  const left = at ? Date.parse(at) - now : 0;
  const fired = useRef(false);
  useEffect(() => { if (at && left <= 0 && !fired.current) { fired.current = true; onExpire(); } if (left > 0) fired.current = false; }, [at, left, onExpire]);
  if (!at) return null;
  return <span className="st-timer" data-testid="text-offer-timer">{left > 0 ? `Rotates in ${fmt(left)}` : 'Refreshing'}</span>;
}

export default function Store({ embedded = false, onClose, onOpenClasses, initialSection = 'featured' }: Props) {
  const [, navigate] = useLocation();
  const { isLoaded, isSignedIn } = useAuth();
  const qc = useQueryClient();
  const store = useGetStore({ query: { queryKey: getGetStoreQueryKey(), enabled: isLoaded, refetchOnMount: 'always', refetchOnWindowFocus: true, refetchInterval: 30000 } });
  const economy = useGetEconomy({ query: { enabled: !!isSignedIn, queryKey: getGetEconomyQueryKey() } });
  const purchase = useCreateStoreCheckout();
  const claim = useClaimStoreTestReward();
  const liveClaim = useClaimStoreReward();
  const [tab, setTab] = useState<Tab>(initialSection);
  const [pending, setPending] = useState<StoreOffer | null>(null);
  const [error, setError] = useState('');
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id') ?? '';
  const returned = params.get('checkout');
  const checkoutStatus = useGetStoreCheckout(sessionId, { query: {
    queryKey: getGetStoreCheckoutQueryKey(sessionId),
    enabled: isLoaded && !!isSignedIn && returned === 'success' && /^cs_(?:test|live)_[a-zA-Z0-9_]+$/.test(sessionId),
    // A freshly returned tab can briefly precede the auth token binding.
    retry: 2,
    retryDelay: 1000,
    refetchInterval: query => query.state.data?.status === 'pending' ? 2000 : false,
  } });
  useEffect(() => {
    if (checkoutStatus.data) qc.setQueryData(getGetStoreQueryKey(), checkoutStatus.data.store);
  }, [qc, checkoutStatus.data]);
  const [claimError, setClaimError] = useState('');
  const [claiming, setClaiming] = useState('');
  const data = store.data as StoreState | undefined;
  const nativePrototype = isAndroidPrototype();
  const isLive = data?.checkoutMode === 'live';
  const economyVersion = useRef('');
  useEffect(() => {
    if (!data || data.checkoutMode !== 'live') return;
    const version = JSON.stringify([data.offers.map(o => o.owned), data.pass.purchasedAt,
      data.pass.claimedGold, data.pass.rewards.map(r => r.state)]);
    if (economyVersion.current !== version) {
      economyVersion.current = version;
      void qc.invalidateQueries({ queryKey: getGetEconomyQueryKey() });
    }
  }, [data, qc]);
  const now = useServerNow(data?.serverTime);
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const refetch = store.refetch;
  const onExpire = useCallback(() => { void refetch(); }, [refetch]);
  const expiredPass = useRef('');
  useEffect(() => {
    if (data && Date.parse(data.pass.endsAt) <= now && expiredPass.current !== data.pass.id) {
      expiredPass.current = data.pass.id;
      onExpire();
    }
  }, [data, now, onExpire]);
  useEffect(() => setTab(initialSection), [initialSection]);

  const close = () => { if (embedded) onClose?.(); else navigate(isSignedIn ? '/play' : '/try'); };
  const openClasses = onOpenClasses ?? (() => navigate(isSignedIn ? '/play?open=classes' : '/try?open=classes'));
  const openBuy = (offer: StoreOffer) => {
    if (nativePrototype) return;
    trigger.current = document.activeElement as HTMLElement;
    if (!isSignedIn || data?.signedIn === false) { navigate('/sign-in'); return; }
    purchase.reset(); setError(''); setCheckoutUrl(''); setPending(offer);
  };
  const closeBuy = () => { if (purchase.isPending) return; setPending(null); window.setTimeout(() => trigger.current?.focus(), 0); };
  useEffect(() => { if (pending) dialog.current?.focus(); }, [pending]);
  const confirm = async () => {
    if (!pending || nativePrototype) return;
    setError('');
    // Open synchronously from the user's click; leave the running game untouched.
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    try {
      const next = await purchase.mutateAsync({ data: { offerId: pending.id } });
      const url = new URL(next.url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Invalid Stripe checkout address.');
      setCheckoutUrl(next.url);
      if (popup && !popup.closed) popup.location.replace(next.url);
    } catch (e) { popup?.close(); setError(gameErrorMessage(e, 'store')); void store.refetch(); }
  };
  const doClaim = async (r: StoreReward) => {
    if (!data) return;
    setClaiming(r.id); setClaimError('');
    try {
      const input = { data: { passId: data.pass.id, rewardId: r.id } };
      qc.setQueryData(getGetStoreQueryKey(), await (isLive ? liveClaim.mutateAsync(input) : claim.mutateAsync(input)));
      if (isLive) await qc.invalidateQueries({ queryKey: getGetEconomyQueryKey() });
    }
    catch (e) { setClaimError(gameErrorMessage(e, 'store')); void store.refetch(); }
    finally { setClaiming(''); }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeBuy(); return; }
    if (e.key !== 'Tab' || !dialog.current) return;
    const f = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')];
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const owned = useMemo(() => new Set((economy.data?.unlocks ?? []).filter(u => u.kind === 'class').map(u => u.itemId)), [economy.data]);
  const classPrices = economy.data?.config.classPrices;
  const quotedClassPrice = Array.isArray(classPrices) && typeof classPrices[owned.size] === 'number'
    ? classPrices[owned.size] as number : economy.data?.config.classPriceAfterTenth;
  const offers = data?.offers ?? [];
  const byKind = (k: string) => offers.filter(o => o.kind === k);
  const enabled = !!data && data.checkoutMode !== 'off';
  const checkoutEnabled = enabled && !!data?.stripeCheckoutEnabled && !nativePrototype;
  const pass = data?.pass;
  const passOffer = offers.find(o => o.kind === 'battle-pass' || o.id === pass?.offerId);

  const buyBtn = (o: StoreOffer) => {
    const state = o.testOwned ? 'Preview active' : o.owned ? 'Owned' : nativePrototype ? 'Purchases disabled in test app' : !enabled ? 'Coming later' : !checkoutEnabled ? 'Checkout unavailable' : `${isLive ? 'Buy' : 'Stripe test checkout'} ${money(o.priceCents)}`;
    const expired = !!o.rotatesAt && Date.parse(o.rotatesAt) <= now;
    return <button type="button" className="st-btn st-gold" disabled={o.testOwned || o.owned || !checkoutEnabled || expired} onClick={() => openBuy(o)} data-testid={`button-buy-${o.id}`}>{expired ? 'Refreshing' : state}</button>;
  };
  const card = (o: StoreOffer, extra = '') => <article key={o.id} className={`st-card st-${o.kind} ${extra}`} data-testid={`card-offer-${o.id}`}>
    <Art offer={o} />
    <div className="st-card-body">
      <span className="st-kind">{o.kind === 'battle-pass' ? 'Battle Pass' : o.kind}{o.classId ? ` · ${classNames[o.classId] ?? o.classId}` : ''}</span>
      <h3>{o.name}</h3><p>{o.description}</p>
      <div className="st-row"><strong className="st-price">{money(o.priceCents)}</strong><Timer at={o.rotatesAt} now={now} onExpire={onExpire} /></div>
      {o.testOwned && <span className="st-preview-badge">Preview only</span>}
      {buyBtn(o)}
      {o.kind === 'battle-pass' && <button type="button" className="st-btn" onClick={() => setTab('battle-pass')} data-testid="button-view-battle-pass">View paid track</button>}
    </div>
  </article>;

  const passBlock = (full: boolean) => pass && <section className="st-pass" data-testid="section-battle-pass">
    <header className="st-pass-head">
      <div><span className="st-kind">Single paid track · {money(pass.priceCents)}</span><h2>{pass.title}</h2><p>{pass.description}</p><p className="st-note">No free track. Rogue class ownership and a Rogue skin are not included.</p></div>
      <div className="st-pass-meta">
        <span data-testid="text-pass-remaining">{Date.parse(pass.endsAt) > now ? `Ends in ${fmt(Date.parse(pass.endsAt) - now)}` : 'Refreshing weekly pass…'}</span>
        <span>Resets Monday 00:00 UTC</span>
        {passOffer && (pass.purchasedAt ? <span className="st-preview-badge" data-testid="status-pass-active">{isLive ? 'Paid pass active' : 'Test pass active'}</span> : buyBtn(passOffer))}
      </div>
    </header>
    <div className="st-bar" role="progressbar" aria-valuemin={0} aria-valuemax={pass.targetWins} aria-valuenow={Math.min(pass.wins, pass.targetWins)} aria-label={`${pass.title} wins`}>
      <i style={{ transform: `scaleX(${Math.min(1, pass.wins / Math.max(1, pass.targetWins))})` }} /></div>
    <p className="st-note" data-testid="text-pass-wins">{pass.wins} / {pass.targetWins} wins. {pass.purchasedAt ? 'Settled real-player Arena wins after activation count, in Duos and Trios, attacking or defending.' : `Wins count only after the ${isLive ? 'paid' : 'test'} pass is activated. Practice, bots and tournaments never count.`}</p>
    {pass.claimedGold > 0 && <p className="st-note" data-testid="text-pass-claimed-gold">{isLive ? 'Gold added to your account' : 'Preview Gold claimed'}: {pass.claimedGold}{!isLive && ' (not added to your real balance)'}</p>}
    {claimError && <p className="st-err" role="alert">{claimError}</p>}
    <ol className="st-rewards">
      {pass.rewards.map(r => <li key={r.id} className={`st-reward is-${r.state}`} data-testid={`reward-${r.id}`}>
        {r.kind === 'gold' ? <span className="st-reward-icon" aria-hidden="true"><Coins size={28}/></span>
          : r.kind === 'badge' ? <span className="st-reward-icon st-badge-icon" aria-hidden="true"><Award size={30}/></span>
          : <img src={asset(r.art)} alt="" onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />}
        <div><span className="st-kind">{r.wins} wins</span><h4>{r.name}</h4><p>{full ? r.description : ''}{r.kind === 'gold' ? ` ${isLive ? 'Gold' : 'Preview Gold'}: ${r.gold}` : ''}</p></div>
        <div className="st-reward-state">
          {r.state === 'available' ? <button type="button" className="st-btn st-gold" disabled={!!claiming || !enabled || Date.parse(pass.endsAt) <= now} onClick={() => void doClaim(r)} data-testid={`button-claim-${r.id}`}>{claiming === r.id ? 'Claiming' : isLive ? 'Claim reward' : 'Claim preview'}</button>
            : <span data-testid={`status-reward-${r.id}`}>{r.state === 'claimed' ? isLive ? 'Claimed' : 'Claimed (preview)' : 'Locked'}</span>}
        </div>
      </li>)}
    </ol>
  </section>;

  return <div className={`store-page${embedded ? ' is-embedded' : ''}`} data-testid="page-store">
    <header className="st-top">
      {embedded ? <button type="button" className="st-btn" onClick={close} data-testid="button-store-close"><X size={16} /> Close</button>
        : <Link href={isSignedIn ? '/play' : '/try'} className="st-btn" data-testid="link-store-back"><ArrowLeft size={16} /> Arena</Link>}
      <h1>Store</h1>
      <span className="st-gold-chip" data-testid="text-store-gold">{economy.data ? `${economy.data.gold.toLocaleString()} Gold` : economy.isError ? 'Gold unavailable' : isSignedIn ? '...' : 'Guest'}</span>
    </header>
    <nav className="st-tabs" role="tablist" aria-label="Store sections">
      {TABS.map(([id, label], index) => <button key={id} id={`st-tab-${id}`} type="button" role="tab" aria-controls="st-panel" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} onKeyDown={e => {
        let next: number;
        if (e.key === 'ArrowRight') next = (index + 1) % TABS.length;
        else if (e.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = TABS.length - 1;
        else return;
        e.preventDefault(); setTab(TABS[next][0]);
        e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
      }} data-testid={`tab-store-${id}`}>{label}</button>)}
    </nav>
    {data && !enabled && <p className="st-banner" data-testid="status-store-disabled">Purchases are coming later. Browsing only.</p>}
    {nativePrototype && <p className="st-banner" data-testid="status-native-prototype">Android test app: purchases are disabled. You can browse the Store and use items already owned on your account.</p>}
    {data && enabled && !nativePrototype && <p className="st-banner">{checkoutEnabled ? isLive ? 'Live payments: purchases charge real money through Stripe. Items are delivered only after the server verifies payment.' : 'Stripe test mode: use a test card only. Test payments activate previews, never real Gold, inventory or ownership.' : isLive ? 'Live checkout is unavailable until the production Stripe connection and prices are ready. No payment can be taken here yet.' : 'Stripe test checkout is temporarily unavailable. Browsing and existing preview rewards remain available.'}</p>}
    {returned === 'canceled' && <p className="st-banner" role="status" data-testid="status-checkout-canceled">Checkout canceled. Canceling does not activate a purchase.</p>}
    {returned === 'success' && <section className="st-banner" role="status" data-testid="status-stripe-return">
      {!isSignedIn ? <><p>Sign in to verify this checkout.</p><Link className="st-btn" href="/sign-in">Sign in</Link></>
        : !/^cs_(?:test|live)_[a-zA-Z0-9_]+$/.test(sessionId) ? 'Invalid Stripe checkout reference. No purchase has been granted.'
        : checkoutStatus.isError ? <><p>Payment verification is unavailable. No unverified purchase will be activated.</p><button className="st-btn" onClick={()=>void checkoutStatus.refetch()}>Retry verification</button></>
        : checkoutStatus.data?.status === 'complete' ? isLive ? 'Stripe payment verified. Your purchase has been delivered to your account.' : 'Stripe test payment verified. Your preview is active; real Gold and ownership are unchanged.'
        : checkoutStatus.data?.status === 'expired' ? 'This checkout expired. No purchase was activated.'
        : <><p>Checking your Stripe payment… Only a verified successful payment activates the purchase.</p><button className="st-btn" onClick={()=>void checkoutStatus.refetch()}>Check again</button></>}
    </section>}
    <main id="st-panel" className="st-main" role="tabpanel" aria-labelledby={`st-tab-${tab}`}>
      {store.isLoading && <div className="st-grid">{[0, 1, 2].map(i => <div key={i} className="skeleton st-skel" />)}</div>}
      {store.isError && !data && <div className="st-empty" role="alert" data-testid="status-store-error"><strong>The Store could not load</strong><button type="button" className="st-btn" onClick={() => void store.refetch()} data-testid="button-store-retry">Retry</button></div>}
      {data && tab === 'featured' && <div className="st-grid" data-testid="section-featured">
        {passOffer && card(passOffer, 'st-hero')}
        {byKind('skin').map(o => card(o))}{byKind('spell').map(o => card(o))}{byKind('ultimate').map(o => card(o))}
      </div>}
      {data && tab === 'battle-pass' && passBlock(true)}
      {data && tab === 'classes' && <section data-testid="section-classes">
        <p className="st-note">Classes you own in your account. Unlocking happens in the Classes screen with Gold.</p>
        {economy.data && !economy.isError && owned.size < Object.keys(classNames).length && typeof quotedClassPrice === 'number' &&
          <p className="st-note" data-testid="text-next-class-price">Next class unlock: {quotedClassPrice.toLocaleString()} Gold. The Classes screen confirms the current price.</p>}
        {economy.isError && <p className="st-err" role="alert">Ownership could not load. <button className="st-btn" onClick={() => void economy.refetch()} data-testid="button-retry-store-classes">Retry</button></p>}
        <div className="st-classes">{Object.entries(classNames).map(([id, name]) => <div key={id} className="st-class" data-testid={`class-${id}`}>
          <img src={portrait(id)} alt={`${name} class portrait`} /><strong>{name}</strong>
          <span>{!isSignedIn ? 'Sign in to see ownership' : economy.isError ? 'Unavailable' : economy.isLoading ? '...' : owned.has(id) ? 'Owned' : 'Not unlocked'}</span></div>)}</div>
        <button type="button" className="st-btn st-gold" onClick={openClasses} data-testid="button-open-classes">Open Classes</button>
      </section>}
      {data && tab === 'spells' && <div className="st-grid" data-testid="section-spells">
        {[...byKind('spell'), ...byKind('ultimate')].map(o => card(o))}
        {!byKind('spell').length && !byKind('ultimate').length && <div className="st-empty"><strong>No rotation right now</strong>Check back soon.</div>}
      </div>}
      {data && tab === 'cosmetics' && <div className="st-grid" data-testid="section-cosmetics">
        {byKind('skin').map(o => card(o))}
        {!!data.earnedBadges?.length && <article className="st-card"><div className="st-card-body"><span className="st-kind">Earned profile badges</span>{data.earnedBadges.map(b => <h3 key={b}><Award size={24}/> {b === 'rogue-week' ? 'Rogue Week' : b}</h3>)}<span className="st-preview-badge">Permanent prestige badge · also shown in Profile</span></div></article>}
        {data.previewBadges.length > 0 && <article className="st-card"><div className="st-card-body"><span className="st-kind">Profile badge previews</span>{data.previewBadges.map(b => <h3 key={b} data-testid={`badge-preview-${b}`}><Award size={24}/> {b === 'rogue-week' ? 'Rogue Week' : b}</h3>)}<span className="st-preview-badge">Earned test badge · also shown in Profile</span></div></article>}
      </div>}
    </main>
    {pending && <div className="st-backdrop" onKeyDown={onKey}>
      <div ref={dialog} className="st-dialog" role="dialog" aria-modal="true" aria-labelledby="st-dlg-title" tabIndex={-1} data-testid="dialog-purchase">
        <h2 id="st-dlg-title">{checkoutUrl ? `Stripe ${isLive ? 'live' : 'test'} checkout ready` : `Stripe ${isLive ? 'live' : 'test'} checkout: ${pending.name}`}</h2>
        {checkoutUrl ? <p role="status" data-testid="text-checkout-ready">Checkout opens in a separate tab so your game stays running. If it did not open, use the link below. Your purchase activates only after the server verifies payment.</p>
          : isLive ? <><p>This is a real-money purchase. Enter payment details only on Stripe. Your account receives the item after payment is verified.</p><p><strong>{money(pending.priceCents)}</strong> one-time charge.{pending.kind === 'battle-pass' && ' This pass ends Monday 00:00 UTC; wins count after activation. It does not renew automatically.'}</p></>
          : <><p>This uses Stripe test mode, not real money. Enter test card details only on Stripe. Successful test payments grant previews, never real Gold, inventory or ownership.</p>
            <p><strong>{money(pending.priceCents)}</strong> test amount. Real charge: none.</p></>}
        {!isLive && <p className="st-note">Test card: 4242 4242 4242 4242 · any future expiry · any 3-digit CVC. Do not use a real card.</p>}
        {error && <p className="st-err" role="alert" data-testid="text-purchase-error">{error}</p>}
        <div className="st-row">
          {checkoutUrl ? <a className="st-btn st-gold" href={checkoutUrl} target="_blank" rel="noopener noreferrer" data-testid="link-stripe-checkout">Open Stripe {isLive ? 'live' : 'test'} checkout</a>
            : <button type="button" className="st-btn st-gold" onClick={() => void confirm()} disabled={purchase.isPending} data-testid="button-confirm-purchase">{purchase.isPending ? 'Opening Stripe…' : error ? 'Try again' : isLive ? `Pay ${money(pending.priceCents)} on Stripe` : 'Continue to Stripe (test)'}</button>}
          <button type="button" className="st-btn" onClick={closeBuy} disabled={purchase.isPending} data-testid="button-cancel-purchase">{checkoutUrl ? 'Close' : 'Cancel'}</button>
        </div>
      </div>
    </div>}
  </div>;
}
