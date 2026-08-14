import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Account, fetchAccountUsername, loginAccount, registerAccount } from '../services/userService';
import { getRestoredAccountUser } from '../services/firebase';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  onAuthenticated: (account: Account) => void;
  onCancel: () => void;
}

type Mode = 'checking' | 'login' | 'register';

function AccountScreen({ onAuthenticated, onCancel }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [mode, setMode] = useState<Mode>('checking');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If this device already has a real (non-anonymous) session persisted
  // from a previous login, skip the form entirely.
  useEffect(() => {
    let cancelled = false;
    getRestoredAccountUser().then(async user => {
      if (cancelled) {
        return;
      }
      if (user) {
        const savedUsername = await fetchAccountUsername(user.uid);
        if (!cancelled && savedUsername) {
          onAuthenticated({ uid: user.uid, username: savedUsername });
          return;
        }
      }
      if (!cancelled) {
        setMode('login');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [onAuthenticated]);

  const handleSubmit = async () => {
    if (loading || mode === 'checking') {
      return;
    }
    setError(null);

    if (mode === 'register' && password !== confirmPassword) {
      setError('Şifreler eşleşmiyor.');
      return;
    }

    setLoading(true);
    try {
      const account =
        mode === 'register'
          ? await registerAccount(username, password)
          : await loginAccount(username, password);
      onAuthenticated(account);
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'checking') {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>
          {mode === 'login' ? 'Giriş Yap' : 'Hesap Oluştur'}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>
          {mode === 'login'
            ? 'Kişilerine ve sohbetlerine ulaşmak için giriş yap.'
            : 'Bu hesapla başka bir telefonda da giriş yapabilirsin.'}
        </Text>

        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border },
          ]}
          placeholder="Kullanıcı adı"
          placeholderTextColor={theme.textFaint}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />

        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border },
          ]}
          placeholder="Şifre"
          placeholderTextColor={theme.textFaint}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />

        {mode === 'register' && (
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border },
            ]}
            placeholder="Şifre (tekrar)"
            placeholderTextColor={theme.textFaint}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            onSubmitEditing={handleSubmit}
          />
        )}

        {error ? <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text> : null}

        <Pressable
          style={[styles.submitButton, { backgroundColor: theme.accent }, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color={theme.accentText} />
          ) : (
            <Text style={[styles.submitButtonText, { color: theme.accentText }]}>
              {mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
            </Text>
          )}
        </Pressable>

        <Pressable
          style={styles.switchModeButton}
          onPress={() => {
            setError(null);
            setMode(mode === 'login' ? 'register' : 'login');
          }}
          disabled={loading}>
          <Text style={[styles.switchModeText, { color: theme.identity }]}>
            {mode === 'login' ? 'Hesabın yok mu? Kayıt ol' : 'Zaten hesabın var mı? Giriş yap'}
          </Text>
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={onCancel} disabled={loading}>
          <Text style={[styles.cancelButtonText, { color: theme.textMuted }]}>Vazgeç</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12.5,
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 13,
    marginBottom: 12,
  },
  submitButton: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  switchModeButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  switchModeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 13,
  },
});

export default AccountScreen;
