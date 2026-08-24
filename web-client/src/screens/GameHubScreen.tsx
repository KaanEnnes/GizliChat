import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeContext';
import BlockBlastGame from './BlockBlastGame';
import Game2048 from './Game2048';
import SnakeGame from './SnakeGame';
import ColorMemoryGame from './ColorMemoryGame';
import WhackAMoleGame from './WhackAMoleGame';
import TicTacToeGame from './TicTacToeGame';
import ChessRoomScreen from './ChessRoomScreen';
import LeaderboardModal from '../components/LeaderboardModal';

interface Props {
  onSecretTriggerReached: () => void;
}

type GameKey = 'blockBlast' | '2048' | 'snake' | 'colorMemory' | 'whackAMole' | 'ticTacToe' | 'chess';

interface GameCardMeta {
  key: GameKey;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  bestScoreKey: string;
  /** Chess has no single numeric high score (win/loss + room-code play) — hidden from the shared leaderboard picker. */
  hasLeaderboard?: boolean;
}

const GAMES: GameCardMeta[] = [
  { key: 'blockBlast', title: 'Blok Çılgınlığı', subtitle: 'Blokları yerleştir, sıraları temizle', icon: '🧩', color: '#4D96FF', bestScoreKey: 'gizlichat_blockblast_best', hasLeaderboard: true },
  { key: '2048', title: '2048', subtitle: "Kayarak birleştir, 2048'e ulaş", icon: '🔢', color: '#EDC22E', bestScoreKey: 'gizlichat_2048_best', hasLeaderboard: true },
  { key: 'snake', title: 'Yılan', subtitle: 'Ye, büyü, kendine çarpma', icon: '🐍', color: '#6BCB77', bestScoreKey: 'gizlichat_snake_best', hasLeaderboard: true },
  { key: 'colorMemory', title: 'Renk Hafızası', subtitle: 'Diziyi izle, aynısını tekrarla', icon: '🎵', color: '#9D6BFF', bestScoreKey: 'gizlichat_colormemory_best', hasLeaderboard: true },
  { key: 'whackAMole', title: 'Köstebek Vurma', subtitle: 'Hızlı ol, kaçırdığın puan kaybı', icon: '🔨', color: '#FF6B6B', bestScoreKey: 'gizlichat_whackamole_best', hasLeaderboard: true },
  { key: 'ticTacToe', title: 'XOX', subtitle: "Bilgisayara karşı 3'ü yan yana getir", icon: '❌', color: '#2E8B8B', bestScoreKey: 'gizlichat_tictactoe_best', hasLeaderboard: true },
  { key: 'chess', title: 'Satranç', subtitle: 'Oda kur veya kodla katıl, arkadaşınla online oyna', icon: '♟️', color: '#6B4F3A', bestScoreKey: 'gizlichat_chess_unused', hasLeaderboard: false },
];

const REQUIRED_TAPS = 10;
const TAP_RESET_MS = 3500;

/**
 * The disguise's front door: a harmless "mini games" hub. The gear icon
 * hosts a hidden 10-tap gesture (within TAP_RESET_MS of each other) that
 * reveals the real chat login — mirrors the mobile app's GameHubScreen.
 */
function GameHubScreen({ onSecretTriggerReached }: Props): React.JSX.Element {
  const { theme, mode, toggleTheme } = useTheme();
  const [activeGame, setActiveGame] = useState<GameKey | null>(null);
  const [leaderboardGame, setLeaderboardGame] = useState<GameCardMeta | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [bestScores, setBestScores] = useState<Partial<Record<GameKey, number>>>({});

  const tapCountRef = useRef(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadBestScores = useCallback(() => {
    const next: Partial<Record<GameKey, number>> = {};
    GAMES.forEach(game => {
      const parsed = parseInt(localStorage.getItem(game.bestScoreKey) || '0', 10);
      if (parsed > 0) next[game.key] = parsed;
    });
    setBestScores(next);
  }, []);

  useEffect(() => {
    if (activeGame === null) loadBestScores();
  }, [activeGame, loadBestScores]);

  const handleGearClick = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    tapCountRef.current += 1;
    if (tapCountRef.current >= REQUIRED_TAPS) {
      tapCountRef.current = 0;
      onSecretTriggerReached();
      return;
    }
    resetTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, TAP_RESET_MS);
  }, [onSecretTriggerReached]);

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  if (activeGame !== null) {
    const closeGame = () => setActiveGame(null);
    switch (activeGame) {
      case 'blockBlast': return <BlockBlastGame onBack={closeGame} />;
      case '2048': return <Game2048 onBack={closeGame} />;
      case 'snake': return <SnakeGame onBack={closeGame} />;
      case 'colorMemory': return <ColorMemoryGame onBack={closeGame} />;
      case 'whackAMole': return <WhackAMoleGame onBack={closeGame} />;
      case 'ticTacToe': return <TicTacToeGame onBack={closeGame} />;
      case 'chess': return <ChessRoomScreen onBack={closeGame} />;
    }
  }

  return (
    <div className="hub-screen" style={{ background: theme.background }}>
      <div className="hub-title" style={{ color: theme.text }}>🎮 Mini Oyunlar</div>
      <div className="hub-subtitle" style={{ color: theme.textMuted }}>Bir oyun seç ve başla!</div>

      <div className="hub-leaderboard-btn" style={{ background: theme.surface, borderColor: theme.border, color: theme.text }} onClick={() => setPickerOpen(true)}>
        🏆 Skor Tablosu
      </div>

      <div className="hub-grid">
        {GAMES.map(game => (
          <div key={game.key} className="hub-card" style={{ background: theme.surface, borderColor: theme.border }} onClick={() => setActiveGame(game.key)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="hub-card-icon-badge" style={{ background: `${game.color}26` }}>{game.icon}</div>
              {!!bestScores[game.key] && (
                <div style={{ background: theme.surfaceAlt, borderRadius: 10, padding: '4px 7px', fontSize: 10.5, fontWeight: 700, color: theme.textMuted }}>
                  🏅 {bestScores[game.key]}
                </div>
              )}
            </div>
            <div className="hub-card-title" style={{ color: theme.text }}>{game.title}</div>
            <div className="hub-card-subtitle" style={{ color: theme.textFaint }}>{game.subtitle}</div>
          </div>
        ))}
      </div>

      <div className="hub-settings-icon" style={{ background: theme.surface, borderColor: theme.border, color: theme.textMuted }} onClick={handleGearClick} title="Ayarlar">
        ⚙
      </div>
      <div
        className="hub-settings-icon"
        style={{ background: theme.surface, borderColor: theme.border, color: theme.textMuted, right: 76 }}
        onClick={toggleTheme}
        title="Tema">
        {mode === 'dark' ? '☀️' : '🌙'}
      </div>

      {pickerOpen && !leaderboardGame && (
        <div className="modal-overlay" style={{ background: theme.overlay }} onClick={() => setPickerOpen(false)}>
          <div className="modal-card" style={{ background: theme.surface, borderColor: theme.border }} onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ color: theme.text }}>Skor Tablosu</div>
            {GAMES.filter(game => game.hasLeaderboard).map(game => (
              <button
                key={game.key}
                className="picker-btn"
                style={{ background: theme.surfaceAlt, color: theme.text, borderColor: theme.border }}
                onClick={() => {
                  setLeaderboardGame(game);
                  setPickerOpen(false);
                }}>
                {game.icon} {game.title}
              </button>
            ))}
            <div style={{ marginTop: 6, textAlign: 'center', fontSize: 13, color: theme.textMuted, cursor: 'pointer' }} onClick={() => setPickerOpen(false)}>
              Vazgeç
            </div>
          </div>
        </div>
      )}

      {leaderboardGame && (
        <LeaderboardModal gameKey={leaderboardGame.key} gameLabel={leaderboardGame.title} onClose={() => setLeaderboardGame(null)} />
      )}
    </div>
  );
}

export default GameHubScreen;
