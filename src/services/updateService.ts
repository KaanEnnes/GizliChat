import { doc, getDoc } from 'firebase/firestore';
import { NativeModules, Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import RNFS from 'react-native-fs';
import { db } from './firebase';

const { ApkInstaller } = NativeModules as { ApkInstaller?: { install: (path: string) => Promise<boolean> } };

/**
 * Manually maintained in Firestore (app_config/android) — there is no build
 * pipeline auto-publishing this, same "elle güncellenir" pattern as the rest
 * of this project's Firebase config (see YAPILACAKLAR.txt). versionCode must
 * be bumped in android/app/build.gradle for every release the app should
 * offer as an update, and apkUrl must point at a publicly downloadable file
 * (Firebase Hosting — see firebase.json's "hosting" entry).
 */
export interface LatestVersionInfo {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  notes?: string;
}

/** Reads the currently published "latest version" config, or null if none is set yet. */
export async function fetchLatestVersion(): Promise<LatestVersionInfo | null> {
  if (Platform.OS !== 'android') {
    return null;
  }
  const snap = await getDoc(doc(db, 'app_config', 'android'));
  if (!snap.exists()) {
    return null;
  }
  const data = snap.data();
  if (typeof data.versionCode !== 'number' || typeof data.apkUrl !== 'string') {
    return null;
  }
  return {
    versionCode: data.versionCode,
    versionName: typeof data.versionName === 'string' ? data.versionName : '',
    apkUrl: data.apkUrl,
    notes: typeof data.notes === 'string' ? data.notes : undefined,
  };
}

/** This device's installed versionCode (Android) — maps 1:1 to android/app/build.gradle's versionCode. */
export function getInstalledVersionCode(): number {
  return parseInt(DeviceInfo.getBuildNumber(), 10) || 0;
}

/**
 * Downloads the APK from `apkUrl` into the app's cache dir, then hands it to
 * ApkInstallerModule.kt to launch the system package installer. `onProgress`
 * receives a 0–1 fraction for a progress bar.
 */
export async function downloadAndInstallUpdate(
  info: LatestVersionInfo,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  if (!ApkInstaller) {
    throw new Error('Güncelleme yükleyici bu cihazda kullanılamıyor.');
  }
  const destPath = `${RNFS.CachesDirectoryPath}/update-${info.versionCode}.apk`;

  await RNFS.downloadFile({
    fromUrl: info.apkUrl,
    toFile: destPath,
    progress: result => {
      if (onProgress && result.contentLength > 0) {
        onProgress(result.bytesWritten / result.contentLength);
      }
    },
    progressDivider: 5,
  }).promise;

  await ApkInstaller.install(destPath);
}
