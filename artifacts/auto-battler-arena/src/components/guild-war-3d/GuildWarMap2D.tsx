import { useEffect, useRef } from 'react';
import type { WarSnapshot } from '../../lib/guildWarTypes';

const W = 1200, H = 800;
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
const CLASSES = ['warrior', 'archer', 'rogue', 'frostmage', 'warlock', 'druid', 'paladin', 'shaman', 'priest'];
const CLASS_TAG: Record<string, string> = { warrior: 'WA', archer: 'AR', rogue: 'RO', frostmage: 'FM', warlock: 'WL', druid: 'DR', paladin: 'PA', shaman: 'SH', priest: 'PR' };
const CLASS_COL: Record<string, string> = { warrior: '#b8553f', archer: '#6f9a55', rogue: '#6b6f8c', frostmage: '#6fb4d8', warlock: '#8a5ca8', druid: '#7b8f45', paladin: '#d8b45a', shaman: '#4c8fb0', priest: '#d8d2bd' };
const WALLS: [number, number, number, number][] = [[440, 220, 320, 14], [440, 220, 14, 320], [746, 220, 14, 320], [440, 526, 120, 14], [640, 526, 120, 14]];
const CAMPS: [number, number][] = [[120, 120], [1080, 120], [1080, 710], [600, 740], [120, 710]];

// Shared, load-once image cache (module level).
const imgs = new Map<string, HTMLImageElement>();
const ready = new Set<string>();
let imgVersion = 0;
function load(key: string, src: string) {
  if (imgs.has(key)) return;
  const im = new Image(); im.decoding = 'async';
  im.onload = () => { ready.add(key); imgVersion++; };
  im.src = src; imgs.set(key, im);
}
function ensureAssets() {
  load('ground', `${BASE}/assets/arena-environments/dungeon-ground.webp`);
  for (const c of CLASSES) load(c, `${BASE}/class-portraits/${c}.jpg`);
}

function bar(c: CanvasRenderingContext2D, x: number, y: number, w: number, f: number, col: string, h = 6) {
  c.fillStyle = '#080b12'; c.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
  c.fillStyle = col; c.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, f)), h);
}
function label(c: CanvasRenderingContext2D, t: string, x: number, y: number, size: number, col = '#f0e9d7') {
  c.font = `700 ${size}px 'Barlow Condensed', sans-serif`; c.textAlign = 'center';
  c.lineWidth = 4; c.strokeStyle = '#0a0e16'; c.lineJoin = 'round'; c.strokeText(t, x, y);
  c.fillStyle = col; c.fillText(t, x, y);
}

function drawStatic(c: CanvasRenderingContext2D) {
  const g = c.createRadialGradient(600, 400, 80, 600, 400, 780); g.addColorStop(0, '#2a3a50'); g.addColorStop(1, '#0e1520');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const gi = imgs.get('ground');
  if (gi && ready.has('ground')) {
    const s = Math.max(W / gi.naturalWidth, H / gi.naturalHeight);
    const dw = gi.naturalWidth * s, dh = gi.naturalHeight * s;
    c.globalAlpha = 0.85; c.drawImage(gi, (W - dw) / 2, (H - dh) / 2, dw, dh); c.globalAlpha = 1;
    c.fillStyle = 'rgba(22,34,52,0.42)'; c.fillRect(0, 0, W, H);
  }
  const v = c.createRadialGradient(600, 400, 300, 600, 400, 780); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(5,8,14,0.6)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);
  // Flat path highlights from camps to the gate approach (ground markings only).
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  for (const [x, y] of CAMPS) {
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo((x + 600) / 2, (y + 600) / 2 + (y < 400 ? 60 : -20), 600, 580);
    c.strokeStyle = 'rgba(239,197,99,0.10)'; c.lineWidth = 26; c.stroke();
    c.strokeStyle = 'rgba(239,197,99,0.22)'; c.lineWidth = 2; c.setLineDash([10, 14]); c.stroke(); c.setLineDash([]);
  }
  c.restore();
  // Boss arena: flat rune ring
  c.save(); c.translate(980, 620);
  c.fillStyle = 'rgba(90,30,40,0.25)'; c.beginPath(); c.arc(0, 0, 118, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(214,120,110,0.55)'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 118, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 100, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.beginPath(); c.moveTo(Math.cos(a) * 100, Math.sin(a) * 100); c.lineTo(Math.cos(a) * 118, Math.sin(a) * 118); c.stroke(); }
  c.restore();
  // Castle floor
  const fl = c.createLinearGradient(0, 220, 0, 540); fl.addColorStop(0, '#38465a'); fl.addColorStop(1, '#2a3547');
  c.fillStyle = fl; c.fillRect(440, 220, 320, 320);
  c.strokeStyle = 'rgba(160,175,195,0.12)'; c.lineWidth = 1;
  for (let x = 460; x < 760; x += 40) { c.beginPath(); c.moveTo(x, 234); c.lineTo(x, 526); c.stroke(); }
  for (let y = 240; y < 526; y += 40) { c.beginPath(); c.moveTo(454, y); c.lineTo(746, y); c.stroke(); }
  c.strokeStyle = 'rgba(239,197,99,0.3)'; c.lineWidth = 2; c.beginPath(); c.arc(600, 330, 42, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = 'rgba(239,197,99,0.16)'; c.lineWidth = 8; c.beginPath(); c.moveTo(600, 372); c.lineTo(600, 520); c.stroke();
  // Camp pads
  for (const [x, y] of CAMPS) {
    c.fillStyle = 'rgba(14,20,30,0.5)'; c.beginPath(); c.arc(x, y, 46, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(239,197,99,0.45)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 46, 0, Math.PI * 2); c.stroke();
  }
  // Walls: slate masonry, gold trim, torch sconces placed ON wall bodies.
  for (const [x, y, w, h] of WALLS) {
    const wg = c.createLinearGradient(x, y, x + (w > h ? 0 : w), y + (w > h ? h : 0));
    wg.addColorStop(0, '#9aa6b8'); wg.addColorStop(1, '#5d697c');
    c.fillStyle = wg; c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(30,38,52,0.7)'; c.lineWidth = 1;
    if (w > h) for (let i = x + 16; i < x + w; i += 16) { c.beginPath(); c.moveTo(i, y); c.lineTo(i, y + h); c.stroke(); }
    else for (let j = y + 16; j < y + h; j += 16) { c.beginPath(); c.moveTo(x, j); c.lineTo(x + w, j); c.stroke(); }
    c.strokeStyle = '#efc563'; c.lineWidth = 1.5; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  for (const [x, y] of [[440, 220], [746, 220], [440, 526], [746, 526], [560, 533], [640, 533]]) {
    const cx = x === 440 || x === 746 ? x + 7 : x, cy = y === 220 ? 227 : 533;
    c.fillStyle = '#2a2018'; c.fillRect(cx - 3, cy - 3, 6, 6);
    c.fillStyle = '#ffb347'; c.beginPath(); c.arc(cx, cy, 2.6, 0, Math.PI * 2); c.fill();
  }
  label(c, 'CASTLE', 600, 266, 20, '#c9d3e2');
}

export function GuildWarMap2D({ snap, meId, zoom }: { snap: WarSnapshot | null; meId: string | null; zoom: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const snapRef = useRef(snap); snapRef.current = snap;
  const meRef = useRef(meId); meRef.current = meId;
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const pos = useRef(new Map<string, { x: number; y: number }>());
  const hpPrev = useRef(new Map<string, { hp: number; hit: number }>());
  const stat = useRef<{ cv: HTMLCanvasElement | null; ratio: number; ver: number }>({ cv: null, ratio: 0, ver: -1 });

  useEffect(() => {
    ensureAssets();
    let raf = 0, lastFrame = 0;
    const draw = (time = 0) => {
      raf = requestAnimationFrame(draw);
      if (document.hidden || time - lastFrame < 33) return;
      lastFrame = time;
      const cv = ref.current; const s = snapRef.current; if (!cv) return;
      const c = cv.getContext('2d'); if (!c) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const displayWidth = Math.max(320, Math.min(2400, cv.getBoundingClientRect().width));
      const tw = Math.round(Math.min(2400, displayWidth * ratio)), th = Math.round(tw * H / W);
      if (cv.width !== tw || cv.height !== th) { cv.width = tw; cv.height = th; stat.current.ver = -1; }
      // cached static layer
      const st = stat.current;
      if (!st.cv) st.cv = document.createElement('canvas');
      if (st.ver !== imgVersion || st.cv.width !== tw) {
        st.cv.width = tw; st.cv.height = th;
        const sc = st.cv.getContext('2d');
        if (sc) { sc.setTransform(tw / W, 0, 0, th / H, 0, 0); drawStatic(sc); }
        st.ver = imgVersion;
      }
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(st.cv, 0, 0);
      c.setTransform(tw / W, 0, 0, th / H, 0, 0);
      const t = time / 1000;
      // torch flicker
      for (const [x, y] of [[440, 220], [746, 220], [440, 526], [746, 526]]) {
        const fx = x === 440 || x === 746 ? x + 7 : x; const fy = y === 220 ? 227 : 533;
        c.fillStyle = `rgba(255,170,70,${0.14 + 0.06 * Math.sin(t * 9 + x)})`;
        c.beginPath(); c.arc(fx, fy, 15 + Math.sin(t * 7 + y), 0, Math.PI * 2); c.fill();
      }
      if (!s) { label(c, 'AWAITING THE WAR HORN', 600, 420, 26, '#efc563'); return; }
      const gate = s.structures.find((x) => x.kind === 'gate');
      const gateUp = gate ? gate.hp > 0 : true;
      const gcol = (id: string | null) => s.guilds.find((x) => x.id === id)?.color ?? '#c0c6d2';
      const owner = s.guilds.find((x) => x.id === s.owner);
      if (owner) { c.fillStyle = owner.color + '2e'; c.fillRect(454, 234, 292, 292); }
      // gate bridge
      if (gateUp) {
        c.fillStyle = '#8a6a3a'; c.fillRect(560, 526, 80, 14);
        c.strokeStyle = '#3a2a14'; c.lineWidth = 1;
        for (let x = 570; x < 640; x += 10) { c.beginPath(); c.moveTo(x, 526); c.lineTo(x, 540); c.stroke(); }
        c.strokeStyle = '#efc563'; c.lineWidth = 2; c.strokeRect(560, 526, 80, 14);
      }
      if (s.ice) {
        c.fillStyle = 'rgba(150,215,245,0.55)'; c.fillRect(560, 520, 80, 26);
        c.strokeStyle = '#d6f0fc'; c.lineWidth = 2; c.strokeRect(560, 520, 80, 26);
        bar(c, 600, 550, 70, s.ice.hp / (s.ice.maxHp || 1), '#8ec9ee');
      }
      // camps
      for (const gd of s.guilds) {
        const { x, y } = gd.camp;
        c.beginPath(); c.arc(x, y, 38, 0, Math.PI * 2); c.fillStyle = gd.color + '44'; c.fill();
        c.strokeStyle = gd.color; c.lineWidth = 3; c.stroke();
        label(c, gd.name.slice(0, 14), x, y + 66, 18);
        // pennant on pole at camp edge
        const sway = Math.sin(t * 2 + x) * 3;
        c.fillStyle = '#c9b27a'; c.fillRect(x - 36, y - 62, 3, 40);
        c.fillStyle = gd.color; c.beginPath(); c.moveTo(x - 33, y - 62); c.lineTo(x - 5 + sway, y - 54); c.lineTo(x - 33, y - 44); c.fill();
      }
      // structures
      for (const sd of s.structures) {
        const alive = sd.hp > 0;
        const isCore = sd.kind === 'core' || sd.kind === 'crystal';
        c.fillStyle = alive ? (isCore ? '#d8b45a' : '#9fb0c6') : '#3a3f48';
        c.fillRect(sd.x - 14, sd.y - 14, 28, 28);
        c.strokeStyle = alive ? '#efc563' : '#555'; c.lineWidth = 2; c.strokeRect(sd.x - 14, sd.y - 14, 28, 28);
        if (sd.shield > 0) { c.strokeStyle = '#8ec9ee'; c.lineWidth = 3; c.beginPath(); c.arc(sd.x, sd.y, 24 + Math.sin(t * 4), 0, Math.PI * 2); c.stroke(); }
        bar(c, sd.x, sd.y + 20, 54, sd.hp / (sd.maxHp || 1), '#a1dfbc');
        label(c, sd.kind.toUpperCase(), sd.x, sd.y - 20, 15);
        const oc = sd.occupant ? s.entities.find((e) => e.id === sd.occupant) : null;
        if (oc) { c.strokeStyle = gcol(oc.guildId); c.lineWidth = 3; c.strokeRect(sd.x - 19, sd.y - 19, 38, 38); }
      }
      // boss
      const b = s.boss;
      c.save();
      c.beginPath(); c.arc(b.x, b.y, 32 + (b.alive ? Math.sin(t * 2) * 1.5 : 0), 0, Math.PI * 2);
      c.fillStyle = b.alive ? '#7a2e3a' : '#2c2f36'; c.fill();
      c.strokeStyle = b.guildId ? gcol(b.guildId) : '#c0c6d2'; c.lineWidth = 5; c.stroke();
      if (b.alive) { c.fillStyle = '#f0c8b8'; c.beginPath(); c.moveTo(b.x - 16, b.y - 6); c.lineTo(b.x - 6, b.y + 2); c.lineTo(b.x - 18, b.y + 4); c.fill(); c.beginPath(); c.moveTo(b.x + 16, b.y - 6); c.lineTo(b.x + 6, b.y + 2); c.lineTo(b.x + 18, b.y + 4); c.fill(); }
      c.restore();
      bar(c, b.x, b.y + 42, 90, b.hp / (b.maxHp || 1), '#f0a9a6', 8);
      label(c, b.alive ? 'BOSS' : 'BOSS DOWN', b.x, b.y - 42, 20, '#f6c9c2');
      // banner
      if (!s.banner.carrier && s.banner.availableAt <= s.now) {
        const bx = s.banner.x, by = s.banner.y, sw = Math.sin(t * 3) * 3;
        c.fillStyle = '#c9b27a'; c.fillRect(bx - 2, by - 28, 4, 46);
        c.fillStyle = '#efc563'; c.beginPath(); c.moveTo(bx + 2, by - 28); c.lineTo(bx + 32 + sw, by - 18); c.lineTo(bx + 2, by - 6); c.fill();
        label(c, 'BANNER', bx, by + 38, 17, '#efc563');
      }
      // units
      const small = zoomRef.current < 2;
      const R = 15;
      for (const e of s.entities) {
        let p = pos.current.get(e.id);
        if (!p) { p = { x: e.x, y: e.y }; pos.current.set(e.id, p); }
        p.x += (e.x - p.x) * 0.3; p.y += (e.y - p.y) * 0.3;
        let hp = hpPrev.current.get(e.id);
        if (!hp) { hp = { hp: e.hp, hit: -1000000 }; hpPrev.current.set(e.id, hp); }
        if (e.hp < hp.hp - 0.5 && e.alive) hp.hit = time;
        hp.hp = e.hp;
        const col = gcol(e.guildId);
        const me = e.id === meRef.current;
        const r = me ? R + 3 : R;
        const key = ready.has(e.classId) ? imgs.get(e.classId) : undefined;
        c.save();
        c.globalAlpha = e.alive ? 1 : 0.4;
        if (e.alive) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(p.x, p.y + r - 2, r, r * 0.4, 0, 0, Math.PI * 2); c.fill(); }
        c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.fillStyle = CLASS_COL[e.classId] ?? '#555'; c.fill();
        if (key && key.naturalWidth) {
          c.save(); c.beginPath(); c.arc(p.x, p.y, r - 1, 0, Math.PI * 2); c.clip();
          const sz = Math.min(key.naturalWidth, key.naturalHeight);
          const sx = (key.naturalWidth - sz) / 2, sy = Math.min(key.naturalHeight - sz, (key.naturalHeight - sz) * 0.25);
          c.drawImage(key, sx, sy, sz, sz, p.x - r, p.y - r, r * 2, r * 2);
          c.restore();
        } else {
          c.fillStyle = '#0b0f18'; c.font = "800 13px 'Barlow Condensed', sans-serif"; c.textAlign = 'center';
          c.fillText(CLASS_TAG[e.classId] ?? '??', p.x, p.y + 4.5);
        }
        c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.lineWidth = 3.5; c.strokeStyle = col; c.stroke();
        if (e.role === 'defender') { c.beginPath(); c.arc(p.x, p.y, r + 4, 0, Math.PI * 2); c.lineWidth = 2; c.strokeStyle = '#efc563'; c.stroke(); }
        if (me) { c.beginPath(); c.arc(p.x, p.y, r + 8, 0, Math.PI * 2); c.lineWidth = 2; c.strokeStyle = '#fff'; c.setLineDash([5, 4]); c.stroke(); c.setLineDash([]); }
        const hitAge = time - hp.hit;
        if (hitAge < 350) { c.globalAlpha = 1 - hitAge / 350; c.beginPath(); c.arc(p.x, p.y, r + 2 + hitAge / 40, 0, Math.PI * 2); c.lineWidth = 3; c.strokeStyle = '#ff6a5a'; c.stroke(); }
        c.restore();
        if (e.alive) {
          bar(c, p.x, p.y + r + 5, 32, e.hp / (e.maxHp || 1), e.hp / (e.maxHp || 1) < 0.35 ? '#f0a9a6' : '#a1dfbc');
          if (e.channel) {
            c.beginPath(); c.arc(p.x, p.y, r + 12, t * 3, t * 3 + Math.PI * 1.5); c.lineWidth = 3; c.strokeStyle = '#8ec9ee'; c.stroke();
            label(c, e.channel.kind, p.x, p.y + r + 28, 15, '#8ec9ee');
          }
        }
        if (!small || me) label(c, e.alive ? e.name.slice(0, 12) : `${e.name.slice(0, 8)} ${Math.max(0, Math.ceil((e.respawnAt - s.now) / 1000))}s`, p.x, p.y - r - 8, 15);
        else if (!e.alive) label(c, `${Math.max(0, Math.ceil((e.respawnAt - s.now) / 1000))}s`, p.x, p.y - r - 6, 15);
        if (e.carrying) { c.fillStyle = '#efc563'; c.beginPath(); c.moveTo(p.x, p.y - r - 30); c.lineTo(p.x + 16, p.y - r - 24); c.lineTo(p.x, p.y - r - 18); c.fill(); c.fillRect(p.x - 1.5, p.y - r - 30, 3, 20); }
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} style={{ width: `${zoom * 100}%` }} role="img" aria-label="Guild Wars battlefield map" data-testid="canvas-war-map" />;
}
