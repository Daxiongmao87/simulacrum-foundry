import { SystemInstallerV12 } from '../../../v12/install-system.js';

export class SystemInstallationV12 {
  static meta = { name: 'system-installation', description: 'Install configured game system' };

  async run(page, permutation) {
    const systemInstaller = new SystemInstallerV12();
    const r = await systemInstaller.installSystem(page, permutation.system);
    if (!r.success) throw new Error(`System installation failed: ${r.error}`);
  }
}


