export type TournamentPlacement = "champion" | "runner_up" | "eliminated";
export type TournamentHistoryItem = {
  round: string;
  playerA: string;
  playerB: string;
  playerAName: string;
  playerBName: string;
  playerASnapshot: Record<string, unknown>;
  playerBSnapshot: Record<string, unknown>;
  winner: string;
  outcome: string;
  scoreA: number;
  scoreB: number;
};
export type TournamentTeam = { id: string; name: string; snapshot: Record<string, unknown> };

function shuffle<T>(values: T[], random: () => number): T[] {
  for (let index = values.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [values[index], values[swap]] = [values[swap], values[index]];
  }
  return values;
}

export function tournamentPrizeForPlacement(
  placement: TournamentPlacement,
  prizes = { champion: 500, runnerUp: 50 },
): number {
  return placement === "champion" ? prizes.champion :
    placement === "runner_up" ? prizes.runnerUp : 0;
}

export function settleTournamentPayout(
  state: "entered" | "finished",
  gold: number,
  prize: number,
): { gold: number; repeated: boolean } {
  return state === "finished"
    ? { gold, repeated: true }
    : { gold: gold + prize, repeated: false };
}

export function tournamentEntryLimitReached(recentEntries: number, limit = 3): boolean {
  return recentEntries >= limit;
}

export function tournamentFinishWaitSeconds(
  enteredAt: Date,
  now = Date.now(),
  minimumDurationMs = 90_000,
): number {
  return Math.max(0, Math.ceil((enteredAt.getTime() + minimumDurationMs - now) / 1000));
}

export function resolveSixTeamBracket(
  attack: Record<string, unknown>,
  bots: TournamentTeam[],
  resolveBattle: (attack: Record<string, unknown>, defense: Record<string, unknown>) => "win" | "loss" | "draw",
  random: () => number,
): { placement: TournamentPlacement; history: TournamentHistoryItem[] } {
  const entrants = shuffle<TournamentTeam>([
    { id: "player", name: "You", snapshot: attack },
    ...shuffle(bots, random).slice(0, 5),
  ], random);
  const history: TournamentHistoryItem[] = [];
  const match = (round: string, a: TournamentTeam, b: TournamentTeam): TournamentTeam => {
    const outcome = resolveBattle(a.snapshot, b.snapshot);
    const winner = outcome === "loss" ? b : a;
    // The existing bracket is presented as best-of-three. Ranked battle has no
    // RNG/seed API, so its single deterministic result is represented as a 2-0
    // sweep rather than trusting a client animation or inventing outcomes.
    history.push({
      round, playerA: a.id, playerB: b.id,
      playerAName: a.name, playerBName: b.name,
      playerASnapshot: a.snapshot, playerBSnapshot: b.snapshot,
      winner: winner.id, outcome,
      scoreA: winner.id === a.id ? 2 : 0,
      scoreB: winner.id === b.id ? 2 : 0,
    });
    return winner;
  };
  const semiA = match("round_of_6", entrants[2], entrants[5]);
  const semiB = match("round_of_6", entrants[3], entrants[4]);
  const finalistA = match("semifinal", entrants[0], semiA);
  const finalistB = match("semifinal", entrants[1], semiB);
  const champion = match("final", finalistA, finalistB);
  const runnerUp = champion.id === finalistA.id ? finalistB : finalistA;
  return {
    placement: champion.id === "player" ? "champion" :
      runnerUp.id === "player" ? "runner_up" : "eliminated",
    history,
  };
}