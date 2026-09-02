import React, { useEffect, useState } from 'react';
import type { ChatMessage } from '../services/chatService';

interface Props {
  images: ChatMessage[];
  initialMessageId: string | null;
  onClose: () => void;
}

/**
 * Full-screen swipeable/arrow-navigable viewer for a room's image AND video
 * messages (WhatsApp-style): opens on the clicked item and lets the user page
 * through every other item in `images` (chronological order), both older and
 * newer than the one that was clicked.
 */
export default function ImageGalleryModal({ images, initialMessageId, onClose }: Props): React.JSX.Element | null {
  const [index, setIndex] = useState(() => Math.max(0, images.findIndex(m => m.id === initialMessageId)));

  useEffect(() => {
    setIndex(Math.max(0, images.findIndex(m => m.id === initialMessageId)));
  }, [initialMessageId, images]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setIndex(i => Math.min(images.length - 1, i + 1));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [images.length, onClose]);

  if (images.length === 0 || !initialMessageId) {
    return null;
  }

  const current = images[index];

  return (
    <div className="gallery-overlay" onClick={onClose}>
      <button type="button" className="gallery-close-btn" onClick={onClose} aria-label="Kapat">
        ✕
      </button>

      {images.length > 1 && <div className="gallery-counter">{index + 1} / {images.length}</div>}

      {images.length > 1 && index > 0 && (
        <button
          type="button"
          className="gallery-arrow gallery-arrow-left"
          onClick={e => {
            e.stopPropagation();
            setIndex(i => i - 1);
          }}
          aria-label="Önceki fotoğraf">
          ‹
        </button>
      )}

      {current.type === 'video' ? (
        <video src={current.mediaUrl} className="gallery-image" controls autoPlay onClick={e => e.stopPropagation()} />
      ) : (
        <img src={current.mediaUrl} className="gallery-image" alt="" onClick={e => e.stopPropagation()} />
      )}

      {images.length > 1 && index < images.length - 1 && (
        <button
          type="button"
          className="gallery-arrow gallery-arrow-right"
          onClick={e => {
            e.stopPropagation();
            setIndex(i => i + 1);
          }}
          aria-label="Sonraki fotoğraf">
          ›
        </button>
      )}
    </div>
  );
}
