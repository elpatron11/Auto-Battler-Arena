import type { CSSProperties } from 'react';
import { rankFor, useRankTiers } from '../lib/arenaRanks';
import './arena-rank.css';

export function ArenaRankBadge({ rating, className = '', testId }: { rating: number; className?: string; testId?: string }) {
  const tiers = useRankTiers();
  const info = rankFor(rating, tiers);
  const style = { '--rank-color': info.tier.color } as CSSProperties;
  return <span className={`arb ${className}`} style={style} data-testid={testId} title={`${info.label} · ${rating} rating points`}>
    <svg className="arb-gem" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5 21 7v10l-9 5.5L3 17V7z" fill="currentColor" fillOpacity=".18" stroke="currentColor" strokeWidth="1.6"/><path d="M12 6l5 3v6l-5 3-5-3V9z" fill="currentColor"/></svg>
    <span className="arb-name">{info.tier.name}{info.division && <b> {info.division}</b>}</span>
    <span className="arb-rating">{rating} RP</span>
  </span>;
}

export function ArenaRankGuide() {
  const tiers = useRankTiers();
  return <section className="arb-guide" aria-labelledby="arb-guide-title" data-testid="section-rank-guide">
    <h3 id="arb-guide-title">Rank guide</h3>
    <p>Each tier pays its gold once, the first time your rating reaches it. Payouts are confirmed by the server after a fight.</p>
    <ol>{tiers.map((t, i) => {
      const next = tiers[i + 1];
      const style = { '--rank-color': t.color } as CSSProperties;
      return <li key={t.name} style={style}><span className="arb-guide-name">{t.name}{t.divisions > 1 ? ' III-I' : ''}</span><span className="arb-guide-range">{t.minimum}{next ? `-${next.minimum - 1}` : '+'}</span><span className="arb-guide-gold">{t.gold > 0 ? `${t.gold} gold, one time` : t.name === 'Gladiator' ? 'Class skin unlock' : 'Starting rank'}</span></li>;
    })}</ol>
  </section>;
}
