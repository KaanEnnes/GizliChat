import { httpsCallable } from 'firebase/functions';
import { getFunctionsInstance } from '../services/firebase';

const SPOTIFY_URL_REGEX = /https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-zA-Z]+)?\/)?(?:track|album|playlist|episode|show|artist)\/[A-Za-z0-9]+(?:\?[^\s]*)?/i;
const ANY_URL_REGEX = /https?:\/\/[^\s<>"']+/i;

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  /** og:image (or twitter:image) — already absolute, resolved server-side against the post-redirect URL. */
  imageUrl?: string;
  siteName?: string;
  /** Renders the Spotify-green branding instead of a generic site chip. */
  isSpotify?: boolean;
}

/** @deprecated Kept for the Spotify fast path; new call sites should use extractPreviewUrl. */
export function extractSpotifyUrl(text: string): string | undefined {
  return text.match(SPOTIFY_URL_REGEX)?.[0];
}

/** First http(s) link in a text message, if any — decides whether a preview card is attempted at all. */
export function extractPreviewUrl(text: string): string | undefined {
  return text.match(ANY_URL_REGEX)?.[0];
}

const previewCache = new Map<string, Promise<LinkPreview | null>>();

async function fetchSpotify(url: string): Promise<LinkPreview | null> {
  // Spotify's public oEmbed needs no auth and IS CORS-enabled, so unlike a
  // generic site it can still be fetched straight from the browser.
  const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
  if (!response.ok) {
    return null;
  }
  const data = await response.json();
  if (!data?.title) {
    return null;
  }
  return {
    url,
    title: data.title as string,
    imageUrl: data.thumbnail_url as string | undefined,
    siteName: 'Spotify',
    isSpotify: true,
  };
}

async function fetchOpenGraph(url: string): Promise<LinkPreview | null> {
  // Must go through the linkPreview Cloud Function: a browser simply cannot
  // read another origin's HTML, so there is no client-side alternative here
  // (see functions/index.js).
  const callable = httpsCallable<{ url: string }, { preview: LinkPreview | null }>(
    getFunctionsInstance(),
    'linkPreview',
  );
  const result = await callable({ url });
  return result.data?.preview ?? null;
}

/**
 * Resolves title/description/og:image for a link in a chat message. Cached
 * per URL for the page's lifetime so re-rendering a message never re-fetches.
 * Resolves to null on any failure so callers just hide the card.
 */
export function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  const cached = previewCache.get(url);
  if (cached) {
    return cached;
  }
  const promise = (async () => {
    try {
      return SPOTIFY_URL_REGEX.test(url) ? await fetchSpotify(url) : await fetchOpenGraph(url);
    } catch {
      return null;
    }
  })();
  previewCache.set(url, promise);
  return promise;
}
