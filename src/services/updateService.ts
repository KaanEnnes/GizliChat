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
 * ApkInstallerModule.kt to launch the system package installer. No progress
 * callback: for a download this size on a fast connection, RNFS's native
 * progress events are too coarse/late to drive a meaningful progress bar
 * (see UpdateBanner.tsx, which just shows an indefinite "İndiriliyor…").
 */
export async function downloadAndInstallUpdate(info: LatestVersionInfo): Promise<void> {
  if (!ApkInstaller) {
    throw new Error('Güncelleme yükleyici bu cihazda kullanılamıyor.');
  }
  const destPath = `${RNFS.CachesDirectoryPath}/update-${info.versionCode}.apk`;
  // Stale partial file from a previously interrupted download at this same
  // versionCode would otherwise get silently handed to the installer as-is.
  await RNFS.unlink(destPath).catch(() => undefined);

  let lastResult: { bytesWritten: number; contentLength: number } = { bytesWritten: 0, contentLength: 0 };
  const { statusCode } = await RNFS.downloadFile({
    fromUrl: info.apkUrl,
    toFile: destPath,
    progress: result => {
      lastResult = result;
    },
    progressDivider: 5,
  }).promise;

  // RNFS resolves rather than rejects on a bad HTTP status or a short read,
  // so an interrupted/incomplete download would otherwise be handed straight
  // to the system installer, which then fails to parse it and shows Android's
  // generic "App not installed" toast with no useful explanation.
  if (statusCode !== 200) {
    await RNFS.unlink(destPath).catch(() => undefined);
    throw new Error(`Güncelleme indirilemedi (sunucu kodu ${statusCode}). Lütfen tekrar deneyin.`);
  }
  const fileStat = await RNFS.stat(destPath);
  if (lastResult.contentLength > 0 && fileStat.size !== lastResult.contentLength) {
    await RNFS.unlink(destPath).catch(() => undefined);
    throw new Error('Güncelleme indirmesi eksik kaldı (bağlantı kesildi). Lütfen tekrar deneyin.');
  }

  await ApkInstaller.install(destPath);
}
