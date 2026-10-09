// The ranked resolver is intentionally independent of the browser's presentation
// simulation. Only server-held, frozen team snapshots affect ladder results.
export type RankedOutcome = "win" | "loss" | "draw";

const classes: Record<string, { hp: number; damage: number; interval: number; healing: number }> = {
  frostmage: { hp: 100, damage: 15, interval: 1.2, healing: 0 },
  priest: { hp: 85, damage: 5, interval: 1.3, healing: 12 },
  warrior: { hp: 190, damage: 11, interval: 1, healing: 0 },
  rogue: { hp: 140, damage: 12, interval: .75, healing: 0 },
  paladin: { hp: 170, damage: 13, interval: 1.1, healing: 4 },
  archer: { hp: 100, damage: 14, interval: 1, healing: 0 },
  warlock: { hp: 115, damage: 16, interval: 1.1, healing: 0 },
  druid: { hp: 145, damage: 8, interval: 1.15, healing: 7 },
  shaman: { hp: 140, damage: 8, interval: 1.15, healing: 8 },
};

type Build = { classId: string; ability?: string; ultimate?: string; talents?: string[]; skinId?: string };
type Team = { heroes: Build[]; captainClass?: string | null; captainRacial?: string | null };

export function parseRankedTeam(value: Record<string, unknown>, teamSize: 2 | 3 = 3): Team | null {
  const heroes = value.heroes;
  if (!Array.isArray(heroes) || heroes.length !== teamSize ||
    heroes.some((hero) => !hero || typeof hero !== "object" || Array.isArray(hero) ||
      typeof hero.classId !== "string" || !Object.hasOwn(classes, hero.classId) ||
      (hero.skinId !== undefined && (typeof hero.skinId !== "string" || hero.skinId.length > 60 ||
        (hero.skinId === "wingedPaladin" && hero.classId !== "paladin") ||
        (hero.skinId === "emberLord" && hero.classId !== "warrior"))) ||
      (hero.ability !== undefined && !["default", "custom"].includes(hero.ability)) ||
      (hero.ultimate !== undefined &&
        !["default", "custom", ...(hero.classId === "frostmage" ? ["polymorph"] : [])].includes(hero.ultimate)) ||
      (hero.talents !== undefined && (!Array.isArray(hero.talents) ||
        hero.talents.length > 2 || hero.talents.some((talent: unknown) => typeof talent !== "string" || talent.length > 40))))) return null;
  if (value.captainClass != null &&
    (typeof value.captainClass !== "string" || !heroes.some((hero) => hero.classId === value.captainClass))) return null;
  if (value.captainRacial != null &&
    (typeof value.captainRacial !== "string" || value.captainRacial.length > 40)) return null;
  return { heroes: heroes.map(({ classId, ability, ultimate, talents, skinId }) =>
    ({ classId, ability, ultimate, talents, ...(skinId ? {skinId} : {}) })), captainClass: value.captainClass as string | null | undefined,
    captainRacial: value.captainRacial as string | null | undefined };
}

// Fixed-step, deterministic ranked rules. No client-provided winner, statistics,
// random seed, clock, or combat trace is accepted for rating decisions.
export function resolveRankedBattle(attack: Team, defense: Team): RankedOutcome {
  const sides = [attack, defense].map((team) => team.heroes.map((hero) => {
    const base = classes[hero.classId];
    return { hp: base.hp, maxHp: base.hp, damage: base.damage,
      interval: Math.round(base.interval * 10), healing: base.healing, next: 0 };
  }));
  for (let step = 0; step < 1500; step++) {
    const hits: Array<{ side: number; target: number; damage: number }> = [];
    const heals: Array<{ side: number; target: number; amount: number }> = [];
    for (let side = 0; side < 2; side++) {
      const enemies = sides[1 - side];
      sides[side].forEach((hero) => {
        if (hero.hp <= 0 || step < hero.next) return;
        hero.next = step + hero.interval;
        const target = enemies.findIndex((enemy) => enemy.hp > 0);
        if (target >= 0) hits.push({ side: 1 - side, target, damage: hero.damage });
        if (hero.healing) {
          const ally = sides[side].reduce((index, candidate, i, allies) =>
            candidate.hp > 0 && candidate.hp / candidate.maxHp < allies[index].hp / allies[index].maxHp ? i : index, 0);
          if (sides[side][ally].hp > 0) heals.push({ side, target: ally, amount: hero.healing });
        }
      });
    }
    for (const hit of hits) sides[hit.side][hit.target].hp -= hit.damage;
    for (const heal of heals) {
      const hero = sides[heal.side][heal.target];
      if (hero.hp > 0) hero.hp = Math.min(hero.maxHp, hero.hp + heal.amount);
    }
    const alive = sides.map((team) => team.some((hero) => hero.hp > 0));
    if (!alive[0] || !alive[1]) return alive[0] ? "win" : alive[1] ? "loss" : "draw";
  }
  const score = sides.map((team) => team.reduce((sum, hero) => sum + Math.max(0, hero.hp) / hero.maxHp, 0));
  return Math.abs(score[0] - score[1]) < .01 ? "draw" : score[0] > score[1] ? "win" : "loss";
}