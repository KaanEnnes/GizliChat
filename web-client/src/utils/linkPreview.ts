const SPOTIFY_URL_REGEX = /https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-zA-Z]+)?\/)?(?:track|album|playlist|episode|show|artist)\/[A-Za-z0-9]+(?:\?[^\s]*)?/i;

export interface SpotifyPreview {
  url: string;
  title: string;
  thumbnailUrl?: string;
}

/** First Spotify open.spotify.com link found in a text message, if any (used to decide whether to show a preview banner). */
export function extractSpotifyUrl(text: string): string | undefined {
  return text.match(SPOTIFY_URL_REGEX)?.[0];
}

const previewCache = new Map<string, Promise<SpotifyPreview | null>>();

/**
 * Fetches title/thumbnail for a Spotify link via Spotify's public oEmbed
 * endpoint (no auth required, CORS-enabled). Results are cached per URL for
 * the lifetime of the page so re-rendering a message never re-fetches.
 * Resolves to null on any failure so callers can just hide the banner
 * instead of showing a broken card.
 */
export function fetchSpotifyPreview(url: string): Promise<SpotifyPreview | null> {
  const cached = previewCache.get(url);
  if (cached) {
    return cached;
  }
  const promise = (async () => {
    try {
      const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      if (!data?.title) {
        return null;
      }
      return { url, title: data.title as string, thumbnailUrl: data.thumbnail_url as string | undefined };
    } catch {
      return null;
    }
  })();
  previewCache.set(url, promise);
  return promise;
}
