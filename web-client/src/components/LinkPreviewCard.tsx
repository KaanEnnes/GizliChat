import React, { useEffect, useState } from 'react';
import { fetchLinkPreview, type LinkPreview } from '../utils/linkPreview';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  url: string;
}

/**
 * Preview card shown under a chat message containing a link. Spotify links
 * keep their compact branded row; every other link renders a generic Open
 * Graph card with the og:image as a wide banner above the title/description.
 * Renders nothing while loading or when the lookup fails, so a link with no
 * metadata just stays a plain link.
 */
function LinkPreviewCard({ url }: Props): React.JSX.Element | null {
  const { theme } = useTheme();
  const [preview, setPreview] = useState<LinkPreview | null | undefined>(undefined);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPreview(undefined);
    setImageFailed(false);
    fetchLinkPreview(url).then(result => {
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

  const showImage = !!preview.imageUrl && !imageFailed;

  if (preview.isSpotify) {
    return (
      <a
        className="msg-link-preview"
        href={preview.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ background: theme.surface, borderColor: theme.border }}
        onClick={e => e.stopPropagation()}>
        {showImage && (
          <img src={preview.imageUrl} className="msg-link-preview-thumb" alt="" onError={() => setImageFailed(true)} />
        )}
        <div className="msg-link-preview-text">
          <div className="msg-link-preview-badge">♫ Spotify</div>
          <div className="msg-link-preview-title" style={{ color: theme.text }}>
            {preview.title}
          </div>
        </div>
      </a>
    );
  }

  return (
    <a
      className="msg-link-preview msg-link-preview-og"
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ background: theme.surface, borderColor: theme.border }}
      onClick={e => e.stopPropagation()}>
      {showImage && (
        <img src={preview.imageUrl} className="msg-link-preview-image" alt="" onError={() => setImageFailed(true)} />
      )}
      <div className="msg-link-preview-og-text">
        {!!preview.siteName && (
          <div className="msg-link-preview-site" style={{ color: theme.textFaint }}>
            {preview.siteName}
          </div>
        )}
        {!!preview.title && (
          <div className="msg-link-preview-title" style={{ color: theme.text }}>
            {preview.title}
          </div>
        )}
        {!!preview.description && (
          <div className="msg-link-preview-desc" style={{ color: theme.textMuted }}>
            {preview.description}
          </div>
        )}
      </div>
    </a>
  );
}

export default LinkPreviewCard;
