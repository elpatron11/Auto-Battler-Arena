import { ECONOMY } from "./economy";
import { parseRankedTeam, resolveRankedBattle } from "./rankedBattle";
import { resolveSixTeamBracket, tournamentPrizeForPlacement } from "./tournamentRules";
import type { TournamentHistoryItem, TournamentTeam } from "./tournamentRules";
export type { TournamentHistoryItem } from "./tournamentRules";

export function resolveTournament(
  attack: Record<string, unknown>,
  opponents: TournamentTeam[],
  random: () => number = Math.random,
): { placement: "champion" | "runner_up" | "eliminated"; prize: number; history: TournamentHistoryItem[] } {
  // One deterministic server-resolved game per bracket matchup. Browser fight
  // animations and reported best-of-three scores are never used for placement.
  if(opponents.length<5) throw new Error("Five eligible real player squads are required.");
  const result = resolveSixTeamBracket(
    attack,
    opponents,
    (attackSnapshot, defenseSnapshot) => resolveRankedBattle(
      parseRankedTeam(attackSnapshot)!,
      parseRankedTeam(defenseSnapshot)!,
    ),
    random,
  );
  return {
    ...result,
    prize: tournamentPrizeForPlacement(result.placement, {
      champion: ECONOMY.tournament.champion,
      runnerUp: ECONOMY.tournament.runnerUp,
    }),
  };
}