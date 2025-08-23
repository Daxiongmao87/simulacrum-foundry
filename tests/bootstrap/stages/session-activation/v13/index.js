import { WorldLaunchV13 } from '../../../v13/world-launch.js';
import { UserAuthenticationV13 } from '../../../v13/user-authentication.js';
import { GameVerificationV13 } from '../../../v13/game-verification.js';
import { EnableModuleV13 } from '../../../v13/enable-module.js';

export class SessionActivationV13 {
  static meta = { name: 'session-activation', description: 'Launch world, authenticate, verify, enable module' };

  async run(page, permutation, config, port) {
    const worldLaunch = new WorldLaunchV13();
    const userAuthentication = new UserAuthenticationV13();
    const gameVerification = new GameVerificationV13();
    const enableModule = new EnableModuleV13();

    const worldId = page.__simu_worldId;
    const r1 = await worldLaunch.launchWorld(page, worldId, port, config);
    if (!r1.success) throw new Error(`World launch failed: ${r1.error}`);

    const r2 = await userAuthentication.authenticateIfNeeded(page, config);
    if (!r2.success) throw new Error(`User authentication failed: ${r2.error}`);

    const r3 = await gameVerification.verifyGame(page, config);
    if (!r3.success) throw new Error(`Game verification failed: ${r3.error}`);

    const r4 = await enableModule.enableModule(page, config);
    if (!r4.success) console.warn(`Module enabling had issues: ${r4.error}`);
  }
}


