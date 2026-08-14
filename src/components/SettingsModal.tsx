import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { isSoundEnabled, setSoundEnabled } from '../services/soundService';
import { isNotificationsEnabled, setNotificationsEnabled } from '../services/notificationService';
import { isVibrationEnabled, setVibrationEnabled } from '../services/hapticsService';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Reachable via a delayed single-tap on the same gear icon that also hosts
 * the hidden 10-tap admin gesture (GameHubScreen owns the tap-counting/delay
 * logic so the secret gesture keeps working unmodified).
 */
function SettingsModal({ visible, onClose }: Props): React.JSX.Element {
  const { theme, mode, toggleTheme } = useTheme();
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [notificationsOn, setNotificationsOn] = useState(isNotificationsEnabled());
  const [vibrationOn, setVibrationOn] = useState(isVibrationEnabled());

  const handleToggleSound = (value: boolean) => {
    setSoundOn(value);
    setSoundEnabled(value);
  };

  const handleToggleNotifications = (value: boolean) => {
    setNotificationsOn(value);
    setNotificationsEnabled(value);
  };

  const handleToggleVibration = (value: boolean) => {
    setVibrationOn(value);
    setVibrationEnabled(value);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>Ayarlar</Text>

          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Koyu tema</Text>
            <Switch
              value={mode === 'dark'}
              onValueChange={toggleTheme}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor={theme.surface}
            />
          </View>

          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Ses efektleri</Text>
            <Switch
              value={soundOn}
              onValueChange={handleToggleSound}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor={theme.surface}
            />
          </View>

          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <View style={styles.rowTextWrap}>
              <Text style={[styles.rowLabel, { color: theme.text }]}>Bildirimler</Text>
              <Text style={[styles.rowHint, { color: theme.textFaint }]}>
                Uygulama açıkken yeni mesaj bildirimleri
              </Text>
            </View>
            <Switch
              value={notificationsOn}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor={theme.surface}
            />
          </View>

          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Titreşim</Text>
            <Switch
              value={vibrationOn}
              onValueChange={handleToggleVibration}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor={theme.surface}
            />
          </View>

          <View style={[styles.aboutRow, { borderTopColor: theme.border }]}>
            <Text style={[styles.aboutText, { color: theme.textFaint }]}>Mini Oyunlar · v1.0</Text>
          </View>

          <Pressable
            onPress={onClose}
            style={[styles.closeButton, { backgroundColor: theme.accent }]}
            accessibilityRole="button"
            accessibilityLabel="Ayarları kapat">
            <Text style={[styles.closeButtonText, { color: theme.accentText }]}>Kapat</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rowTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowHint: {
    fontSize: 11.5,
    marginTop: 2,
  },
  aboutRow: {
    alignItems: 'center',
    paddingTop: 14,
    marginTop: 4,
    borderTopWidth: 1,
  },
  aboutText: {
    fontSize: 12,
    fontWeight: '600',
  },
  closeButton: {
    marginTop: 18,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});

export default SettingsModal;
