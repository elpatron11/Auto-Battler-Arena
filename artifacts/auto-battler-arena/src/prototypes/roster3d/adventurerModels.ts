import type { CharacterModel } from './modelKit';
import type { DruidForm } from './roster';
import { createArcher, createPaladin, createRogue } from './adventurers/classes';
import { createBear, createDruidHuman, createTiger, createTree } from './adventurers/druid';

export function createAdventurer(classId: 'rogue' | 'paladin' | 'archer' | 'druid', form: DruidForm = ''): CharacterModel {
  switch (classId) {
    case 'rogue': return createRogue();
    case 'paladin': return createPaladin();
    case 'archer': return createArcher();
    default:
      return form === 'bear' ? createBear() : form === 'tiger' ? createTiger()
        : form === 'tree' ? createTree() : createDruidHuman();
  }
}
