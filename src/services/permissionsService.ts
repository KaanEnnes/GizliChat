import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';

/**
 * Android requires these as *runtime* grants even though they're declared
 * in AndroidManifest.xml — without this call, recording/calling silently
 * fails (or, for camera, just never publishes a track) because the OS never
 * asked the user. iOS handles the equivalent prompt automatically from the
 * Info.plist usage-description strings the first time the native APIs are
 * touched, so there's nothing to do there.
 *
 * If the user already denied a permission once (or ticked "don't ask
 * again"), Android stops showing its own prompt on subsequent requests and
 * `requestMultiple` just resolves to DENIED/NEVER_ASK_AGAIN instantly —
 * there is no in-app "always allow" control to add, that choice lives in
 * the OS dialog itself. The only way to recover at that point is the app's
 * own Settings page, so when a grant is missing we fall back to an alert
 * that deep-links there.
 */
async function requestAndroidPermissions(permissions: string[], rationale: string): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const results = await PermissionsAndroid.requestMultiple(
    permissions as Array<(typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS]>,
  );
  const granted = Object.values(results).every(result => result === PermissionsAndroid.RESULTS.GRANTED);
  if (!granted) {
    Alert.alert('İzin gerekli', rationale, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Ayarlara Git', onPress: () => Linking.openSettings() },
    ]);
  }
  return granted;
}

export function requestMicrophonePermission(): Promise<boolean> {
  return requestAndroidPermissions(
    [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO],
    'Sesli mesaj kaydedebilmek için mikrofon iznine ihtiyaç var. Telefon bir daha sormuyorsa izni Ayarlar\'dan elle açman gerekiyor.',
  );
}

/**
 * Android 13+ (API 33) requires this as a runtime grant before any
 * notification (including the FCM/notifee ones fired for incoming messages)
 * can be shown. Below API 33, POST_NOTIFICATIONS isn't a real dangerous
 * permission — notifications are enabled by default with no prompt — but
 * `PermissionsAndroid.requestMultiple` was observed (real device, Android 11)
 * resolving that permission key to DENIED instead of GRANTED on those older
 * versions, which incorrectly blocked `fcmService.initFcm` from ever calling
 * `getToken()`. Guard on API level explicitly instead of trusting the bridge
 * to no-op correctly.
 */
export function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android' && Platform.Version < 33) {
    return Promise.resolve(true);
  }
  return requestAndroidPermissions(
    [PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS],
    'Yeni mesaj geldiğinde bildirim gösterebilmek için bildirim iznine ihtiyaç var. Telefon bir daha sormuyorsa izni Ayarlar\'dan elle açman gerekiyor.',
  );
}

export function requestCallPermissions(includeCamera: boolean): Promise<boolean> {
  const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (includeCamera) {
    permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
  }
  const rationale = includeCamera
    ? 'Görüntülü arama için mikrofon ve kamera iznine ihtiyaç var. Telefon bir daha sormuyorsa izinleri Ayarlar\'dan elle açman gerekiyor.'
    : 'Sesli arama için mikrofon iznine ihtiyaç var. Telefon bir daha sormuyorsa izni Ayarlar\'dan elle açman gerekiyor.';
  return requestAndroidPermissions(permissions, rationale);
}
