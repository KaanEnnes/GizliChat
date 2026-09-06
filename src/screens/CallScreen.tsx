import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import {
  AudioDevice,
  AudioDeviceEndpointType,
  Call,
  CallingState,
  ParticipantView,
  StreamCall,
  StreamVideoParticipant,
  callManager,
  useAudioDeviceStatus,
  useCall,
  useCallStateHooks,
} from '@stream-io/video-react-native-sdk';
import { useTheme } from '../theme/ThemeContext';
import { findMatchingDevice, getAudioOutputPreference } from '../services/audioOutputService';
import { RINGING_TIMEOUT_MS } from '../services/callService';
import type { CallLogStatus } from '../services/chatService';
import {
  AcceptCallIcon,
  BluetoothIcon,
  EarpieceIcon,
  EndCallIcon,
  FlipCameraIcon,
  HeadsetIcon,
  MicIcon,
  MicOffIcon,
  SpeakerIcon,
  VideoCallIcon,
  VideoOffIcon,
} from '../components/CallIcons';

/** Handed to `onLeave` once a call ends, so the caller can log a WhatsApp-style call entry in the chat. */
export interface CallSummary {
  callId: string | null;
  otherUserId: string | null;
  isVideo: boolean;
  isCreatedByMe: boolean;
  /**
   * How the call ended. 'completed' means it was actually joined; 'declined'
   * means someone explicitly rejected it; 'missed' covers a call that simply
   * rang out or was cancelled before being answered.
   */
  status: CallLogStatus;
  durationSeconds: number;
}

interface Props {
  call: Call;
  onLeave: (summary: CallSummary) => void;
}

const RECONNECT_FAILED_DISPLAY_MS = 1600;
/**
 * How long the active call UI tolerates being alone in the call before
 * hanging up. Stream does not always end a 1:1 call the instant the other
 * participant leaves, so without this the screen sat on "Görüşme sürüyor"
 * with a running timer long after the other side had hung up.
 */
const REMOTE_GONE_GRACE_MS = 2500;

/**
 * The call UI is deliberately always dark, in both app themes — a full-bleed
 * dark surface is what every phone's call screen looks like, it keeps the
 * video tiles from being framed in white, and it means the ringing screen
 * reads the same whichever theme the user picked.
 */
const SURFACE = {
  base: '#05070F',
  text: '#F8FAFC',
  textMuted: 'rgba(226,232,240,0.62)',
  textFaint: 'rgba(226,232,240,0.38)',
  control: 'rgba(255,255,255,0.13)',
  controlActive: '#F1F5F9',
  controlActiveIcon: '#0B132B',
  hairline: 'rgba(255,255,255,0.12)',
  sheet: '#111827',
  danger: '#EF4444',
  accept: '#22C55E',
  live: '#4ADE80',
  warning: '#FBBF24',
};

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  // Only grows to h:mm:ss once a call actually passes an hour, so the common
  // case stays the compact mm:ss everyone expects.
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
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

/** Full-bleed dark backdrop with a soft brand-tinted glow behind the avatar. */
function CallBackdrop({ tint }: { tint: string }): React.JSX.Element {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="callGlow" cx="50%" cy="27%" r="80%">
            <Stop offset="0" stopColor={tint} stopOpacity={0.45} />
            <Stop offset="0.55" stopColor={tint} stopOpacity={0.12} />
            <Stop offset="1" stopColor={SURFACE.base} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={SURFACE.base} />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#callGlow)" />
      </Svg>
    </View>
  );
}

/** Two staggered rings expanding out from behind the avatar while the call rings. */
function PulsingRings({ size, color }: { size: number; color: string }): React.JSX.Element {
  const ringA = useRef(new Animated.Value(0)).current;
  const ringB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const wave = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 2200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );
    const animation = Animated.parallel([wave(ringA, 0), wave(ringB, 1100)]);
    animation.start();
    return () => animation.stop();
  }, [ringA, ringB]);

  const ringStyle = (value: Animated.Value) => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    borderColor: color,
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.85] }) }],
    opacity: value.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.4, 0] }),
  });

  return (
    <View style={styles.ringLayer} pointerEvents="none">
      <Animated.View style={[styles.ring, ringStyle(ringA)]} />
      <Animated.View style={[styles.ring, ringStyle(ringB)]} />
    </View>
  );
}

/** Large circular initials avatar — used everywhere in place of a photo, since contacts have no profile image. */
function CallAvatar({ name, size, tint }: { name: string; size: number; tint: string }): React.JSX.Element {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: tint },
      ]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.34 }]}>{getInitials(name)}</Text>
    </View>
  );
}

/** Small pulsing dot used by every status banner (ringing/connecting/reconnecting/live). */
function PulsingDot({ color }: { color: string }): React.JSX.Element {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 620, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 620, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return <Animated.View style={[styles.pulsingDot, { backgroundColor: color, opacity: pulse }]} />;
}

type IconComponent = (props: { color: string; size?: number }) => React.JSX.Element;

/**
 * Circular in-call control. `active` inverts it (light fill, dark glyph) the
 * way a phone's call controls show an engaged toggle — mute, camera off, and
 * a non-default audio route all use it, so state is readable at a glance
 * instead of being carried only by a swapped emoji.
 */
function ControlButton({
  Icon,
  label,
  accessibilityLabel,
  active = false,
  color,
  iconColor,
  size = 58,
  onPress,
}: {
  Icon: IconComponent;
  label?: string;
  /** Falls back to `label` — required when there's no visible label (icon-only buttons). */
  accessibilityLabel?: string;
  active?: boolean;
  color?: string;
  iconColor?: string;
  size?: number;
  onPress: () => void;
}): React.JSX.Element {
  const background = color ?? (active ? SURFACE.controlActive : SURFACE.control);
  const glyph = iconColor ?? (active ? SURFACE.controlActiveIcon : SURFACE.text);
  // Every call action must have a real hit target of at least 44x44 (the
  // platform-recommended minimum), even where the visual circle is drawn
  // smaller — hitSlop alone can't be relied on for very small `size` values.
  const hitSlop = Math.max(0, (Math.max(size, 44) - size) / 2) + 10;

  return (
    <View style={styles.controlWrap}>
      <Pressable
        onPress={onPress}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={accessibilityLabel ?? label}
        style={({ pressed }) => [
          styles.controlButton,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
          pressed && styles.controlPressed,
        ]}>
        <Icon color={glyph} size={size * 0.42} />
      </Pressable>
      {label ? <Text style={styles.controlLabel}>{label}</Text> : null}
    </View>
  );
}

const AUDIO_DEVICE_ICONS: Record<AudioDeviceEndpointType, IconComponent> = {
  'Bluetooth Device': BluetoothIcon,
  Earpiece: EarpieceIcon,
  Speaker: SpeakerIcon,
  'Wired Headset': HeadsetIcon,
  Unknown: SpeakerIcon,
};

function audioDeviceIcon(type: AudioDeviceEndpointType): IconComponent {
  return AUDIO_DEVICE_ICONS[type] ?? SpeakerIcon;
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
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.deviceModalBackdrop} onPress={onClose} accessibilityLabel="Kapat">
        <Pressable
          style={[styles.deviceSheet, { paddingBottom: 20 + insets.bottom }]}
          onPress={() => undefined}>
          <View style={styles.deviceSheetGrabber} />
          <Text style={styles.deviceSheetTitle}>Ses Çıkışı</Text>
          {devices.map(device => {
            const isSelected = device.id === selectedDeviceId;
            const Icon = audioDeviceIcon(device.type);
            return (
              <Pressable
                key={device.id}
                onPress={() => onSelect(device)}
                style={({ pressed }) => [
                  styles.deviceRow,
                  isSelected && styles.deviceRowSelected,
                  pressed && styles.controlPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={device.name}>
                <Icon color={isSelected ? SURFACE.live : SURFACE.text} size={21} />
                <Text style={styles.deviceRowLabel} numberOfLines={1}>
                  {device.name}
                </Text>
                {isSelected && <View style={styles.deviceRowCheck} />}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Round control button that opens the audio-output picker — mirrors a real phone's speaker/earpiece/bluetooth toggle. */
function AudioDeviceButton({ size = 58, label }: { size?: number; label?: string }): React.JSX.Element | null {
  const status = useAudioDeviceStatus();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Nothing to switch between (e.g. only the built-in speaker is available) — no point showing the control.
  if (!status || status.devices.length <= 1) {
    return null;
  }

  const isExternalRoute =
    status.currentEndpointType === 'Speaker' ||
    status.currentEndpointType === 'Bluetooth Device' ||
    status.currentEndpointType === 'Wired Headset';

  return (
    <>
      <ControlButton
        Icon={audioDeviceIcon(status.currentEndpointType)}
        label={label}
        accessibilityLabel="Ses çıkışını değiştir"
        active={isExternalRoute}
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
function RingingScreen({
  call,
  isVideo,
  tint,
  onDecline,
}: {
  call: Call;
  isVideo: boolean;
  tint: string;
  onDecline: () => void;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const name = useOtherMemberName(call);
  const isCaller = Boolean(call.isCreatedByMe);

  return (
    <View style={styles.fullScreen}>
      <CallBackdrop tint={tint} />

      <View style={[styles.topArea, { paddingTop: insets.top + 28 }]}>
        <Text style={styles.callTypeLabel}>{isVideo ? 'GÖRÜNTÜLÜ ARAMA' : 'SESLİ ARAMA'}</Text>
      </View>

      <View style={styles.centerArea}>
        <View style={styles.avatarStack}>
          <PulsingRings size={132} color={tint} />
          <CallAvatar name={name} size={132} tint={tint} />
        </View>
        <Text style={styles.callerName} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.statusRow}>
          <PulsingDot color={SURFACE.text} />
          <Text style={styles.statusText}>{isCaller ? 'Aranıyor…' : 'Gelen arama…'}</Text>
        </View>
      </View>

      <View style={[styles.bottomArea, { paddingBottom: 40 + insets.bottom }]}>
        {isCaller ? (
          <ControlButton
            Icon={EndCallIcon}
            label="Vazgeç"
            color={SURFACE.danger}
            iconColor="#FFFFFF"
            size={70}
            onPress={onDecline}
          />
        ) : (
          <View style={styles.ringingActionsRow}>
            <ControlButton
              Icon={EndCallIcon}
              label="Reddet"
              color={SURFACE.danger}
              iconColor="#FFFFFF"
              size={68}
              onPress={onDecline}
            />
            <ControlButton
              Icon={AcceptCallIcon}
              label="Kabul Et"
              color={SURFACE.accept}
              iconColor="#FFFFFF"
              size={68}
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
function StatusOverlay({ text, tint }: { text: string; tint: string }): React.JSX.Element {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      // Linear easing: the default ease-in-out made the spinner visibly stall
      // at the top of every rotation instead of turning steadily.
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={[styles.fullScreen, styles.centeredScreen]}>
      <CallBackdrop tint={tint} />
      <Animated.View style={[styles.spinner, { borderTopColor: tint, transform: [{ rotate }] }]} />
      <Text style={styles.connectingText}>{text}</Text>
    </View>
  );
}

/** Full-screen active voice call UI — large avatar, duration, mute + end. No video to render, so entirely custom. */
function ActiveVoiceScreen({
  call,
  elapsedSeconds,
  tint,
}: {
  call: Call;
  elapsedSeconds: number;
  tint: string;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const name = useOtherMemberName(call);
  const { useMicrophoneState } = useCallStateHooks();
  const { isMute, microphone } = useMicrophoneState();

  return (
    <View style={styles.fullScreen}>
      <CallBackdrop tint={tint} />

      <View style={[styles.topArea, { paddingTop: insets.top + 28 }]}>
        <View style={styles.statusRow}>
          <PulsingDot color={SURFACE.live} />
          <Text style={styles.statusText}>Görüşme sürüyor</Text>
        </View>
      </View>

      <View style={styles.centerArea}>
        <CallAvatar name={name} size={140} tint={tint} />
        <Text style={styles.callerName} numberOfLines={1}>
          {name}
        </Text>
        {/* Tabular-ish duration under the name, the way a phone shows it — a
            fixed min-width stops the row from jittering as digits change. */}
        <Text style={styles.durationText}>{formatDuration(elapsedSeconds)}</Text>
        {isMute && <Text style={styles.mutedHint}>Mikrofonun kapalı</Text>}
      </View>

      <View style={[styles.bottomArea, { paddingBottom: 40 + insets.bottom }]}>
        <View style={styles.activeVoiceActionsRow}>
          <ControlButton
            Icon={isMute ? MicOffIcon : MicIcon}
            label={isMute ? 'Sesi Aç' : 'Sustur'}
            active={isMute}
            size={58}
            onPress={() => {
              microphone.toggle().catch(() => undefined);
            }}
          />
          <ControlButton
            Icon={EndCallIcon}
            label="Kapat"
            color={SURFACE.danger}
            iconColor="#FFFFFF"
            size={70}
            onPress={() => {
              call.leave().catch(() => undefined);
            }}
          />
          <AudioDeviceButton size={58} label="Ses" />
        </View>
      </View>
    </View>
  );
}

/** Custom bottom control bar for active video calls — swapped in for the SDK's default `CallControls`. */
function VideoCallControls(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const call = useCall();
  const { useMicrophoneState, useCameraState } = useCallStateHooks();
  const { isMute: micMuted, microphone } = useMicrophoneState();
  const { isMute: cameraOff, camera } = useCameraState();

  return (
    <View style={[styles.videoControlsDock, { paddingBottom: 14 + insets.bottom }]}>
      <View style={styles.videoControlsRow}>
        <ControlButton
          Icon={micMuted ? MicOffIcon : MicIcon}
          accessibilityLabel={micMuted ? 'Sesi aç' : 'Sustur'}
          active={micMuted}
          size={54}
          onPress={() => microphone.toggle().catch(() => undefined)}
        />
        <ControlButton
          Icon={cameraOff ? VideoOffIcon : VideoCallIcon}
          accessibilityLabel={cameraOff ? 'Kamerayı aç' : 'Kamerayı kapat'}
          active={cameraOff}
          size={54}
          onPress={() => camera.toggle().catch(() => undefined)}
        />
        <ControlButton
          Icon={FlipCameraIcon}
          accessibilityLabel="Kamerayı çevir"
          size={54}
          onPress={() => camera.flip().catch(() => undefined)}
        />
        <AudioDeviceButton size={54} />
        <ControlButton
          Icon={EndCallIcon}
          accessibilityLabel="Görüşmeyi sonlandır"
          color={SURFACE.danger}
          iconColor="#FFFFFF"
          size={62}
          onPress={() => call?.leave().catch(() => undefined)}
        />
      </View>
    </View>
  );
}

const SELF_VIEW_WIDTH = 112;
const SELF_VIEW_HEIGHT = 168;
const SELF_VIEW_MARGIN = 14;

/**
 * The local camera preview, as a small rounded rectangle floating over the
 * remote video — draggable anywhere on screen, and springing to the nearest
 * corner when released so it can never be left half off-screen or parked over
 * the controls.
 *
 * This replaces the SDK's `CallContent` spotlight layout, which tiled both
 * participants and left the person you are talking to sharing the screen with
 * your own preview instead of filling it.
 */
function DraggableSelfView({
  participant,
  bounds,
}: {
  participant: StreamVideoParticipant;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}): React.JSX.Element {
  const position = useRef(new Animated.ValueXY({ x: bounds.maxX, y: bounds.minY })).current;
  // PanResponder is created once, so its callbacks close over the first
  // `bounds` object — this ref keeps the live one reachable from inside them
  // (the usable area changes with orientation and safe-area insets).
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const positionRef = useRef({ x: bounds.maxX, y: bounds.minY });

  useEffect(() => {
    const id = position.addListener(value => {
      positionRef.current = value;
    });
    return () => position.removeListener(id);
  }, [position]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,
      onPanResponderGrant: () => {
        position.setOffset({ ...positionRef.current });
        position.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: position.x, dy: position.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        position.flattenOffset();
        const { minX, maxX, minY, maxY } = boundsRef.current;
        const { x, y } = positionRef.current;
        // Nearest corner by which half of the screen the tile's centre sits in.
        const targetX = x + SELF_VIEW_WIDTH / 2 < (minX + maxX + SELF_VIEW_WIDTH) / 2 ? minX : maxX;
        const targetY = y + SELF_VIEW_HEIGHT / 2 < (minY + maxY + SELF_VIEW_HEIGHT) / 2 ? minY : maxY;
        Animated.spring(position, {
          toValue: { x: targetX, y: targetY },
          useNativeDriver: false,
          friction: 7,
          tension: 60,
        }).start();
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[styles.selfView, { transform: position.getTranslateTransform() }]}
      {...panResponder.panHandlers}>
      <ParticipantView
        participant={participant}
        objectFit="cover"
        // Above the remote video, which renders at the default zOrder 0 —
        // without this the local preview is composited *behind* the
        // full-screen remote surface and simply never appears.
        videoZOrder={1}
        ParticipantLabel={null}
        ParticipantNetworkQualityIndicator={null}
        ParticipantReaction={null}
        style={styles.selfViewInner}
      />
    </Animated.View>
  );
}

/** Full-screen active video call UI — remote participant fills the screen, local camera floats over it. */
function ActiveVideoScreen({ elapsedSeconds }: { elapsedSeconds: number }): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const call = useCall();
  const name = useOtherMemberName(call ?? undefined);
  const { useRemoteParticipants, useLocalParticipant } = useCallStateHooks();
  const remoteParticipants = useRemoteParticipants();
  const localParticipant = useLocalParticipant();
  const remoteParticipant = remoteParticipants[0];

  // Keeps the floating preview clear of the duration bar at the top and the
  // control dock at the bottom, whichever corner it is snapped to.
  const bounds = useMemo(
    () => ({
      minX: SELF_VIEW_MARGIN,
      maxX: width - SELF_VIEW_WIDTH - SELF_VIEW_MARGIN,
      minY: insets.top + 64,
      maxY: height - insets.bottom - 108 - SELF_VIEW_HEIGHT,
    }),
    [width, height, insets.top, insets.bottom],
  );

  return (
    <View style={[styles.fullScreen, { backgroundColor: SURFACE.base }]}>
      {remoteParticipant ? (
        <ParticipantView
          participant={remoteParticipant}
          objectFit="cover"
          ParticipantLabel={null}
          ParticipantNetworkQualityIndicator={null}
          ParticipantReaction={null}
          style={styles.remoteVideo}
        />
      ) : (
        <View style={[styles.fullScreen, styles.centeredScreen]}>
          <CallAvatar name={name} size={116} tint={SURFACE.control} />
          <Text style={styles.remoteWaitingText}>Bağlanıyor…</Text>
        </View>
      )}

      <View style={[styles.videoTopBar, { paddingTop: insets.top + 10 }]} pointerEvents="none">
        <Text style={styles.videoTopName} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.statusRow}>
          <PulsingDot color={SURFACE.live} />
          <Text style={styles.videoTopDuration}>{formatDuration(elapsedSeconds)}</Text>
        </View>
      </View>

      {localParticipant && <DraggableSelfView participant={localParticipant} bounds={bounds} />}

      <View style={styles.videoControlsOverlay}>
        <VideoCallControls />
      </View>
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
  const tint = theme.identity;
  const call = useCall();
  const { useCallCallingState, useCallCustomData, useRemoteParticipants } = useCallStateHooks();
  const callingState = useCallCallingState();
  // Read through the hook rather than `call.state.custom` directly: on the
  // callee's device the custom data can land a tick *after* the call starts
  // ringing, and a plain property read does not re-render when it does — so
  // an incoming video call could render (and join) as a voice call.
  const customData = useCallCustomData();
  const remoteParticipants = useRemoteParticipants();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const joinedAtRef = useRef<number | null>(null);
  // Set when this device (or the other side) explicitly rejects, so the chat
  // log can say "reddedildi" instead of lumping it in with a call that just
  // rang out unanswered.
  const declinedRef = useRef(false);
  // Guards against `onLeave` firing twice for one call — the failed-reconnect
  // path reports the failure and then leaves, which trips the LEFT effect too.
  const leftReportedRef = useRef(false);
  // Mirrors `elapsedSeconds` so the LEFT/RECONNECTING_FAILED effects below
  // (which only re-run when `callingState`/`call` change, not every second)
  // can read the live value instead of one frozen at whichever render last
  // recreated them.
  const elapsedSecondsRef = useRef(0);
  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  const isVideoCall = Boolean((customData as { isVideo?: boolean } | undefined)?.isVideo);

  const reportLeave = useCallback(() => {
    if (leftReportedRef.current) {
      return;
    }
    leftReportedRef.current = true;
    const status: CallLogStatus =
      joinedAtRef.current !== null ? 'completed' : declinedRef.current ? 'declined' : 'missed';
    onLeave({
      callId: call?.id ?? null,
      otherUserId: call?.state.members.find(m => m.user_id !== call?.currentUserId)?.user_id ?? null,
      isVideo: isVideoCall,
      isCreatedByMe: Boolean(call?.isCreatedByMe),
      status,
      durationSeconds: joinedAtRef.current !== null ? elapsedSecondsRef.current : 0,
    });
  }, [call, isVideoCall, onLeave]);

  /** Ends a ringing call with a proper reject so the other device stops ringing too. */
  const declineOrCancel = useCallback(() => {
    // The caller giving up is a *cancelled* call, which both sides should see
    // as missed — only the callee refusing it counts as declined.
    if (!call?.isCreatedByMe) {
      declinedRef.current = true;
    }
    call?.leave({ reject: true, reason: call.isCreatedByMe ? 'cancel' : 'decline' })
      .catch(() => call?.leave().catch(() => undefined));
  }, [call]);

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
    // Voice calls open on the earpiece and video calls on the loudspeaker,
    // which is what every phone does and what a private chat app should do —
    // a voice call that starts on speakerphone broadcasts the other person's
    // voice to whoever is in the room.
    //
    // An earlier version forced 'speaker' for *both*, to work around the
    // earpiece becoming the sticky default output for the app's whole audio
    // session (game and notification sounds kept coming out of the earpiece
    // after a call). The fix for that is the `callManager.stop()` cleanup
    // below, which hands routing back to the OS default when the call ends —
    // if that leak ever reappears, this `deviceEndpointType` is the line to
    // look at first.
    callManager.start({
      audioRole: 'communicator',
      deviceEndpointType: isVideoCall ? 'speaker' : 'earpiece',
    });
    // start() above forces an initial route. When the user's saved preference
    // (Ayarlar → Arama ses çıkışı) is 'auto', that's corrected by handing
    // routing to whatever external device (a Bluetooth/wired headset) was
    // already in use going into the call — e.g. earbuds playing music right
    // before answering — since forcing the built-in route would otherwise
    // silently undo that. A specific saved preference (speaker/earpiece/
    // bluetooth/wired) is matched against this call's actual device list
    // instead, when available. Either way the in-call button
    // (AudioDeviceButton) still lets the user override it.
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
  }, [call, isVideoCall]);

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
      reportLeave();
    }
  }, [callingState, call, isVideoCall, reportLeave]);

  // The other side rejecting an outgoing call has to be observed as an event:
  // the caller's own calling state just goes to LEFT, which on its own is
  // indistinguishable from "nobody picked up", so the chat log said "cevapsız"
  // for calls that were actually declined.
  useEffect(() => {
    if (!call) {
      return undefined;
    }
    return call.on('call.rejected', event => {
      // Stream reuses this event for a *cancelled* call too (the caller
      // hanging up while it rings sends `reason: 'cancel'`, and an unanswered
      // one 'timeout'), so the reason has to be checked — otherwise the
      // callee logged every cancelled call as one it had declined.
      if (event.reason !== 'cancel' && event.reason !== 'timeout') {
        declinedRef.current = true;
      }
    });
  }, [call]);

  // An outgoing call that nobody answers used to ring forever — no timeout on
  // either side. Cancelling it here also produces the 'missed' chat entry that
  // a real phone would leave behind.
  useEffect(() => {
    if (callingState !== CallingState.RINGING || !call?.isCreatedByMe) {
      return undefined;
    }
    const timer = setTimeout(() => {
      call.leave({ reject: true, reason: 'timeout' }).catch(() => call.leave().catch(() => undefined));
    }, RINGING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [callingState, call]);

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

  // Hang up as soon as the other side does. Stream does NOT end a 1:1 call
  // just because one participant left, and the local calling state stays
  // JOINED — so without this the remaining device sat on "Görüşme sürüyor"
  // with a running timer (and a live mic) long after the other person had
  // hung up. Driven by the coordinator events rather than by watching the
  // participant list, because they fire the moment the other side leaves
  // instead of waiting for its tracks to time out.
  useEffect(() => {
    if (!call) {
      return undefined;
    }
    const leave = () => {
      call.leave().catch(() => undefined);
    };
    const unsubscribers = [
      // The other member left the session (the normal "they hung up" path).
      call.on('call.session_participant_left', event => {
        if (event.participant?.user?.id !== call.currentUserId) {
          leave();
        }
      }),
      // Whole call/session torn down server-side.
      call.on('call.ended', leave),
      call.on('call.session_ended', leave),
    ];
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [call]);

  // Backstop for the events above: if a remote participant was present and
  // then vanished without any of those events arriving (a dropped socket on
  // their side), close the call rather than leaving it hanging. Only armed
  // after a remote participant has actually been seen, so the gap between
  // joining and the other side's tracks arriving isn't mistaken for a hangup.
  const sawRemoteRef = useRef(false);
  useEffect(() => {
    if (callingState !== CallingState.JOINED) {
      return undefined;
    }
    if (remoteParticipants.length > 0) {
      sawRemoteRef.current = true;
      return undefined;
    }
    if (!sawRemoteRef.current) {
      return undefined;
    }
    const timer = setTimeout(() => {
      call?.leave().catch(() => undefined);
    }, REMOTE_GONE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [callingState, remoteParticipants.length, call]);

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
      reportLeave();
    }, RECONNECT_FAILED_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [callingState, call, reportLeave]);

  if (callingState === CallingState.RINGING && call) {
    return <RingingScreen call={call} isVideo={isVideoCall} tint={tint} onDecline={declineOrCancel} />;
  }

  if (callingState === CallingState.JOINING) {
    return <StatusOverlay text="Bağlanıyor…" tint={tint} />;
  }

  if (callingState === CallingState.RECONNECTING_FAILED) {
    return <StatusOverlay text="Görüşme koptu" tint={tint} />;
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
          <ActiveVoiceScreen call={call} elapsedSeconds={elapsedSeconds} tint={tint} />
        )}
        {callingState === CallingState.RECONNECTING && (
          <View style={styles.reconnectingBanner}>
            <PulsingDot color={SURFACE.warning} />
            <Text style={styles.reconnectingText}>Bağlantı zayıf, yeniden bağlanılıyor…</Text>
          </View>
        )}
      </View>
    );
  }

  return <StatusOverlay text="Bağlanıyor…" tint={tint} />;
}

/** Full-screen call UI, mounted by CallProvider whenever a call is ringing or active. */
function CallScreen({ call, onLeave }: Props): React.JSX.Element {
  // `key` on StreamCall: without it, reusing this screen for a second call
  // would keep the previous call's subtree (and its timers/refs) mounted.
  return (
    <View style={[styles.fullScreen, { backgroundColor: SURFACE.base }]}>
      <StreamCall call={call}>
        <CallContentSwitcher key={call.id} onLeave={onLeave} />
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
    alignItems: 'center',
  },
  centerArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomArea: {
    alignItems: 'center',
  },
  avatarStack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  avatarText: {
    color: SURFACE.text,
    fontWeight: '800',
  },
  callerName: {
    color: SURFACE.text,
    fontSize: 26,
    fontWeight: '700',
    marginTop: 26,
    maxWidth: '82%',
    textAlign: 'center',
  },
  durationText: {
    color: SURFACE.textMuted,
    fontSize: 17,
    fontWeight: '600',
    marginTop: 8,
    minWidth: 78,
    textAlign: 'center',
    letterSpacing: 1,
  },
  mutedHint: {
    color: SURFACE.textFaint,
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 14,
  },
  callTypeLabel: {
    color: SURFACE.textFaint,
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  statusText: {
    color: SURFACE.textMuted,
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
    gap: 64,
  },
  activeVoiceActionsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 34,
  },
  controlWrap: {
    alignItems: 'center',
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  controlPressed: {
    opacity: 0.72,
  },
  controlLabel: {
    color: SURFACE.textMuted,
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 9,
  },
  spinner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.14)',
    marginBottom: 16,
  },
  connectingText: {
    color: SURFACE.text,
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
    backgroundColor: 'rgba(251,191,36,0.16)',
  },
  reconnectingText: {
    color: SURFACE.warning,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  videoTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: 'center',
    paddingBottom: 12,
    backgroundColor: 'rgba(5,7,15,0.55)',
  },
  videoTopName: {
    color: SURFACE.text,
    fontSize: 15,
    fontWeight: '700',
    maxWidth: '70%',
  },
  videoTopDuration: {
    color: SURFACE.textMuted,
    fontSize: 12.5,
    fontWeight: '600',
    marginLeft: 8,
    letterSpacing: 0.8,
  },
  videoControlsDock: {
    paddingTop: 14,
    backgroundColor: 'rgba(5,7,15,0.55)',
  },
  videoControlsOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  remoteVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  remoteWaitingText: {
    color: SURFACE.textMuted,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 18,
  },
  selfView: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SELF_VIEW_WIDTH,
    height: SELF_VIEW_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: '#0B1020',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  selfViewInner: {
    flex: 1,
  },
  videoControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  deviceModalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  deviceSheet: {
    backgroundColor: SURFACE.sheet,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: SURFACE.hairline,
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  deviceSheetGrabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginBottom: 14,
  },
  deviceSheetTitle: {
    color: SURFACE.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 6,
    marginLeft: 14,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  deviceRowSelected: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  deviceRowLabel: {
    flex: 1,
    color: SURFACE.text,
    fontSize: 15.5,
    fontWeight: '600',
    marginLeft: 14,
  },
  deviceRowCheck: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: SURFACE.live,
    marginLeft: 8,
  },
});

export default CallScreen;
