import { doc, getDoc } from 'firebase/firestore';
import { NativeModules, Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import RNFS from 'react-native-fs';
import { db } from './firebase';

const { ApkInstaller } = NativeModules as {
  ApkInstaller?: { install: (path: string) => Promise<boolean>; shareApk: () => Promise<boolean> };
};

/**
 * Offline, no-internet "send to nearby device": hands this app's own
 * installed APK to the system share sheet (Nearby Share/Quick Share,
 * Bluetooth, etc.), unlike the QR flow above which needs the recipient to
 * have internet to hit Firebase Hosting.
 */
export async function shareInstalledApk(): Promise<void> {
  if (Platform.OS !== 'android' || !ApkInstaller) {
    throw new Error('Bu özellik bu cihazda kullanılamıyor.');
  }
  await ApkInstaller.shareApk();
}

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
 * How many times a dropped-connection download is silently retried before
 * surfacing an error to the user. This APK is ~130MB+, so on a weak/unstable
 * mobile connection (observed live: "Software caused connection abort" from
 * the OS killing the socket mid-transfer) a single attempt failing isn't
 * unusual — most of the time a retry a moment later just succeeds.
 */
const MAX_DOWNLOAD_ATTEMPTS = 3;

function isTransientDownloadError(error: unknown): boolean {
  const message = (error as Error)?.message ?? '';
  return (
    message.includes('connection abort') ||
    message.includes('Connection reset') ||
    message.includes('ETIMEDOUT') ||
    message.includes('ECONNRESET') ||
    message.includes('Network request failed')
  );
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
  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      await downloadAndInstallOnce(info);
      return;
    } catch (error) {
      const isLastAttempt = attempt === MAX_DOWNLOAD_ATTEMPTS;
      if (isLastAttempt || !isTransientDownloadError(error)) {
        throw isTransientDownloadError(error)
          ? new Error('Bağlantı birkaç kez koptu. Wi-Fi\'ye geçip tekrar dene.')
          : error;
      }
      // Brief pause before retrying — an immediate retry into the same
      // network hiccup just fails again just as fast.
      await new Promise<void>(resolve => setTimeout(resolve, 1500));
    }
  }
}

async function downloadAndInstallOnce(info: LatestVersionInfo): Promise<void> {
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

  await ApkInstaller!.install(destPath);
}
