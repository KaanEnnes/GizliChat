import React, { useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchSpotifyPreview, type SpotifyPreview } from '../utils/linkPreview';
import { useTheme } from '../theme/ThemeContext';

const SPOTIFY_GREEN = '#1DB954';

interface Props {
  url: string;
}

/** Banner card shown under a chat message that contains a Spotify link — cover art, track title and an "open in Spotify" affordance. Renders nothing while loading or if the oEmbed lookup fails. */
function LinkPreviewCard({ url }: Props): React.JSX.Element | null {
  const { theme } = useTheme();
  const [preview, setPreview] = useState<SpotifyPreview | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setPreview(undefined);
    fetchSpotifyPreview(url).then(result => {
      if (!cancelled) {
        setPreview(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!preview) {
    return null;
  }

  return (
    <Pressable
      onPress={() => Linking.openURL(url).catch(() => undefined)}
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {preview.thumbnailUrl && (
        <Image source={{ uri: preview.thumbnailUrl }} style={styles.thumb} resizeMode="cover" />
      )}
      <View style={styles.textWrap}>
        <View style={styles.badgeRow}>
          <Text style={styles.badgeIcon}>♫</Text>
          <Text style={[styles.badgeText, { color: SPOTIFY_GREEN }]}>Spotify</Text>
        </View>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
          {preview.title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
    marginTop: 6,
    maxWidth: 260,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 10,
  },
  textWrap: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  badgeIcon: {
    color: SPOTIFY_GREEN,
    fontSize: 12,
    marginRight: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 13.5,
    fontWeight: '600',
  },
});

export default LinkPreviewCard;
