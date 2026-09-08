import React, { useState } from 'react';
import { useTheme } from '../theme/ThemeContext';
import { LIVE_LOCATION_DURATIONS_MS } from '../services/locationService';

interface Props {
  onClose: () => void;
  onShareCurrent: () => void;
  onShareLive: (durationMs: number) => void;
}

/**
 * Web counterpart of the RN app's LocationShareModal — same two steps: pick
 * "mevcut konum" vs "canlı konum", then (live only) pick a duration from the
 * shared LIVE_LOCATION_DURATIONS_MS presets.
 */
function LocationShareModal({ onClose, onShareCurrent, onShareLive }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [pickingDuration, setPickingDuration] = useState(false);

  return (
    <div className="attach-overlay" style={{ background: theme.overlay }} onClick={onClose}>
      <div
        className="attach-card"
        style={{ background: theme.surface, borderColor: theme.border }}
        onClick={e => e.stopPropagation()}>
        {!pickingDuration ? (
          <>
            <div className="attach-title" style={{ color: theme.text }}>
              Konum Gönder
            </div>
            <button
              type="button"
              className="attach-row"
              style={{ color: theme.text }}
              onClick={() => {
                onClose();
                onShareCurrent();
              }}>
              📍&nbsp;&nbsp;Mevcut Konumu Gönder
            </button>
            <button type="button" className="attach-row" style={{ color: theme.text }} onClick={() => setPickingDuration(true)}>
              🔴&nbsp;&nbsp;Canlı Konum Paylaş
            </button>
            <button type="button" className="attach-row attach-cancel" style={{ color: theme.textMuted }} onClick={onClose}>
              Vazgeç
            </button>
          </>
        ) : (
          <>
            <div className="attach-title" style={{ color: theme.text }}>
              Ne kadar süreyle?
            </div>
            {LIVE_LOCATION_DURATIONS_MS.map(option => (
              <button
                key={option.label}
                type="button"
                className="attach-row"
                style={{ color: theme.text }}
                onClick={() => {
                  onClose();
                  onShareLive(option.ms);
                }}>
                {option.label}
              </button>
            ))}
            <button type="button" className="attach-row attach-cancel" style={{ color: theme.textMuted }} onClick={onClose}>
              Vazgeç
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default LocationShareModal;
