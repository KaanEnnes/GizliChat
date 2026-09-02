import { httpsCallable } from 'firebase/functions';
import { getFunctionsInstance } from './firebase';

export interface SongSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
}

/** Searches YouTube (via the youtubeSearch Cloud Function, see functions/index.js) for the "şarkı gönder" song picker. Empty query short-circuits to no results without a network round-trip. */
export async function searchSongs(query: string): Promise<SongSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const searchCallable = httpsCallable<{ query: string }, { tracks: SongSearchResult[] }>(getFunctionsInstance(), 'youtubeSearch');
  const result = await searchCallable({ query: trimmed });
  return result.data.tracks;
}
