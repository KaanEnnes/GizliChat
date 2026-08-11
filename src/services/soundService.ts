import { Platform } from 'react-native';
import Sound from 'react-native-sound';

// Files live in android/app/src/main/res/raw as raw PCM WAVs (generated
// synthetically, no third-party audio assets involved). react-native-sound
// finds Android raw resources by filename alone; iOS isn't wired up since
// this project is only built/tested for Android so far.
Sound.setCategory('Playback');

type SoundKey = 'place' | 'clear' | 'gameover';

const SOUND_FILES: Record<SoundKey, string> = {
  place: 'sfx_place.wav',
  clear: 'sfx_clear.wav',
  gameover: 'sfx_gameover.wav',
};

const loadedSounds: Partial<Record<SoundKey, Sound>> = {};

if (Platform.OS === 'android') {
  (Object.keys(SOUND_FILES) as SoundKey[]).forEach(key => {
    const sound = new Sound(SOUND_FILES[key], Sound.MAIN_BUNDLE, error => {
      if (error) {
        console.warn(`Ses efekti yüklenemedi (${key}):`, error);
      }
    });
    loadedSounds[key] = sound;
  });
}

function play(key: SoundKey): void {
  const sound = loadedSounds[key];
  if (!sound) {
    return;
  }
  sound.stop(() => sound.play());
}

export function playPlaceSound(): void {
  play('place');
}

export function playClearSound(): void {
  play('clear');
}

export function playGameOverSound(): void {
  play('gameover');
}
