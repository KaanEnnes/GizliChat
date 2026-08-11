import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Call,
  CallContent,
  CallingState,
  RingingCallContent,
  StreamCall,
  useCall,
  useCallStateHooks,
} from '@stream-io/video-react-native-sdk';

interface Props {
  call: Call;
  onLeave: () => void;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/**
 * Switches between the ringing (incoming/outgoing) UI and the live call UI
 * (with a WhatsApp-style "call started" duration banner). Leaves the call
 * screen immediately once the call ends — no lingering "call ended" screen.
 */
function CallContentSwitcher({ onLeave }: { onLeave: () => void }): React.JSX.Element {
  const call = useCall();
  const { useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const joinedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (callingState === CallingState.JOINED && joinedAtRef.current === null) {
      joinedAtRef.current = Date.now();
      // Mirrors the camera fix: the mic doesn't reliably default to "on"
      // just because the call was joined — has to be enabled explicitly,
      // on both the caller's and the callee's side (RingingCallContent's
      // built-in "accept" doesn't do this for us).
      call?.microphone.enable().catch(() => undefined);
    }
    if (callingState === CallingState.LEFT) {
      onLeave();
    }
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

  if (callingState === CallingState.RINGING) {
    return <RingingCallContent />;
  }

  return (
    <View style={styles.container}>
      {callingState === CallingState.JOINED && (
        <View style={styles.callBanner}>
          <View style={styles.callBannerDot} />
          <Text style={styles.callBannerText}>
            Görüşme sürüyor • {formatDuration(elapsedSeconds)}
          </Text>
        </View>
      )}
      <CallContent onHangupCallHandler={onLeave} />
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
  callBannerText: {
    color: '#F5F5F7',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default CallScreen;
