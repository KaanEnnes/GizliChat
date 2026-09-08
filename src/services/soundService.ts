import { Platform } from 'react-native';
import Sound from 'react-native-sound';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SOUND_ENABLED_KEY = 'gizlichat_sound_enabled';
let soundEnabled = true;

AsyncStorage.getItem(SOUND_ENABLED_KEY).then(value => {
  if (value === '0') {
    soundEnabled = false;
  }
});

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
  AsyncStorage.setItem(SOUND_ENABLED_KEY, enabled ? '1' : '0').catch(() => undefined);
}

// Files live in android/app/src/main/res/raw as raw PCM WAVs (generated
// synthetically, no third-party audio assets involved). react-native-sound
// finds Android raw resources by filename alone; iOS isn't wired up since
// this project is only built/tested for Android so far.
//
// The `true` (mixWithOthers) is required — without it, react-native-sound
// calls AudioManager.requestAudioFocus(..., AUDIOFOCUS_GAIN) on Android
// before every single effect (tap, win, game-over, ...), which asks the
// system to pause/steal focus from whatever's playing in the background
// (e.g. a music app) for the effect's whole duration. These are short UI
// sound effects, not this app's own music/media playback, so they should
// never interrupt audio the user already has playing elsewhere.
Sound.setCategory('Playback', true);

type SoundKey =
  | 'place'
  | 'clear'
  | 'gameover'
  | 'tap'
  | 'merge'
  | 'eat'
  | 'noteA'
  | 'noteB'
  | 'noteC'
  | 'noteD'
  | 'wrong'
  | 'hit'
  | 'miss'
  | 'notification'
  | 'win';

const SOUND_FILES: Record<SoundKey, string> = {
  place: 'sfx_place.wav',
  clear: 'sfx_clear.wav',
  gameover: 'sfx_gameover.wav',
  tap: 'sfx_tap.wav',
  merge: 'sfx_merge.wav',
  eat: 'sfx_eat.wav',
  noteA: 'sfx_note_a.wav',
  noteB: 'sfx_note_b.wav',
  noteC: 'sfx_note_c.wav',
  noteD: 'sfx_note_d.wav',
  wrong: 'sfx_wrong.wav',
  hit: 'sfx_hit.wav',
  miss: 'sfx_miss.wav',
  notification: 'sfx_notification.wav',
  win: 'sfx_win.wav',
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
  if (!soundEnabled) {
    return;
  }
  const sound = loadedSounds[key];
  if (!sound) {
    return;
  }
  sound.setVolume(1.0);
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

export function playTapSound(): void {
  play('tap');
}

export function playMergeSound(): void {
  play('merge');
}

export function playEatSound(): void {
  play('eat');
}

/** Simon-style memory pad tones — one per pad index (0-3). */
export function playNoteSound(padIndex: number): void {
  const keys: SoundKey[] = ['noteA', 'noteB', 'noteC', 'noteD'];
  play(keys[padIndex % keys.length]);
}

export function playWrongSound(): void {
  play('wrong');
}

export function playHitSound(): void {
  play('hit');
}

export function playMissSound(): void {
  play('miss');
}

export function playNotificationSound(): void {
  play('notification');
}

export function playWinSound(): void {
  play('win');
}
