import { LicenseSubmissionV12 } from './license-submission.js';
import { EULAHandlingV12 } from './eula-handling.js';
import { SetupNavigationV12 } from './setup-navigation.js';
import { DeclineDataSharingV12 } from './decline-data-sharing.js';
import { StepButtonHandlingV12 } from './step-button-handling.js';

export class ApplicationInitializationV12 {
  static meta = { name: 'application-initialization', description: 'Initialize Foundry application (license, EULA, setup flow)' };

  async run(page, permutation, config, port) {
    const licenseSubmission = new LicenseSubmissionV12();
    const setupNavigation = new SetupNavigationV12();
    const eulaHandling = new EULAHandlingV12();
    const declineDataSharing = new DeclineDataSharingV12();
    const stepButtonHandling = new StepButtonHandlingV12();

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


