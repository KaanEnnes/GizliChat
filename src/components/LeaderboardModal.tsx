import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchTopScores, HighScoreEntry } from '../services/leaderboardService';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Shared global-highscore table, reused by every game's game-over screen and
 * by GameHubScreen's own quick-access entry — the leaderboard collection
 * itself isn't per-game (see leaderboardService.ts), so a single shared
 * modal keeps the presentation consistent instead of each game rolling its
 * own copy.
 */
function LeaderboardModal({ visible, onClose }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<HighScoreEntry[]>([]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setLoading(true);
    setError(null);
    fetchTopScores()
      .then(setScores)
      .catch(fetchError => setError(`Skor tablosu yüklenemedi: ${fetchError.message}`))
      .finally(() => setLoading(false));
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>🏆 Skor Tablosu</Text>
          {loading && <ActivityIndicator color={theme.accent} style={styles.loader} />}
          {error && <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>}
          {!loading && !error && (
            <FlatList
              data={scores}
              keyExtractor={item => item.id}
              style={styles.list}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: theme.textFaint }]}>Henüz skor yok, ilk sen ol!</Text>
              }
              renderItem={({ item, index }) => (
                <View style={[styles.row, { borderBottomColor: theme.border }]}>
                  <Text style={[styles.rank, { color: theme.textFaint }]}>{index + 1}.</Text>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.score, { color: theme.identity }]}>{item.score}</Text>
                </View>
              )}
            />
          )}
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Skor tablosunu kapat">
            <Text style={[styles.closeButtonText, { color: theme.textMuted }]}>Kapat</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '80%',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 22,
    borderWidth: 1,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  loader: {
    marginVertical: 20,
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 16,
  },
  list: {
    maxHeight: 320,
    marginTop: 8,
    marginBottom: 12,
  },
  empty: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  rank: {
    fontSize: 13,
    fontWeight: '700',
    width: 26,
  },
  name: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
  },
  score: {
    fontSize: 14,
    fontWeight: '800',
  },
  closeButton: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 6,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default LeaderboardModal;
