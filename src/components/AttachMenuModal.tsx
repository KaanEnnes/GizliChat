import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  onGallery: () => void;
  onCamera: () => void;
  onHiddenMedia: () => void;
  onFile: () => void;
  onGif: () => void;
  onSong: () => void;
  onLocation: () => void;
}

/**
 * Replaces a plain Alert.alert for the attach menu — Android's native Alert
 * silently renders at most 3 buttons, so once this menu grew past
 * Galeri/Kamera/Gizli Medya to include Dosya too, the extra options (and
 * Vazgeç) just disappeared with no error. A real modal has no such limit.
 */
function AttachMenuModal({ visible, onClose, onGallery, onCamera, onHiddenMedia, onFile, onGif, onSong, onLocation }: Props): React.JSX.Element {
  const { theme } = useTheme();

  const run = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>Medya Gönder</Text>
          <Pressable style={styles.row} onPress={() => run(onGallery)} accessibilityRole="button">
            <Text style={[styles.rowText, { color: theme.text }]}>🖼️  Galeri</Text>
          </Pressable>
          <Pressable style={styles.row} onPress={() => run(onCamera)} accessibilityRole="button">
            <Text style={[styles.rowText, { color: theme.text }]}>📷  Kamera</Text>
          </Pressable>
          <Pressable style={styles.row} onPress={() => run(onHiddenMedia)} accessibilityRole="button">
            <Text style={[styles.rowText, { color: theme.text }]}>🙈  Gizli Fotoğraf/Video</Text>
          </Pressable>
          <Pressable style={styles.row} onPress={() => run(onFile)} accessibilityRole="button">
            <Text style={[styles.rowText, { color: theme.text }]}>📎  Dosya</Text>
          </Pressable>
          <Pressable style={styles.row} onPress={() => run(onGif)} accessibilityRole="button">
            <Text style={[styles.rowText, { color: theme.text }]}>🎞️  GIF</Text>
          </Pressable>
          <Pressable style={styles.row} onPress={() => run(onSong)} accessibilityRole="button">
            <Text style={[styles.rowText, { color: theme.text }]}>🎵  Şarkı</Text>
          </Pressable>
          <Pressable style={styles.row} onPress={() => run(onLocation)} accessibilityRole="button">
            <Text style={[styles.rowText, { color: theme.text }]}>📍  Konum</Text>
          </Pressable>
          <Pressable style={[styles.row, styles.cancelRow]} onPress={onClose} accessibilityRole="button">
            <Text style={[styles.rowText, { color: theme.textMuted }]}>Vazgeç</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 18,
    paddingVertical: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    opacity: 0.6,
    textAlign: 'center',
    paddingVertical: 10,
  },
  row: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  cancelRow: {
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.24)',
  },
  rowText: {
    fontSize: 15.5,
    fontWeight: '600',
  },
});

export default AttachMenuModal;
