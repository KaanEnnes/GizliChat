import { Alert, NativeModules, Platform } from 'react-native';

const { PipMode } = NativeModules as {
  PipMode?: {
    isSupported: () => Promise<boolean>;
    enter: () => Promise<boolean>;
    openPipSettings: () => Promise<boolean>;
  };
};

/**
 * Sohbeti Android'in resmi Picture-in-Picture küçük penceresine alır.
 * `enterPictureInPictureMode()` istisna atmadan sessizce `false` dönebiliyor —
 * bu genelde kullanıcının bu uygulama için "Ekran içinde ekran" iznini henüz
 * açmadığı anlamına geliyor (birçok OEM arayüzünde varsayılan kapalı). Bu
 * durumda kullanıcıyı doğrudan o ayar ekranına yönlendiriyoruz.
 */
export async function enterPipMode(): Promise<void> {
  if (Platform.OS !== 'android' || !PipMode) {
    return;
  }
  try {
    const entered = await PipMode.enter();
    if (!entered) {
      Alert.alert(
        'Küçük pencere izni gerekiyor',
        'Bu özelliği kullanabilmek için telefon ayarlarından bu uygulamaya "Ekran içinde ekran" (Picture-in-picture) izni vermen gerekiyor. Şimdi o ayar ekranını açalım mı?',
        [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Ayarları Aç', onPress: () => PipMode.openPipSettings().catch(() => undefined) },
        ],
      );
    }
  } catch {
    // Cihaz/Android sürümü PIP'i hiç desteklemiyor — sessizce yut.
  }
}

export async function isPipSupported(): Promise<boolean> {
  if (Platform.OS !== 'android' || !PipMode) {
    return false;
  }
  try {
    return await PipMode.isSupported();
  } catch {
    return false;
  }
}
