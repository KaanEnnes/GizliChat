import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { LIVE_LOCATION_DURATIONS_MS } from '../services/locationService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onShareCurrent: () => void;
  onShareLive: (durationMs: number) => void;
}

/**
 * Opened from AttachMenuModal's "Konum" row. Two-step, same modal-instead-of-
 * Alert reasoning as AttachMenuModal itself: step 1 picks "mevcut konum" vs
 * "canlı konum", step 2 (only for live) picks a duration — WhatsApp-style
 * 15dk/1sa/8sa presets from locationService.LIVE_LOCATION_DURATIONS_MS.
 */
function LocationShareModal({ visible, onClose, onShareCurrent, onShareLive }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [pickingDuration, setPickingDuration] = useState(false);

  const close = () => {
    setPickingDuration(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={close}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {!pickingDuration ? (
            <>
              <Text style={[styles.title, { color: theme.text }]}>Konum Gönder</Text>
              <Pressable
                style={styles.row}
                onPress={() => {
                  close();
                  onShareCurrent();
                }}
                accessibilityRole="button">
                <Text style={[styles.rowText, { color: theme.text }]}>📍  Mevcut Konumu Gönder</Text>
              </Pressable>
              <Pressable style={styles.row} onPress={() => setPickingDuration(true)} accessibilityRole="button">
                <Text style={[styles.rowText, { color: theme.text }]}>🔴  Canlı Konum Paylaş</Text>
              </Pressable>
              <Pressable style={[styles.row, styles.cancelRow]} onPress={close} accessibilityRole="button">
                <Text style={[styles.rowText, { color: theme.textMuted }]}>Vazgeç</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: theme.text }]}>Ne kadar süreyle?</Text>
              {LIVE_LOCATION_DURATIONS_MS.map(option => (
                <Pressable
                  key={option.label}
                  style={styles.row}
                  onPress={() => {
                    close();
                    onShareLive(option.ms);
                  }}
                  accessibilityRole="button">
                  <Text style={[styles.rowText, { color: theme.text }]}>{option.label}</Text>
                </Pressable>
              ))}
              <Pressable style={[styles.row, styles.cancelRow]} onPress={close} accessibilityRole="button">
                <Text style={[styles.rowText, { color: theme.textMuted }]}>Vazgeç</Text>
              </Pressable>
            </>
          )}
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

export default LocationShareModal;
