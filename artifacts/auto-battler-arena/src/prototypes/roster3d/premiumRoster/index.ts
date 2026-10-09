import { createCharacterModel } from '../characterModel';
import { createPremiumMageModel } from '../magePremiumModel';
import { createPremiumMageMotion } from '../magePremiumMotion';
import { createPremiumMeleeModel } from './melee';
import { createPremiumCasterModel } from './casters';
import { createPremiumNatureModel } from './nature';
import { createPremiumRosterMotion } from './motion';
import type { ModelId } from '../creatures';
import type { DruidForm } from '../roster';
import type { CharacterModel } from '../modelKit';

export function isPremiumRosterModel(id: ModelId, form: DruidForm = '') {
  return ['warrior', 'paladin', 'rogue', 'archer', 'priest', 'frostmage', 'shaman', 'warlock', 'druid'].includes(id) &&
    !(id === 'druid' && form === 'tree');
}

/** Approved normal-play 3D roster; excluded creatures and Tree Form retain their base models. */
export function createPremiumRosterModel(id: ModelId, form: DruidForm = ''): CharacterModel {
  if (!isPremiumRosterModel(id, form)) return createCharacterModel(id, form);
  if (id === 'frostmage') return createPremiumMageMotion(createPremiumMageModel());
  const model = id === 'warrior' || id === 'paladin' || id === 'rogue' ? createPremiumMeleeModel(id) :
    id === 'priest' || id === 'shaman' || id === 'warlock' ? createPremiumCasterModel(id) :
      createPremiumNatureModel(id as 'archer' | 'druid', form);
  return createPremiumRosterMotion(model, id);
}

export const PREMIUM_ROSTER_FACTORY = { supports: isPremiumRosterModel, create: createPremiumRosterModel };