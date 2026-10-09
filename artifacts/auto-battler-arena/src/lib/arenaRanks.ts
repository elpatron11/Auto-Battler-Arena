import definitions from './arena-ranks.json';

export type RankTier = { name: string; minimum: number; gold: number; divisions: number; color: string };
export type RankInfo = { tier: RankTier; division: string; label: string; next: RankTier | null };

// Build-time import: rank UI cannot silently fall back to different thresholds.
const cache: RankTier[] = definitions;

export function useRankTiers() {
  return cache;
}

const ROMAN = ['I', 'II', 'III'];
export function rankFor(rating: number, tiers: RankTier[] = cache): RankInfo {
  const r = Number.isFinite(rating) ? rating : 0;
  let idx = 0;
  tiers.forEach((t, i) => { if (r >= t.minimum) idx = i; });
  const tier = tiers[idx];
  const next = tiers[idx + 1] ?? null;
  let division = '';
  if (tier.divisions > 1 && next) {
    const span = (next.minimum - tier.minimum) / tier.divisions;
    const step = Math.min(tier.divisions - 1, Math.max(0, Math.floor((r - tier.minimum) / span)));
    division = ROMAN[tier.divisions - 1 - step];
  }
  return { tier, division, label: division ? `${tier.name} ${division}` : tier.name, next };
}
