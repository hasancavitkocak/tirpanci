// Builds the Android app with Gradle. Usage: node scripts/android-build.mjs [debug|release]
// Picks a JDK 21 (Android Studio's bundled JBR) when JAVA_HOME isn't set, and writes
// android/local.properties from ANDROID_HOME / the default SDK location if missing.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const mode = process.argv[2] ?? 'debug';
const env = { ...process.env };
const isWin = process.platform === 'win32';

if (!env.JAVA_HOME) {
  const jbr = [
    'C:/Program Files/Android/Android Studio/jbr',
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/opt/android-studio/jbr',
  ].find((p) => existsSync(p));
  if (jbr) env.JAVA_HOME = jbr;
}
if (env.JAVA_HOME) console.log('JAVA_HOME =', env.JAVA_HOME);

// LOCAL_GRADLE_CACHE=1 keeps Gradle's cache and temp files inside the project
// (useful when the system drive is full or not writable).
if (env.LOCAL_GRADLE_CACHE === '1') {
  const tmp = join(process.cwd(), '.tmp');
  env.GRADLE_USER_HOME = env.GRADLE_USER_HOME ?? join(process.cwd(), '.gradle-home');
  env.TEMP = env.TMP = tmp;
  env.GRADLE_OPTS = `${env.GRADLE_OPTS ?? ''} -Djava.io.tmpdir=${tmp.split(String.fromCharCode(92)).join('/')}`.trim();
  mkdirSync(tmp, { recursive: true });
  console.log('GRADLE_USER_HOME =', env.GRADLE_USER_HOME);
}

const localProps = 'android/local.properties';
if (!existsSync(localProps)) {
  const sdk =
    env.ANDROID_HOME ??
    env.ANDROID_SDK_ROOT ??
    [join(env.LOCALAPPDATA ?? '', 'Android/Sdk'), join(homedir(), 'Library/Android/sdk'), join(homedir(), 'Android/Sdk')].find((p) => existsSync(p));
  if (!sdk) {
    console.error('Android SDK not found. Set ANDROID_HOME.');
    process.exit(1);
  }
  writeFileSync(localProps, `sdk.dir=${sdk.split(String.fromCharCode(92)).join('/')}\n`);
}

const tasks = mode === 'release' ? ['bundleRelease', 'assembleRelease'] : ['assembleDebug'];
const gradlew = join(process.cwd(), 'android', isWin ? 'gradlew.bat' : 'gradlew');
const r = spawnSync(isWin ? `"${gradlew}"` : gradlew, [...tasks, '--no-daemon'], { cwd: 'android', env, stdio: 'inherit', shell: isWin });
process.exit(r.status ?? 1);
