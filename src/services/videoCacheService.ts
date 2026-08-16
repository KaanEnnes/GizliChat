import RNFS from 'react-native-fs';

// Videos are the one media type still served from a remote Firebase Storage
// URL (see mediaService.ts) instead of an inline data: URI, so every replay
// of the same message would otherwise re-download the whole file from
// scratch. This keeps a local copy on first play/preview and reuses it after
// that — one request per video per device, ever, instead of one per view.
const CACHE_DIR = `${RNFS.CachesDirectoryPath}/video-cache`;

let dirReadyPromise: Promise<void> | null = null;
function ensureCacheDir(): Promise<void> {
  if (!dirReadyPromise) {
    dirReadyPromise = RNFS.mkdir(CACHE_DIR).catch(() => undefined);
  }
  return dirReadyPromise;
}

function cacheFileName(remoteUrl: string): string {
  // Cheap, dependency-free stable hash of the URL — good enough for a
  // filename, doesn't need to be cryptographically strong.
  let hash = 0;
  for (let i = 0; i < remoteUrl.length; i++) {
    hash = (hash * 31 + remoteUrl.charCodeAt(i)) | 0;
  }
  return `${Math.abs(hash)}.mp4`;
}

// In-flight downloads keyed by remote URL, so that MessageBubble mounting
// the same video twice in quick succession (e.g. thumbnail + viewer modal)
// only triggers a single network download instead of two racing ones.
const pendingDownloads = new Map<string, Promise<string>>();

/**
 * Resolves a video message's remote URL to a local `file://` path, downloading
 * and caching it on first use. Returns the original remote URL unchanged for
 * any non-http(s) source (e.g. it's already a local/data URI) since there's
 * nothing to cache there.
 */
export async function getCachedVideoUri(remoteUrl: string): Promise<string> {
  if (!remoteUrl.startsWith('http')) {
    return remoteUrl;
  }

  await ensureCacheDir();
  const localPath = `${CACHE_DIR}/${cacheFileName(remoteUrl)}`;

  const alreadyCached = await RNFS.exists(localPath);
  if (alreadyCached) {
    return `file://${localPath}`;
  }

  const inFlight = pendingDownloads.get(remoteUrl);
  if (inFlight) {
    return inFlight;
  }

  const downloadPromise = RNFS.downloadFile({ fromUrl: remoteUrl, toFile: localPath })
    .promise.then(() => `file://${localPath}`)
    .catch(() => remoteUrl) // download failed — fall back to streaming the remote URL directly
    .finally(() => pendingDownloads.delete(remoteUrl));

  pendingDownloads.set(remoteUrl, downloadPromise);
  return downloadPromise;
}
