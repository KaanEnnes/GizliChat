import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { playTapSound } from '../services/soundService';
import SettingsModal from '../components/SettingsModal';
import LeaderboardModal from '../components/LeaderboardModal';
import HomeScreen from './HomeScreen';
import Game2048 from './Game2048';
import SnakeGame from './SnakeGame';
import ColorMemoryGame from './ColorMemoryGame';
import WhackAMoleGame from './WhackAMoleGame';
import TicTacToeGame from './TicTacToeGame';
import ChessRoomScreen from './ChessRoomScreen';

interface Props {
  onAdminTriggerReached: () => void;
}

type GameKey = 'blockBlast' | '2048' | 'snake' | 'colorMemory' | 'whackAMole' | 'ticTacToe' | 'chess';

interface GameCardMeta {
  key: GameKey;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  /** Matches each game screen's own `BEST_STORAGE_KEY` constant. */
  bestScoreKey: string;
}

const GAMES: GameCardMeta[] = [
  {
    key: 'blockBlast',
    title: 'Blok Çılgınlığı',
    subtitle: 'Blokları yerleştir, sıraları temizle',
    icon: '🧩',
    color: '#4D96FF',
    bestScoreKey: 'gizlichat_blockblast_best',
  },
  {
    key: '2048',
    title: '2048',
    subtitle: 'Kayarak birleştir, 2048\'e ulaş',
    icon: '🔢',
    color: '#EDC22E',
    bestScoreKey: 'gizlichat_2048_best',
  },
  {
    key: 'snake',
    title: 'Yılan',
    subtitle: 'Ye, büyü, kendine çarpma',
    icon: '🐍',
    color: '#6BCB77',
    bestScoreKey: 'gizlichat_snake_best',
  },
  {
    key: 'colorMemory',
    title: 'Renk Hafızası',
    subtitle: 'Diziyi izle, aynısını tekrarla',
    icon: '🎵',
    color: '#9D6BFF',
    bestScoreKey: 'gizlichat_colormemory_best',
  },
  {
    key: 'whackAMole',
    title: 'Köstebek Vurma',
    subtitle: 'Hızlı ol, kaçırdığın puan kaybı',
    icon: '🔨',
    color: '#FF6B6B',
    bestScoreKey: 'gizlichat_whackamole_best',
  },
  {
    key: 'ticTacToe',
    title: 'XOX',
    subtitle: 'Bilgisayara karşı 3\'ü yan yana getir',
    icon: '❌',
    color: '#2E8B8B',
    bestScoreKey: 'gizlichat_tictactoe_best',
  },
  {
    key: 'chess',
    title: 'Satranç',
    subtitle: 'Oda kur veya kodla katıl, arkadaşınla online oyna',
    icon: '♟️',
    color: '#6B4F3A',
    bestScoreKey: 'gizlichat_chess_unused',
  },
];

// XOX and Satranç aren't part of the shared online leaderboard — XOX tracks
// a local win streak and Satranç has no single-player numeric score at all,
// neither fits the same "highest number wins" ranking as the arcade games.
const SCORE_LEADERBOARD_GAMES = GAMES.filter(game => game.key !== 'ticTacToe' && game.key !== 'chess');

const REQUIRED_TAPS = 10;
const TAP_RESET_MS = 3500;
// A lone tap on the gear waits this long before opening Settings — long
// enough that it never fires mid-way through the 10-tap secret combo (every
// following tap cancels and reschedules it), short enough to still feel
// responsive for a genuine single tap.
const SETTINGS_OPEN_DELAY_MS = 550;

/**
 * The disguise's front door: a small "mini-games" hub with a grid of
 * unrelated casual games. The gear icon here hosts the same hidden 10-tap
 * secret gesture that used to live directly on Block Çılgınlığı's menu
 * screen (see [[Changelog]]) — moving it here means it works no matter which
 * game was played last, since every game now returns to this hub via
 * `onBack` instead of owning the trigger itself.
 */
function GameHubScreen({ onAdminTriggerReached }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [activeGame, setActiveGame] = useState<GameKey | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [leaderboardVisible, setLeaderboardVisible] = useState(false);
  const [leaderboardGame, setLeaderboardGame] = useState<GameCardMeta>(GAMES[0]);
  const [bestScores, setBestScores] = useState<Partial<Record<GameKey, number>>>({});

  const loadBestScores = useCallback(() => {
    AsyncStorage.getMany(GAMES.map(game => game.bestScoreKey)).then(entries => {
      const next: Partial<Record<GameKey, number>> = {};
      GAMES.forEach(game => {
        const value = entries[game.bestScoreKey];
        const parsed = value ? parseInt(value, 10) : 0;
        if (parsed > 0) {
          next[game.key] = parsed;
        }
      });
      setBestScores(next);
    });
  }, []);

  // Loaded on mount, then refreshed every time the user returns to the hub
  // (closeGame) — a just-finished game may have set a new best score.
  useEffect(() => {
    if (activeGame === null) {
      loadBestScores();
    }
  }, [activeGame, loadBestScores]);

  const [, setTapCount] = useState(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResetTimer = useCallback(() => {
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  }, []);

  const clearSettingsTimer = useCallback(() => {
    if (settingsTimer.current) {
      clearTimeout(settingsTimer.current);
      settingsTimer.current = null;
    }
  }, []);

  const handleIconPress = useCallback(() => {
    clearResetTimer();
    clearSettingsTimer();

    setTapCount(prev => {
      const next = prev + 1;

      if (next >= REQUIRED_TAPS) {
        setTimeout(() => onAdminTriggerReached(), 0);
        return 0;
      }

      resetTimer.current = setTimeout(() => {
        setTapCount(0);
        resetTimer.current = null;
      }, TAP_RESET_MS);

      if (next === 1) {
        settingsTimer.current = setTimeout(() => {
          setSettingsVisible(true);
          setTapCount(0);
          settingsTimer.current = null;
        }, SETTINGS_OPEN_DELAY_MS);
      }

      return next;
    });
  }, [clearResetTimer, clearSettingsTimer, onAdminTriggerReached]);

  useEffect(() => {
    return () => {
      clearResetTimer();
      clearSettingsTimer();
    };
  }, [clearResetTimer, clearSettingsTimer]);

  // --- Entrance animation: cards spring in one after another -------------
  const cardAnims = useRef(GAMES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (activeGame !== null) {
      return;
    }
    cardAnims.forEach(anim => anim.setValue(0));
    Animated.stagger(
      70,
      cardAnims.map(anim =>
        Animated.spring(anim, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      ),
    ).start();
  }, [activeGame, cardAnims]);

  const openGame = useCallback((key: GameKey) => {
    playTapSound();
    setActiveGame(key);
  }, []);

  const closeGame = useCallback(() => setActiveGame(null), []);

  if (activeGame !== null) {
    // Full-screen while actually playing — the status bar (clock/battery/
    // wifi icons) hides so the game gets the whole screen; it reappears on
    // its own once this StatusBar instance unmounts (closeGame → back to the
    // hub below, which doesn't render one).
    let gameElement: React.ReactNode;
    if (activeGame === 'blockBlast') {
      gameElement = <HomeScreen onBack={closeGame} />;
    } else if (activeGame === '2048') {
      gameElement = <Game2048 onBack={closeGame} />;
    } else if (activeGame === 'snake') {
      gameElement = <SnakeGame onBack={closeGame} />;
    } else if (activeGame === 'colorMemory') {
      gameElement = <ColorMemoryGame onBack={closeGame} />;
    } else if (activeGame === 'whackAMole') {
      gameElement = <WhackAMoleGame onBack={closeGame} />;
    } else if (activeGame === 'ticTacToe') {
      gameElement = <TicTacToeGame onBack={closeGame} />;
    } else {
      gameElement = <ChessRoomScreen onBack={closeGame} />;
    }
    return (
      <>
        <StatusBar hidden />
        {gameElement}
      </>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          // Extra bottom padding clears the absolutely-positioned settings
          // gear (bottom-right) so the last game card never sits behind it.
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 84 },
        ]}
        showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.text }]}>🎮 Mini Oyunlar</Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>Bir oyun seç ve başla!</Text>

        <Pressable
          onPress={() => {
            const gameButtons = SCORE_LEADERBOARD_GAMES.map(game => ({
              text: game.title,
              onPress: () => {
                setLeaderboardGame(game);
                setLeaderboardVisible(true);
              },
            }));
            Alert.alert('Skor Tablosu', 'Hangi oyunun tablosunu görmek istersin?', [
              ...gameButtons,
              { text: 'Vazgeç', style: 'cancel' },
            ]);
          }}
          style={({ pressed }) => [
            styles.leaderboardButton,
            { backgroundColor: theme.surface, borderColor: theme.border },
            pressed && styles.cardPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Skor tablosunu aç">
          <Text style={[styles.leaderboardButtonText, { color: theme.text }]}>🏆 Skor Tablosu</Text>
        </Pressable>

        <View style={styles.grid}>
          {GAMES.map((game, index) => {
            const anim = cardAnims[index];
            return (
              <Animated.View
                key={game.key}
                style={[
                  styles.cardWrap,
                  {
                    opacity: anim,
                    transform: [
                      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
                      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
                    ],
                  },
                ]}>
                <Pressable
                  onPress={() => openGame(game.key)}
                  style={({ pressed }) => [
                    styles.card,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                    pressed && styles.cardPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${game.title} oyna`}>
                  <View style={styles.cardTopRow}>
                    <View style={[styles.iconBadge, { backgroundColor: `${game.color}26` }]}>
                      <Text style={styles.iconText}>{game.icon}</Text>
                    </View>
                    {!!bestScores[game.key] && (
                      <View style={[styles.bestBadge, { backgroundColor: theme.surfaceAlt }]}>
                        <Text style={[styles.bestBadgeText, { color: theme.textMuted }]}>
                          🏅 {bestScores[game.key]}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>{game.title}</Text>
                  <Text style={[styles.cardSubtitle, { color: theme.textFaint }]} numberOfLines={2}>
                    {game.subtitle}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>

      <Pressable
        onPress={handleIconPress}
        accessibilityRole="button"
        accessibilityLabel="Ayarlar"
        style={[
          styles.settingsIcon,
          { backgroundColor: theme.surface, borderColor: theme.border },
          { bottom: insets.bottom + 20, right: insets.right + 20 },
        ]}
        hitSlop={10}>
        <Text style={[styles.settingsIconText, { color: theme.textMuted }]}>⚙</Text>
      </Pressable>

      <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
      <LeaderboardModal
        visible={leaderboardVisible}
        onClose={() => setLeaderboardVisible(false)}
        gameKey={leaderboardGame.key}
        gameLabel={leaderboardGame.title}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 18,
  },
  leaderboardButton: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 22,
  },
  leaderboardButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  grid: {
    width: '100%',
    maxWidth: 420,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  cardWrap: {
    width: '48%',
    marginBottom: 14,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 14,
    alignItems: 'flex-start',
    minHeight: 148,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  cardPressed: {
    opacity: 0.82,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 12,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bestBadge: {
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  bestBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  iconText: {
    fontSize: 22,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  settingsIcon: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  settingsIconText: {
    fontSize: 18,
  },
});

export default GameHubScreen;
