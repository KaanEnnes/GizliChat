import React, { useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchLinkPreview, type LinkPreview } from '../utils/linkPreview';
import { useTheme } from '../theme/ThemeContext';

const SPOTIFY_GREEN = '#1DB954';

interface Props {
  url: string;
}

/**
 * Preview card shown under a chat message containing a link. Spotify links
 * keep their compact branded row (cover art beside the track title); every
 * other link renders a generic Open Graph card with the og:image as a wide
 * banner above the title/description. Renders nothing while loading or when
 * the lookup fails, so a link that has no metadata just stays a plain link.
 */
function LinkPreviewCard({ url }: Props): React.JSX.Element | null {
  const { theme } = useTheme();
  const [preview, setPreview] = useState<LinkPreview | null | undefined>(undefined);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPreview(undefined);
    setImageFailed(false);
    fetchLinkPreview(url).then(result => {
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

  const open = () => Linking.openURL(preview.url).catch(() => undefined);
  const showImage = !!preview.imageUrl && !imageFailed;

  if (preview.isSpotify) {
    return (
      <Pressable onPress={open} style={[styles.card, styles.spotifyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {showImage && <Image source={{ uri: preview.imageUrl }} style={styles.spotifyThumb} resizeMode="cover" onError={() => setImageFailed(true)} />}
        <View style={styles.spotifyTextWrap}>
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

  return (
    <Pressable onPress={open} style={[styles.card, styles.ogCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {showImage && (
        <Image
          source={{ uri: preview.imageUrl }}
          style={styles.ogImage}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      )}
      <View style={styles.ogTextWrap}>
        {!!preview.siteName && (
          <Text style={[styles.siteName, { color: theme.textFaint }]} numberOfLines={1}>
            {preview.siteName}
          </Text>
        )}
        {!!preview.title && (
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
            {preview.title}
          </Text>
        )}
        {!!preview.description && (
          <Text style={[styles.description, { color: theme.textMuted }]} numberOfLines={2}>
            {preview.description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 6,
    maxWidth: 260,
    overflow: 'hidden',
  },
  spotifyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  spotifyThumb: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 10,
  },
  spotifyTextWrap: {
    flex: 1,
  },
  ogCard: {
    width: 260,
  },
  ogImage: {
    width: '100%',
    height: 130,
  },
  ogTextWrap: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  siteName: {
    fontSize: 10.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
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
  description: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
});

export default LinkPreviewCard;
