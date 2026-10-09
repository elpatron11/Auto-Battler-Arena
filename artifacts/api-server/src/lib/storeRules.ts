export const STORE_DAY_MS = 86_400_000;
export const STORE_WEEK_MS = STORE_DAY_MS * 7;
const ROTATION_ANCHOR = Date.UTC(2026, 9, 5); // Monday UTC; initial Rogue Week.

type Reward = {
  id: string; wins: number; kind: "gold" | "talent" | "spell" | "ultimate" | "badge";
  itemId: string; name: string; description: string; art: string; gold: number;
};
type PassTemplate = {
  id: string; classId: string; title: string; description: string; priceCents: number;
  targetWins: number; rewards: Reward[];
};

const goldReward = (wins: number, gold: number): Reward => ({
  id: `gold-${wins}`, wins, kind: "gold", itemId: "", name: `${gold} Gold`,
  description: "A Gold reward preview. Test claims do not change your real balance.",
  art: "", gold,
});

/** Add another class template and schedule entry here; reward IDs never change combat definitions. */
export const PASS_TEMPLATES: Record<string, PassTemplate> = {
  "rogue-week": {
    id: "rogue-week", classId: "rogue", title: "Rogue Week", priceCents: 799, targetWins: 35,
    description: "One paid track. Earn existing Rogue abilities and a prestige profile badge through Arena victories.",
    rewards: [
      goldReward(5, 75),
      goldReward(10, 100),
      {
        id: "escape-artist", wins: 15, kind: "talent", itemId: "rogue:escape",
        name: "Escape Artist", description: "+25% movement speed while below 35% HP.",
        art: "collectibles/rogue-escape-artist.webp", gold: 0,
      },
      {
        id: "disorient", wins: 20, kind: "spell", itemId: "ability:rogue", name: "Disorient",
        description: "Interrupts a cast and makes a nearby enemy wander helplessly for 6.5s.",
        art: "collectibles/rogue-disorient.webp", gold: 0,
      },
      goldReward(25, 150),
      {
        id: "umbral-step", wins: 30, kind: "ultimate", itemId: "ult:rogue", name: "Umbral Step",
        description: "Teleports behind the target to stun then silence; dodges everything and attacks 100% faster for 3s.",
        art: "collectibles/rogue-umbral-step.webp", gold: 0,
      },
      {
        id: "rogue-badge", wins: 35, kind: "badge", itemId: "rogue-week",
        name: "Rogue Week profile badge", description: "The final prestige reward. A permanent test badge preview, not a Rogue class or skin unlock.",
        art: "collectibles/rogue-precision.webp", gold: 0,
      },
    ],
  },
};
export const FEATURED_PASS_SCHEDULE = ["rogue-week"] as const;

const spells = [
  ["frostmage", "Blink"], ["priest", "Swift Shield"], ["archer", "Bear Trap"],
  ["paladin", "Gladiator"], ["warlock", "Doom Curse"], ["druid", "King of the Jungle"],
] as const;
const ultimates = [
  ["warrior", "Steel Cyclone"], ["priest", "Umbral Ascension"], ["frostmage", "Firestorm"],
  ["archer", "Beast Command"], ["shaman", "Elemental Fury"],
] as const;
const cycleIndex = (cycle: number, length: number) => ((cycle % length) + length) % length;
const art = (classId: string, name: string) =>
  `collectibles/${classId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.webp`;

export function storeWeekAt(now: number) {
  const date = new Date(now);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const startsAt = midnight - ((date.getUTCDay() + 6) % 7) * STORE_DAY_MS;
  const cycle = Math.floor((startsAt - ROTATION_ANCHOR) / STORE_WEEK_MS);
  const templateId = FEATURED_PASS_SCHEDULE[cycleIndex(cycle, FEATURED_PASS_SCHEDULE.length)];
  const template = PASS_TEMPLATES[templateId];
  const id = `${template.id}:${new Date(startsAt).toISOString().slice(0, 10)}`;
  return { id, offerId: `pass:${id}`, startsAt, endsAt: startsAt + STORE_WEEK_MS, template };
}

export function storeOffersAt(now: number) {
  const week = storeWeekAt(now);
  const dayStart = Math.floor(now / STORE_DAY_MS) * STORE_DAY_MS;
  const cycle = Math.floor((dayStart - ROTATION_ANCHOR) / STORE_DAY_MS);
  const rotatesAt = new Date(dayStart + STORE_DAY_MS).toISOString();
  const [spellClass, spellName] = spells[cycleIndex(cycle, spells.length)];
  const [ultClass, ultName] = ultimates[cycleIndex(cycle, ultimates.length)];
  return [
    {
      id: week.offerId, kind: "battle-pass" as const, name: week.template.title,
      classId: week.template.classId, itemId: week.id, priceCents: week.template.priceCents,
      description: "Weekly single paid track. Arena wins begin counting only after activation.",
      art: `class-portraits/${week.template.classId}.jpg`,
      rotatesAt: new Date(week.endsAt).toISOString(),
    },
    {
      id: "skin:wingedPaladin", kind: "skin" as const, name: "Winged Paladin",
      classId: "paladin", itemId: "wingedPaladin", priceCents: 799,
      description: "The existing golden winged armor and celestial glow. Cosmetic only.",
      art: "class-portraits/paladin.jpg", rotatesAt: null,
    },
    {
      id: "skin:emberLord", kind: "skin" as const, name: "Ember Lord Warrior",
      classId: "warrior", itemId: "emberLord", priceCents: 799,
      description: "The existing dark molten armor and glowing two-handed sword. Cosmetic only.",
      art: "class-portraits/warrior.jpg", rotatesAt: null,
    },
    {
      id: `spell:${dayStart}:ability:${spellClass}`, kind: "spell" as const, name: spellName,
      classId: spellClass, itemId: `ability:${spellClass}`, priceCents: 500,
      description: "An existing alternate spell. Its current combat effects remain unchanged.",
      art: art(spellClass, spellName), rotatesAt,
    },
    {
      id: `ultimate:${dayStart}:ult:${ultClass}`, kind: "ultimate" as const, name: ultName,
      classId: ultClass, itemId: `ult:${ultClass}`, priceCents: 600,
      description: "An existing alternate ultimate. Its current combat effects remain unchanged.",
      art: art(ultClass, ultName), rotatesAt,
    },
  ];
}

export function storeRewardState(requiredWins: number, wins: number, activated: boolean, claimed: boolean) {
  if (!activated) return "locked" as const;
  if (claimed) return "claimed" as const;
  return wins >= requiredWins ? "available" as const : "locked" as const;
}

export function storeTestFlowsEnabled(environment: string | undefined): boolean {
  // Fail closed if the hosting environment has not explicitly opted into development.
  return environment === "development";
}
