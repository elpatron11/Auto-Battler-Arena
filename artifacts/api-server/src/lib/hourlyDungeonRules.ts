export const DUNGEON_HOUR_MS = 60 * 60 * 1000;
export const DUNGEON_MIN_WIN_DURATION_MS = 8_000;
export const DUNGEON_MAX_ATTEMPTS_PER_CYCLE = 60;

export const DUNGEON_ENCOUNTERS = ["frost", "demon", "temple"] as const;
export type DungeonEncounterId = typeof DUNGEON_ENCOUNTERS[number];
export type DungeonBuff = {
  id: DungeonEncounterId;
  cycle: number;
  kind: "maxHp" | "damage" | "healing";
  value: number;
  expiresAt: number;
  name: string;
  icon: string;
};
export type DungeonStatus = {
  serverNow: number;
  cycle: number;
  resetAt: number;
  encounterId: DungeonEncounterId;
  completed: boolean;
  activeBuff: DungeonBuff | null;
};

const BUFFS: Record<DungeonEncounterId, Omit<DungeonBuff, "id" | "cycle" | "expiresAt">> = {
  frost: { kind: "maxHp", value: 0.05, name: "Frostbound Guardian", icon: "❄️" },
  demon: { kind: "damage", value: 0.04, name: "Demon Lord", icon: "🔥" },
  temple: { kind: "healing", value: 0.05, name: "Temple Sentinel", icon: "🛕" },
};

export function dungeonCycleAt(now: number): number {
  return Math.floor(now / DUNGEON_HOUR_MS);
}

export function dungeonEncounterForCycle(cycle: number): DungeonEncounterId {
  const index = ((cycle % DUNGEON_ENCOUNTERS.length) + DUNGEON_ENCOUNTERS.length) %
    DUNGEON_ENCOUNTERS.length;
  return DUNGEON_ENCOUNTERS[index];
}

export function dungeonBuffForCycle(id: DungeonEncounterId, cycle: number): DungeonBuff {
  return {
    id,
    cycle,
    ...BUFFS[id],
    expiresAt: (cycle + 1) * DUNGEON_HOUR_MS,
  };
}

export function activeDungeonBuff(buff: DungeonBuff | null, now: number): DungeonBuff | null {
  return buff && buff.expiresAt > now ? buff : null;
}

export function buildDungeonStatus(
  now: number,
  completion: { cycle: number; encounterId: DungeonEncounterId } | null,
): DungeonStatus {
  const cycle = dungeonCycleAt(now);
  const resetAt = (cycle + 1) * DUNGEON_HOUR_MS;
  const encounterId = dungeonEncounterForCycle(cycle);
  const completed = completion?.cycle === cycle && completion.encounterId === encounterId;
  return {
    serverNow: now,
    cycle,
    resetAt,
    encounterId,
    completed,
    activeBuff: completed
      ? activeDungeonBuff(dungeonBuffForCycle(encounterId, cycle), now)
      : null,
  };
}

export function mayAwardDungeonWin(input: {
  attemptCycle: number;
  currentCycle: number;
  startedAt: number;
  now: number;
  alreadyCompleted: boolean;
}): boolean {
  return input.attemptCycle === input.currentCycle &&
    input.now - input.startedAt >= DUNGEON_MIN_WIN_DURATION_MS &&
    !input.alreadyCompleted;
}

export function dungeonAttemptReceipt(attempt: {
  outcome: string | null;
  awarded: boolean;
}): { awarded: boolean } {
  return { awarded: attempt.outcome === "win" && attempt.awarded };
}