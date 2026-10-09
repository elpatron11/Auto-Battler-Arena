import {rankedSize,rankedView,rankedScorePatch} from '../src/lib/arenaModeRules.ts';
export function rankedModeFixture(table) {
  return {rankedSize,rankedView,rankedScorePatch,rankedColumns:size=>({
    rating:size===2 ? table.rating2 : table.rating,
    wins:size===2 ? table.wins2 : table.wins,
    defense:size===2 ? table.defense2 : table.defense,
    updated:size===2 ? table.defenseUpdatedAt2 : table.defenseUpdatedAt,
  })};
}