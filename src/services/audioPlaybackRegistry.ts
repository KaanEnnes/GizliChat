// react-native-nitro-sound exposes one native player as a module-level
// singleton (see chatService/AudioMessagePlayer comments) — there is no way
// to have two independent playback sessions. A chat can render many
// AudioMessagePlayer instances (one per voice message bubble) though, and
// without coordination, playing message B while message A was still
// "playing" silently hijacks the shared native player/listener, leaving A's
// own play button stuck showing "playing" forever. This tiny registry lets
// whichever player starts next tell the previous one to reset its own UI
// state before it takes over.
let activeReset: (() => void) | null = null;

export function setActiveAudioPlayer(reset: () => void): void {
  if (activeReset && activeReset !== reset) {
    activeReset();
  }
  activeReset = reset;
}

export function clearAudioPlayerIfActive(reset: () => void): void {
  if (activeReset === reset) {
    activeReset = null;
  }
}
