import { ROSTER, isClassId, type ClassId } from './roster';

export const CREATURES = [
  { id: 'boss-frost', name: 'Frostbound Colossus', group: 'Bosses', role: 'Ice-crystal Yeti with crushing fists' },
  { id: 'boss-demon', name: 'Ashen Demon', group: 'Bosses', role: 'Horned flame brute and dungeon summoner' },
  { id: 'boss-temple', name: 'Temple Guardian', group: 'Bosses', role: 'Golden armored temple sentinel' },
  { id: 'pet-archer', name: 'Hawk', group: 'Pets', role: 'Archer companion with flapping wings and a stunning strike' },
  { id: 'pet-archer-snake', name: 'Snake', group: 'Pets', role: 'Archer companion with a coiling body and venomous bite' },
  { id: 'pet-archer-turtle', name: 'Turtle', group: 'Pets', role: 'Captain Archer’s hard-shelled companion' },
  { id: 'pet-frostmage', name: 'Frost Elemental', group: 'Pets', role: 'Cryomancer’s floating crystal summon' },
  { id: 'add-hound', name: 'Demon Hound', group: 'Dungeon minions', role: 'Ashen Demon’s ember-fanged quadruped' },
  { id: 'add-guard', name: 'Demon Guard', group: 'Dungeon minions', role: 'Ashen Demon’s horned armored guard' },
] as const;
export type CreatureId = typeof CREATURES[number]['id'];
export type ModelId = ClassId | CreatureId;
export type BossEncounter = 'frost' | 'demon' | 'temple';
export const MODEL_ROSTER = [...ROSTER.map(c => ({ ...c, group: 'Heroes' as const })), ...CREATURES];
export function isCreatureId(value: unknown): value is CreatureId {
  return typeof value === 'string' && CREATURES.some(c => c.id === value);
}
export function isModelId(value: unknown): value is ModelId { return isClassId(value) || isCreatureId(value); }
export function isBossEncounter(value: unknown): value is BossEncounter {
  return value === 'frost' || value === 'demon' || value === 'temple';
}
export interface CreatureEntity {
  readonly classId: string;
  readonly name?: string;
  readonly isPet?: boolean;
  readonly isDungeonMonster?: boolean;
  readonly _dungeonBoss?: boolean | { readonly id?: string; readonly encounterId?: string };
  readonly _dungeonEncounterId?: string;
  readonly _dungeonAdd?: boolean;
}
/** Boss/add flags take precedence over the warrior class used by their combat engine. */
export function entityModelId(e: CreatureEntity): ModelId | null {
  if (e._dungeonBoss || e.isDungeonMonster) {
    const boss = typeof e._dungeonBoss === 'object'
      ? e._dungeonBoss.id || e._dungeonBoss.encounterId : e._dungeonEncounterId;
    return isBossEncounter(boss) ? `boss-${boss}` : null;
  }
  if (e._dungeonAdd) return e.name === 'Demon Hound' ? 'add-hound' : e.name === 'Demon Guard' ? 'add-guard' : null;
  if (e.isPet) return isCreatureId(e.classId) && e.classId.startsWith('pet-') ? e.classId : null;
  return isClassId(e.classId) ? e.classId : null;
}