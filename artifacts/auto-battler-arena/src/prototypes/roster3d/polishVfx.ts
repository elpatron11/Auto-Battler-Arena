export interface PolishVfxEntity {
  readonly classId: string;
  readonly alive: boolean;
  readonly x: number;
  readonly y: number;
  readonly radius?: number;
  readonly atkAnimAt?: number;
  readonly atkAnimDur?: number;
  readonly hitFlashAt?: number;
  readonly hitFlashDur?: number;
  readonly casting?: { readonly timeLeft: number; readonly total: number } | null;
}

const clamp01 = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;

/**
 * Draws a few crisp, class-coded accents in entity-local coordinates. `time`
 * is the same performance-clock seconds used by the battle renderer; all
 * action envelopes come from the game's existing attack/cast/hit state.
 */
export function drawPolishVfx(
  ctx: CanvasRenderingContext2D,
  entity: PolishVfxEntity,
  time: number,
): void {
  if (!Number.isFinite(time)) return;
  const elapsed = (time * 1000 - (entity.atkAnimAt || 0)) / 1000;
  const duration = entity.atkAnimDur && entity.atkAnimDur > 0 ? entity.atkAnimDur : 0.34;
  const activeAttack = elapsed >= 0 && elapsed < duration;
  const phase = activeAttack ? clamp01(elapsed / duration) : 0;
  const attack = activeAttack ? Math.sin(phase * Math.PI) : 0;
  const cast = entity.casting && entity.casting.total > 0
    ? clamp01(1 - entity.casting.timeLeft / entity.casting.total) : 0;
  const hitDuration = entity.hitFlashDur && entity.hitFlashDur > 0 ? entity.hitFlashDur : 0.18;
  const hitElapsed = entity.hitFlashAt ? (time * 1000 - entity.hitFlashAt) / 1000 : Infinity;
  const hit = hitElapsed >= 0 && hitElapsed < hitDuration
    ? Math.sin(clamp01(hitElapsed / hitDuration) * Math.PI) : 0;
  if (attack < 0.025 && cast < 0.04 && hit < 0.025) return;

  const radius = Math.max(10, Math.min(26, entity.radius || 17));
  const classId = entity.classId.replace(/^pet-/, '');
  const action = cast > 0.04 ? 'cast' : 'attack';
  const strength = action === 'cast' ? cast : attack;
  const color = action === 'cast'
    ? classId === 'priest' || classId === 'paladin' ? '#ffe28a'
      : classId === 'frostmage' ? '#8de8ff'
        : classId === 'shaman' ? '#5fe4dc'
          : classId === 'druid' ? '#a7dc78' : '#c879ff'
    : classId === 'warrior' || classId === 'paladin' ? '#ffd16c'
      : classId === 'rogue' ? '#ff697d'
        : classId === 'archer' ? '#b7ee75'
          : classId === 'druid' ? '#9dce70'
            : classId === 'pet-frostmage' ? '#8de8ff'
              : classId === 'hound' ? '#ff8a48' : '#f0d589';

  ctx.save();
  const inheritedAlpha = ctx.globalAlpha;
  ctx.globalAlpha = inheritedAlpha * (0.2 + strength * 0.62);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (hit > 0.025) {
    // A short, sharp cross-flash mirrors game.html's hitFlashAt / hitFlashDur.
    ctx.globalAlpha = inheritedAlpha * hit * 0.72;
    ctx.strokeStyle = '#fff4d6';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.34, -radius * 0.45);
    ctx.lineTo(radius * 0.3, radius * 0.2);
    ctx.moveTo(radius * 0.24, -radius * 0.48);
    ctx.lineTo(-radius * 0.25, radius * 0.12);
    ctx.stroke();
  }

  if (action === 'cast' && cast > 0.04) {
    // Simple broken rune / class seal: a ring and one class-specific mark.
    ctx.globalAlpha = inheritedAlpha * (0.18 + cast * 0.48);
    ctx.beginPath();
    ctx.ellipse(0, radius * 0.36, radius * (0.62 + cast * 0.08), radius * 0.2, 0, 0.12, Math.PI * 1.82);
    ctx.stroke();
    ctx.beginPath();
    if (classId === 'priest' || classId === 'paladin') {
      ctx.moveTo(0, -radius * 0.83); ctx.lineTo(0, -radius * 0.48);
      ctx.moveTo(-radius * 0.15, -radius * 0.68); ctx.lineTo(radius * 0.15, -radius * 0.68);
    } else if (classId === 'frostmage' || classId === 'pet-frostmage') {
      ctx.moveTo(0, -radius * 0.82); ctx.lineTo(radius * 0.15, -radius * 0.58);
      ctx.lineTo(0, -radius * 0.34); ctx.lineTo(-radius * 0.15, -radius * 0.58); ctx.closePath();
    } else if (classId === 'shaman') {
      ctx.moveTo(-radius * 0.16, -radius * 0.55); ctx.lineTo(radius * 0.16, -radius * 0.55);
      ctx.moveTo(0, -radius * 0.72); ctx.lineTo(0, -radius * 0.38);
    } else {
      ctx.moveTo(-radius * 0.13, -radius * 0.68); ctx.lineTo(radius * 0.13, -radius * 0.45);
      ctx.lineTo(-radius * 0.13, -radius * 0.22);
    }
    ctx.stroke();
  } else if (attack > 0.025) {
    ctx.globalAlpha = inheritedAlpha * attack * 0.58;
    if (classId === 'archer') {
      ctx.beginPath();
      ctx.moveTo(radius * 0.16, -radius * 0.5); ctx.lineTo(radius * 0.62, -radius * 0.08);
      ctx.lineTo(radius * 0.16, radius * 0.34);
      ctx.moveTo(radius * 0.62, -radius * 0.08); ctx.lineTo(-radius * 0.38, -radius * 0.08);
      ctx.stroke();
    } else if (classId === 'rogue') {
      ctx.beginPath();
      ctx.moveTo(-radius * 0.62, -radius * 0.3); ctx.lineTo(radius * 0.45, radius * 0.18);
      ctx.moveTo(-radius * 0.36, -radius * 0.48); ctx.lineTo(radius * 0.64, 0);
      ctx.stroke();
    } else if (classId === 'druid') {
      ctx.beginPath();
      ctx.moveTo(-radius * 0.52, radius * 0.12);
      ctx.quadraticCurveTo(0, -radius * 0.7, radius * 0.55, -radius * 0.12);
      ctx.moveTo(-radius * 0.08, -radius * 0.08); ctx.lineTo(radius * 0.2, -radius * 0.24);
      ctx.stroke();
    } else {
      // One broad crescent reads as a weapon follow-through without a particle burst.
      ctx.beginPath();
      ctx.arc(radius * 0.16, radius * 0.05, radius * 0.78, -1.18, 0.45);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export interface PolishTotem {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly type: 'fear' | 'lightning' | 'shockwave' | 'heal' | string;
}

/** Lightweight rune accent for an existing Shaman totem; draws no game effects. */
export function drawPolishTotem(
  ctx: CanvasRenderingContext2D,
  totem: PolishTotem,
  time: number,
): void {
  if (!Number.isFinite(time)) return;
  const color = totem.type === 'fear' ? '#c79bff' :
    totem.type === 'lightning' ? '#4dd0e1' :
      totem.type === 'shockwave' ? '#b78b56' :
        totem.type === 'heal' ? '#75e28c' : '#4dd0e1';
  const pulse = Math.sin(time * 3 + totem.id * 0.7);
  ctx.save();
  ctx.translate(totem.x, totem.y);
  ctx.globalAlpha *= 0.45 + pulse * 0.08;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, -16, 9 + pulse * 0.8, -0.7, 2.6);
  ctx.stroke();
  ctx.beginPath();
  if (totem.type === 'lightning') {
    ctx.moveTo(-2, -20); ctx.lineTo(1, -17); ctx.lineTo(-1, -14); ctx.lineTo(2, -12);
  } else if (totem.type === 'heal') {
    ctx.moveTo(0, -20); ctx.lineTo(0, -12);
    ctx.moveTo(-3, -16); ctx.lineTo(3, -16);
  } else if (totem.type === 'fear') {
    ctx.moveTo(-2, -18); ctx.lineTo(0, -20); ctx.lineTo(2, -18);
    ctx.moveTo(-2, -14); ctx.lineTo(0, -12); ctx.lineTo(2, -14);
  } else {
    ctx.moveTo(-3, -14); ctx.lineTo(0, -18); ctx.lineTo(3, -14);
  }
  ctx.stroke();
  ctx.restore();
}

/** Death accent for the preview dead branch; `alive === false` is authoritative. */
export function drawPolishDeath(
  ctx: CanvasRenderingContext2D,
  entity: PolishVfxEntity,
  time: number,
): void {
  if (entity.alive !== false || !Number.isFinite(time) ||
      !Number.isFinite(entity.x) || !Number.isFinite(entity.y)) return;
  const age = entity.hitFlashAt ? Math.max(0, time * 1000 - entity.hitFlashAt) / 1000 : Infinity;
  const impactDuration = entity.hitFlashDur && entity.hitFlashDur > 0 ? entity.hitFlashDur : 0.18;
  const impact = age < impactDuration ? Math.sin(clamp01(age / impactDuration) * Math.PI) : 0;
  const classId = entity.classId.replace(/^pet-/, '');
  const color = classId === 'priest' || classId === 'paladin' ? '#ffe3a0' :
    classId === 'frostmage' ? '#a6eaff' : classId === 'warlock' ? '#c58be8' :
      classId === 'druid' ? '#a2ca76' : classId === 'shaman' ? '#75d6d0' : '#c8ced5';
  const radius = Math.max(8, Math.min(25, entity.radius || 17));
  ctx.save();
  ctx.translate(entity.x, entity.y);
  ctx.globalAlpha *= 0.3 + impact * 0.35;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.35;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(0, radius * 0.58, radius * 0.55, radius * 0.16, 0, 0.2, Math.PI * 1.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-radius * 0.22, -radius * 0.34);
  ctx.lineTo(radius * 0.2, radius * 0.08);
  if (impact > 0.03) {
    ctx.moveTo(radius * 0.2, -radius * 0.34);
    ctx.lineTo(-radius * 0.2, radius * 0.02);
  }
  ctx.stroke();
  ctx.restore();
}