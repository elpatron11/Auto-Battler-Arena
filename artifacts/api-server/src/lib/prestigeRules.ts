export const GLADIATOR_RATING = 2400;
export const PRESTIGE_SKINS = [
  { id: "wingedPaladin", classId: "paladin", name: "Winged Paladin", teamSize: 3 },
  { id: "emberLord", classId: "warrior", name: "Ember Lord Warrior", teamSize: 2 },
] as const;
export type PrestigeSkinId = typeof PRESTIGE_SKINS[number]["id"];
export const PRESTIGE_DROP_CHANCES = { dungeon: 0.003, arena: 0.002 } as const;
export function isPrestigeSkin(value: unknown): value is PrestigeSkinId {
  return PRESTIGE_SKINS.some(skin => skin.id === value);
}
export function prestigeRankSkin(teamSize: 2 | 3, rating: number): PrestigeSkinId | null {
  return rating >= GLADIATOR_RATING ? (teamSize === 3 ? "wingedPaladin" : "emberLord") : null;
}
export function rollPrestigeSkins(source: keyof typeof PRESTIGE_DROP_CHANCES, owned: string[], random: () => number) {
  return PRESTIGE_SKINS.filter(skin => !owned.includes(skin.id) &&
    random() < PRESTIGE_DROP_CHANCES[source]).map(skin => skin.id);
}