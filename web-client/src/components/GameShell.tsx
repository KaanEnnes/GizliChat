import React from 'react';
import { useTheme } from '../theme/ThemeContext';

interface StatItem {
  label: string;
  value: string | number;
}

interface Props {
  title: string;
  onBack: () => void;
  stats: StatItem[];
  headerRight?: React.ReactNode;
  hint?: string;
  onRestart?: () => void;
  children: React.ReactNode;
}

/** Shared chrome (header + stat cards + hint) reused by every single-player mini game, mirroring the common layout pattern across the mobile app's game screens. */
function GameShell({ title, onBack, stats, headerRight, hint, onRestart, children }: Props): React.JSX.Element {
  const { theme } = useTheme();
  return (
    <div className="game-screen" style={{ background: theme.background }}>
      <div className="game-header">
        <span className="game-menu-link" style={{ color: theme.textMuted }} onClick={onBack}>‹ Menü</span>
        <span className="game-title" style={{ color: theme.text }}>{title}</span>
        <div className="game-header-right">{headerRight}</div>
      </div>

      <div className="game-stats-row">
        {stats.map(stat => (
          <div key={stat.label} className="game-stat-card" style={{ background: theme.surface, borderColor: theme.border }}>
            <div className="game-stat-label" style={{ color: theme.textFaint }}>{stat.label}</div>
            <div className="game-stat-value" style={{ color: theme.text }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {children}

      {hint && <div className="game-hint" style={{ color: theme.textFaint }}>{hint}</div>}
      {onRestart && (
        <button className="game-secondary-btn" style={{ color: theme.textMuted }} onClick={onRestart}>
          Yeni Oyun
        </button>
      )}
    </div>
  );
}

export default GameShell;
