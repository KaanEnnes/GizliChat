import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { app } from './firebase';

const storage = getStorage(app);

export type MediaKind = 'image' | 'video' | 'audio' | 'file';

/**
 * Uploads a local file (picked/recorded on-device, given as a `file://` uri)
 * to Firebase Storage under rooms/{roomId}/media/, and resolves the public
 * download URL that gets stored on the chat message document. Storage access
 * itself is governed by storage.rules (see project root) — same "room
 * membership" model as Firestore's rooms/{roomId}/messages.
 */
export async function uploadRoomMedia(
  roomId: string,
  kind: MediaKind,
  localUri: string,
  fileExtension: string,
): Promise<{ url: string; sizeBytes: number }> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${fileExtension}`;
  const storageRef = ref(storage, `rooms/${roomId}/media/${kind}/${fileName}`);
  await uploadBytes(storageRef, blob, { contentType: blob.type || undefined });
  const url = await getDownloadURL(storageRef);
  return { url, sizeBytes: blob.size };
}

/**
 * Reads a local file (e.g. a just-recorded voice message, given as a
 * `file://` uri) into an inline base64 `data:` URI — no Firebase Storage
 * involved, same reasoning as the image path in ChatRoomScreen's
 * handlePickMedia (this project stays on Firebase's free Spark plan,
 * Storage requires Blaze). Only viable for small files; callers are
 * responsible for enforcing Firestore's ~1 MiB document limit.
 */
export async function localFileToDataUri(localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Dosya okunamadı.'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}
