import React, { useEffect, useState } from 'react';
import { fetchSpotifyPreview, type SpotifyPreview } from '../utils/linkPreview';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  url: string;
}

/** Banner card shown under a chat message that contains a Spotify link — cover art, track title and an "open in Spotify" affordance. Renders nothing while loading or if the oEmbed lookup fails. */
function LinkPreviewCard({ url }: Props): React.JSX.Element | null {
  const { theme } = useTheme();
  const [preview, setPreview] = useState<SpotifyPreview | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setPreview(undefined);
    fetchSpotifyPreview(url).then(result => {
      if (!cancelled) {
        setPreview(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!preview) {
    return null;
  }

  return (
    <a
      className="msg-link-preview"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ background: theme.surface, borderColor: theme.border }}
      onClick={e => e.stopPropagation()}>
      {preview.thumbnailUrl && <img src={preview.thumbnailUrl} className="msg-link-preview-thumb" alt="" />}
      <div className="msg-link-preview-text">
        <div className="msg-link-preview-badge">♫ Spotify</div>
        <div className="msg-link-preview-title" style={{ color: theme.text }}>
          {preview.title}
        </div>
      </div>
    </a>
  );
}

export default LinkPreviewCard;
