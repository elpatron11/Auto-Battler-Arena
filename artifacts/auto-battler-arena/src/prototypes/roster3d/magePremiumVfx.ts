import type { PolishVfxEntity } from './polishVfx';

/** Fixed faceted accents and a broken casting seal; no bloom, emitters or mutable state. */
export function drawPremiumMageVfx(ctx: CanvasRenderingContext2D, e: PolishVfxEntity & { readonly ultVariant?: string; readonly atkAnimAng?: number }, time: number) {
  if (e.classId !== 'frostmage' || !e.alive || !Number.isFinite(time)) return;
  const cast = e.casting && e.casting.total > 0 ? Math.max(0, Math.min(1, 1 - e.casting.timeLeft / e.casting.total)) : 0;
  const age = e.atkAnimAt ? (time * 1000 - e.atkAnimAt) / 1000 : Infinity;
  const duration = e.atkAnimDur && e.atkAnimDur > 0 ? e.atkAnimDur : .34;
  const attack = age >= 0 && age < duration ? Math.sin(age / duration * Math.PI) : 0;
  if (cast <= .03 && attack <= .03) return;
  ctx.save();
  const inherited = ctx.globalAlpha, fire = e.ultVariant === 'custom';
  const bright = fire ? '#ffd899' : '#d7fbff', middle = fire ? '#ffaf54' : '#8be5fb', dark = fire ? '#d75b33' : '#3195c9';
  ctx.strokeStyle = bright; ctx.fillStyle = middle;
  ctx.lineWidth = 1.25; ctx.lineJoin = 'miter';
  const facet = (x: number, y: number, size: number) => {
    ctx.fillStyle = middle; ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x + size * .48, y);
    ctx.lineTo(x, y + size * .75); ctx.lineTo(x - size * .4, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x, y + size * .75);
    ctx.lineTo(x - size * .4, y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = bright; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x + size * .48, y); ctx.stroke();
  };
  if (cast > .03) {
    const charge = Math.sin(cast * Math.PI);
    ctx.globalAlpha = inherited * charge * .65;
    ctx.beginPath(); ctx.ellipse(0, 12, 18 + charge * 2, 6.5, 0, .2, Math.PI * 1.8); ctx.stroke();
    // Four deterministic crystal planes, not an expanding particle cloud.
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + .4, x = Math.cos(a) * 16, y = -14 + Math.sin(a) * 8;
      facet(x, y, 2.5 + charge);
    }
  } else {
    ctx.globalAlpha = inherited * attack * .6;
    ctx.rotate(Number.isFinite(e.atkAnimAng) ? e.atkAnimAng! : 0);
    ctx.beginPath(); ctx.moveTo(5, -5); ctx.lineTo(16 + attack * 7, -1); ctx.lineTo(10 + attack * 5, 2); ctx.stroke();
    facet(15 + attack * 6, -2, 2.5);
  }
  ctx.restore();
}