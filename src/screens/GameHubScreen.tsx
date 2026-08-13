import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { playTapSound } from '../services/soundService';
import SettingsModal from '../components/SettingsModal';
import HomeScreen from './HomeScreen';
import Game2048 from './Game2048';
import SnakeGame from './SnakeGame';
import ColorMemoryGame from './ColorMemoryGame';
import WhackAMoleGame from './WhackAMoleGame';

interface Props {
  onAdminTriggerReached: () => void;
}

type GameKey = 'blockBlast' | '2048' | 'snake' | 'colorMemory' | 'whackAMole';

interface GameCardMeta {
  key: GameKey;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
}

const GAMES: GameCardMeta[] = [
  {
    key: 'blockBlast',
    title: 'Blok Çılgınlığı',
    subtitle: 'Blokları yerleştir, sıraları temizle',
    icon: '🧩',
    color: '#4D96FF',
  },
  {
    key: '2048',
    title: '2048',
    subtitle: 'Kayarak birleştir, 2048\'e ulaş',
    icon: '🔢',
    color: '#EDC22E',
  },
  {
    key: 'snake',
    title: 'Yılan',
    subtitle: 'Ye, büyü, kendine çarpma',
    icon: '🐍',
    color: '#6BCB77',
  },
  {
    key: 'colorMemory',
    title: 'Renk Hafızası',
    subtitle: 'Diziyi izle, aynısını tekrarla',
    icon: '🎵',
    color: '#9D6BFF',
  },
  {
    key: 'whackAMole',
    title: 'Köstebek Vurma',
    subtitle: 'Hızlı ol, kaçırdığın puan kaybı',
    icon: '🔨',
    color: '#FF6B6B',
  },
];

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
    } else {
      gameElement = <WhackAMoleGame onBack={closeGame} />;
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
      <View style={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
        <Text style={[styles.title, { color: theme.text }]}>🎮 Mini Oyunlar</Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>Bir oyun seç ve başla!</Text>

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
                  <View style={[styles.iconBadge, { backgroundColor: `${game.color}26` }]}>
                    <Text style={styles.iconText}>{game.icon}</Text>
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
      </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
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
    marginBottom: 22,
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
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
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
