import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from 'react-native';
import { Call, StreamVideo, useCalls } from '@stream-io/video-react-native-sdk';
import { getOrCreateStreamClient } from '../services/callService';
import { requestCallPermissions } from '../services/permissionsService';
import CallScreen from '../screens/CallScreen';

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
function IncomingCallWatcher(): React.JSX.Element | null {
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

  if (!activeCall) {
    return null;
  }

  return (
    <Modal visible animationType="slide" onRequestClose={() => setActiveCall(null)}>
      <CallScreen call={activeCall} onLeave={() => setActiveCall(null)} />
    </Modal>
  );
}

/** Wraps the authenticated part of the app with a Stream Video client + global call UI. */
function CallProvider({ myUid, myUsername, children }: Props): React.JSX.Element {
  const client = useMemo(() => getOrCreateStreamClient(myUid, myUsername), [myUid, myUsername]);

  return (
    <StreamVideo client={client}>
      {children}
      <IncomingCallWatcher />
    </StreamVideo>
  );
}

export default CallProvider;
