import { LicenseSubmissionV13 } from '../../../v13/license-submission.js';
import { EULAHandlingV13 } from '../../../v13/eula-handling.js';
import { SetupNavigationV13 } from '../../../v13/setup-navigation.js';
import { DeclineDataSharingV13 } from '../../../v13/decline-data-sharing.js';
import { StepButtonHandlingV13 } from '../../../v13/step-button-handling.js';

export class ApplicationInitializationV13 {
  static meta = { name: 'application-initialization', description: 'Initialize Foundry application (license, EULA, setup flow)' };

  async run(page, permutation, config, port) {
    const licenseSubmission = new LicenseSubmissionV13();
    const setupNavigation = new SetupNavigationV13();
    const eulaHandling = new EULAHandlingV13();
    const declineDataSharing = new DeclineDataSharingV13();
    const stepButtonHandling = new StepButtonHandlingV13();

    const r1 = await licenseSubmission.submitLicense(page, config.foundryLicenseKey);
    if (!r1.success) throw new Error(`License submission failed: ${r1.error}`);

    const r2 = await setupNavigation.navigateToSetup(page, port, config);
    if (!r2.success) throw new Error(`Setup navigation failed: ${r2.error}`);

    const r3 = await eulaHandling.handleEULAOnSetupPage(page, config);
    if (!r3.success) console.warn(`EULA handling had issues: ${r3.error}`);

    const r4 = await declineDataSharing.handleDeclineSharing(page);
    if (!r4.success) console.warn(`Decline sharing had issues: ${r4.error}`);

    const r5 = await stepButtonHandling.handleStepButton(page);
    if (!r5.success) console.warn(`Step button handling had issues: ${r5.error}`);
  }
}


