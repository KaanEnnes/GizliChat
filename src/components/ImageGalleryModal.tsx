import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { ChatMessage } from '../services/chatService';
import { BackChevronIcon } from './CallIcons';

interface Props {
  /** Non-empty when the gallery should be shown; the modal renders nothing otherwise. */
  images: ChatMessage[];
  initialMessageId: string | null;
  onClose: () => void;
}

/**
 * Full-screen swipeable viewer for a room's image messages (WhatsApp-style):
 * opens on the tapped photo and lets the user page left/right through every
 * other image in the same list (`images`, passed in chronological order),
 * both older and newer than the one that was tapped.
 */
export default function ImageGalleryModal({ images, initialMessageId, onClose }: Props): React.JSX.Element | null {
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const initialIndex = Math.max(
    0,
    images.findIndex(m => m.id === initialMessageId),
  );
  const [index, setIndex] = useState(initialIndex);

  const goTo = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= images.length) {
        return;
      }
      listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      setIndex(nextIndex);
    },
    [images.length],
  );

  const handleMomentumScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const nextIndex = Math.round(e.nativeEvent.contentOffset.x / width);
      setIndex(nextIndex);
    },
    [width],
  );

  if (images.length === 0 || !initialMessageId) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={item => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          renderItem={({ item }) => (
            <View style={[styles.page, { width, height }]}>
              <Image source={{ uri: item.mediaUrl }} style={styles.image} resizeMode="contain" />
            </View>
          )}
        />

        <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat">
          <Text style={styles.closeButtonText}>✕</Text>
        </Pressable>

        {images.length > 1 && (
          <Text style={styles.counter}>
            {index + 1} / {images.length}
          </Text>
        )}

        {images.length > 1 && index > 0 && (
          <Pressable
            style={[styles.arrow, styles.arrowLeft]}
            onPress={() => goTo(index - 1)}
            accessibilityRole="button"
            accessibilityLabel="Önceki fotoğraf">
            <View style={styles.arrowIconLeft}>
              <BackChevronIcon color="#fff" size={22} />
            </View>
          </Pressable>
        )}

        {images.length > 1 && index < images.length - 1 && (
          <Pressable
            style={[styles.arrow, styles.arrowRight]}
            onPress={() => goTo(index + 1)}
            accessibilityRole="button"
            accessibilityLabel="Sonraki fotoğraf">
            <View style={styles.arrowIconRight}>
              <BackChevronIcon color="#fff" size={22} />
            </View>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000',
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    top: 44,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 20,
    lineHeight: 20,
  },
  counter: {
    position: 'absolute',
    top: 52,
    alignSelf: 'center',
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowLeft: {
    left: 12,
  },
  arrowRight: {
    right: 12,
  },
  arrowIconLeft: {
    transform: [{ rotate: '0deg' }],
  },
  arrowIconRight: {
    transform: [{ rotate: '180deg' }],
  },
});
