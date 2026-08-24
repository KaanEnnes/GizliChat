import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeContext';
import { fetchTrendingGifs, searchGifs, type GifResult } from '../services/gifService';

interface Props {
  onSelect: (gif: GifResult) => void;
  onClose: () => void;
}

const SEARCH_DEBOUNCE_MS = 400;

function GifPickerModal({ onSelect, onClose }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchTrendingGifs()
      .then(setGifs)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
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
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="modal-overlay" style={{ background: theme.overlay }} onClick={onClose}>
      <div className="gif-picker-card" style={{ background: theme.surface, borderColor: theme.border }} onClick={e => e.stopPropagation()}>
        <div className="modal-header-row">
          <span className="modal-title-inline" style={{ color: theme.text }}>GIF gönder</span>
          <button className="modal-close-btn" style={{ color: theme.textMuted }} onClick={onClose}>✕</button>
        </div>
        <input
          className="gif-search-input"
          style={{ background: theme.inputBackground, color: theme.text, borderColor: theme.border }}
          placeholder="GIF ara… (örn. gülme, kalp, merhaba)"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        <div className="gif-grid-wrap">
          {loading && <div style={{ textAlign: 'center', color: theme.textMuted, padding: 24 }}>Yükleniyor…</div>}
          {error && <div style={{ color: theme.danger, fontSize: 13, textAlign: 'center', padding: 12 }}>{error}</div>}
          {!loading && !error && gifs.length === 0 && (
            <div style={{ textAlign: 'center', color: theme.textFaint, padding: 24, fontSize: 13 }}>Sonuç bulunamadı.</div>
          )}
          {!loading && !error && (
            <div className="gif-grid">
              {gifs.map(gif => (
                <img
                  key={gif.id}
                  src={gif.previewUrl}
                  alt={gif.title}
                  className="gif-thumb"
                  onClick={() => onSelect(gif)}
                />
              ))}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'center', fontSize: 10.5, color: theme.textFaint, marginTop: 8 }}>Powered by GIPHY</div>
      </div>
    </div>
  );
}

export default GifPickerModal;
