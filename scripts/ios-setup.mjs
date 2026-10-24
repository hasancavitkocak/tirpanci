// iOS: run after `npx cap add ios` (on the Mac that builds it, e.g. Codemagic) to give the generated
// project the game's own settings: its icon and launch picture (assets-src/ios), full screen with no
// status bar, every orientation on iPhone and iPad, the AdMob app id (Google's test one while the ads
// are test ads: see src/platform/ads.ts), no export-compliance question (only standard encryption),
// and the version from package.json with the build number given.
// Usage: node scripts/ios-setup.mjs [buildNumber]
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const build = process.argv[2] ?? '1';
const version = JSON.parse(readFileSync('package.json', 'utf8')).version ?? '1.0.0';
const app = 'ios/App/App';

// ---- Info.plist
const plistPath = `${app}/Info.plist`;
let plist = readFileSync(plistPath, 'utf8');
const set = (key, xml) => {
  const re = new RegExp(`\\s*<key>${key}</key>\\s*(<string>[^<]*</string>|<true/>|<false/>|<array>[\\s\\S]*?</array>)`);
  plist = plist.replace(re, '');
  plist = plist.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${key}</key>\n\t${xml}\n</dict>\n</plist>\n`);
};
const orientations = '<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t\t<string>UIInterfaceOrientationLandscapeLeft</string>\n\t\t<string>UIInterfaceOrientationLandscapeRight</string>\n\t</array>';
set('CFBundleDisplayName', '<string>Kral Tırpan</string>');
set('UIStatusBarHidden', '<true/>');
set('UIViewControllerBasedStatusBarAppearance', '<false/>');
set('UIRequiresFullScreen', '<true/>');
set('UISupportedInterfaceOrientations', orientations);
set('UISupportedInterfaceOrientations~ipad', orientations.replace('<string>UIInterfaceOrientationPortrait</string>', '<string>UIInterfaceOrientationPortrait</string>\n\t\t<string>UIInterfaceOrientationPortraitUpsideDown</string>'));
set('ITSAppUsesNonExemptEncryption', '<false/>');
set('GADApplicationIdentifier', '<string>ca-app-pub-3940256099942544~1458002511</string>');
writeFileSync(plistPath, plist);

// ---- Version and build number
const pbxPath = 'ios/App/App.xcodeproj/project.pbxproj';
let pbx = readFileSync(pbxPath, 'utf8');
pbx = pbx.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`).replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
writeFileSync(pbxPath, pbx);

// ---- Icon and launch picture: over whatever files the template's asset sets name.
const assets = `${app}/Assets.xcassets`;
for (const f of readdirSync(`${assets}/AppIcon.appiconset`).filter((f) => f.endsWith('.png'))) copyFileSync('assets-src/ios/AppIcon-1024.png', `${assets}/AppIcon.appiconset/${f}`);
for (const f of readdirSync(`${assets}/Splash.imageset`).filter((f) => f.endsWith('.png'))) copyFileSync('assets-src/ios/splash-2732.png', `${assets}/Splash.imageset/${f}`);

console.log(`iOS set up: version ${version} (${build})`);
