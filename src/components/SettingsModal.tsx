import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { AudioDevice, useAudioDeviceStatus } from '@stream-io/video-react-native-sdk';
import { useTheme } from '../theme/ThemeContext';
import { isSoundEnabled, setSoundEnabled } from '../services/soundService';
import { isNotificationsEnabled, setNotificationsEnabled } from '../services/notificationService';
import { syncNotificationsEnabledToServer } from '../services/fcmService';
import { isVibrationEnabled, setVibrationEnabled } from '../services/hapticsService';
import {
  AudioOutputPreference,
  audioOutputPreferenceLabel,
  getAudioOutputPreference,
  setAudioOutputPreference,
} from '../services/audioOutputService';

const DEVICE_ICONS: Record<string, string> = {
  'Bluetooth Device': '🎧',
  Earpiece: '📱',
  Speaker: '🔊',
  'Wired Headset': '🎧',
};

function deviceIcon(type: string): string {
  return DEVICE_ICONS[type] ?? '🔊';
}

function preferenceMatchesDevice(preference: AudioOutputPreference, device: AudioDevice): boolean {
  return preference.kind === 'device' && preference.type === device.type && preference.name === device.name;
}

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
  const [audioOutput, setAudioOutput] = useState<AudioOutputPreference>(getAudioOutputPreference());
  const [audioOutputPickerOpen, setAudioOutputPickerOpen] = useState(false);
  // Real device list (e.g. "CMF Buds 2 Plus") straight from the OS audio
  // session — same source the in-call picker uses — instead of generic
  // category labels, so this matches what an app like Spotify shows.
  const audioStatus = useAudioDeviceStatus();

  const handlePickAudioOutput = (preference: AudioOutputPreference) => {
    setAudioOutput(preference);
    setAudioOutputPreference(preference);
    setAudioOutputPickerOpen(false);
  };

  const handleToggleSound = (value: boolean) => {
    setSoundOn(value);
    setSoundEnabled(value);
  };

  const handleToggleNotifications = (value: boolean) => {
    setNotificationsOn(value);
    setNotificationsEnabled(value);
    // Mirrors the flag onto this user's Firestore profile (no-op if signed
    // out) so the server-side Cloud Function that sends real push
    // notifications knows to skip this device too, not just the in-app toast.
    syncNotificationsEnabledToServer(value);
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
            </View>
            <Switch
              value={notificationsOn}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor={theme.surface}
            />
          </View>

          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Titreşim</Text>
            <Switch
              value={vibrationOn}
              onValueChange={handleToggleVibration}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor={theme.surface}
            />
          </View>

          <Pressable
            onPress={() => setAudioOutputPickerOpen(true)}
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel="Arama ses çıkışını değiştir">
            <View style={styles.rowTextWrap}>
              <Text style={[styles.rowLabel, { color: theme.text }]}>Arama ses çıkışı</Text>
              <Text style={[styles.rowHint, { color: theme.textFaint }]}>
                Sesli/görüntülü aramalarda kullanılacak varsayılan cihaz
              </Text>
            </View>
            <Text style={[styles.rowValue, { color: theme.textMuted }]} numberOfLines={1}>
              {audioOutputPreferenceLabel(audioOutput)}
            </Text>
          </Pressable>

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

      <Modal
        visible={audioOutputPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAudioOutputPickerOpen(false)}>
        <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={() => setAudioOutputPickerOpen(false)}>
          <Pressable
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => undefined}>
            <Text style={[styles.title, { color: theme.text }]}>Arama Ses Çıkışı</Text>
            <Pressable
              onPress={() => handlePickAudioOutput({ kind: 'auto' })}
              style={[
                styles.optionRow,
                { borderBottomColor: theme.border },
                audioOutput.kind === 'auto' && { backgroundColor: `${theme.identity}22` },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Otomatik">
              <View style={styles.optionLabelRow}>
                <Text style={styles.deviceIcon}>⚙️</Text>
                <Text style={[styles.rowLabel, { color: theme.text }]}>Otomatik (o an kullanılan)</Text>
              </View>
              {audioOutput.kind === 'auto' && <Text style={[styles.optionCheck, { color: theme.identity }]}>✓</Text>}
            </Pressable>
            {(audioStatus?.devices ?? []).map(device => {
              const isSelected = preferenceMatchesDevice(audioOutput, device);
              return (
                <Pressable
                  key={device.id}
                  onPress={() => handlePickAudioOutput({ kind: 'device', type: device.type, name: device.name })}
                  style={[
                    styles.optionRow,
                    { borderBottomColor: theme.border },
                    isSelected && { backgroundColor: `${theme.identity}22` },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={device.name}>
                  <View style={styles.optionLabelRow}>
                    <Text style={styles.deviceIcon}>{deviceIcon(device.type)}</Text>
                    <Text style={[styles.rowLabel, { color: theme.text }]} numberOfLines={1}>
                      {device.name}
                    </Text>
                  </View>
                  {isSelected && <Text style={[styles.optionCheck, { color: theme.identity }]}>✓</Text>}
                </Pressable>
              );
            })}
            {!audioStatus && (
              <Text style={[styles.rowHint, { color: theme.textFaint, marginTop: 4 }]}>Cihazlar taranıyor…</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
  rowValue: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
  },
  optionCheck: {
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 8,
  },
  optionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  deviceIcon: {
    fontSize: 17,
    marginRight: 10,
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
