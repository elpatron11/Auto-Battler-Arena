import { drawPremiumMageVfx } from '../magePremiumVfx';
import type { RosterEntity } from '../battleRenderer';

const PALETTE: Record<string, [string, string]> = {
  paladin: ['#fff1ac', '#d6a340'], warrior: ['#ffd3a1', '#df6747'],
  rogue: ['#ff809b', '#a93959'], archer: ['#d5f394', '#5faa55'],
  priest: ['#fff7cd', '#dfba67'], shaman: ['#cffaff', '#60b9eb'],
  warlock: ['#efd0ff', '#a65ed7'], druid: ['#d5ed94', '#70a560'],
};

/** Bounded local strokes: no particles, persistent state, lights, or combat writes. */
export function drawPremiumRosterVfx(ctx: CanvasRenderingContext2D, e: RosterEntity, time: number) {
  if (e.classId === 'frostmage') { drawPremiumMageVfx(ctx, e, time); return; }
  if (!e.alive || !Number.isFinite(time) || !PALETTE[e.classId]) return;
  const cast = e.casting && e.casting.total > 0 ? Math.max(0, Math.min(1, 1 - e.casting.timeLeft / e.casting.total)) : 0;
  const age = e.atkAnimAt ? (time * 1000 - e.atkAnimAt) / 1000 : Infinity;
  const duration = e.atkAnimDur && e.atkAnimDur > 0 ? e.atkAnimDur : .34;
  const attack = age >= 0 && age < duration ? Math.sin(age / duration * Math.PI) : 0;
  if (cast <= .03 && attack <= .03) return;
  const [light, dark] = e.classId === 'warrior' && e.skinId === 'emberLord' ? ['#ef3551', '#180a14'] :
    e.classId === 'paladin' && e.skinId === 'wingedPaladin' ? ['#fffdf1', '#ffe184'] :
    e.classId === 'priest' && (e.extra?.shadowForm || 0) > 0 ? ['#e3c7ff', '#9362cd'] : PALETTE[e.classId];
  ctx.save();
  ctx.globalAlpha *= (cast > .03 ? Math.sin(cast * Math.PI) : attack) * .6;
  ctx.strokeStyle = light; ctx.fillStyle = dark; ctx.lineWidth = 1.15; ctx.lineJoin = 'miter';
  if (cast > .03) {
    ctx.beginPath(); ctx.ellipse(0, 12, 18, 6, 0, .25, Math.PI * 1.8); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3, x = Math.cos(a) * 15, y = -12 + Math.sin(a) * 7;
      ctx.beginPath();
      if (e.classId === 'paladin' || e.classId === 'priest') {
        ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.moveTo(x - 2, y); ctx.lineTo(x + 2, y); ctx.stroke();
      } else if (e.classId === 'shaman') {
        ctx.moveTo(x + 1, y - 4); ctx.lineTo(x - 2, y); ctx.lineTo(x + 1, y); ctx.lineTo(x - 1, y + 4); ctx.stroke();
      } else {
        ctx.moveTo(x, y - 3); ctx.lineTo(x + 2, y); ctx.lineTo(x, y + 3); ctx.lineTo(x - 2, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
  } else {
    ctx.rotate(Number.isFinite(e.atkAnimAng) ? e.atkAnimAng! : 0);
    ctx.beginPath();
    if (e.classId === 'archer') {
      ctx.moveTo(6, 0); ctx.lineTo(23, 0); ctx.moveTo(20, -2); ctx.lineTo(23, 0); ctx.lineTo(20, 2);
    } else {
      ctx.moveTo(5, -6); ctx.lineTo(15 + attack * 7, -1); ctx.lineTo(10 + attack * 5, 3);
      if (e.classId === 'rogue') { ctx.moveTo(4, 4); ctx.lineTo(14 + attack * 5, 1); }
    }
    ctx.stroke();
  }
  ctx.restore();
}