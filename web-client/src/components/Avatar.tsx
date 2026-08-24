import React from 'react';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  name: string;
  size: number;
  photoUrl?: string;
  online?: boolean;
}

/** Circular avatar — profile photo when set, initials otherwise, with an optional online dot. Mirrors the mobile app's Avatar.tsx. */
function Avatar({ name, size, photoUrl, online }: Props): React.JSX.Element {
  const { theme } = useTheme();
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name}
          style={{ width: size, height: size, borderRadius: size / 2, objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            background: theme.identity,
            color: theme.identityText,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: size * 0.4,
          }}>
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      {online && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: size * 0.3,
            height: size * 0.3,
            borderRadius: size * 0.15,
            background: theme.success,
            border: `2px solid ${theme.background}`,
          }}
        />
      )}
    </div>
  );
}

export default Avatar;
