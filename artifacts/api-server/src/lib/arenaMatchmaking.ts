export const DAILY_OPPONENT_CHALLENGE_LIMIT = 5;

export function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function chooseRandomEligibleOpponent<T extends { id: string }>(
  candidates: T[],
  challengeCounts: Map<string, number>,
  limit = DAILY_OPPONENT_CHALLENGE_LIMIT,
): T | null {
  const eligible = candidates.filter((candidate) =>
    (challengeCounts.get(candidate.id) ?? 0) < limit
  );
  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

type BotHero = string | {
  classId: string;
  ability?: "default" | "custom";
  ultimate?: "default" | "custom" | "polymorph";
};

export const ARENA_BOTS = [
  { id: "arena-bot-01", name: "Arena Bot • Ember Vanguard", rating: 850, heroes: ["warrior", "priest", "rogue"] },
  { id: "arena-bot-02", name: "Arena Bot • Frostbound Trio", rating: 920, heroes: ["frostmage", "paladin", "archer"] },
  { id: "arena-bot-03", name: "Arena Bot • Wildwood Circle", rating: 980, heroes: ["druid", "shaman", "warrior"] },
  { id: "arena-bot-04", name: "Arena Bot • Shadow Company", rating: 1040, heroes: ["warlock", "rogue", "priest"] },
  { id: "arena-bot-05", name: "Arena Bot • Ironwall", rating: 1100, heroes: ["paladin", "warrior", "priest"] },
  { id: "arena-bot-06", name: "Arena Bot • Stormcallers", rating: 1160, heroes: ["shaman", "frostmage", "archer"] },
  { id: "arena-bot-07", name: "Arena Bot • Night Prowlers", rating: 1220, heroes: ["rogue", "rogue", "warlock"] },
  { id: "arena-bot-08", name: "Arena Bot • Sunlit Grove", rating: 1280, heroes: ["druid", "priest", "paladin"] },
  { id: "arena-bot-09", name: "Arena Bot • Sharpshot Syndicate", rating: 1340, heroes: ["archer", "warrior", "frostmage"] },
  { id: "arena-bot-10", name: "Arena Bot • Arcane Tempest", rating: 1400, heroes: ["warlock", "shaman", "frostmage"] },
  { id: "arena-bot-11", name: "Arena Bot • Firelight Wardens", rating: 1600, heroes: [
    { classId: "frostmage", ability: "custom", ultimate: "custom" },
    { classId: "priest", ability: "custom" }, "paladin",
  ] },
  { id: "arena-bot-12", name: "Arena Bot • Jungle Shadows", rating: 1600, heroes: [
    { classId: "druid", ability: "custom" },
    { classId: "priest", ultimate: "custom" }, "rogue",
  ] },
  { id: "arena-bot-13", name: "Arena Bot • Elemental Steel", rating: 1600, heroes: [
    { classId: "shaman", ultimate: "custom" },
    { classId: "warrior", ultimate: "custom" }, "druid",
  ] },
  { id: "arena-bot-14", name: "Arena Bot • Hexbound Guardians", rating: 1700, heroes: [
    { classId: "frostmage", ability: "custom", ultimate: "polymorph" },
    { classId: "priest", ability: "custom" },
    { classId: "warrior", ultimate: "custom" },
  ] },
  { id: "arena-bot-15", name: "Arena Bot • Jungle Tempest", rating: 1700, heroes: [
    { classId: "druid", ability: "custom" },
    { classId: "shaman", ultimate: "custom" }, "paladin",
  ] },
  { id: "arena-bot-16", name: "Arena Bot • Shadow Cyclone", rating: 1700, heroes: [
    { classId: "warrior", ultimate: "custom" },
    { classId: "priest", ability: "custom", ultimate: "custom" }, "warlock",
  ] },
  { id: "arena-bot-17", name: "Arena Bot • Inferno Sovereigns", rating: 2000, heroes: [
    { classId: "frostmage", ability: "custom", ultimate: "custom" },
    { classId: "druid", ability: "custom" },
    { classId: "priest", ability: "custom" },
  ] },
  { id: "arena-bot-18", name: "Arena Bot • Hexstorm Council", rating: 2000, heroes: [
    { classId: "frostmage", ability: "custom", ultimate: "polymorph" },
    { classId: "shaman", ultimate: "custom" },
    { classId: "priest", ability: "custom", ultimate: "custom" },
  ] },
  { id: "arena-bot-19", name: "Arena Bot • Apex Shadowguard", rating: 2000, heroes: [
    { classId: "warrior", ultimate: "custom" },
    { classId: "priest", ability: "custom", ultimate: "custom" },
    { classId: "druid", ability: "custom" },
  ] },
] as const;

export function botDefense(heroes: readonly BotHero[]): Record<string, unknown> {
  const builds = heroes.map(hero => {
    const build = typeof hero === "string" ? { classId: hero } : hero;
    return {
      classId: build.classId,
      ability: build.ability ?? "default",
      ultimate: build.ultimate ?? "default",
      talents: [],
    };
  });
  return {
    heroes: builds,
    captainClass: builds[0]?.classId ?? null,
    captainRacial: null,
  };
}