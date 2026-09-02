import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeContext';
import { searchSongs, type SongSearchResult } from '../services/songService';
import type { SongClip } from '../services/chatService';

interface Props {
  onSend: (clip: SongClip) => void;
  onClose: () => void;
}

const SEARCH_DEBOUNCE_MS = 400;
const CLIP_DURATION_OPTIONS = [10, 15, 20, 30];
const DEFAULT_CLIP_DURATION = 15;

function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * "Şarkı gönder" — search YouTube (via the youtubeSearch Cloud Function) and
 * pick a clip window to send, Instagram-style. Spotify was tried first but
 * its Web API no longer returns a playable preview clip for apps created
 * after Nov 2024 (every search result came back with an empty preview_url —
 * see ObsidianVault/Changelog.md), so this uses YouTube's own embeddable
 * player instead, which supports `start`/`end` params to bound playback to
 * exactly the picked window.
 */
function SongPickerModal({ onSend, onClose }: Props): React.JSX.Element {
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
    if (debounceRef.current) clearTimeout(debounceRef.current);
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
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handlePickTrack = (track: SongSearchResult) => {
    setSelected(track);
    setStartSeconds(0);
    setClipDuration(DEFAULT_CLIP_DURATION);
    setPreviewKey(k => k + 1);
  };

  const handlePreview = () => setPreviewKey(k => k + 1);

  const handleSend = () => {
    if (!selected) return;
    onSend({
      videoId: selected.videoId,
      title: selected.title,
      artist: selected.channelTitle,
      thumbnailUrl: selected.thumbnailUrl,
      startSeconds,
      durationSeconds: clipDuration,
    });
  };

  return (
    <div className="modal-overlay" style={{ background: theme.overlay }} onClick={onClose}>
      <div className="gif-picker-card" style={{ background: theme.surface, borderColor: theme.border }} onClick={e => e.stopPropagation()}>
        <div className="modal-header-row">
          <span className="modal-title-inline" style={{ color: theme.text }}>
            {selected ? '↩ Klip seç' : '🎵 Şarkı gönder'}
          </span>
          <button className="modal-close-btn" style={{ color: theme.textMuted }} onClick={selected ? () => setSelected(null) : onClose}>
            ✕
          </button>
        </div>

        {!selected && (
          <>
            <input
              className="gif-search-input"
              style={{ background: theme.inputBackground, color: theme.text, borderColor: theme.border }}
              placeholder="Şarkı ara… (örn. sanatçı - şarkı adı)"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
            <div className="gif-grid-wrap" style={{ display: 'block' }}>
              {loading && <div style={{ textAlign: 'center', color: theme.textMuted, padding: 24 }}>Aranıyor…</div>}
              {error && <div style={{ color: theme.danger, fontSize: 13, textAlign: 'center', padding: 12 }}>{error}</div>}
              {!loading && !error && !query.trim() && (
                <div style={{ textAlign: 'center', color: theme.textFaint, padding: 24, fontSize: 13 }}>Bir şarkı adı yazmaya başla.</div>
              )}
              {!loading && !error && query.trim() && results.length === 0 && (
                <div style={{ textAlign: 'center', color: theme.textFaint, padding: 24, fontSize: 13 }}>Sonuç bulunamadı.</div>
              )}
              {results.map(track => (
                <div
                  key={track.videoId}
                  onClick={() => handlePickTrack(track)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', cursor: 'pointer' }}>
                  <img src={track.thumbnailUrl} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: theme.text, fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {track.title}
                    </div>
                    <div style={{ color: theme.textMuted, fontSize: 12 }}>{track.channelTitle}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {selected && (
          <div style={{ padding: '4px 2px' }}>
            <div style={{ color: theme.text, fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>{selected.title}</div>
            <iframe
              key={previewKey}
              title="Önizleme"
              width="100%"
              height="180"
              style={{ borderRadius: 8, border: 'none' }}
              src={`https://www.youtube.com/embed/${selected.videoId}?start=${startSeconds}&end=${startSeconds + clipDuration}&autoplay=1`}
              allow="autoplay"
            />
            <div style={{ marginTop: 12 }}>
              <label style={{ color: theme.textMuted, fontSize: 12.5 }}>
                Başlangıç: {formatSeconds(startSeconds)}
              </label>
              <input
                type="range"
                min={0}
                max={600}
                step={1}
                value={startSeconds}
                onChange={e => setStartSeconds(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ color: theme.textMuted, fontSize: 12.5 }}>Klip uzunluğu:</label>
              {CLIP_DURATION_OPTIONS.map(d => (
                <button
                  key={d}
                  onClick={() => setClipDuration(d)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 14,
                    border: `1px solid ${theme.border}`,
                    background: clipDuration === d ? theme.accent : 'transparent',
                    color: clipDuration === d ? theme.accentText : theme.text,
                    fontSize: 12.5,
                    cursor: 'pointer',
                  }}>
                  {d}sn
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button
                onClick={handlePreview}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.text, cursor: 'pointer' }}>
                🔁 Yeniden dinle
              </button>
              <button
                onClick={handleSend}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: theme.accent, color: theme.accentText, fontWeight: 700, cursor: 'pointer' }}>
                Gönder
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SongPickerModal;
