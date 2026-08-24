import React, { useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeContext';
import { fetchTopScores, type HighScoreEntry } from '../services/leaderboardService';

interface Props {
  onClose: () => void;
  gameKey: string;
  gameLabel: string;
}

/** Shared highscore table — scoped to a single game's key so scores across different mini games are never mixed. */
function LeaderboardModal({ onClose, gameKey, gameLabel }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<HighScoreEntry[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchTopScores(gameKey)
      .then(setScores)
      .catch(err => setError(`Skor tablosu yüklenemedi: ${(err as Error).message}`))
      .finally(() => setLoading(false));
  }, [gameKey]);

  return (
    <div className="modal-overlay" style={{ background: theme.overlay }} onClick={onClose}>
      <div className="modal-card" style={{ background: theme.surface, borderColor: theme.border, maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ color: theme.text }}>🏆 {gameLabel}</div>
        {loading && <div style={{ textAlign: 'center', color: theme.textMuted, padding: 20 }}>Yükleniyor…</div>}
        {error && <div style={{ color: theme.danger, fontSize: 13, textAlign: 'center' }}>{error}</div>}
        {!loading && !error && (
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {scores.length === 0 && <div style={{ textAlign: 'center', color: theme.textFaint, padding: 20, fontSize: 13 }}>Henüz skor yok, ilk sen ol!</div>}
            {scores.map((item, index) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: `1px solid ${theme.border}` }}>
                <span style={{ color: theme.textFaint, width: 22, fontSize: 13 }}>{index + 1}.</span>
                <span style={{ color: theme.text, flex: 1, fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                <span style={{ color: theme.identity, fontWeight: 800, fontSize: 14 }}>{item.score}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 14, textAlign: 'center', fontSize: 13, color: theme.textMuted, cursor: 'pointer' }} onClick={onClose}>
          Kapat
        </div>
      </div>
    </div>
  );
}

export default LeaderboardModal;
