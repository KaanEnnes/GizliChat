import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

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

/** Small picture-in-picture icon used on the "küçük pencereye al" header button. */
export function PipIcon({ color, size = 18 }: Props): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M12.5 12.5h6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z"
        fill={color}
      />
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

/*
 * ---------------------------------------------------------------------------
 * In-call control icons.
 *
 * CallScreen used to draw its controls with emoji (🎙️ / 🔇 / 📷 / 🔄 / ✕ / ✓),
 * which render at a different size, weight and colour on every Android
 * version — and are simply not tintable, so a "muted" state could not be
 * expressed by colour. These are the same 24x24 outline family as the icons
 * above, so the call UI matches the rest of the app.
 * ---------------------------------------------------------------------------
 */

/** Microphone, unmuted. */
export function MicIcon({ color, size = 24 }: Props): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Microphone with a strike-through — the muted state. */
export function MicOffIcon({ color, size = 24 }: Props): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 9V6a3 3 0 0 1 5.9-.7M15 10.5V12a3 3 0 0 1-3.6 2.94"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path d="M5 11a7 7 0 0 0 10.3 6.2M19 11v.6M12 18v3" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="m4 3 16 18" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

/** Camera with a strike-through — the "camera off" state (the on state reuses VideoCallIcon). */
export function VideoOffIcon({ color, size = 24 }: Props): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8.2 6h4.3A1.5 1.5 0 0 1 14 7.5v4.2M14 15.8a1.5 1.5 0 0 1-1.5 1.4h-8A1.5 1.5 0 0 1 3 15.7v-8A1.5 1.5 0 0 1 4.5 6.2"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="m14 10.4 5.4-3.1a.8.8 0 0 1 1.2.7v8a.8.8 0 0 1-1.2.7L17 15"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="m4 3 16 18" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

/** Front/back camera switch. */
export function FlipCameraIcon({ color, size = 24 }: Props): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.3l1.3-2h7.8l1.3 2h2.3A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-9Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M9.5 13a2.5 2.5 0 0 1 4.3-1.7M14.5 13a2.5 2.5 0 0 1-4.3 1.7"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      <Path d="M13.4 9.9h1.5v1.5M10.6 16.1H9.1v-1.5" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Loudspeaker — the "speaker" audio route. */
export function SpeakerIcon({ color, size = 24 }: Props): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 9.5h3L11.5 5.6a.6.6 0 0 1 1 .46v11.88a.6.6 0 0 1-1 .46L7 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M16.5 9.2a4 4 0 0 1 0 5.6M19 6.8a7.5 7.5 0 0 1 0 10.4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** Handset held to the ear — the "earpiece" audio route. */
export function EarpieceIcon({ color, size = 24 }: Props): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 2.8h10a1.8 1.8 0 0 1 1.8 1.8v14.8A1.8 1.8 0 0 1 17 21.2H7a1.8 1.8 0 0 1-1.8-1.8V4.6A1.8 1.8 0 0 1 7 2.8Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M9.5 5.8h5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={12} cy={17.6} r={1.1} fill={color} />
    </Svg>
  );
}

/** Bluetooth rune — the "bluetooth device" audio route. */
export function BluetoothIcon({ color, size = 24 }: Props): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="m7 7.5 10 9-5 4.2V3.3l5 4.2-10 9"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Over-ear headphones — the "wired headset" audio route. */
export function HeadsetIcon({ color, size = 24 }: Props): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 15v-3a8 8 0 1 1 16 0v3" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path
        d="M2.8 15.2a1.8 1.8 0 0 1 1.8-1.8h1.2v6H4.6a1.8 1.8 0 0 1-1.8-1.8v-2.4ZM17.2 13.4h1.2a1.8 1.8 0 0 1 1.8 1.8v2.4a1.8 1.8 0 0 1-1.8 1.8h-1.2v-6Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Handset rotated 135° — the universal "hang up" glyph. */
export function EndCallIcon({ color, size = 26 }: Props): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2.6 14.3c5.2-5.2 13.6-5.2 18.8 0 .8.8.8 2 0 2.7l-1.7 1.7c-.6.6-1.6.5-2.2-.2l-1.3-1.6a1.5 1.5 0 0 1-.3-1.3l.3-1.3c-2.5-.9-5.2-.9-7.7 0l.3 1.3c.1.5 0 1-.3 1.3L7.2 18.5c-.6.7-1.6.8-2.2.2L3.3 17a1.9 1.9 0 0 1-.7-2.7Z"
        fill={color}
      />
    </Svg>
  );
}

/** Upright handset — the "accept call" glyph (a filled twin of PhoneCallIcon). */
export function AcceptCallIcon({ color, size = 26 }: Props): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.4 0 .8-.2 1L6.6 10.8Z"
        fill={color}
      />
    </Svg>
  );
}

/** Handset with a downward arrow — a missed/declined call in the chat log. */
export function MissedCallIcon({ color, size = 18 }: Props): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.4 0 .8-.2 1L6.6 10.8Z"
        fill={color}
      />
      <Path d="M14.5 3.5 20 9m0-5.5V9h-5.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
