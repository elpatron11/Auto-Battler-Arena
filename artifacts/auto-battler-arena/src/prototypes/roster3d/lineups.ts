import type { ClassId } from './roster';

export const LINEUPS: { name: string; player: [ClassId, ClassId, ClassId]; enemy: [ClassId, ClassId, ClassId] }[] = [
  { name: 'Guardians & Rangers', player: ['warrior', 'paladin', 'priest'], enemy: ['rogue', 'archer', 'frostmage'] },
  { name: 'Nature & Dark Magic', player: ['druid', 'shaman', 'warlock'], enemy: ['frostmage', 'priest', 'rogue'] },
  { name: 'Rangers & Wilds', player: ['archer', 'rogue', 'paladin'], enemy: ['druid', 'shaman', 'warlock'] },
  { name: 'Pet companions', player: ['archer', 'frostmage', 'priest'], enemy: ['archer', 'frostmage', 'warlock'] },
];
export type LineupConfig = { player: ClassId[]; enemy: ClassId[]; druidAbility: 'default' | 'custom'; encounter?: 'arena' | 'frost' | 'demon' | 'temple' };