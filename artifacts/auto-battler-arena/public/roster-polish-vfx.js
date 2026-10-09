(function (root) {
  'use strict';

  let lowFx = false;
  let used = 0;
  let metrics = { accentEffects: 0, accentPrimitives: 0, shadows: 0, entities: 0, budget: 12 };
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const TAU = Math.PI * 2;

  function beginFrame(options) {
    lowFx = !!(options && options.low);
    used = 0;
    metrics = { accentEffects: 0, accentPrimitives: 0, shadows: 0, entities: 0, budget: lowFx ? 6 : 12 };
  }

  function getOptions(options) {
    const opts = options && typeof options === 'object' ? options : {};
    // beginFrame is the only budget boundary. Entity and effect draws may use
    // different clock samples inside the same actual frame.
    if (opts.low !== undefined) lowFx = !!opts.low;
    metrics.budget = lowFx ? 6 : 12;
    return opts;
  }

  function reserveAccent(options) {
    getOptions(options);
    if (lowFx || used >= (lowFx ? 6 : 12)) return false;
    used += 1;
    metrics.accentEffects += 1;
    return true;
  }

  function validContext(ctx) {
    return !!(ctx && typeof ctx.save === 'function' && typeof ctx.restore === 'function' &&
      typeof ctx.beginPath === 'function' && typeof ctx.moveTo === 'function' &&
      typeof ctx.lineTo === 'function' && typeof ctx.stroke === 'function');
  }

  function colorOf(fx) {
    return typeof fx.color === 'string' && fx.color.length < 80 ? fx.color : '#d9f2ff';
  }

  function geometry(fx) {
    if (finite(fx.x1) && finite(fx.y1) && finite(fx.x2) && finite(fx.y2)) {
      return { x1: fx.x1, y1: fx.y1, x2: fx.x2, y2: fx.y2 };
    }
    if (finite(fx.x) && finite(fx.y)) {
      const x2 = finite(fx.x2) ? fx.x2 : fx.x;
      const y2 = finite(fx.y2) ? fx.y2 : fx.y;
      return { x1: fx.x, y1: fx.y, x2, y2 };
    }
    return null;
  }

  function abilityStyle(fx) {
    const key = `${fx.kind || ''} ${fx.cls || ''}`.toLowerCase();
    if (/frost|ice|blizzard|cryomancer/.test(key)) return 'frost';
    if (/holy|smite|blessing|radiant|resurrect|paladin|priest/.test(key)) return 'holy';
    if (/fel|chaos|doom|shadow|warlock/.test(key)) return 'fel';
    if (/nature|tree|beast|druid|wild|surge/.test(key)) return 'nature';
    if (/storm|lightning|thunder|shaman/.test(key)) return 'storm';
    return 'neutral';
  }

  function pOf(fx) {
    if (!finite(fx.t)) return 0;
    const duration = finite(fx.dur) && fx.dur > 0 ? fx.dur : 0;
    return duration > 0 ? clamp(fx.t / duration, 0, 1) : 1;
  }

  // Decorative overlays never own effect lifetime. The legacy renderer remains
  // responsible for updating t and removing expired effects.
  function drawEffect(ctx, fx, options) {
    if (!fx || typeof fx !== 'object' || !validContext(ctx)) return false;
    const opts = getOptions(options);
    if (lowFx) return false;
    const p = pOf(fx);
    if (p >= 1) return false;

    const type = fx.type;
    const g = geometry(fx);
    const radial = finite(fx.x) && finite(fx.y);
    const supported = type === 'projectile' || type === 'impact' || type === 'aoe' ||
      type === 'aoeRune' || type === 'slash' || type === 'statusBurst' ||
      type === 'deathBurst' || type === 'namedAbility';
    if (!supported || (!g && !radial)) return false;
    if (!reserveAccent(opts)) return false;

    const color = colorOf(fx);
    const alpha = clamp(1 - p, 0, 1);
    const dx = g ? g.x2 - g.x1 : 0;
    const dy = g ? g.y2 - g.y1 : 0;
    const length = g ? Math.hypot(dx, dy) : 0;
    const angle = length > 0.001 ? Math.atan2(dy, dx) : (finite(fx.ang) ? fx.ang : 0);

    try {
      ctx.save();
      ctx.globalAlpha = alpha * 0.68;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.35;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (type === 'projectile' && g && length > 0.001) {
        // Three tapered ticks trail the existing projectile path.
        for (let i = 1; i <= 3; i++) {
          const q = clamp(p + i * 0.045, 0, 1);
          const x = g.x1 + dx * q;
          const y = g.y1 + dy * q;
          const tail = 3 + i * 2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - Math.cos(angle) * tail, y - Math.sin(angle) * tail);
          ctx.stroke();
          metrics.accentPrimitives += 1;
        }
      } else if (type === 'impact') {
        const radius = finite(fx.size) ? clamp(fx.size, 2, 48) : 12;
        for (let i = 0; i < 3; i++) {
          const a = (TAU * i) / 3 + p * 1.2;
          const x = fx.x + Math.cos(a) * radius * (0.35 + p * 0.5);
          const y = fx.y + Math.sin(a) * radius * (0.35 + p * 0.5);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3);
          ctx.stroke();
          metrics.accentPrimitives += 1;
        }
      } else if (type === 'slash') {
        if (!finite(fx.ang) || !finite(fx.len)) return false;
        const reach = clamp(fx.len, 4, 100);
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, reach * (0.52 + p * 0.12), fx.ang - 0.52, fx.ang + 0.52);
        ctx.stroke();
        metrics.accentPrimitives += 1;
      } else if (type === 'aoe' || type === 'aoeRune') {
        if (!finite(fx.r) || fx.r <= 0) return false;
        const radius = clamp(fx.r, 2, 400) * (0.72 + p * 0.18);
        ctx.beginPath();
        ctx.ellipse(fx.x, fx.y, radius, radius * 0.34, 0, 0, TAU);
        ctx.stroke();
        metrics.accentPrimitives += 1;
      } else if (type === 'statusBurst') {
        if (!finite(fx.r)) return false;
        const radius = clamp(fx.r + p * 8, 3, 120);
        ctx.beginPath();
        ctx.moveTo(fx.x - radius * 0.25, fx.y - radius * 0.28);
        ctx.lineTo(fx.x, fx.y - radius * 0.55);
        ctx.lineTo(fx.x + radius * 0.25, fx.y - radius * 0.28);
        ctx.stroke();
        metrics.accentPrimitives += 1;
      } else if (type === 'deathBurst') {
        const side = fx.facing === -1 ? -1 : 1;
        for (let i = 0; i < 2; i++) {
          const yy = fx.y - 4 - i * 6 - p * 5;
          ctx.beginPath();
          ctx.moveTo(fx.x + side * (4 + i * 2), yy);
          ctx.lineTo(fx.x + side * (8 + i * 2), yy - 3);
          ctx.stroke();
          metrics.accentPrimitives += 1;
        }
      } else if (type === 'namedAbility') {
        if (!g) return false;
        const style = abilityStyle(fx);
        if (style === 'frost') {
          // Faceted ice splinters travel along the existing ability trajectory.
          for (let i = 1; i <= 3; i++) {
            const q = clamp(p + i * 0.08, 0, 1);
            const x = g.x1 + dx * q;
            const y = g.y1 + dy * q;
            const nx = -Math.sin(angle) * 2.4;
            const ny = Math.cos(angle) * 2.4;
            ctx.beginPath();
            ctx.moveTo(x - nx, y - ny);
            ctx.lineTo(x + Math.cos(angle) * 4, y + Math.sin(angle) * 4);
            ctx.lineTo(x + nx, y + ny);
            ctx.stroke();
            metrics.accentPrimitives += 1;
          }
        } else if (style === 'holy') {
          const x = g.x2;
          const y = g.y2;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(x + i * 5, y - 6);
            ctx.lineTo(x + i * 3, y + 1);
            ctx.stroke();
            metrics.accentPrimitives += 1;
          }
        } else if (style === 'fel') {
          const q = clamp(p, 0.12, 0.88);
          const x = g.x1 + dx * q;
          const y = g.y1 + dy * q;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(angle + i * 0.58) * 5, y + Math.sin(angle + i * 0.58) * 5);
            ctx.stroke();
            metrics.accentPrimitives += 1;
          }
        } else if (style === 'nature') {
          for (let i = 1; i <= 3; i++) {
            const q = clamp(p + i * 0.09, 0, 1);
            const x = g.x1 + dx * q;
            const y = g.y1 + dy * q;
            ctx.beginPath();
            ctx.ellipse(x, y, 2.6, 1.15, angle + i * 0.7, 0, TAU);
            ctx.stroke();
            metrics.accentPrimitives += 1;
          }
        } else if (style === 'storm') {
          const q = clamp(p, 0.08, 0.9);
          const x = g.x1 + dx * q;
          const y = g.y1 + dy * q;
          ctx.beginPath();
          ctx.moveTo(g.x1, g.y1);
          ctx.lineTo(x - Math.sin(angle) * 3, y + Math.cos(angle) * 3);
          ctx.lineTo(x + Math.sin(angle) * 3, y - Math.cos(angle) * 3);
          ctx.lineTo(g.x2, g.y2);
          ctx.stroke();
          metrics.accentPrimitives += 1;
        } else {
          ctx.beginPath();
          ctx.arc(g.x2, g.y2, 3 + p * 2, 0, TAU);
          ctx.stroke();
          metrics.accentPrimitives += 1;
        }
      }
    } catch (_error) {
      // Rendering is best-effort; legacy effect drawing and teardown continue.
    } finally {
      try { ctx.restore(); } catch (_error) { /* preserve canvas state when possible */ }
    }
    return false;
  }

  function drawEntity(ctx, e, time, pose, options) {
    const opts = getOptions(options);
    metrics.entities += 1;
    if (!e || !pose || !validContext(ctx) || lowFx || (e.status && e.status.invis)) return false;
    const x = e.x;
    const y = e.y;
    if (!finite(x) || !finite(y)) return false;
    const classId = typeof e.classId === 'string' ? e.classId.replace(/^pet-/, '') : '';
    const isActive = (finite(pose.attack) && pose.attack > 0.15) ||
      (finite(pose.cast) && pose.cast > 0.15);
    if (!isActive || !reserveAccent(opts)) return false;

    const side = pose.facing === -1 ? -1 : 1;
    const radius = finite(e.radius) ? clamp(e.radius, 3, 80) : 16;
    const color = classId === 'frostmage' ? '#c9f6ff' :
      classId === 'priest' || classId === 'paladin' ? '#fff0bd' :
      classId === 'warlock' ? '#c99cff' :
      classId === 'druid' ? '#a7dd7a' :
      classId === 'shaman' ? '#75edff' : '#f6e4c1';
    try {
      ctx.save();
      ctx.globalAlpha = 0.35 + clamp(pose.attack || pose.cast || 0, 0, 1) * 0.45;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + side * radius * 0.5, y - radius * 0.4);
      ctx.lineTo(x + side * (radius * 0.9), y - radius * 0.4);
      ctx.stroke();
      metrics.accentPrimitives += 1;
    } catch (_error) {
      // No effect is created or gameplay state touched.
    } finally {
      try { ctx.restore(); } catch (_error) { /* no-op */ }
    }
    return false;
  }

  function drawShadow(ctx, e, time, pose, options) {
    getOptions(options);
    if (!e || !validContext(ctx) || !finite(e.x) || !finite(e.y)) return false;
    const radius = finite(e.radius) ? clamp(e.radius, 2, 80) : 16;
    const lift = pose && finite(pose.death) ? clamp(pose.death, 0, 1) : 0;
    const alpha = (e.status && e.status.invis) ? 0.18 : 0.3;
    try {
      ctx.save();
      ctx.globalAlpha = alpha * (1 - lift * 0.65);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + radius * (0.78 + lift * 0.1), radius * 0.86, Math.max(1, radius * 0.28), 0, 0, TAU);
      ctx.fill();
      metrics.shadows += 1;
    } catch (_error) {
      // Shadows are optional and isolated from the gameplay renderer.
    } finally {
      try { ctx.restore(); } catch (_error) { /* no-op */ }
    }
    return true;
  }

  const api = { beginFrame, drawEffect, drawEntity, drawShadow };
  Object.defineProperty(api, 'metrics', { get: () => Object.freeze({ ...metrics }) });
  root.RosterPolishVfx = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis);