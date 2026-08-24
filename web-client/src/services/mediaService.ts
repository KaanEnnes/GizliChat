import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';

export type MediaKind = 'image' | 'video' | 'audio' | 'file';

/** Uploads a File to Firebase Storage under rooms/{roomId}/media/ — same layout as the mobile app's mediaService.ts. */
export async function uploadRoomMedia(roomId: string, kind: MediaKind, file: File): Promise<{ url: string; sizeBytes: number }> {
  const ext = file.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'bin');
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const storageRef = ref(storage, `rooms/${roomId}/media/${kind}/${fileName}`);
  await uploadBytes(storageRef, file, { contentType: file.type || undefined });
  const url = await getDownloadURL(storageRef);
  return { url, sizeBytes: file.size };
}

/** Reads a File into an inline base64 data: URI — used for image messages, same as mobile (no Storage, stays on Firebase's free plan). */
export function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Dosya okunamadı.'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

/** Resizes/compresses an image File to a JPEG data URI capped at maxSize px on the long edge — keeps it under Firestore's ~1MiB doc limit. */
export function resizeImageToDataUri(file: File, maxSize = 1280, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Dosya okunamadı.'));
    reader.onload = () => {
      img.src = reader.result as string;
    };
    img.onerror = () => reject(new Error('Görsel işlenemedi.'));
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const scale = maxSize / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas desteklenmiyor.'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    reader.readAsDataURL(file);
  });
}
