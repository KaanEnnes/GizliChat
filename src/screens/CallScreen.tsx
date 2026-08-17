import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AudioDevice,
  AudioDeviceEndpointType,
  Call,
  CallContent,
  CallingState,
  StreamCall,
  callManager,
  useAudioDeviceStatus,
  useCall,
  useCallStateHooks,
} from '@stream-io/video-react-native-sdk';
import { ThemePalette, useTheme } from '../theme/ThemeContext';
import { findMatchingDevice, getAudioOutputPreference } from '../services/audioOutputService';

/** Handed to `onLeave` once a call ends, so the caller can log a WhatsApp-style call entry in the chat. */
export interface CallSummary {
  callId: string | null;
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

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '?';
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Large circular initials avatar — used everywhere in place of a photo, since contacts have no profile image. */
function CallAvatar({ name, size, theme }: { name: string; size: number; theme: ThemePalette }): React.JSX.Element {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.identity },
      ]}>
      <Text style={[styles.avatarText, { color: theme.identityText, fontSize: size * 0.36 }]}>
        {getInitials(name)}
      </Text>
    </View>
  );
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

  return <Animated.View style={[styles.pulsingDot, { backgroundColor: color, opacity: pulse }]} />;
}

/** Large circular action button (accept/decline/end/mute) with an optional label underneath, WhatsApp-style. */
function RoundButton({
  icon,
  label,
  accessibilityLabel,
  color,
  textColor = '#FFFFFF',
  labelColor,
  size = 64,
  onPress,
}: {
  icon: string;
  label?: string;
  /** Falls back to `label` when omitted — required when there's no visible label (icon-only buttons). */
  accessibilityLabel?: string;
  color: string;
  textColor?: string;
  labelColor?: string;
  size?: number;
  onPress: () => void;
}): React.JSX.Element {
  // Every call action must have a real hit target of at least 44x44 (the
  // platform-recommended minimum), even where the visual circle is drawn
  // smaller — hitSlop alone can't be relied on for very small `size` values.
  const minHitSize = Math.max(size, 44);
  const hitSlop = Math.max(0, (minHitSize - size) / 2);
  return (
    <View style={styles.roundButtonWrap}>
      <Pressable
        onPress={onPress}
        hitSlop={hitSlop + 10}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label ?? icon}
        style={({ pressed }) => [
          styles.roundButton,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
          pressed && styles.roundButtonPressed,
        ]}>
        <Text style={[styles.roundButtonIcon, { color: textColor, fontSize: size * 0.32 }]}>{icon}</Text>
      </Pressable>
      {label ? <Text style={[styles.roundButtonLabel, { color: labelColor }]}>{label}</Text> : null}
    </View>
  );
}

const AUDIO_DEVICE_ICONS: Record<AudioDeviceEndpointType, string> = {
  'Bluetooth Device': '🎧',
  Earpiece: '📱',
  Speaker: '🔊',
  'Wired Headset': '🎧',
  Unknown: '🔊',
};

function audioDeviceIcon(type: AudioDeviceEndpointType): string {
  return AUDIO_DEVICE_ICONS[type] ?? '🔊';
}

/** Bottom-sheet listing every currently available audio output device — tap one to switch to it. */
function AudioDevicePickerModal({
  visible,
  devices,
  selectedDeviceId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  devices: AudioDevice[];
  selectedDeviceId: string | undefined;
  onSelect: (device: AudioDevice) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { theme } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.deviceModalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.deviceSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => undefined}>
          <Text style={[styles.deviceSheetTitle, { color: theme.text }]}>Ses Çıkışı</Text>
          {devices.map(device => {
            const isSelected = device.id === selectedDeviceId;
            return (
              <Pressable
                key={device.id}
                onPress={() => onSelect(device)}
                style={[
                  styles.deviceRow,
                  isSelected && { backgroundColor: `${theme.identity}22` },
                ]}
                accessibilityRole="button"
                accessibilityLabel={device.name}>
                <Text style={styles.deviceRowIcon}>{audioDeviceIcon(device.type)}</Text>
                <Text style={[styles.deviceRowLabel, { color: theme.text }]} numberOfLines={1}>
                  {device.name}
                </Text>
                {isSelected && <Text style={[styles.deviceRowCheck, { color: theme.identity }]}>✓</Text>}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Round control button that opens the audio-output picker — mirrors a real phone's speaker/earpiece/bluetooth toggle. */
function AudioDeviceButton({ size = 54 }: { size?: number }): React.JSX.Element | null {
  const { theme } = useTheme();
  const status = useAudioDeviceStatus();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Nothing to switch between (e.g. only the built-in speaker is available) — no point showing the control.
  if (!status || status.devices.length <= 1) {
    return null;
  }

  return (
    <>
      <RoundButton
        icon={audioDeviceIcon(status.currentEndpointType)}
        accessibilityLabel="Ses çıkışını değiştir"
        color="rgba(255,255,255,0.16)"
        size={size}
        onPress={() => setPickerOpen(true)}
      />
      <AudioDevicePickerModal
        visible={pickerOpen}
        devices={status.devices}
        selectedDeviceId={status.selectedDeviceId}
        onSelect={device => {
          callManager.audioDevices.select(device.id);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}

/** Looks up the other call member's display name (falls back to their id, then a placeholder). */
function useOtherMemberName(call: Call | undefined): string {
  const { useCallMembers } = useCallStateHooks();
  const members = useCallMembers();
  const other = members.find(m => m.user_id !== call?.currentUserId);
  return other?.user?.name || other?.user_id || 'Bilinmeyen';
}

/** Full-screen ringing UI — outgoing ("Aranıyor…") or incoming ("Gelen arama…") — replacing the SDK's default. */
function RingingScreen({ call, isVideo }: { call: Call; isVideo: boolean }): React.JSX.Element {
  const { theme } = useTheme();
  const name = useOtherMemberName(call);
  const isCaller = Boolean(call.isCreatedByMe);

  return (
    <View style={[styles.fullScreen, { backgroundColor: theme.background }]}>
      <View style={styles.topArea}>
        <Text style={[styles.callTypeLabel, { color: theme.textMuted }]}>
          {isVideo ? 'Görüntülü arama' : 'Sesli arama'}
        </Text>
      </View>

      <View style={styles.centerArea}>
        <CallAvatar name={name} size={132} theme={theme} />
        <Text style={[styles.callerName, { color: theme.text }]} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.statusRow}>
          <PulsingDot color={theme.identity} />
          <Text style={[styles.statusText, { color: theme.textMuted }]}>
            {isCaller ? 'Aranıyor…' : 'Gelen arama…'}
          </Text>
        </View>
      </View>

      <View style={styles.bottomArea}>
        {isCaller ? (
          <RoundButton
            icon="✕"
            label="Vazgeç"
            labelColor={theme.textMuted}
            color={theme.danger}
            size={68}
            onPress={() => {
              call.leave().catch(() => undefined);
            }}
          />
        ) : (
          <View style={styles.ringingActionsRow}>
            <RoundButton
              icon="✕"
              label="Reddet"
              labelColor={theme.textMuted}
              color={theme.danger}
              size={64}
              onPress={() => {
                call.leave({ reject: true }).catch(() => undefined);
              }}
            />
            <RoundButton
              icon="✓"
              label="Kabul Et"
              labelColor={theme.textMuted}
              color={theme.accent}
              textColor={theme.accentText}
              size={72}
              onPress={() => {
                call.join().catch(() => undefined);
              }}
            />
          </View>
        )}
      </View>
    </View>
  );
}

/** Full-screen "Bağlanıyor…" shown between accepting a call and actually joining it (also reused for reconnecting-failed). */
function StatusOverlay({ text }: { text: string }): React.JSX.Element {
  const { theme } = useTheme();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={[styles.fullScreen, styles.centeredScreen, { backgroundColor: theme.background }]}>
      <Animated.View
        style={[styles.spinner, { borderColor: theme.surfaceAlt, borderTopColor: theme.identity, transform: [{ rotate }] }]}
      />
      <Text style={[styles.connectingText, { color: theme.text }]}>{text}</Text>
    </View>
  );
}

/** Full-screen active voice call UI — large avatar, duration, mute + end. No video to render, so entirely custom. */
function ActiveVoiceScreen({ call, elapsedSeconds }: { call: Call; elapsedSeconds: number }): React.JSX.Element {
  const { theme } = useTheme();
  const name = useOtherMemberName(call);
  const { useMicrophoneState } = useCallStateHooks();
  const { isMute, microphone } = useMicrophoneState();

  return (
    <View style={[styles.fullScreen, { backgroundColor: theme.background }]}>
      <View style={styles.topArea}>
        <View style={styles.statusRow}>
          <PulsingDot color={theme.success} />
          <Text style={[styles.statusText, { color: theme.textMuted }]}>
            Görüşme sürüyor • {formatDuration(elapsedSeconds)}
          </Text>
        </View>
      </View>

      <View style={styles.centerArea}>
        <CallAvatar name={name} size={140} theme={theme} />
        <Text style={[styles.callerName, { color: theme.text }]} numberOfLines={1}>
          {name}
        </Text>
      </View>

      <View style={styles.bottomArea}>
        <View style={styles.activeVoiceActionsRow}>
          <RoundButton
            icon={isMute ? '🔇' : '🎙️'}
            label={isMute ? 'Sesi Aç' : 'Sustur'}
            labelColor={theme.textMuted}
            color={isMute ? theme.identity : theme.surfaceAlt}
            textColor={isMute ? theme.identityText : theme.text}
            size={58}
            onPress={() => {
              microphone.toggle().catch(() => undefined);
            }}
          />
          <RoundButton
            icon="✕"
            label="Kapat"
            labelColor={theme.textMuted}
            color={theme.danger}
            size={68}
            onPress={() => {
              call.leave().catch(() => undefined);
            }}
          />
          <AudioDeviceButton size={58} />
        </View>
      </View>
    </View>
  );
}

/** Custom bottom control bar for active video calls — swapped in for the SDK's default `CallControls`. */
function VideoCallControls(): React.JSX.Element {
  const { theme } = useTheme();
  const call = useCall();
  const { useMicrophoneState, useCameraState } = useCallStateHooks();
  const { isMute: micMuted, microphone } = useMicrophoneState();
  const { isMute: cameraOff, camera } = useCameraState();
  const dimButton = 'rgba(255,255,255,0.16)';

  return (
    <View style={styles.videoControlsRow}>
      <RoundButton
        icon={micMuted ? '🔇' : '🎙️'}
        accessibilityLabel={micMuted ? 'Sesi aç' : 'Sustur'}
        color={micMuted ? theme.identity : dimButton}
        size={54}
        onPress={() => microphone.toggle().catch(() => undefined)}
      />
      <RoundButton
        icon={cameraOff ? '📷' : '📸'}
        accessibilityLabel={cameraOff ? 'Kamerayı aç' : 'Kamerayı kapat'}
        color={cameraOff ? theme.identity : dimButton}
        size={54}
        onPress={() => camera.toggle().catch(() => undefined)}
      />
      <RoundButton
        icon="🔄"
        accessibilityLabel="Kamerayı çevir"
        color={dimButton}
        size={54}
        onPress={() => camera.flip().catch(() => undefined)}
      />
      <AudioDeviceButton size={54} />
      <RoundButton
        icon="✕"
        accessibilityLabel="Görüşmeyi sonlandır"
        color={theme.danger}
        size={62}
        onPress={() => call?.leave().catch(() => undefined)}
      />
    </View>
  );
}

/** Full-screen active video call UI — keeps the SDK's video tile rendering, restyles everything around it. */
function ActiveVideoScreen({ elapsedSeconds }: { elapsedSeconds: number }): React.JSX.Element {
  const { theme } = useTheme();
  return (
    <View style={styles.fullScreen}>
      <View style={styles.videoDurationBanner} pointerEvents="none">
        <PulsingDot color={theme.success} />
        <Text style={styles.videoDurationText}>{formatDuration(elapsedSeconds)}</Text>
      </View>
      <CallContent
        layout="spotlight"
        CallControls={VideoCallControls}
        CallParticipantsList={null}
      />
    </View>
  );
}

/**
 * Switches between the ringing (incoming/outgoing) UI and the live call UI.
 * Leaves the call screen immediately once the call ends — no lingering
 * "call ended" screen.
 */
function CallContentSwitcher({ onLeave }: { onLeave: (summary: CallSummary) => void }): React.JSX.Element {
  const { theme } = useTheme();
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

  const isVideoCall = Boolean((call?.state.custom as { isVideo?: boolean } | undefined)?.isVideo);

  const buildSummary = (): CallSummary => ({
    callId: call?.id ?? null,
    otherUserId: call?.state.members.find(m => m.user_id !== call?.currentUserId)?.user_id ?? null,
    isVideo: isVideoCall,
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
  useEffect(() => {
    if (!call) {
      return undefined;
    }
    // Always route through the main loudspeaker, never the earpiece — an
    // earlier version used 'earpiece' for voice calls (like a real phone
    // held to your ear), but that also became the sticky default output for
    // the whole app's audio session, so game/notification sound effects kept
    // coming out of the earpiece afterwards too. 'speaker' for everything
    // avoids that leak: the moment this effect's cleanup runs (call ends),
    // callManager.stop() hands audio routing back to the OS default, so
    // every other in-app sound (games, notifications, voice messages) is
    // unaffected outside of an actual call.
    callManager.start({
      audioRole: 'communicator',
      deviceEndpointType: 'speaker',
    });
    // start() above always forces the speaker as the initial route. When the
    // user's saved preference (Ayarlar → Arama ses çıkışı) is 'auto', that's
    // corrected by handing routing back to whatever external device (a
    // Bluetooth/wired headset) was already in use going into the call — e.g.
    // earbuds playing music right before answering — since forcing the
    // speaker would otherwise silently undo that. A specific saved
    // preference (speaker/earpiece/bluetooth/wired) is matched against this
    // call's actual device list instead, when available. Either way the
    // in-call button (AudioDeviceButton) still lets the user override it.
    const preference = getAudioOutputPreference();
    callManager.audioDevices
      .getStatus()
      .then(status => {
        const target =
          preference.kind === 'device'
            ? findMatchingDevice(status.devices, preference)
            : status.devices.find(d => d.type === 'Bluetooth Device' || d.type === 'Wired Headset');
        if (target && target.id !== status.selectedDeviceId) {
          callManager.audioDevices.select(target.id);
        }
      })
      .catch(() => undefined);
    return () => {
      callManager.stop();
    };
  }, [call]);

  useEffect(() => {
    if (callingState === CallingState.JOINED && joinedAtRef.current === null) {
      joinedAtRef.current = Date.now();
      // The mic doesn't reliably default to "on" just because the call was
      // joined — has to be enabled explicitly, on both the caller's and the
      // callee's side (RingingCallContent's built-in "accept" doesn't do
      // this for us). Always on: a call with no working mic would leave the
      // other side hearing silence with zero indication why.
      call?.microphone.enable().catch(error => {
        console.warn('Mikrofon açılamadı:', error);
      });
      // Camera enable/disable is per-device local state, not something the
      // caller's choice (see callService.startCall) automatically carries
      // over to the callee's device — each side must explicitly set its own
      // camera to match the call's actual type on join. This is also the
      // guard against a voice call ever turning the camera on: only a call
      // created with `custom.isVideo: true` enables it here; the user can
      // still turn it on manually afterwards via the in-call controls.
      if (isVideoCall) {
        call?.camera.enable().catch(error => {
          console.warn('Kamera açılamadı:', error);
        });
      } else {
        call?.camera.disable().catch(() => undefined);
      }
    }
    if (callingState === CallingState.LEFT) {
      onLeave(buildSummary());
    }
    // buildSummary intentionally omitted: it closes over `call`/`elapsedSecondsRef`
    // (already covered by their own deps/ref) and is cheap to recreate, but adding
    // it here would re-run this effect (and re-enable the mic) on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callingState, onLeave, call, isVideoCall]);

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
    const timer = setTimeout(() => {
      // Unlike a normal hangup (where the LEFT state above only fires once
      // something has *already* called call.leave()), reaching
      // RECONNECTING_FAILED does not itself leave the call — Stream just
      // gave up trying to reconnect the local session. Without an explicit
      // leave() here, the local UI would close while the call is possibly
      // still considered live server-side (and by the other participant),
      // leaving a dangling call, an un-released mic/camera, and no chance
      // for the other side to see it end.
      call?.leave().catch(() => undefined);
      onLeave(buildSummary());
    }, RECONNECT_FAILED_DISPLAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callingState, onLeave]);

  if (callingState === CallingState.RINGING && call) {
    return <RingingScreen call={call} isVideo={isVideoCall} />;
  }

  if (callingState === CallingState.JOINING) {
    return <StatusOverlay text="Bağlanıyor…" />;
  }

  if (callingState === CallingState.RECONNECTING_FAILED) {
    return <StatusOverlay text="Görüşme koptu" />;
  }

  // RECONNECTING only ever follows a prior JOINED for this call (a dropped
  // connection Stream is actively retrying) — the active call UI stays
  // mounted underneath a warning banner instead of being replaced, so mic/
  // camera state and the duration display don't reset just because the
  // network blipped.
  if ((callingState === CallingState.JOINED || callingState === CallingState.RECONNECTING) && call) {
    return (
      <View style={styles.fullScreen}>
        {isVideoCall ? (
          <ActiveVideoScreen elapsedSeconds={elapsedSeconds} />
        ) : (
          <ActiveVoiceScreen call={call} elapsedSeconds={elapsedSeconds} />
        )}
        {callingState === CallingState.RECONNECTING && (
          <View style={[styles.reconnectingBanner, { backgroundColor: theme.warningSoft }]}>
            <PulsingDot color={theme.warning} />
            <Text style={[styles.reconnectingText, { color: theme.warning }]}>
              Bağlantı zayıf, yeniden bağlanılıyor…
            </Text>
          </View>
        )}
      </View>
    );
  }

  return <StatusOverlay text="Bağlanıyor…" />;
}

/** Full-screen call UI, mounted by CallProvider whenever a call is ringing or active. */
function CallScreen({ call, onLeave }: Props): React.JSX.Element {
  return (
    <View style={styles.fullScreen}>
      <StreamCall call={call}>
        <CallContentSwitcher onLeave={onLeave} />
      </StreamCall>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
  },
  centeredScreen: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  topArea: {
    paddingTop: 24,
    alignItems: 'center',
  },
  centerArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomArea: {
    paddingBottom: 56,
    alignItems: 'center',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '800',
  },
  callerName: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 22,
    maxWidth: '80%',
    textAlign: 'center',
  },
  callTypeLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ringingActionsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 56,
  },
  activeVoiceActionsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 40,
  },
  roundButtonWrap: {
    alignItems: 'center',
  },
  roundButton: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  roundButtonPressed: {
    opacity: 0.8,
  },
  roundButtonIcon: {
    fontWeight: '700',
  },
  roundButtonLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 8,
  },
  spinner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 3,
    marginBottom: 16,
  },
  connectingText: {
    fontSize: 15,
    fontWeight: '600',
  },
  reconnectingBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  reconnectingText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  videoDurationBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: 'rgba(11,19,43,0.55)',
  },
  videoDurationText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 8,
  },
  videoControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 20,
  },
  deviceModalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  deviceSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 16,
    paddingBottom: 32,
    paddingHorizontal: 8,
  },
  deviceSheetTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginLeft: 12,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 12,
  },
  deviceRowIcon: {
    fontSize: 20,
    marginRight: 14,
  },
  deviceRowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  deviceRowCheck: {
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 8,
  },
});

export default CallScreen;
