import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface Props {
  color: string;
  size?: number;
}

/** Modern outline phone-call icon (replaces the old 📞 emoji in ChatRoomScreen's header). */
export function PhoneCallIcon({ color, size = 20 }: Props): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.4 0 .8-.2 1L6.6 10.8Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Modern outline video-camera icon (replaces the old 🎥 emoji in ChatRoomScreen's header). */
export function VideoCallIcon({ color, size = 20 }: Props): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 7.5A1.5 1.5 0 0 1 4.5 6h8A1.5 1.5 0 0 1 14 7.5v9A1.5 1.5 0 0 1 12.5 18h-8A1.5 1.5 0 0 1 3 16.5v-9Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="m14 10.4 5.4-3.1a.8.8 0 0 1 1.2.7v8a.8.8 0 0 1-1.2.7L14 13.6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Small back-chevron icon (replaces the plain "‹" character in ChatRoomScreen's header). */
export function BackChevronIcon({ color, size = 22 }: Props): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 5 8 12l7 7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Game controller icon used on the "play XOX with this contact" header button. */
export function GameControllerIcon({ color, size = 20 }: Props): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 8.5h10a4.5 4.5 0 0 1 4.4 5.46l-.56 2.55a2.6 2.6 0 0 1-4.63 1.02L15 16H9l-1.21 1.53a2.6 2.6 0 0 1-4.63-1.02l-.56-2.55A4.5 4.5 0 0 1 7 8.5Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M7.5 11v3M6 12.5h3" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M16 11.5h.01M18 13h.01" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

/** Small image icon used on the "chat background" option (options menu). */
export function ImageIcon({ color, size = 18 }: Props): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="m5 16 4.5-5 3 3.2L16 10l3 4.5" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}
