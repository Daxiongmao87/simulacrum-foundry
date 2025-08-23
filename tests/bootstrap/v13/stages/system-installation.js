import { SystemInstallerV13 } from '../../v13/install-system.js';

export class SystemInstallationV13 {
  static meta = { name: 'system-installation', description: 'Install configured game system' };

  async run(page, permutation) {
    const systemInstaller = new SystemInstallerV13();
    const r = await systemInstaller.installSystem(page, permutation.system);
    if (!r.success) throw new Error(`System installation failed: ${r.error}`);
  }
}


