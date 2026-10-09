export const ROSTER = [
  { id: 'warrior', name: 'Warrior', role: 'Two-handed frontline fighter' },
  { id: 'priest', name: 'Priest', role: 'Holy staff and healing magic' },
  { id: 'frostmage', name: 'Cryomancer', role: 'Frost staff and ice magic' },
  { id: 'rogue', name: 'Rogue', role: 'Hooded twin-dagger assassin' },
  { id: 'paladin', name: 'Paladin', role: 'Armored hammer and shield guardian' },
  { id: 'archer', name: 'Archer', role: 'Woodland bow ranger' },
  { id: 'warlock', name: 'Warlock', role: 'Horned violet caster and orb staff' },
  { id: 'druid', name: 'Druid', role: 'Antlered nature caster and shapeshifter' },
  { id: 'shaman', name: 'Shaman', role: 'Elemental rune-hammer wielder' },
] as const;
export type ClassId = typeof ROSTER[number]['id'];
export type DruidForm = '' | 'bear' | 'tiger' | 'tree';
export function isClassId(value: unknown): value is ClassId {
  return typeof value === 'string' && ROSTER.some(c => c.id === value);
}