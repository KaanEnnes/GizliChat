import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../theme/ThemeContext';
import { searchSongs, type SongSearchResult } from '../services/songService';
import type { SongClip } from '../services/chatService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSend: (clip: SongClip) => void;
}

const SEARCH_DEBOUNCE_MS = 400;
const CLIP_DURATION_OPTIONS = [10, 15, 20, 30];
const DEFAULT_CLIP_DURATION = 15;

/**
 * YouTube's embedded player refuses to play ("Yapılandırma hatası" / config
 * error) when it detects it's running inside an Android System WebView —
 * the default RN WebView user agent string ends in "; wv)", a marker Chrome
 * adds specifically so sites can tell in-app WebViews apart from the real
 * browser, and YouTube blocks playback there on purpose (DRM/policy, not a
 * bug in our code). Overriding the user agent to a normal Chrome-for-Android
 * string (no "wv" token) is the standard workaround.
 */
const YOUTUBE_EMBED_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * "Şarkı gönder" — search YouTube (via the youtubeSearch Cloud Function) and
 * pick a clip window to send, Instagram-style. Mirrors the web client's
 * SongPickerModal.tsx — see its doc comment for why YouTube instead of
 * Spotify (Spotify's Web API stopped returning a playable preview clip for
 * apps created after Nov 2024). The preview player here is a WebView loading
 * YouTube's embeddable player, which supports `start`/`end` params.
 */
function SongPickerModal({ visible, onClose, onSend }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SongSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SongSearchResult | null>(null);
  const [startSeconds, setStartSeconds] = useState(0);
  const [clipDuration, setClipDuration] = useState(DEFAULT_CLIP_DURATION);
  const [previewKey, setPreviewKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchSongs(query)
        .then(setResults)
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
    setResults([]);
    setSelected(null);
    onClose();
  };

  const handlePickTrack = (track: SongSearchResult) => {
    setSelected(track);
    setStartSeconds(0);
    setClipDuration(DEFAULT_CLIP_DURATION);
    setPreviewKey(k => k + 1);
  };

  const handleSend = () => {
    if (!selected) {
      return;
    }
    onSend({
      videoId: selected.videoId,
      title: selected.title,
      artist: selected.channelTitle,
      thumbnailUrl: selected.thumbnailUrl,
      startSeconds,
      durationSeconds: clipDuration,
    });
    handleClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>{selected ? 'Klip seç' : '🎵 Şarkı gönder'}</Text>
            <Pressable
              onPress={selected ? () => setSelected(null) : handleClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Kapat">
              <Text style={[styles.closeIcon, { color: theme.textMuted }]}>✕</Text>
            </Pressable>
          </View>

          {!selected && (
            <>
              <TextInput
                style={[styles.searchInput, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
                placeholder="Şarkı ara… (örn. sanatçı - şarkı adı)"
                placeholderTextColor={theme.textFaint}
                value={query}
                onChangeText={setQuery}
                autoFocus
              />
              <View style={styles.listWrap}>
                {loading && <ActivityIndicator color={theme.identity} style={styles.loader} />}
                {!!error && <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>}
                {!loading && !error && !query.trim() && (
                  <Text style={[styles.emptyText, { color: theme.textFaint }]}>Bir şarkı adı yazmaya başla.</Text>
                )}
                {!loading && !error && query.trim() && results.length === 0 && (
                  <Text style={[styles.emptyText, { color: theme.textFaint }]}>Sonuç bulunamadı.</Text>
                )}
                {!loading && !error && (
                  <FlatList
                    data={results}
                    keyExtractor={item => item.videoId}
                    renderItem={({ item }) => (
                      <Pressable style={styles.resultRow} onPress={() => handlePickTrack(item)}>
                        <Image source={{ uri: item.thumbnailUrl }} style={styles.resultThumb} />
                        <View style={styles.resultTextWrap}>
                          <Text style={[styles.resultTitle, { color: theme.text }]} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={[styles.resultArtist, { color: theme.textMuted }]} numberOfLines={1}>
                            {item.channelTitle}
                          </Text>
                        </View>
                      </Pressable>
                    )}
                  />
                )}
              </View>
            </>
          )}

          {selected && (
            <View style={styles.clipEditor}>
              <Text style={[styles.resultTitle, { color: theme.text, marginBottom: 8 }]} numberOfLines={1}>
                {selected.title}
              </Text>
              <View style={styles.playerWrap}>
                <WebView
                  key={previewKey}
                  style={styles.player}
                  source={{
                    uri: `https://www.youtube.com/embed/${selected.videoId}?start=${startSeconds}&end=${
                      startSeconds + clipDuration
                    }&autoplay=1&playsinline=1`,
                  }}
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                  userAgent={YOUTUBE_EMBED_USER_AGENT}
                />
              </View>
              <Text style={[styles.sliderLabel, { color: theme.textMuted }]}>Başlangıç: {formatSeconds(startSeconds)}</Text>
              <View style={styles.seekRow}>
                {[-10, -5, 5, 10].map(delta => (
                  <Pressable
                    key={delta}
                    style={[styles.seekBtn, { borderColor: theme.border }]}
                    onPress={() => {
                      setStartSeconds(s => Math.max(0, s + delta));
                      setPreviewKey(k => k + 1);
                    }}>
                    <Text style={{ color: theme.text, fontSize: 13 }}>{delta > 0 ? `+${delta}sn` : `${delta}sn`}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.durationRow}>
                <Text style={[styles.sliderLabel, { color: theme.textMuted }]}>Klip uzunluğu:</Text>
                {CLIP_DURATION_OPTIONS.map(d => (
                  <Pressable
                    key={d}
                    onPress={() => {
                      setClipDuration(d);
                      setPreviewKey(k => k + 1);
                    }}
                    style={[
                      styles.durationChip,
                      { borderColor: theme.border, backgroundColor: clipDuration === d ? theme.identity : 'transparent' },
                    ]}>
                    <Text style={{ color: clipDuration === d ? '#fff' : theme.text, fontSize: 12.5 }}>{d}sn</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.actionRow}>
                <Pressable style={[styles.actionBtn, { borderColor: theme.border }]} onPress={() => setPreviewKey(k => k + 1)}>
                  <Text style={{ color: theme.text }}>🔁 Yeniden dinle</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, { backgroundColor: theme.identity, borderColor: theme.identity }]} onPress={handleSend}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Gönder</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  card: { width: '100%', maxWidth: 420, maxHeight: '85%', borderRadius: 20, borderWidth: 1, padding: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 16, fontWeight: '800' },
  closeIcon: { fontSize: 16, fontWeight: '700', padding: 4 },
  searchInput: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginTop: 10, marginBottom: 12 },
  listWrap: { minHeight: 200, flexShrink: 1 },
  loader: { marginTop: 24 },
  errorText: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 24 },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  resultThumb: { width: 48, height: 48, borderRadius: 6 },
  resultTextWrap: { flex: 1, minWidth: 0 },
  resultTitle: { fontSize: 13.5, fontWeight: '600' },
  resultArtist: { fontSize: 12 },
  clipEditor: { paddingTop: 4 },
  playerWrap: { width: '100%', height: 180, borderRadius: 10, overflow: 'hidden' },
  player: { flex: 1 },
  sliderLabel: { fontSize: 12.5, marginTop: 10 },
  seekRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  seekBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  durationChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, borderWidth: 1 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
});

export default SongPickerModal;
