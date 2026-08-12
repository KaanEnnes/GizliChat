import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import {
  Call,
  CallContent,
  CallingState,
  RingingCallContent,
  StreamCall,
  callManager,
  useCall,
  useCallStateHooks,
} from '@stream-io/video-react-native-sdk';

/** Handed to `onLeave` once a call ends, so the caller can log a WhatsApp-style call entry in the chat. */
export interface CallSummary {
  otherUserId: string | null;
  isVideo: boolean;
  isCreatedByMe: boolean;
  /** False if the call ended before ever being joined (missed/declined/cancelled) — durationSeconds is 0 in that case. */
  wasJoined: boolean;
  durationSeconds: number;
}

interface Props {
  call: Call;
  onLeave: (summary: CallSummary) => void;
}

const RECONNECT_FAILED_DISPLAY_MS = 1600;

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/** Small pulsing dot used by every status banner (ringing/connecting/reconnecting/live). */
function PulsingDot({ color }: { color: string }): React.JSX.Element {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 550, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[styles.callBannerDot, { backgroundColor: color, opacity: pulse }]}
    />
  );
}

/** Status banner overlaid on the ringing screen: "Aranıyor…" (caller) vs "Çalıyor…" (callee). */
function RingingStatusBanner({ isCaller }: { isCaller: boolean }): React.JSX.Element {
  return (
    <View style={[styles.callBanner, styles.callBannerFloating]} pointerEvents="none">
      <PulsingDot color="#4D96FF" />
      <Text style={styles.callBannerText}>{isCaller ? 'Aranıyor…' : 'Telefon çalıyor…'}</Text>
    </View>
  );
}

/** Full-screen "Bağlanıyor…" shown between accepting a call and actually joining it. */
function ConnectingOverlay(): React.JSX.Element {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.connectingContainer}>
      <Animated.View style={[styles.connectingSpinner, { transform: [{ rotate }] }]} />
      <Text style={styles.connectingText}>Bağlanıyor…</Text>
    </View>
  );
}

/**
 * Switches between the ringing (incoming/outgoing) UI and the live call UI
 * (with a WhatsApp-style "call started" duration banner). Leaves the call
 * screen immediately once the call ends — no lingering "call ended" screen.
 */
function CallContentSwitcher({ onLeave }: { onLeave: (summary: CallSummary) => void }): React.JSX.Element {
  const call = useCall();
  const { useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const joinedAtRef = useRef<number | null>(null);
  // Mirrors `elapsedSeconds` so the LEFT/RECONNECTING_FAILED effects below
  // (which only re-run when `callingState`/`call` change, not every second)
  // can read the live value instead of one frozen at whichever render last
  // recreated them.
  const elapsedSecondsRef = useRef(0);
  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  const buildSummary = (): CallSummary => ({
    otherUserId: call?.state.members.find(m => m.user_id !== call?.currentUserId)?.user_id ?? null,
    isVideo: Boolean((call?.state.custom as { isVideo?: boolean } | undefined)?.isVideo),
    isCreatedByMe: Boolean(call?.isCreatedByMe),
    wasJoined: joinedAtRef.current !== null,
    durationSeconds: elapsedSecondsRef.current,
  });

  // Root cause of the "no audio on voice calls" bug: nothing in this app was
  // ever starting Stream's native audio session/routing manager. The camera
  // fix worked because WebRTC video tracks render regardless, but audio
  // output only plays through the OS's audio-routing layer, which this SDK
  // requires you to start explicitly (the old auto-start only applied to the
  // now-deprecated `react-native-incall-manager`, which isn't installed here).
  // `deviceEndpointType: 'earpiece'` for voice calls also transparently turns
  // on the SDK's built-in proximity-sensor screen-off/on behavior (native
  // ProximityManager only engages while the active route is the earpiece).
  useEffect(() => {
    if (!call) {
      return undefined;
    }
    // Always route through the main loudspeaker, never the earpiece — an
    // earlier version used 'earpiece' for voice calls (like a real phone
    // held to your ear), but that also became the sticky default output for
    // the whole app's audio session, so game/notification sound effects kept
    // coming out of the earpiece afterwards too. 'speaker' for everything
    // avoids that leak and is the safer default for a phone without the
    // proximity sensor in play.
    callManager.start({
      audioRole: 'communicator',
      deviceEndpointType: 'speaker',
    });
    return () => {
      callManager.stop();
    };
  }, [call]);

  useEffect(() => {
    if (callingState === CallingState.JOINED && joinedAtRef.current === null) {
      joinedAtRef.current = Date.now();
      // Mirrors the camera fix: the mic doesn't reliably default to "on"
      // just because the call was joined — has to be enabled explicitly,
      // on both the caller's and the callee's side (RingingCallContent's
      // built-in "accept" doesn't do this for us).
      call?.microphone.enable().catch(error => {
        console.warn('Mikrofon açılamadı:', error);
      });
    }
    if (callingState === CallingState.LEFT) {
      onLeave(buildSummary());
    }
    // buildSummary intentionally omitted: it closes over `call`/`elapsedSecondsRef`
    // (already covered by their own deps/ref) and is cheap to recreate, but adding
    // it here would re-run this effect (and re-enable the mic) on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callingState, onLeave, call]);

  useEffect(() => {
    if (callingState !== CallingState.JOINED) {
      return undefined;
    }
    const interval = setInterval(() => {
      const startedAt = joinedAtRef.current ?? Date.now();
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [callingState]);

  // A dropped connection (RECONNECTING_FAILED) is a distinct, user-visible
  // event worth a brief explicit message — unlike a normal hangup (LEFT),
  // which still closes instantly with no lingering screen (kept as-is).
  useEffect(() => {
    if (callingState !== CallingState.RECONNECTING_FAILED) {
      return undefined;
    }
    const timer = setTimeout(() => onLeave(buildSummary()), RECONNECT_FAILED_DISPLAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callingState, onLeave]);

  if (callingState === CallingState.RINGING) {
    return (
      <View style={styles.container}>
        <RingingCallContent />
        <RingingStatusBanner isCaller={Boolean(call?.isCreatedByMe)} />
      </View>
    );
  }

  if (callingState === CallingState.JOINING) {
    return <ConnectingOverlay />;
  }

  if (callingState === CallingState.RECONNECTING_FAILED) {
    return (
      <View style={styles.connectingContainer}>
        <Text style={styles.connectingText}>Görüşme koptu</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {callingState === CallingState.JOINED && (
        <View style={styles.callBanner}>
          <PulsingDot color="#4CD964" />
          <Text style={styles.callBannerText}>
            Görüşme sürüyor • {formatDuration(elapsedSeconds)}
          </Text>
        </View>
      )}
      {callingState === CallingState.RECONNECTING && (
        <View style={[styles.callBanner, styles.callBannerWarning]}>
          <PulsingDot color="#FFB84D" />
          <Text style={styles.callBannerText}>Bağlantı zayıf, yeniden bağlanılıyor…</Text>
        </View>
      )}
      {/* No onHangupCallHandler here: its internal hangup button already calls
          call.leave() itself, which flips callingState to LEFT and fires the
          effect above — wiring onLeave here too would call it (and log the
          call-in-chat entry) twice for every manual hangup. */}
      <CallContent />
    </View>
  );
}

/** Full-screen call UI, mounted by CallProvider whenever a call is ringing or active. */
function CallScreen({ call, onLeave }: Props): React.JSX.Element {
  return (
    <View style={styles.container}>
      <StreamCall call={call}>
        <CallContentSwitcher onLeave={onLeave} />
      </StreamCall>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1115',
  },
  callBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: 'rgba(15,17,21,0.85)',
  },
  callBannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CD964',
    marginRight: 8,
  },
  callBannerFloating: {
    top: undefined,
    bottom: 90,
    backgroundColor: 'rgba(15,17,21,0.55)',
    borderRadius: 20,
    marginHorizontal: 60,
  },
  callBannerWarning: {
    backgroundColor: 'rgba(255,184,77,0.18)',
  },
  callBannerText: {
    color: '#F5F5F7',
    fontSize: 13,
    fontWeight: '600',
  },
  connectingContainer: {
    flex: 1,
    backgroundColor: '#0F1115',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectingSpinner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: 'rgba(77,150,255,0.25)',
    borderTopColor: '#4D96FF',
    marginBottom: 16,
  },
  connectingText: {
    color: '#F5F5F7',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default CallScreen;
