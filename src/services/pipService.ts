import { NativeModules, Platform } from 'react-native';

const { PipMode } = NativeModules as {
  PipMode?: {
    isSupported: () => Promise<boolean>;
    enter: () => Promise<boolean>;
  };
};

/** Sohbeti Android'in resmi Picture-in-Picture küçük penceresine alır. */
export async function enterPipMode(): Promise<void> {
  if (Platform.OS !== 'android' || !PipMode) {
    return;
  }
  try {
    await PipMode.enter();
  } catch {
    // Sessizce yut — desteklenmeyen cihaz/Android sürümünde buton en kötü
    // ihtimalle hiçbir şey yapmamış olur.
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
