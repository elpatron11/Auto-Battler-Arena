import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { WarEntity, WarSnapshot } from '../../lib/guildWarTypes';
import { GuildWarMap } from '../GuildWarMap';

// DEV-ONLY SYNTHETIC FIXTURE. Generated locally in the browser: no network, no server writes, no matchmaking.
const CLASSES = ['warrior', 'archer', 'rogue', 'frostmage', 'warlock', 'druid', 'paladin', 'shaman', 'priest'];
const COLORS = ['#d86a52', '#5aa0d8', '#8fc65a', '#c78ae0', '#e0b84a'];
const CAMPS = [[240, 240], [2160, 240], [2160, 1420], [1200, 1480], [240, 1420]];
const WALLS = [[880, 440, 640, 28], [880, 440, 28, 640], [1492, 440, 28, 640], [880, 1052, 240, 28], [1280, 1052, 240, 28]].map(([x, y, w, h]) => ({ x, y, w, h }));
const KINDS = ['arrow', 'frostbolt', 'fireball', 'heal', 'shield', 'melee', 'shadowbolt', 'smite'];
const PETS = ['pet-archer', 'pet-archer-snake', 'pet-archer-turtle', 'pet-frostmage', 'add-hound', 'add-guard'];
type Ev = NonNullable<WarSnapshot['events']>[number];
let evId = 1;

function build(t: number, evs: Ev[]): WarSnapshot {
  const now = Math.round(t);
  const ents: WarEntity[] = Array.from({ length: 25 }, (_, i) => {
    const g = i % 5, cls = CLASSES[i % 9], ph = i * 0.9 + t / 2600, [cx, cy] = CAMPS[g];
    const tx = 1200 + Math.cos(ph) * (300 + (i % 4) * 120), ty = 780 + Math.sin(ph * 0.8) * (200 + (i % 3) * 120);
    const k = 0.35 + 0.25 * Math.sin(t / 5000 + i);
    const x = cx + (tx - cx) * k + Math.cos(ph * 2) * 40, y = cy + (ty - cy) * k + Math.sin(ph * 2) * 40;
    const dead = i === 7 && Math.floor(t / 6000) % 2 === 1;
    const tower = i === 3 || i === 11;
    return {
      id: `bench-${i}`, name: `Bench ${cls.slice(0, 4)}${i}`, guildId: `g${g}`, classId: cls,
      x: tower ? (i === 3 ? 950 : 1450) : x, y: tower ? 520 : y,
      hp: dead ? 0 : 60 + 40 * (0.5 + 0.5 * Math.sin(t / 3000 + i)), maxHp: 100, alive: !dead, respawnAt: now + 3000, role: i % 4 === 0 ? 'defender' : 'attacker',
      objective: 'auto', form: cls === 'druid' && Math.floor(t / 4000) % 2 ? 'bear' : 'normal', channel: i === 4 && Math.floor(t / 1500) % 2 ? { kind: 'channel', endsAt: now + 800 } : null,
      cooldowns: {}, towerId: tower ? `tower-${i === 3 ? 0 : 1}` : null, carrying: i === 9, wall: false,
      build: { ability: 'a', ultimate: 'u', talents: ['t1', 't2', 't3'].slice(0, i % 4), racial: i % 3 === 0 ? 'racial' : null, isCaptain: i % 5 === 0, skinId: i === 6 ? 'wingedPaladin' : i === 0 ? 'emberLord' : 'default' },
      combat: { casting: i === 8 && Math.floor(t / 1200) % 2 ? 'cast' : null, shield: i % 6 === 0 ? 20 : 0, cc: i === 13 && Math.floor(t / 3000) % 2 ? ['stun'] : i === 14 && Math.floor(t / 3500) % 2 ? ['freeze'] : [], form: 'normal', attackAt: now - (Math.floor(t / 700) + i) % 4 * 250, targetId: `bench-${(i + 1) % 25}` },
    } as WarEntity;
  });
  const summons: NonNullable<WarSnapshot['summons']> = PETS.map((classId, i) => {
    const o = ents[(i * 4 + 1) % 25];
    return { id: `bench-pet-${i}`, ownerId: o.id, guildId: o.guildId, classId, x: o.x + 50 + Math.sin(t / 700 + i) * 20, y: o.y + 40, hp: 40, maxHp: 50, alive: true };
  });
  const snap = {
    id: 'synthetic-benchmark', eventId: 'synthetic', startedAt: 0, endsAt: 1e12, now, tick: Math.floor(t / 100), finished: false, winners: [], owner: 'g1', contested: false, rewardsEnabled: false,
    guilds: COLORS.map((color, i) => ({ id: `g${i}`, name: `Synthetic ${i + 1}`, emblem: '', score: 0, color, camp: { x: CAMPS[i][0], y: CAMPS[i][1] } })),
    entities: ents,
    structures: [
      { id: 'tower-0', kind: 'tower', x: 950, y: 520, hp: 800, maxHp: 1000, shield: 0, disabledUntil: 0, immuneUntil: 0, occupant: 'bench-3' },
      { id: 'tower-1', kind: 'tower', x: 1450, y: 520, hp: 1000, maxHp: 1000, shield: 40, disabledUntil: 0, immuneUntil: 0, occupant: 'bench-11' },
      { id: 'gate', kind: 'gate', x: 1200, y: 1066, hp: Math.floor(t / 8000) % 2 ? 0 : 1500, maxHp: 1500, shield: 0, disabledUntil: 0, immuneUntil: 0, occupant: null },
      { id: 'core', kind: 'core', x: 1200, y: 700, hp: 2000, maxHp: 2000, shield: 0, disabledUntil: 0, immuneUntil: 0, occupant: null },
    ],
    ice: null,
    boss: { x: 1960, y: 1240, hp: 7000, maxHp: 10000, guildId: null, alive: true, corpseUntil: 0, resurrected: false, pactUntil: 0, target: 'bench-2' },
    banner: { x: 1200, y: 1180, carrier: null, availableAt: 0 },
    log: [], metrics: { tickMs: 0, p95Ms: 0, maxMs: 0, entityCount: 25, snapshotBytes: 0 },
    map: { width: 2400, height: 1600, scale: 2, walls: WALLS, ramps: [{ x: 1000, y: 640 }, { x: 1400, y: 640 }] },
    events: evs, summons,
  } as WarSnapshot;
  return snap;
}

function Bench() {
  const [snap, setSnap] = useState<WarSnapshot>(() => build(0, []));
  const [zoom, setZoom] = useState(1);
  const [stats, setStats] = useState('');
  useEffect(() => {
    const t0 = performance.now(); let evs: Ev[] = [];
    const id = setInterval(() => {
      const t = performance.now() - t0;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const a = Math.floor(Math.random() * 25), b = (a + 1 + Math.floor(Math.random() * 24)) % 25;
        const kind = KINDS[Math.floor(Math.random() * KINDS.length)];
        const A = build(t, []).entities;
        evs.push({ id: evId++, at: Math.round(t), kind, sourceId: `bench-${a}`, targetId: `bench-${b}`, x: A[a].x, y: A[a].y, tx: A[b].x, ty: A[b].y, amount: 12, label: kind });
      }
      evs = evs.slice(-20); setSnap(build(t, evs));
    }, 100);
    const si = setInterval(() => setStats(JSON.stringify(window.__guildWar3DStats ?? { renderer: 'none' })), 1000);
    return () => { clearInterval(id); clearInterval(si); };
  }, []);
  return (
    <div style={{ color: '#f0e9d7', fontFamily: 'sans-serif', padding: 8 }}>
      <div data-testid="banner-synthetic" style={{ background: '#7a2e2e', border: '2px solid #efc563', padding: '8px 10px', borderRadius: 6, fontWeight: 700, marginBottom: 8, fontSize: 14 }}>
        SYNTHETIC BENCHMARK FIXTURE - NOT A LIVE WAR - NO MATCHMAKING - NO SERVER WRITES. 25 generated heroes (all 9 classes), 6 pets, 1 boss, generated events.
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {[1, 2, 3].map((z) => <button key={z} type="button" data-testid={`button-bench-zoom-${z}`} onClick={() => setZoom(z)} style={{ padding: '6px 12px', background: zoom === z ? '#efc563' : '#1c2536', color: zoom === z ? '#10141c' : '#efc563', border: '1px solid #efc563', borderRadius: 6 }}>{z === 1 ? 'Fit' : `${z}x${z}`}</button>)}
      </div>
      <GuildWarMap snap={snap} meId="bench-2" zoom={zoom} />
      <pre data-testid="text-bench-stats" style={{ whiteSpace: 'pre-wrap', fontSize: 10, opacity: 0.8 }}>{stats}</pre>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><Bench /></StrictMode>);
