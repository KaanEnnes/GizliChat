import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const listener = () => setMatches(mql.matches);
    listener();
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

/** Below this width the app behaves like the mobile app: one pane visible at a time (contacts OR chat room), not a side-by-side split. */
export function useIsMobileLayout(): boolean {
  return useMediaQuery('(max-width: 860px)');
}
