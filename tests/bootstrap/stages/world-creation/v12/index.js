import { WorldCreationV12 } from '../../../v12/world-creation.js';

export class WorldCreationStageV12 {
  static meta = { name: 'world-creation', description: 'Create test world' };

  async run(page, permutation, config) {
    const worldCreation = new WorldCreationV12();
    const r = await worldCreation.createWorld(page, permutation, config);
    if (!r.success) throw new Error(`World creation failed: ${r.error}`);
    page.__simu_worldId = r.worldId;
  }
}


