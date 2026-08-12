import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * True while the device appears to have working internet, false only once
 * NetInfo has positively reported no connection/no reachability. Starts
 * `true` (optimistic) so the offline banner never flashes on mount before
 * the first NetInfo event arrives — `isConnected`/`isInternetReachable` are
 * nullable ("still figuring it out") on some platforms, and null must not be
 * treated as offline.
 */
export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      setIsOnline(!offline);
    });
    return unsubscribe;
  }, []);

  return isOnline;
}
