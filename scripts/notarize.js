/**
 * macOS Notarization — runs after signing via electron-builder afterSign hook.
 * Requires env vars: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
 * Skip if not on macOS or env vars not set.
 */

const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;

    if (electronPlatformName !== 'darwin') return;

    if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD) {
        console.log('Skipping notarization: APPLE_ID or APPLE_APP_SPECIFIC_PASSWORD not set');
        return;
    }

    const appName = context.packager.appInfo.productFilename;

    console.log(`Notarizing ${appName}...`);

    await notarize({
        appBundleId: 'net.decatron.optimapos',
        appPath: `${appOutDir}/${appName}.app`,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
    });

    console.log('Notarization complete');
};
