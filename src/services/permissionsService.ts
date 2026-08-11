import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Android requires these as *runtime* grants even though they're declared
 * in AndroidManifest.xml — without this call, recording/calling silently
 * fails (or, for camera, just never publishes a track) because the OS never
 * asked the user. iOS handles the equivalent prompt automatically from the
 * Info.plist usage-description strings the first time the native APIs are
 * touched, so there's nothing to do there.
 */
async function requestAndroidPermissions(permissions: string[]): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const results = await PermissionsAndroid.requestMultiple(
    permissions as Array<(typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS]>,
  );
  return Object.values(results).every(result => result === PermissionsAndroid.RESULTS.GRANTED);
}

export function requestMicrophonePermission(): Promise<boolean> {
  return requestAndroidPermissions([PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]);
}

export function requestCallPermissions(includeCamera: boolean): Promise<boolean> {
  const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (includeCamera) {
    permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
  }
  return requestAndroidPermissions(permissions);
}
