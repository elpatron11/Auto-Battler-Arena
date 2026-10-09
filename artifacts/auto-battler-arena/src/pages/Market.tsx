import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useUser } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ArrowUpRight, CircleAlert, Coins, Gem, LockKeyhole, Package, RefreshCw, Search, Shield, ShoppingBag, Sparkles, Swords, X } from 'lucide-react';
import { Link } from 'wouter';
import {
  getGetEconomyQueryKey, getListMarketListingsQueryKey,
  useGetEconomy, useListMarketListings, useCreateMarketListing,
  useCancelMarketListing, usePurchaseMarketListing,
} from '@workspace/api-client-react';
import type { MarketListing, MarketListingKind } from '@workspace/api-client-react';
import { Pager } from '../components/Pager';
import { paginate } from '../lib/pagination';
import { marketErrorText as errorText } from '../lib/marketErrors';
import { SiteHeader } from '../components/SiteHeader';
import { catalogByKey, classNames, itemCatalog } from '../data/itemCatalog';
import './MarketGame.css';

type MarketProps = {
  embedded?: boolean;
  onClose?: () => void;
  onOpenArena?: () => void;
  onOpenPlay?: () => void;
};

type Filter = 'all' | MarketListingKind;
type CatalogStatus = 'all' | 'owned' | 'sale' | 'missing';
const kinds: Filter[] = ['all', 'spell', 'talent', 'ultimate'];
const gold = (value: number) => new Intl.NumberFormat('en-US').format(value);
const title = (id: string) => id.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const kindIcon = (kind: string) => kind === 'ultimate' ? <Gem size={23} strokeWidth={1.6}/> : kind === 'talent' ? <Shield size={23} strokeWidth={1.6}/> : <Sparkles size={23} strokeWidth={1.6}/>;
export default function Market({ embedded = false, onClose, onOpenArena, onOpenPlay }: MarketProps) {
  const { user } = useUser();
  const client = useQueryClient();
  const economy = useGetEconomy();
  const market = useListMarketListings();
  const create = useCreateMarketListing();
  const cancel = useCancelMarketListing();
  const purchase = usePurchaseMarketListing();
  const [filter, setFilter] = useState<Filter>('all');
  const [catalogKind, setCatalogKind] = useState<Filter>('all');
  const [catalogClass, setCatalogClass] = useState('all');
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>('all');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [sort, setSort] = useState<'recent' | 'low' | 'high'>('recent');
  const [selected, setSelected] = useState('');
  const [price, setPrice] = useState('');
  const [confirm, setConfirm] = useState<MarketListing | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [mode, setMode] = useState<'hub' | 'buy' | 'sell'>('hub');
  const dialogRef = useRef<HTMLDivElement>(null);
  const purchasePendingRef = useRef(false);
  purchasePendingRef.current = purchase.isPending;
  const account = economy.data;
  useEffect(() => {
    if (!confirm) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLButtonElement>('[data-testid="button-cancel-purchase"]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !purchasePendingRef.current) {
        event.preventDefault();
        setConfirm(null);
      }
      if (event.key !== 'Tab' || !dialog) return;
      const buttons = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex="0"]'));
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (!dialog.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [confirm]);
  const ownIds = new Set(account?.listings.map(item => item.id) ?? []);
  const owned = (listing: MarketListing) => ownIds.has(listing.id) || (Boolean(user?.id) && listing.sellerId === user?.id);
  const pending = create.isPending || cancel.isPending || purchase.isPending;
  const taxRate = typeof account?.config.marketTax === 'number' ? account.config.marketTax : .1;
  const numericPrice = Number(price);
  const validPrice = /^\d+$/.test(price) && Number.isSafeInteger(numericPrice) && numericPrice > 0;
  const tax = validPrice ? Math.floor(numericPrice * taxRate) : 0;
  const available = useMemo(() => (account?.duplicates ?? []).map(copy => {
    const listed = (account?.listings ?? []).filter(item => item.kind === copy.kind && item.itemId === copy.itemId).length;
    return { ...copy, listed, free: Math.max(0, copy.quantity - listed), key: `${copy.kind}:${copy.itemId}` };
  }), [account]);
  const chosen = available.find(item => item.key === selected);
  const [inventoryPage, setInventoryPage] = useState(1);
  const sparePage = paginate(available.filter(item => item.free > 0), inventoryPage, 8);
  useEffect(() => { if (sparePage.page !== inventoryPage) setInventoryPage(sparePage.page); }, [sparePage.page, inventoryPage]);
  const [ownOfferPage, setOwnOfferPage] = useState(1);
  const ownPage = paginate(account?.listings ?? [], ownOfferPage, 6);
  useEffect(() => { if (ownPage.page !== ownOfferPage) setOwnOfferPage(ownPage.page); }, [ownPage.page, ownOfferPage]);
  const listings = useMemo(() => {
    const items = (market.data ?? []).filter(item => filter === 'all' || item.kind === filter);
    return [...items].sort((a, b) => sort === 'low' ? a.price - b.price : sort === 'high' ? b.price - a.price : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [market.data, filter, sort]);
  const dropCatalog = account?.config.dropCatalog;
  const drops = (dropCatalog && typeof dropCatalog === 'object' && !Array.isArray(dropCatalog)
    ? dropCatalog : {}) as Record<string, unknown>;
  const unlockKeys = new Set(account?.unlocks.map(item => `${item.kind}:${item.itemId}`) ?? []);
  const duplicateCounts = new Map<string, number>();
  for (const copy of account?.duplicates ?? []) {
    const key = `${copy.kind}:${copy.itemId}`;
    duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + copy.quantity);
  }
  const offerCounts = new Map<string, number>();
  for (const offer of market.data ?? []) {
    const key = `${offer.kind}:${offer.itemId}`;
    offerCounts.set(key, (offerCounts.get(key) ?? 0) + 1);
  }
  const catalogItems = itemCatalog.filter(entry => {
    const key = `${entry.kind}:${entry.id === 'variant:polymorph:frostmage' ? 'ult:frostmage' : entry.id}`;
    const isDefault = entry.variant === 'default';
    const hasClass = unlockKeys.has(`class:${entry.classId}`);
    const isOwned = isDefault ? hasClass : unlockKeys.has(key);
    const isOnSale = !isDefault && entry.id !== 'variant:polymorph:frostmage' && (offerCounts.get(key) ?? 0) > 0;
    const query = catalogSearch.trim().toLocaleLowerCase();
    return (catalogKind === 'all' || entry.kind === catalogKind)
      && (catalogClass === 'all' || entry.classId === catalogClass)
      && (catalogStatus === 'all' || (catalogStatus === 'owned' && isOwned) || (catalogStatus === 'sale' && isOnSale) || (catalogStatus === 'missing' && !isOwned))
      && (!query || `${entry.name} ${classNames[entry.classId]} ${entry.summary} ${entry.effect} ${entry.kind}`.toLocaleLowerCase().includes(query));
  });
  const [listingPage, setListingPage] = useState(1);
  useEffect(() => { setListingPage(1); }, [filter, sort]);
  const boardPage = paginate(listings, listingPage);
  useEffect(() => { if (boardPage.page !== listingPage) setListingPage(boardPage.page); }, [boardPage.page, listingPage]);
  const [catalogPage, setCatalogPage] = useState(1);
  useEffect(() => { setCatalogPage(1); }, [catalogKind, catalogClass, catalogStatus, catalogSearch]);
  const catPage = paginate(catalogItems, catalogPage, 6);
  useEffect(() => { if (catPage.page !== catalogPage) setCatalogPage(catPage.page); }, [catPage.page, catalogPage]);
  const refresh = () => { void Promise.all([economy.refetch(), market.refetch()]); setNotice('Checking the latest offers…'); setError(''); };
  const settled = () => {
    void Promise.all([
      client.invalidateQueries({ queryKey: getGetEconomyQueryKey() }),
      client.invalidateQueries({ queryKey: getListMarketListingsQueryKey() }),
    ]);
  };
  const listCopy = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!chosen || chosen.free < 1 || !validPrice || account?.onboardingRequired || pending) return;
    setError(''); setNotice('');
    create.mutate({ data: { kind: chosen.kind, itemId: chosen.itemId, price: numericPrice } }, {
      onSuccess: () => { setPrice(''); setSelected(''); setNotice(`${title(chosen.itemId)} is now on the board.`); settled(); },
      onError: cause => setError(errorText(cause)),
    });
  };
  const cancelOffer = (listing: MarketListing) => {
    if (!owned(listing) || pending) return;
    setBusyId(listing.id); setError(''); setNotice('');
    cancel.mutate({ listingId: listing.id }, {
      onSuccess: () => { setBusyId(''); setNotice('Offer withdrawn. Your copy is available again.'); settled(); },
      onError: cause => { setBusyId(''); setError(errorText(cause)); },
    });
  };
  const buy = () => {
    if (!confirm || owned(confirm) || !account || account.gold < confirm.price || pending) return;
    const item = confirm;
    setBusyId(item.id); setError(''); setNotice('');
    purchase.mutate({ listingId: item.id }, {
      onSuccess: () => { setBusyId(''); setConfirm(null); setNotice(`${title(item.itemId)} acquired. Your inventory has been updated.`); settled(); },
      onError: cause => { setBusyId(''); setConfirm(null); setError(errorText(cause)); settled(); },
    });
  };

  return <div className={`site market-page market-game${embedded ? ' market-embedded' : ''}`}>
    {!embedded && <SiteHeader signedIn/>}
    <main className="shell market-shell">
      <nav className="market-game-nav" aria-label="Trading Post navigation">
        <div className="market-game-brand"><Swords size={18} strokeWidth={1.8}/> FANTASY WORLD ARENAS <span aria-hidden="true">/</span> TRADING POST</div>
        <div className="market-game-links">
          {embedded && <button type="button" className="market-back" onClick={onClose} disabled={!onClose || pending} data-testid="button-market-main-menu"><ArrowLeft size={14}/> Main Menu</button>}
          {embedded ? <button type="button" onClick={onOpenPlay} disabled={!onOpenPlay || pending} data-testid="button-market-play">Play <ArrowRight size={13}/></button> : <Link href="/play" data-testid="link-market-play">Play <ArrowRight size={13}/></Link>}
          {embedded ? <button type="button" onClick={onOpenArena} disabled={!onOpenArena || pending} data-testid="button-market-arena">Arena <ArrowRight size={13}/></button> : <Link href="/arena" data-testid="link-market-arena">Arena <ArrowRight size={13}/></Link>}
        </div>
      </nav>
      {mode === 'hub' ? <section className="ah-hub" aria-label="Auction house">
        <img className="ah-scene" src={`${import.meta.env.BASE_URL}ui/auction-house.webp`} alt="" width={1280} height={720}/>
        <div className="ah-purse" data-testid="text-hub-gold"><Coins size={18}/><strong>{account ? gold(account.gold) : '—'}</strong><span>GOLD</span></div>
        <div className="ah-actions">
          <button type="button" className="ah-card ah-buy" onClick={() => setMode('buy')} data-testid="button-mode-buy"><ShoppingBag size={44} strokeWidth={1.3}/><strong>BUY</strong><span>{market.data ? `${market.data.length} ${market.data.length === 1 ? 'offer' : 'offers'} posted` : 'Browse offers and the armory'}</span></button>
          <button type="button" className="ah-card ah-sell" onClick={() => setMode('sell')} data-testid="button-mode-sell"><Coins size={44} strokeWidth={1.3}/><strong>SELL</strong><span>{account ? `${available.reduce((sum, item) => sum + item.free, 0)} spare ${available.reduce((sum, item) => sum + item.free, 0) === 1 ? 'copy' : 'copies'} ready` : 'List your spare copies'}</span></button>
        </div>
      </section> : <div className="ah-bar"><button type="button" className="ah-back" onClick={() => setMode('hub')} data-testid="button-market-hub"><ArrowLeft size={15}/> Auction House</button><div className="ah-tabs" role="group" aria-label="Market mode"><button type="button" aria-pressed={mode === 'buy'} onClick={() => setMode('buy')}>Buy</button><button type="button" aria-pressed={mode === 'sell'} onClick={() => setMode('sell')}>Sell</button></div>{account && <span className="ah-bar-gold"><Coins size={14}/> {gold(account.gold)} G</span>}</div>}
      {(error || notice) && <div className={`market-feedback ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'} data-testid="status-market-transaction"><span>{error ? <CircleAlert size={17}/> : <Sparkles size={17}/>} {error || notice}</span><button type="button" aria-label="Dismiss message" data-testid="button-dismiss-market-message" onClick={() => { setError(''); setNotice(''); }}><X size={17}/></button></div>}

      {mode !== 'hub' && <div className={`market-columns ah-single ah-${mode}`}>
        {mode === 'buy' && <section className="market-board" id="market-stalls">
          <div className="market-section-top"><div><span className="eyebrow">OPEN OFFERS / THE PUBLIC BOARD</span><h2 className="display">ON THE BOARD<span className="market-period">.</span></h2></div><button type="button" className="market-refresh" data-testid="button-refresh-market" onClick={refresh} aria-label="Refresh listings"><RefreshCw size={17}/></button></div>
          <div className="market-toolbar"><div className="market-filters" role="group" aria-label="Filter listings">{kinds.map(kind => <button key={kind} type="button" className={filter === kind ? 'selected' : ''} onClick={() => setFilter(kind)} data-testid={`button-filter-${kind}`}>{kind === 'all' ? 'All wares' : `${title(kind)}s`}</button>)}</div><label className="market-sort">SORT <select value={sort} onChange={event => setSort(event.target.value as typeof sort)} data-testid="select-sort-market"><option value="recent">Newest first</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></label></div>
          {market.isLoading ? <div className="market-list-skeleton" aria-label="Loading offers">{[0,1,2].map(i => <div className="skeleton" key={i}/>)}</div> : market.isError ? <div className="market-state" role="alert"><CircleAlert/><strong>The board is out of reach</strong><p>Offers could not be loaded right now.</p><button className="btn btn-sm" data-testid="button-retry-listings" onClick={() => void market.refetch()}><RefreshCw size={14}/> Try again</button></div> : listings.length === 0 ? <div className="market-state"><ShoppingBag size={34} strokeWidth={1.3}/><strong>No offers on this board</strong><p>{filter === 'all' ? 'The first deal is still waiting to be made. Have a spare? Post it below.' : `No ${filter} offers yet. Try another category.`}</p><button type="button" className="btn btn-sm" onClick={() => setMode('sell')} data-testid="link-empty-sell">Post an offer <ArrowRight size={14}/></button></div> : <div className="market-list" data-testid="list-market-offers">{boardPage.items.map(item => {
            const isOwn = owned(item);
            const catalogEntry = catalogByKey.get(`${item.kind}:${item.itemId}`);
            return <article className="market-listing" key={item.id} data-testid={`card-listing-${item.id}`}>
              <div className={`market-item-emblem market-kind-${item.kind}`}>{catalogEntry?.art ? <img src={catalogEntry.art} alt="" loading="lazy"/> : kindIcon(item.kind)}</div>
              <div className="market-item-info">
                <span className="market-kind">{catalogEntry ? `${classNames[catalogEntry.classId]} · ` : ''}{item.kind}</span>
                <h3>{catalogEntry?.name ?? title(item.itemId)}</h3>
                {isOwn ? <span className="market-own-tag">YOUR OFFER</span> : unlockKeys.has(`${item.kind}:${item.itemId}`) && <span className="market-owned-item">Unlocked · extra copy</span>}
                <div className="market-listing-meta">{isOwn ? 'Posted by you' : `Trader ${item.sellerId.slice(0, 6).toUpperCase()}`} <span>·</span> {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                {isOwn && <div className="market-risk">Still at Arena risk until sold</div>}
              </div>
              <div className="market-item-action">
                <div className="market-price" data-testid={`text-listing-price-${item.id}`}><Coins size={14}/> {gold(item.price)} <small>G</small></div>
                {isOwn ? <button className="market-text-button" disabled={pending} onClick={() => cancelOffer(item)} data-testid={`button-cancel-listing-${item.id}`}>{busyId === item.id ? 'Withdrawing…' : 'Withdraw offer'} <X size={13}/></button>
                  : <button className="btn btn-primary btn-sm" disabled={pending || economy.isLoading || !account || account.onboardingRequired || account.gold < item.price} title={account && account.gold < item.price ? 'Not enough Gold' : undefined} onClick={() => setConfirm(item)} data-testid={`button-buy-listing-${item.id}`}>{account && account.gold < item.price ? 'Need Gold' : 'Buy now'} <ArrowUpRight size={14}/></button>}
              </div>
            </article>;
          })}<Pager page={boardPage.page} pages={boardPage.pages} total={boardPage.total} label="Live offers" onPage={setListingPage} testId="listings"/></div>}
        </section>}

        {mode === 'sell' && <aside className="market-seller" id="market-sell">
          <div className="market-seller-header"><span className="eyebrow">YOUR COUNTER / SELL A SPARE</span><h2 className="display">MAKE AN OFFER<span className="market-period">.</span></h2><p>Choose one duplicate and set your price. Your permanent unlock never leaves your collection.</p></div>
          {account?.onboardingRequired ? <div className="market-state market-seller-empty"><LockKeyhole/><strong>Begin your journey first</strong><p>Complete your class and racial choices in Play to open the trading post.</p>{embedded ? <button type="button" className="btn btn-primary btn-sm" onClick={onOpenPlay} disabled={!onOpenPlay} data-testid="link-onboard-play">Go to Play <ArrowRight size={14}/></button> : <Link href="/play" className="btn btn-primary btn-sm" data-testid="link-onboard-play">Go to Play <ArrowRight size={14}/></Link>}</div> : economy.isLoading ? <div className="market-seller-loading"><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></div> : economy.isError ? <div className="market-state"><CircleAlert/><strong>Inventory unavailable</strong><p>Try loading your ledger again before posting an offer.</p></div> : available.every(item => item.free < 1) ? <div className="market-state market-seller-empty"><Package size={31} strokeWidth={1.4}/><strong>No free copies to list</strong><p>Win duplicates in the Arena or withdraw an existing offer to make one available.</p>{embedded ? <button type="button" className="btn btn-sm" onClick={onOpenArena} disabled={!onOpenArena} data-testid="link-earn-duplicates">Go to Arena <ArrowRight size={14}/></button> : <Link href="/arena" className="btn btn-sm" data-testid="link-earn-duplicates">Go to Arena <ArrowRight size={14}/></Link>}</div> : <form onSubmit={listCopy} className="market-sell-form">
            <div className="ah-inventory">
            <label htmlFor="market-copy">01 / CHOOSE A DUPLICATE</label>
            <div className="ah-tiles" role="group" aria-label="Choose a spare copy">{sparePage.items.map(copy => {
              const entry = catalogByKey.get(copy.key);
              return <button type="button" aria-pressed={selected === copy.key} key={copy.key} className={`ah-tile market-kind-${copy.kind}${selected === copy.key ? ' on' : ''}`} onClick={() => setSelected(copy.key)} data-testid={`tile-copy-${copy.key}`}>
                <span className="ah-tile-art">{entry?.art ? <img src={entry.art} alt="" loading="lazy"/> : kindIcon(copy.kind)}</span>
                <b>{entry?.name ?? title(copy.itemId)}</b><small>{entry ? classNames[entry.classId] : ''} · {copy.kind}</small><i>x{copy.free}</i></button>;
            })}</div>
            <select id="market-copy" className="ah-fallback-select" value={selected} onChange={event => setSelected(event.target.value)} required data-testid="select-market-copy"><option value="">Select a spare copy</option>{available.filter(copy => copy.free > 0).map(copy => <option key={copy.key} value={copy.key}>{title(copy.itemId)} · {title(copy.kind)} ({copy.free} available)</option>)}</select>
            <Pager page={sparePage.page} pages={sparePage.pages} total={sparePage.total} label="Spare copies" onPage={setInventoryPage} testId="spares"/>
            </div>
            <div className="ah-price-panel">
            {chosen && <div className="ah-selected-copy" role="status">Listing: <strong>{catalogByKey.get(chosen.key)?.name ?? title(chosen.itemId)}</strong></div>}
            <label htmlFor="market-price">02 / SET YOUR ASKING PRICE</label>
            <div className="market-price-input"><input id="market-price" type="number" inputMode="numeric" min="1" max="2147483647" step="1" placeholder="Enter Gold amount" value={price} onChange={event => setPrice(event.target.value)} required data-testid="input-market-price"/><span>GOLD</span></div>
            <div className="market-quote"><span>Asking price <b>{validPrice ? gold(numericPrice) : '—'} G</b></span><span>Market tax ({Math.round(taxRate * 100)}%) <b>− {validPrice ? gold(tax) : '—'} G</b></span><div>You receive if sold <strong data-testid="text-market-proceeds">{validPrice ? gold(numericPrice - tax) : '—'} G</strong></div></div>
            <button type="submit" className="btn btn-primary market-submit" disabled={!chosen || chosen.free < 1 || !validPrice || pending} data-testid="button-create-listing">{create.isPending ? 'Posting offer…' : 'Post one copy'} <ArrowUpRight size={16}/></button>
            </div>
          </form>}
          <div className="market-risk-note"><Swords size={18}/><p><strong>THE ARENA DOES NOT PAUSE.</strong> A listed duplicate remains in your inventory until purchased. It can still be lost in Arena play, which will remove its listing.</p></div>
          {account && account.listings.length > 0 && <div className="market-my-offers">
            <span className="eyebrow">YOUR ACTIVE OFFERS / {account.listings.length}</span>
            {ownPage.items.map(item => <div key={item.id} className="market-my-offer"><div><strong>{catalogByKey.get(`${item.kind}:${item.itemId}`)?.name ?? title(item.itemId)}</strong><span>{gold(item.price)} G · At Arena risk</span></div><button type="button" disabled={pending} onClick={() => cancelOffer(item)} aria-label={`Withdraw ${catalogByKey.get(`${item.kind}:${item.itemId}`)?.name ?? title(item.itemId)}`} data-testid={`button-withdraw-own-${item.id}`}><X size={16}/></button></div>)}
            <Pager page={ownPage.page} pages={ownPage.pages} total={ownPage.total} label="Your offers" onPage={setOwnOfferPage} testId="my-offers"/>
          </div>}
        </aside>}
      </div>}
      {mode === 'sell' && <section className="market-ledger" aria-label="Your account">
        <div className="market-ledger-heading"><span className="eyebrow">YOUR LEDGER / LIVE BALANCE</span><h2 className="display">YOUR HOLDINGS.</h2><p>Gold buys options. Your first unlock is permanent; extra copies can be traded.</p></div>
        {economy.isLoading ? <div className="market-ledger-skeleton" aria-label="Loading holdings"><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></div> : economy.isError ? <div className="market-state" role="alert"><CircleAlert/><strong>Ledger unavailable</strong><p>We could not load your holdings.</p><button className="btn btn-sm" data-testid="button-retry-economy" onClick={() => void economy.refetch()}><RefreshCw size={14}/> Retry</button></div> : account && <div className="market-holdings">
          <div className="market-wallet"><div className="market-holding-label"><Coins size={17}/> GOLD IN PURSE</div><strong data-testid="text-wallet-gold">{gold(account.gold)}</strong><span>Earned from AI, Arena, and tournaments</span></div>
          <div className="market-holding"><div className="market-holding-label"><LockKeyhole size={17}/> PERMANENT UNLOCKS</div><strong data-testid="text-unlock-count">{account.unlocks.length.toString().padStart(2, '0')}</strong><span>Yours to keep, never listed</span></div>
          <div className="market-holding"><div className="market-holding-label"><Package size={17}/> TRADABLE COPIES</div><strong data-testid="text-duplicate-count">{gold(account.duplicates.reduce((sum, copy) => sum + copy.quantity, 0))}</strong><span>{account.listings.length} currently on the board</span></div>
        </div>}
      </section>}

      {mode === 'buy' && <section className="market-catalog" id="market-catalog" aria-labelledby="market-catalog-title">
        <div className="market-catalog-heading">
          <div><span className="eyebrow">THE COMPLETE ARMORY / BROWSE ONLY</span><h2 id="market-catalog-title" className="display">THE CATALOG<span className="market-period">.</span></h2><p>Every class ability, ultimate and talent in one place. Browse the full kit, whether or not anyone is selling.</p></div>
          <span className="market-catalog-total">{itemCatalog.length} ENTRIES / 9 CLASSES</span>
        </div>
        <div className="market-catalog-toolbar">
          <label className="market-catalog-search"><Search size={16}/><span className="sr-only">Search the catalog</span><input type="search" value={catalogSearch} onChange={event => setCatalogSearch(event.target.value)} placeholder="Search names and effects" data-testid="input-catalog-search"/></label>
          <label className="market-catalog-select">CLASS<select value={catalogClass} onChange={event => setCatalogClass(event.target.value)} data-testid="select-catalog-class"><option value="all">All classes</option>{Object.entries(classNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label className="market-catalog-select">STATUS<select value={catalogStatus} onChange={event => setCatalogStatus(event.target.value as CatalogStatus)} data-testid="select-catalog-status"><option value="all">All entries</option><option value="owned">Available to me</option><option value="sale">For sale</option><option value="missing">Not unlocked</option></select></label>
        </div>
        <div className="market-catalog-tabs" role="group" aria-label="Filter catalog by type">{kinds.map(kind => <button type="button" key={kind} className={catalogKind === kind ? 'selected' : ''} onClick={() => setCatalogKind(kind)} aria-pressed={catalogKind === kind} data-testid={`button-catalog-${kind}`}>{kind === 'all' ? 'Everything' : `${title(kind)}s`}</button>)}</div>
        {(economy.isLoading || market.isLoading) && <div className="market-catalog-loading" aria-label="Loading catalog availability">{[0, 1, 2].map(index => <div className="skeleton" key={index}/>)}</div>}
        {(economy.isError || market.isError) && <div className="market-catalog-note" role="status">Availability may be out of date. The full catalog is still available to browse. <button type="button" onClick={refresh} data-testid="button-retry-catalog">Retry availability</button></div>}
        <div className="market-catalog-results" aria-live="polite">{catalogItems.length} {catalogItems.length === 1 ? 'entry' : 'entries'} match · showing {catPage.total ? catPage.start + 1 : 0}-{catPage.start + catPage.items.length}</div>
        {catalogItems.length === 0 ? <div className="market-catalog-empty"><Search size={25}/><strong>No matching entries</strong><p>Try another class, status, type or search term.</p><button type="button" className="btn btn-sm" onClick={() => { setCatalogKind('all'); setCatalogClass('all'); setCatalogStatus('all'); setCatalogSearch(''); }} data-testid="button-clear-catalog">Clear filters</button></div> :
          <><div className="market-catalog-grid">{catPage.items.map(entry => {
            const shared = entry.id === 'variant:polymorph:frostmage';
            const key = `${entry.kind}:${shared ? 'ult:frostmage' : entry.id}`;
            const isDefault = entry.variant === 'default';
            const tradable = !isDefault && !shared && Array.isArray(drops[entry.kind]) && (drops[entry.kind] as unknown[]).includes(entry.id);
            const hasClass = unlockKeys.has(`class:${entry.classId}`);
            const isOwned = isDefault ? hasClass : unlockKeys.has(key);
            const copies = duplicateCounts.get(key) ?? 0;
            const offers = !shared && tradable ? offerCounts.get(key) ?? 0 : 0;
            return <article className={`market-catalog-card market-kind-${entry.kind}`} key={`${entry.kind}:${entry.id}`} data-testid={`card-catalog-${entry.kind}-${entry.id}`}>
              <div className="market-card-art"><img src={entry.art} alt={`${entry.name} ${entry.kind} artwork`} loading="lazy"/><span className="market-card-type">{entry.kind}</span></div><div className="market-catalog-card-top"><span className="market-catalog-icon">{kindIcon(entry.kind)}</span><span className="market-catalog-class">{classNames[entry.classId]} / {entry.kind}</span></div>
              <h3>{entry.name}</h3><p className="market-catalog-summary">{entry.summary}</p><p className="market-catalog-effect">{entry.effect}</p><details className="market-effect-details"><summary data-testid={`button-effect-${entry.kind}-${entry.id}`}>Effect details</summary><p>{entry.effect}</p></details>
              <div className="market-catalog-card-foot">
                <span className={`market-catalog-badge ${isOwned ? 'is-owned' : ''}`}>{economy.isLoading ? 'Checking ownership' : economy.isError ? 'Ownership unavailable' : isOwned ? (isDefault ? 'Class kit available' : 'Unlocked') : isDefault ? 'Unlock class to use' : 'Not unlocked'}</span>
                <span className="market-catalog-availability">{isDefault ? 'Default kit · not tradable' : shared ? 'Shared Frost Mage ultimate unlock · not separately traded' : entry.variant === 'starter' ? 'Starter talent · not in drop pool' : economy.isLoading || economy.isError ? 'Drop eligibility unavailable' : !tradable ? 'Not in drop pool' : market.isLoading ? 'Checking offers' : market.isError ? 'Offers unavailable' : offers ? `${offers} ${offers === 1 ? 'offer' : 'offers'} on board${copies ? ` · ${copies} spare` : ''}` : copies ? `${copies} spare ${copies === 1 ? 'copy' : 'copies'} · no offers` : 'No offers right now'}</span>
              </div>
            </article>;
          })}</div><Pager page={catPage.page} pages={catPage.pages} total={catPage.total} label="Catalog" onPage={setCatalogPage} testId="catalog"/></>}
        <p className="market-catalog-disclaimer">This is a reference, not a shop. Only eligible duplicate drops can be posted for Gold; default class abilities and ultimates cannot be traded. Check live offers on the board above.</p>
      </section>}

    </main>
    {confirm && <div className="market-modal-backdrop market-game-modal-layer" onMouseDown={event => { if (event.target === event.currentTarget && !purchase.isPending) setConfirm(null); }}>
      <div ref={dialogRef} tabIndex={-1} className="market-modal" role="dialog" aria-modal="true" aria-labelledby="market-confirm-title">
        <button type="button" className="market-modal-close" onClick={() => setConfirm(null)} aria-label="Close purchase confirmation" disabled={purchase.isPending} data-testid="button-close-purchase"><X size={20}/></button>
        <span className="eyebrow">CONFIRM TRADE / ONE COPY</span>
        <h2 id="market-confirm-title" className="display">Confirm purchase</h2>
        {(() => {
          const entry = catalogByKey.get(`${confirm.kind}:${confirm.itemId}`);
          return <div className={`ah-confirm-item market-kind-${confirm.kind}`}>
            <div className="ah-confirm-art">{entry?.art ? <img src={entry.art} alt={`${entry.name} artwork`}/> : kindIcon(confirm.kind)}</div>
            <div><b>{entry?.name ?? title(confirm.itemId)}</b><small>{entry ? `${classNames[entry.classId]} · ` : ''}{confirm.kind}</small>{entry?.effect && <p>{entry.effect}</p>}<small>Seller: Trader {confirm.sellerId.slice(0, 6).toUpperCase()}</small></div>
          </div>;
        })()}
        <p>This spends <strong>{gold(confirm.price)} Gold</strong> from your purse.</p>
        <div className="market-modal-total"><span>YOUR BALANCE AFTER</span><strong>{gold((account?.gold ?? 0) - confirm.price)} G</strong></div>
        <div className="market-modal-actions">
          <button type="button" className="btn" onClick={() => setConfirm(null)} disabled={purchase.isPending} data-testid="button-cancel-purchase">Keep browsing</button>
          <button type="button" className="btn btn-primary" disabled={purchase.isPending || owned(confirm) || !account || account.gold < confirm.price} onClick={buy} data-testid="button-confirm-purchase">{purchase.isPending ? 'Completing trade…' : `Pay ${gold(confirm.price)} G`} <ArrowRight size={16}/></button>
        </div>
      </div>
    </div>}
  </div>;
}