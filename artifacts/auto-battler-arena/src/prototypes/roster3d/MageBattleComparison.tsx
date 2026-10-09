import { useState } from 'react';
import { createRosterBattleRenderer, type RosterEntity } from './battleRenderer';
import { createPremiumMageModel } from './magePremiumModel';
import { PREMIUM_ROSTER_FACTORY } from './premiumRoster';
import type { ModelId } from './creatures';
import type { DruidForm } from './roster';

/** Actual battle compositor, not a beauty-camera proxy. Temporary contexts are released serially. */
export function MageBattleComparison({ classId = 'frostmage', form = '', rosterPremium = false, label = 'Cryomancer' }: {
  classId?: ModelId; form?: DruidForm; rosterPremium?: boolean; label?: string;
} = {}) {
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState('');
  function compare(mode: 'idle' | 'run' | 'cast' | 'attack') {
    setError('');
    try {
      const time = mode === 'run' ? 2.2 : 2.1;
      const entity: RosterEntity = { alive: true, x: 0, y: 0, classId, team: 'player', extra: { form },
        casting: mode === 'cast' ? { total: 1, timeLeft: .5 } : null,
        atkAnimAt: mode === 'attack' ? (time - .17) * 1000 : 0, atkAnimDur: .34 };
      const result = [false, true].map(premium => {
        const sampleEntity = { ...entity };
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 160;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas is unavailable.');
        ctx.fillStyle = '#192335'; ctx.fillRect(0, 0, 160, 160);
        const renderer = createRosterBattleRenderer(() => [sampleEntity], { presentationTime: time,
          premiumMage: premium && !rosterPremium ? createPremiumMageModel : undefined,
          premiumRoster: premium && rosterPremium ? PREMIUM_ROSTER_FACTORY : undefined });
        try {
          ctx.translate(80, 104);
          if (!renderer.draw(ctx, sampleEntity, time)) throw new Error(renderer.stats.error || '3D comparison is unavailable.');
          if (mode === 'run') {
            // A second captured position uses the real renderer's movement
            // detection; no fake pose API or change to the battle camera.
            sampleEntity.x += 1;
            ctx.clearRect(-80, -104, 160, 160);
            ctx.fillStyle = '#192335'; ctx.fillRect(-80, -104, 160, 160);
            if (!renderer.draw(ctx, sampleEntity, time + .05)) throw new Error(renderer.stats.error || 'Run comparison is unavailable.');
          }
          return canvas.toDataURL('image/png');
        } finally { renderer.dispose(); }
      });
      setImages(result);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  return <section className="r3d-card" aria-label={`${label} actual battle-size comparison`}>
    <h2>Compare at battle size</h2>
    <p className="r3d-note">Actual battle camera and 85px body compositor in 160 × 160 samples. Same pose, scale and light—not an enlarged beauty view.</p>
    <div className="r3d-row">{(['idle', 'run', 'cast', 'attack'] as const).map(mode =>
      <button key={mode} onClick={() => compare(mode)} data-testid={`button-mage-compare-${mode}`}>Compare {mode}</button>)}</div>
    {images.length > 0 && <div className="r3d-row" data-testid="mage-battle-size-comparison">{images.map((src, i) =>
      <figure key={i} style={{ margin: '12px 12px 12px 0' }}><img src={src} width={160} height={160} alt={`${i ? 'Premium' : 'Current'} ${label}${form ? ` ${form}` : ''} at actual battle scale`} />
        <figcaption>{i ? `Premium ${label} · test` : 'Current base'}</figcaption></figure>)}</div>}
    {error && <p role="alert">{error}</p>}
  </section>;
}