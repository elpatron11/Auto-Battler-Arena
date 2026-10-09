import { useEffect, useRef } from 'react';
import { Lock, ShieldCheck, X } from 'lucide-react';
import { useGetEconomy } from '@workspace/api-client-react';
import './ArenaRewards.css';

const SKINS = [
  { id: 'wingedPaladin', name: 'Winged Paladin', cls: 'Paladin', ladder: 'Arena 3s' },
  { id: 'emberLord', name: 'Ember Lord', cls: 'Warrior', ladder: 'Arena 2s' },
] as const;

export default function ArenaRewards({ onClose }: { onClose: () => void }) {
  const eco = useGetEconomy();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); prev?.focus?.(); };
  }, [onClose]);
  const owned = (id: string) => !!eco.data?.unlocks?.some(u => u.kind === 'skin' && u.itemId === id);
  return <div className="arw-backdrop" onClick={onClose} data-testid="backdrop-arena-rewards">
    <div className="arw-panel" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="arw-title" onClick={e => e.stopPropagation()} data-testid="dialog-arena-rewards">
      <div className="arw-head"><div><span className="ag-eyebrow">Arena rewards</span><h2 id="arw-title">Skins unlocked by class</h2></div><button className="ag-button ag-button-small" onClick={onClose} aria-label="Close rewards" data-testid="button-close-rewards"><X size={14} /> Close</button></div>
      {eco.isLoading && <p className="arw-note" data-testid="status-rewards-loading">Checking your collection…</p>}
      {eco.isError && <p className="arw-note arw-err" role="alert" data-testid="status-rewards-error">Ownership could not be loaded. <button className="ag-side-link" onClick={() => void eco.refetch()} data-testid="button-retry-rewards">Try again</button></p>}
      <ul className="arw-list">{SKINS.map(s => { const o = owned(s.id); return <li key={s.id} className={`arw-skin ${o ? 'is-open' : ''}`} data-testid={`card-skin-${s.id}`}>
        <span className="arw-icon">{o ? <ShieldCheck size={18} /> : <Lock size={18} />}</span>
        <div><strong>{s.name}</strong> <span className="arw-class">{s.cls} class</span>
          <p>Permanently unlocks at Gladiator 2400 RP in {s.ladder}.</p></div>
        <span className="arw-state" data-testid={`status-skin-${s.id}`}>{eco.isLoading || eco.isError ? 'Unknown' : o ? 'Unlocked' : 'Locked'}</span>
      </li>; })}</ul>
      <p className="arw-note">Both skins also have independent 0.3% chances per rewarded hourly Dungeon clear and independent 0.2% chances per rewarded ranked Arena win. Anti-farming applies.</p>
      <p className="arw-note">Cosmetic only: no purchases, no power advantage. Equip unlocked skins in Profile.</p>
    </div>
  </div>;
}
