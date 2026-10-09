import { sql, type SQL } from "drizzle-orm";

export const CLASS_IDS = [
  "frostmage", "priest", "warrior", "rogue", "paladin", "archer", "warlock", "druid", "shaman",
] as const;
export const RACIAL_IDS = ["nightelf", "tauren", "orc", "troll", "dwarf", "bloodelf", "goblin", "undead"] as const;
export const STARTER_TALENT: Record<string, string> = {
  frostmage: "frostbite", priest: "grace", warrior: "brutal", rogue: "precision",
  paladin: "devotion", archer: "marksman", warlock: "affliction", druid: "wildheart", shaman: "elements",
};
export const CLASS_TALENTS: Record<string, readonly string[]> = {
  frostmage: ["frostbite", "deepchill", "icearmor"],
  priest: ["grace", "warding", "lastgrace"],
  warrior: ["brutal", "iron", "executioner"],
  rogue: ["precision", "quickhands", "escape"],
  paladin: ["devotion", "aegis", "mercy"],
  archer: ["marksman", "scout", "hunter"],
  warlock: ["affliction", "demonhide", "malice"],
  druid: ["wildheart", "bearhide", "tigerfang"],
  shaman: ["elements", "earth", "spirit"],
};
export const MAX_GOLD = 2_147_483_647;
const spellIds = ["frostmage", "priest", "rogue", "paladin", "archer", "warlock", "druid"]
  .map((classId) => `ability:${classId}`);
const ultimateIds = ["warrior", "priest", "frostmage", "archer", "rogue", "shaman"]
  .map((classId) => `ult:${classId}`);
const talentIds = Object.entries(CLASS_TALENTS).flatMap(([classId, ids]) =>
  ids.filter((talentId) => talentId !== STARTER_TALENT[classId])
    .map((talentId) => `${classId}:${talentId}`));

export function legacyClassTalentUnlocks(classIds: string[]): Array<{ kind: string; itemId: string }> {
  return [...new Set(classIds)]
    .filter((classId) => CLASS_IDS.includes(classId as typeof CLASS_IDS[number]))
    .flatMap((classId) => CLASS_TALENTS[classId]
      .map((talentId) => ({ kind: "talent", itemId: `${classId}:${talentId}` })));
}

function positiveSetting(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const ECONOMY = {
  arenaGold: { win: 25, loss: 5 },
  dungeonGold: 25,
  localGold: { firstWins: 3, firstWinAmount: 35, laterWinAmount: 10 },
  arenaDrops: {
    win: { spell: 0.07, talent: 0.05, ultimate: 0.03 },
    loss: { spell: 0.01, talent: 0.01, ultimate: 0.005 },
  },
  duplicateLoss: { spell: 0.1, ultimate: 0.05 },
  marketTax: 0.1,
  classPrices: [0, 0, 0, 1000, 1500, 2250, 3250, 4500, 6000] as number[],
  classPriceAfterTenth: 8000,
  racialPrices: [750, 1250, 2000, 3000, 4500] as number[],
  racialPriceAfterSixth: 6000,
  tournament: {
    entry: 100,
    champion: 500,
    runnerUp: 50,
    entryLimit: positiveSetting("ARENA_TOURNAMENT_ENTRY_LIMIT", 3),
    entryWindowMs: positiveSetting("ARENA_TOURNAMENT_ENTRY_WINDOW_MS", 24 * 60 * 60 * 1000),
    minimumDurationMs: Math.max(90_000, positiveSetting("ARENA_TOURNAMENT_MIN_DURATION_MS", 90_000)),
  },
  antiFarming: {
    windowMs: positiveSetting("ARENA_FARMING_WINDOW_MS", 24 * 60 * 60 * 1000),
    repeatCount: positiveSetting("ARENA_FARMING_REPEAT_COUNT", 3),
    cooldownMs: positiveSetting("ARENA_FARMING_COOLDOWN_MS", 24 * 60 * 60 * 1000),
  },
  drops: { spell: spellIds, talent: talentIds, ultimate: ultimateIds } as Record<string, string[]>,
} as const;

export function localWinGold(priorWins: number): number {
  return priorWins < ECONOMY.localGold.firstWins
    ? ECONOMY.localGold.firstWinAmount : ECONOMY.localGold.laterWinAmount;
}

export const LOCAL_MATCH_MIN_DURATION_MS = 20_000;
export const LOCAL_MATCH_START_INTERVAL_MS = 20_000;
export const LOCAL_MATCH_PENDING_WINDOW_MS = 30 * 60_000;
export const LOCAL_MATCH_MAX_PENDING = 2;

export function localStartRetryAfterSeconds(recentStart: Date | null, outstanding: number, now: number): number | null {
  if (recentStart && now - recentStart.getTime() < LOCAL_MATCH_START_INTERVAL_MS)
    return Math.max(1, Math.ceil((LOCAL_MATCH_START_INTERVAL_MS - (now - recentStart.getTime())) / 1000));
  return outstanding >= LOCAL_MATCH_MAX_PENDING ? 60 : null;
}

export type CollectibleKind = "spell" | "talent" | "ultimate";
export type DropRoll = { kind: CollectibleKind; itemId: string };

export function orderedAccountIds(playerIds: string[]): string[] {
  return [...new Set(playerIds)].sort();
}

export async function lockEconomyAccounts(
  tx: { execute: (query: SQL) => Promise<unknown> },
  playerIds: string[],
): Promise<void> {
  for (const playerId of orderedAccountIds(playerIds)) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${playerId}, 0))`);
  }
}

export function isCanonicalCollectible(kind: CollectibleKind, itemId: string): boolean {
  return ECONOMY.drops[kind].includes(itemId);
}

export function mapLegacyEconomyState(state: Record<string, unknown>): {
  present: boolean;
  gold: number;
  unlocks: Array<{ kind: string; itemId: string }>;
  legacyTournamentWins: number;
  legacyTournamentEntries: number;
  legacyTournamentHistory: unknown[];
} {
  const present = ["gold", "ownedClasses", "ownedRacials", "ownedSpells", "ownedUltimates", "unlockedTalents"]
    .some((field) => Object.hasOwn(state, field));
  const parsedGold = Number(state.gold ?? 0);
  const gold = Number.isSafeInteger(parsedGold) ? Math.max(0, Math.min(2_000_000_000, parsedGold)) : 0;
  const boundedCount = (value: unknown): number => {
    const count = Number(value ?? 0);
    return Number.isSafeInteger(count) ? Math.max(0, Math.min(MAX_GOLD, count)) : 0;
  };
  const legacyTournamentHistory = Array.isArray(state.tournamentHistory)
    ? state.tournamentHistory.slice(0, 100).filter((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      try { return JSON.stringify(entry).length <= 20_000; } catch { return false; }
    })
    : [];
  const strings = (value: unknown): string[] => Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string"))] : [];
  const classes = strings(state.ownedClasses).filter((id) => CLASS_IDS.includes(id as typeof CLASS_IDS[number]));
  const racials = strings(state.ownedRacials).filter((id) => RACIAL_IDS.includes(id as typeof RACIAL_IDS[number]));
  const unlocks = [
    ...classes.map((itemId) => ({ kind: "class", itemId })),
    ...racials.map((itemId) => ({ kind: "racial", itemId })),
    ...legacyClassTalentUnlocks(classes),
    ...strings(state.ownedSpells).filter((id) => spellIds.includes(id)).map((itemId) => ({ kind: "spell", itemId })),
    ...strings(state.ownedUltimates).filter((id) => ultimateIds.includes(id)).map((itemId) => ({ kind: "ultimate", itemId })),
  ];
  const talents = recordOfStrings(state.unlockedTalents);
  for (const [classId, ids] of Object.entries(talents)) {
    if (!classes.includes(classId) || !CLASS_TALENTS[classId]) continue;
    for (const talentId of ids) {
      if (CLASS_TALENTS[classId].includes(talentId)) unlocks.push({
        kind: "talent", itemId: `${classId}:${talentId}`,
      });
    }
  }
  return {
    present, gold,
    legacyTournamentWins: boundedCount(state.tournamentWins),
    legacyTournamentEntries: boundedCount(state.tournamentEntries),
    legacyTournamentHistory,
    unlocks: [...new Map(unlocks.map((item) => [`${item.kind}:${item.itemId}`, item])).values()],
  };
}

function recordOfStrings(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, items]) => [
    key,
    Array.isArray(items) ? [...new Set(items.filter((item): item is string => typeof item === "string"))] : [],
  ]));
}

export function validBootstrapSelection(classIds: unknown, racialId: unknown): classIds is string[] {
  return Array.isArray(classIds) && classIds.length === 3 &&
    classIds.every((id) => typeof id === "string" && CLASS_IDS.includes(id as typeof CLASS_IDS[number])) &&
    new Set(classIds).size === 3 && typeof racialId === "string" &&
    RACIAL_IDS.includes(racialId as typeof RACIAL_IDS[number]);
}

export function bootstrapUnlocks(classIds: string[], racialId: string): Array<{ kind: string; itemId: string }> {
  return [
    ...classIds.map((itemId) => ({ kind: "class", itemId })),
    { kind: "racial", itemId: racialId },
    ...classIds.map((classId) => ({ kind: "talent", itemId: `${classId}:${STARTER_TALENT[classId]}` })),
  ];
}

export function starterTalentUnlocks(classIds: string[]): Array<{ kind: string; itemId: string }> {
  return classIds.filter((classId) => CLASS_TALENTS[classId] && STARTER_TALENT[classId])
    .map((classId) => ({ kind: "talent", itemId: `${classId}:${STARTER_TALENT[classId]}` }));
}
export function rollArenaDrops(
  outcome: "win" | "loss" | "draw",
  random: () => number = Math.random,
): DropRoll[] {
  const rates = outcome === "win" ? ECONOMY.arenaDrops.win : ECONOMY.arenaDrops.loss;
  const drops: DropRoll[] = [];
  for (const kind of ["spell", "talent", "ultimate"] as const) {
    if (random() < rates[kind]) {
      const catalog = ECONOMY.drops[kind];
      drops.push({ kind, itemId: catalog[Math.floor(random() * catalog.length)] });
    }
  }
  return drops;
}

export function classUnlockPrice(alreadyUnlocked: number): number {
  return ECONOMY.classPrices[alreadyUnlocked] ?? ECONOMY.classPriceAfterTenth;
}

export function racialUnlockPrice(additionalAlreadyUnlocked: number): number {
  return ECONOMY.racialPrices[additionalAlreadyUnlocked] ?? ECONOMY.racialPriceAfterSixth;
}

export function listedSaleAmounts(price: number): { tax: number; sellerAmount: number } {
  const tax = Math.floor(price * ECONOMY.marketTax);
  return { tax, sellerAmount: price - tax };
}

export function purchaseQuote(
  price: number,
  buyerGold: number,
  sellerGold: number,
): { buyerGoldAfter: number; sellerGoldAfter: number; tax: number; sellerAmount: number } | null {
  if (!Number.isSafeInteger(price) || price < 1 || buyerGold < price) return null;
  const { tax, sellerAmount } = listedSaleAmounts(price);
  const sellerGoldAfter = sellerGold + sellerAmount;
  if (!Number.isSafeInteger(sellerGoldAfter) || sellerGoldAfter > MAX_GOLD) return null;
  return { buyerGoldAfter: buyerGold - price, sellerGoldAfter, tax, sellerAmount };
}

export function boundedGoldCredit(balance: number, requested: number): number | null {
  if (!Number.isSafeInteger(balance) || balance < 0 || balance > MAX_GOLD ||
      !Number.isSafeInteger(requested) || requested < 0) return null;
  return Math.min(requested, MAX_GOLD - balance);
}

export function chooseDuplicateLoss(
  kind: "spell" | "ultimate",
  itemIds: string[],
  random: () => number = Math.random,
): string | null {
  if (random() >= ECONOMY.duplicateLoss[kind] || itemIds.length === 0) return null;
  return itemIds[Math.floor(random() * itemIds.length)] ?? null;
}

export function selectDuplicateLossCopy(
  kind: "spell" | "ultimate",
  copies: Array<{ itemId: string; quantity: number; listedQuantity: number }>,
  random: () => number = Math.random,
): { itemId: string; listingCancelled: boolean } | null {
  const total = copies.reduce((sum, copy) => sum + Math.max(0, copy.quantity), 0);
  if (total === 0 || random() >= ECONOMY.duplicateLoss[kind]) return null;
  let selected = Math.floor(random() * total);
  const copy = copies.find((candidate) => (selected -= candidate.quantity) < 0);
  if (!copy) return null;
  const listedQuantity = Math.min(copy.quantity, Math.max(0, copy.listedQuantity));
  return { itemId: copy.itemId, listingCancelled: random() < listedQuantity / copy.quantity };
}