export interface GuildWarBuild {
  ability: "default" | "custom";
  ultimate: "default" | "custom" | "polymorph";
  talents: string[];
  racial: string | null;
  isCaptain: boolean;
  skinId: string;
  heroIndex: number | null;
}
export function selectGuildWarBuild(
  state: unknown,
  classId: string,
  heroIndex: number | undefined,
  unlocks: {kind:string;itemId:string}[],
): GuildWarBuild;
