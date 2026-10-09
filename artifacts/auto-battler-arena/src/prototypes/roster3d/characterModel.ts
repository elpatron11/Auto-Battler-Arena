import { createWarrior } from '../warrior3d/warriorModel';
import { applyPose, createPose, samplePose } from '../warrior3d/warriorAnimation';
import { createCaster } from './casterModels';
import { createAdventurer } from './adventurerModels';
import type { CharacterModel } from './modelKit';
import type { DruidForm } from './roster';
import { createBossModel } from './bossModels';
import { createPetModel } from './petModels';
import type { ModelId } from './creatures';

export function createCharacterModel(id: ModelId, form: DruidForm = ''): CharacterModel {
  if (id === 'boss-frost' || id === 'boss-demon' || id === 'boss-temple') return createBossModel(id);
  if (id === 'pet-archer' || id === 'pet-archer-snake' || id === 'pet-archer-turtle' ||
      id === 'pet-frostmage' || id === 'add-hound' || id === 'add-guard') return createPetModel(id);
  if (id === 'warrior') {
    const warrior = createWarrior();
    const pose = createPose();
    return { root: warrior.root, stats: warrior.stats, dispose: warrior.dispose,
      animate(input) {
        const mode = input.mode === 'cast' ? 'attack' : input.mode;
        applyPose(warrior.rig, samplePose(mode, mode === 'attack' ? input.progress * 2.1 : input.time, pose));
      } };
  }
  if (id === 'priest' || id === 'frostmage' || id === 'warlock' || id === 'shaman') return createCaster(id);
  return createAdventurer(id, form);
}