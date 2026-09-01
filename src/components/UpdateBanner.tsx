import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import {
  downloadAndInstallUpdate,
  fetchLatestVersion,
  getInstalledVersionCode,
  LatestVersionInfo,
} from '../services/updateService';

/**
 * Shown at the top of ContactsScreen (the real chat home) when Firestore's
 * app_config/android doc advertises a versionCode newer than this install —
 * see updateService.ts for how that doc is meant to be maintained.
 */
function UpdateBanner(): React.JSX.Element | null {
  const { theme } = useTheme();
  const [update, setUpdate] = useState<LatestVersionInfo | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchLatestVersion()
      .then(info => {
        if (cancelled || !info) {
          return;
        }
        if (info.versionCode > getInstalledVersionCode()) {
          setUpdate(info);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update) {
    return null;
  }

  const handleUpdate = () => {
    if (downloading) {
      return;
    }
    setDownloading(true);
    downloadAndInstallUpdate(update)
      .catch(error => {
        Alert.alert('Güncelleme başarısız', (error as Error).message);
      })
      .finally(() => setDownloading(false));
  };

  return (
    <View style={[styles.banner, { backgroundColor: theme.surfaceAlt, borderColor: theme.accent }]}>
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: theme.text }]}>
          Yeni sürüm hazır{update.versionName ? `: v${update.versionName}` : ''}
        </Text>
        {update.notes ? (
          <Text style={[styles.notes, { color: theme.textMuted }]} numberOfLines={2}>
            {update.notes}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={handleUpdate}
        disabled={downloading}
        style={[styles.button, { backgroundColor: theme.accent }, downloading && styles.buttonDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Güncellemeyi indir ve kur">
        <Text style={[styles.buttonText, { color: theme.accentText }]}>
          {downloading ? 'İndiriliyor…' : 'Güncelle'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginTop: 10,
  },
  textWrap: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
  },
  notes: {
    fontSize: 11,
    marginTop: 2,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
});

export default UpdateBanner;
