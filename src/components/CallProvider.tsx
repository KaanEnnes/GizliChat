import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, StatusBar } from 'react-native';
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
  // Call ids this device has already rejected as "busy" — without it, the
  // `calls` array updating again before the server processes the rejection
  // would make us fire another reject for the same call every render.
  const rejectedAsBusyRef = useRef<Set<string>>(new Set());
  // CallScreen can reach `onLeave` twice for one call (a connection that
  // fails to recover both reports the failure *and* then leaves), which
  // previously wrote the call log twice and cleared state twice.
  const loggedCallIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const ringingCalls = calls.filter(call => call.ringing);

    if (activeCall) {
      // Already on a call: anything else that rings is answered with a real
      // "busy" rejection. Previously these were simply ignored, so the other
      // person's phone rang until it timed out with no indication that the
      // call could never be picked up.
      ringingCalls.forEach(call => {
        if (call.id !== activeCall.id && !rejectedAsBusyRef.current.has(call.id)) {
          rejectedAsBusyRef.current.add(call.id);
          call.leave({ reject: true, reason: 'busy' }).catch(() => undefined);
        }
      });
      return;
    }

    const ringingCall = ringingCalls.find(call => !rejectedAsBusyRef.current.has(call.id));
    if (!ringingCall) {
      return;
    }
    setActiveCall(ringingCall);
    // Requested here (not just by the caller) so that by the time the
    // callee taps "accept", the OS permission prompt is already resolved
    // — otherwise Stream silently fails to publish camera/mic on join.
    // Camera permission is only requested for calls actually marked as
    // video (see `custom.isVideo`, set by the caller in callService.ts) —
    // a voice call must never prompt for or touch the camera.
    const isVideoCall = Boolean((ringingCall.state.custom as { isVideo?: boolean } | undefined)?.isVideo);
    // Only the callee is prompted here; the caller already answered the same
    // prompt in callService.startCall before the call was even created, and
    // re-requesting there would pop a second dialog over the ringing screen.
    if (!ringingCall.isCreatedByMe) {
      // Result intentionally unused for flow control: if denied,
      // requestCallPermissions itself already shows the "İzin gerekli" /
      // "Ayarlara Git" alert. The call is still allowed to connect —
      // Stream will just publish without the missing track — since
      // silently blocking the answer entirely would be worse than a
      // one-way call.
      requestCallPermissions(isVideoCall).catch(() => undefined);
    }
  }, [calls, activeCall]);

  const handleLeave = useCallback(
    (summary: CallSummary) => {
      setActiveCall(null);
      if (!summary.otherUserId || !summary.callId || loggedCallIdsRef.current.has(summary.callId)) {
        return;
      }
      loggedCallIdsRef.current.add(summary.callId);
      // Logged like WhatsApp's in-chat call entries — non-critical, so a
      // failure here (e.g. offline) is swallowed rather than surfaced.
      // The *caller's* uid is stored rather than this device's, so both
      // sides render the same direction arrow (see sendCallLogMessage).
      const roomId = getRoomId(myUid, summary.otherUserId);
      const callerId = summary.isCreatedByMe ? myUid : summary.otherUserId;
      sendCallLogMessage(roomId, callerId, summary.callId, {
        video: summary.isVideo,
        status: summary.status,
        durationSeconds: summary.durationSeconds,
      }).catch(() => undefined);
    },
    [myUid],
  );

  if (!activeCall) {
    return null;
  }

  return (
    <Modal
      visible
      animationType="slide"
      // The call UI is a dark, full-bleed surface regardless of the app's
      // light/dark theme, so the status bar has to be forced to light icons
      // for the duration of the call — on a light theme they were previously
      // dark-on-dark and effectively invisible.
      statusBarTranslucent
      onRequestClose={() => {
        // Was just clearing local state, leaving the underlying Stream call
        // ringing/active on the server — the other side kept ringing forever,
        // the audio session/wake lock never released, and the very next
        // `calls` update could re-find the still-ringing call and pop this
        // same modal right back up. `leave()` actually ends it; `handleLeave`
        // (via CallContentSwitcher's LEFT-state effect) clears `activeCall`
        // once that's actually happened. Rejecting rather than plain-leaving
        // matters while it's still ringing: a bare leave() by the caller does
        // not stop the callee's phone from ringing.
        activeCall
          .leave({ reject: true, reason: activeCall.isCreatedByMe ? 'cancel' : 'decline' })
          .catch(() => activeCall.leave().catch(() => undefined));
      }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
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
