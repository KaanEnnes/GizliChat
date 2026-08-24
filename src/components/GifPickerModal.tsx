import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fetchTrendingGifs, searchGifs, type GifResult } from '../services/gifService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (gif: GifResult) => void;
}

const SEARCH_DEBOUNCE_MS = 400;
const NUM_COLUMNS = 2;

/** GIF search/picker — GIPHY-backed, mirrors the web client's GifPickerModal.tsx. Selected GIF's original URL is sent as-is (no re-upload), same as any other image message. */
function GifPickerModal({ visible, onClose, onSelect }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setLoading(true);
    setError(null);
    fetchTrendingGifs()
      .then(setGifs)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      setError(null);
      const fetcher = query.trim() ? searchGifs(query.trim()) : fetchTrendingGifs();
      fetcher
        .then(setGifs)
        .catch(err => setError((err as Error).message))
        .finally(() => setLoading(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, visible]);

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>GIF gönder</Text>
            <Pressable onPress={handleClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Kapat">
              <Text style={[styles.closeIcon, { color: theme.textMuted }]}>✕</Text>
            </Pressable>
          </View>

          <TextInput
            style={[styles.searchInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
            placeholder="GIF ara… (örn. gülme, kalp, merhaba)"
            placeholderTextColor={theme.textFaint}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />

          <View style={styles.gridWrap}>
            {loading && <ActivityIndicator color={theme.identity} style={styles.loader} />}
            {!!error && <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>}
            {!loading && !error && gifs.length === 0 && (
              <Text style={[styles.emptyText, { color: theme.textFaint }]}>Sonuç bulunamadı.</Text>
            )}
            {!loading && !error && (
              <FlatList
                data={gifs}
                keyExtractor={item => item.id}
                numColumns={NUM_COLUMNS}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.thumbWrap}
                    onPress={() => {
                      onSelect(item);
                      handleClose();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={item.title || 'GIF'}>
                    <Image source={{ uri: item.previewUrl }} style={styles.thumb} resizeMode="cover" />
                  </Pressable>
                )}
              />
            )}
          </View>

          <Text style={[styles.attribution, { color: theme.textFaint }]}>Powered by GIPHY</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  closeIcon: {
    fontSize: 16,
    fontWeight: '700',
    padding: 4,
  },
  searchInput: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginTop: 10,
    marginBottom: 12,
  },
  gridWrap: {
    minHeight: 200,
    flexShrink: 1,
  },
  loader: {
    marginTop: 24,
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
  thumbWrap: {
    flex: 1,
    margin: 4,
    aspectRatio: 1.4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  attribution: {
    fontSize: 10.5,
    textAlign: 'center',
    marginTop: 8,
  },
});

export default GifPickerModal;
