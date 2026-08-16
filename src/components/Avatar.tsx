import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  name: string;
  size: number;
  photoUrl?: string;
  online?: boolean;
}

/** Circular avatar shown across Contacts/ChatRoom — a profile photo when set, initials otherwise. Shows an "online" dot when present. */
function Avatar({ name, size, photoUrl, online }: Props): React.JSX.Element {
  const { theme } = useTheme();
  return (
    <View style={{ width: size, height: size }}>
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.identity },
          ]}>
          <Text style={[styles.fallbackText, { color: theme.identityText, fontSize: size * 0.4 }]}>
            {name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
      )}
      {online && (
        <View
          style={[
            styles.onlineDot,
            {
              backgroundColor: theme.success,
              borderColor: theme.background,
              width: size * 0.3,
              height: size * 0.3,
              borderRadius: size * 0.15,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    resizeMode: 'cover',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    fontWeight: '800',
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    borderWidth: 2,
  },
});

export default Avatar;
