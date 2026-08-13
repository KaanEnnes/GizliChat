import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from 'react-native';
import { Call, StreamVideo, useCalls } from '@stream-io/video-react-native-sdk';
import { getOrCreateStreamClient } from '../services/callService';
import { requestCallPermissions } from '../services/permissionsService';
import { getRoomId, sendCallLogMessage } from '../services/chatService';
import CallScreen, { CallSummary } from '../screens/CallScreen';

interface Props {
  myUid: string;
  myUsername: string;
  children: React.ReactNode;
}

/**
 * Watches for any ringing call (incoming, or the one this device just
 * started) and shows a full-screen CallScreen for it until the call ends.
 * Must live inside <StreamVideo>, which is why it's a separate component
 * from CallProvider itself.
 */
function IncomingCallWatcher({ myUid }: { myUid: string }): React.JSX.Element | null {
  const calls = useCalls();
  const [activeCall, setActiveCall] = useState<Call | null>(null);

  useEffect(() => {
    if (activeCall) {
      return;
    }
    const ringingCall = calls.find(call => call.ringing);
    if (ringingCall) {
      setActiveCall(ringingCall);
      // Requested here (not just by the caller) so that by the time the
      // callee taps "accept", the OS permission prompt is already resolved
      // — otherwise Stream silently fails to publish camera/mic on join.
      requestCallPermissions(true).catch(() => undefined);
    }
  }, [calls, activeCall]);

  const handleLeave = (summary: CallSummary) => {
    setActiveCall(null);
    // Logged like WhatsApp's in-chat call entries — non-critical, so a
    // failure here (e.g. offline) is swallowed rather than surfaced.
    if (summary.otherUserId) {
      const roomId = getRoomId(myUid, summary.otherUserId);
      sendCallLogMessage(roomId, myUid, {
        video: summary.isVideo,
        status: summary.wasJoined ? 'completed' : 'missed',
        durationSeconds: summary.durationSeconds,
      }).catch(() => undefined);
    }
  };

  if (!activeCall) {
    return null;
  }

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => {
        // Was just clearing local state, leaving the underlying Stream call
        // ringing/active on the server — the other side kept ringing forever,
        // the audio session/wake lock never released, and the very next
        // `calls` update could re-find the still-ringing call and pop this
        // same modal right back up. `leave()` actually ends it; `handleLeave`
        // (via CallContentSwitcher's LEFT-state effect) clears `activeCall`
        // once that's actually happened.
        activeCall.leave().catch(() => undefined);
      }}>
      <CallScreen call={activeCall} onLeave={handleLeave} />
    </Modal>
  );
}

/** Wraps the authenticated part of the app with a Stream Video client + global call UI. */
function CallProvider({ myUid, myUsername, children }: Props): React.JSX.Element {
  const client = useMemo(() => getOrCreateStreamClient(myUid, myUsername), [myUid, myUsername]);

  return (
    <StreamVideo client={client}>
      {children}
      <IncomingCallWatcher myUid={myUid} />
    </StreamVideo>
  );
}

export default CallProvider;
