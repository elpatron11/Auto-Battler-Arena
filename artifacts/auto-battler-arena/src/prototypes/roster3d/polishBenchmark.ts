import { createRosterBattleRenderer, type RosterEntity } from './battleRenderer';
import type { PolishTotem } from './polishVfx';
import { createPremiumMageModel } from './magePremiumModel';
import { PREMIUM_ROSTER_FACTORY } from './premiumRoster';

type Result = { median: number; p95: number; calls: number; triangles: number };
export type FinishComparison = 'mage-premium' | 'roster-polish' | 'roster-premium';
export type FinishBenchmark = { units: number; totems: number; samples: number; base: Result; polished: Result; comparison?: FinishComparison };

/** Matched captured body workload, never a claim about device/full-game FPS. */
export async function benchmarkRosterFinish(entities: readonly RosterEntity[], totems: readonly PolishTotem[], capturedTime: number, comparison: FinishComparison = 'roster-polish'): Promise<FinishBenchmark> {
  if (!Number.isFinite(capturedTime)) throw new Error('The practice rendering clock is unavailable.');
  const captured = entities.filter(e => e.alive).slice(0, 18).map(e => ({
    ...e, status: { ...e.status }, extra: { ...e.extra }, casting: e.casting ? { ...e.casting } : null,
  }));
  if (!captured.length) throw new Error('Start an active practice battle first.');
  const capturedTotems = totems.map(t => ({ ...t }));
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas readback is unavailable.');
  const samples = 24, startTime = capturedTime;
  // Cache refresh time advances, but pose/VFX use the iframe's captured clock.
  // Positions are frozen (movement idle); cast/attack/hit phases do not expire.
  const base = createRosterBattleRenderer(() => captured, { presentationTime: capturedTime });
  const polished = createRosterBattleRenderer(() => captured, { polished: comparison === 'roster-polish',
    premiumMage: comparison === 'mage-premium' ? createPremiumMageModel : undefined,
    premiumRoster: comparison === 'roster-premium' ? PREMIUM_ROSTER_FACTORY : undefined, presentationTime: capturedTime });
  const a: number[] = [], b: number[] = [];
  function frame(renderer: typeof base, index: number) {
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    const now = startTime + index / 29;
    const started = performance.now();
    captured.forEach(e => { ctx!.save(); ctx!.translate(256, 256); renderer.draw(ctx!, e, now); ctx!.restore(); });
    renderer.drawTotems?.(ctx!, capturedTotems, now);
    if (renderer.stats.phase === 'failed') throw new Error(renderer.stats.error);
    return performance.now() - started;
  }
  try {
    // Compile shaders and populate both atlases before paired measurements.
    for (let i = 0; i < 5; i++) { frame(base, i); frame(polished, i); }
    for (let i = 5; i < samples + 5; i++) {
      if (i % 2) { a.push(frame(base, i)); b.push(frame(polished, i)); }
      else { b.push(frame(polished, i)); a.push(frame(base, i)); }
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    const summarize = (values: number[], renderer: typeof base): Result => {
      values.sort((x, y) => x - y);
      return { median: (values[11] + values[12]) / 2, p95: values[Math.ceil(values.length * .95) - 1],
        calls: renderer.stats.drawCalls, triangles: renderer.stats.triangles };
    };
    return { units: base.stats.units, totems: capturedTotems.length, samples, base: summarize(a, base), polished: summarize(b, polished), comparison };
  } finally { base.dispose(); polished.dispose(); }
}