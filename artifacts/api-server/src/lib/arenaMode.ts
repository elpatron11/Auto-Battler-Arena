import { arenaProfilesTable } from "@workspace/db";
import type {RankedSize} from "./arenaModeRules";
import {rankedView as modeView} from "./arenaModeRules";
import {squadRatings,squadScore} from "./squadRatings";
export {rankedSize,rankedScorePatch,type RankedSize} from "./arenaModeRules";
export function rankedView<T extends Parameters<typeof modeView>[0]>(player:T,size:RankedSize):T {
  const view=modeView(player,size);
  const ranks=squadRatings(player);
  const score=view.defense?squadScore(player,size,view.defense,ranks).score:
    {rating:view.rating,wins:view.wins,losses:view.losses};
  return {...view,rating:score.rating,wins:score.wins,losses:score.losses,state:{...view.state,squadRatings:ranks}};
}
export function rankedColumns(size: RankedSize) {
  return size === 2
    ? {rating:arenaProfilesTable.rating2,wins:arenaProfilesTable.wins2,defense:arenaProfilesTable.defense2,updated:arenaProfilesTable.defenseUpdatedAt2}
    : {rating:arenaProfilesTable.rating,wins:arenaProfilesTable.wins,defense:arenaProfilesTable.defense,updated:arenaProfilesTable.defenseUpdatedAt};
}