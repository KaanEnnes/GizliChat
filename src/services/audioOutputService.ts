import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AudioDevice, AudioDeviceEndpointType } from '@stream-io/video-react-native-sdk';

/**
 * Preferred call audio output, saved from Ayarlar → Arama ses çıkışı.
 * 'auto' (default) means "whatever the phone is already using" — a connected
 * Bluetooth/wired headset wins, otherwise the speaker — see the
 * callManager.start effect in CallScreen.tsx. A 'device' preference is
 * identified by (type, name) rather than the SDK's device id, since that id
 * is only guaranteed stable for the lifetime of a single call — the same
 * physical device (e.g. a specific Bluetooth headset) can get a different id
 * on a later call, so matching by name is what actually survives across
 * calls and app restarts.
 */
export type AudioOutputPreference = { kind: 'auto' } | { kind: 'device'; type: AudioDeviceEndpointType; name: string };

const AUDIO_OUTPUT_KEY = 'gizlichat_audio_output_preference_v2';
let audioOutputPreference: AudioOutputPreference = { kind: 'auto' };

AsyncStorage.getItem(AUDIO_OUTPUT_KEY).then(value => {
  if (!value) {
    return;
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed?.kind === 'auto' || (parsed?.kind === 'device' && typeof parsed.type === 'string' && typeof parsed.name === 'string')) {
      audioOutputPreference = parsed;
    }
  } catch {
    // Ignore malformed/legacy stored value — keep the 'auto' default.
  }
});

export function getAudioOutputPreference(): AudioOutputPreference {
  return audioOutputPreference;
}

export function setAudioOutputPreference(preference: AudioOutputPreference): void {
  audioOutputPreference = preference;
  AsyncStorage.setItem(AUDIO_OUTPUT_KEY, JSON.stringify(preference)).catch(() => undefined);
}

export function audioOutputPreferenceLabel(preference: AudioOutputPreference): string {
  return preference.kind === 'auto' ? 'Otomatik (o an kullanılan)' : preference.name;
}

/** Finds the live device (from an active call's device list) matching a saved 'device' preference, if still available. */
export function findMatchingDevice(devices: AudioDevice[], preference: AudioOutputPreference): AudioDevice | null {
  if (preference.kind !== 'device') {
    return null;
  }
  return devices.find(d => d.type === preference.type && d.name === preference.name) ?? null;
}
