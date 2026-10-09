type Snapshot = Record<string, unknown>;

/** Only an explicit defense edit/resave may replace an already chosen defense. */
export function explicitDefenseChange(state: Snapshot, previous: Snapshot): Snapshot | null {
  const next = snapshot(state.defenseTeam);
  if (!next) return null;
  const before = snapshot(previous.defenseTeam);
  const saved = state.defenseTeam as Snapshot;
  const old = previous.defenseTeam as Snapshot | null | undefined;
  const resaved = typeof saved.savedAt === "number" &&
    saved.savedAt > (typeof old?.savedAt === "number" ? old.savedAt : 0);
  return resaved || JSON.stringify(next) !== JSON.stringify(before) ? next : null;
}

function snapshot(value: unknown): Snapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const team = value as Snapshot;
  if (!Array.isArray(team.heroes)) return null;
  return {
    heroes: team.heroes,
    squadId:team.squadId ?? team.id ?? null,
    captainClass: team.captainClass ?? null,
    captainRacial: team.captainRacial ?? null,
    orders: team.orders ?? null,
  };
}

/** Prefer the selected team, then the main saved loadout, then recent saves. */
export function autoDefenseCandidates(state: Snapshot): Snapshot[] {
  const saved = Array.isArray(state.savedTeams)
    ? state.savedTeams.filter((team): team is Snapshot => !!team && typeof team === "object" && !Array.isArray(team))
    : [];
  const main = typeof state.mainLoadoutId === "string"
    ? saved.find(team => team.id === state.mainLoadoutId) : undefined;
  return [state.defenseTeam, state.currentTeam, main, ...saved.slice().reverse().filter(team => team !== main)]
    .map(snapshot).filter((team): team is Snapshot => team !== null);
}