export type RankedSize=2|3;
export function rankedSize(value:unknown):RankedSize{return Number(value)===2 ? 2 : 3;}
type RankProfile={
  rating:number;wins:number;losses:number;rating2:number;wins2:number;losses2:number;
  defense:Record<string,unknown>|null;defense2:Record<string,unknown>|null;
  defenseUpdatedAt:Date|null;defenseUpdatedAt2:Date|null;state:Record<string,unknown>;
};
export function rankedView<T extends RankProfile>(player:T,size:RankedSize):T {
  return size===3 ? player : {...player,rating:player.rating2,wins:player.wins2,losses:player.losses2,
    defense:player.defense2,defenseUpdatedAt:player.defenseUpdatedAt2,
    state:{...player.state,defenseTeam:player.state.defenseTeam2??player.defense2}};
}
export function rankedScorePatch(size:RankedSize,rating:number,wins:number,losses:number) {
  return size===2 ? {rating2:rating,wins2:wins,losses2:losses} : {rating,wins,losses};
}