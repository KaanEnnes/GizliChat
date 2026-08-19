import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { VIDEO_STORAGE_QUOTA_BYTES } from '../services/userService';

interface Props {
  usedBytes: number;
  /** Contacts (dashboard) uses the roomier "card" look; ChatRoomScreen uses a slimmer strip that sits right under its header. */
  variant?: 'card' | 'strip';
}

function formatMb(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

/**
 * Persistent (non-dismissible) indicator of how much of the self-imposed
 * video-upload quota (see userService.VIDEO_STORAGE_QUOTA_BYTES) this
 * account has used — shown on both ContactsScreen ("home") and
 * ChatRoomScreen, each in a layout suited to that screen rather than a
 * single fixed position.
 */
function StorageQuotaBanner({ usedBytes, variant = 'card' }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const usedMb = formatMb(usedBytes);
  const totalMb = formatMb(VIDEO_STORAGE_QUOTA_BYTES);
  const ratio = Math.min(1, usedBytes / VIDEO_STORAGE_QUOTA_BYTES);
  const nearFull = ratio > 0.85;

  return (
    <View
      style={[
        styles.wrap,
        variant === 'strip' ? styles.wrapStrip : styles.wrapCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}>
      <Text style={[styles.label, { color: nearFull ? theme.warning : theme.textMuted }]} numberOfLines={1}>
        video/dosya yükleme alanı: {usedMb}mb / {totalMb}mb
      </Text>
      <View style={[styles.track, { backgroundColor: theme.border }]}>
        <View
          style={[
            styles.fill,
            { width: `${ratio * 100}%`, backgroundColor: nearFull ? theme.warning : theme.identity },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  wrapCard: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  wrapStrip: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 6,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '600',
    marginBottom: 6,
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
});

export default StorageQuotaBanner;
