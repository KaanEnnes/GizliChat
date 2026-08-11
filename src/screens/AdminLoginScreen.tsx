import React, { useState } from 'react';
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
import { loginAdmin } from '../services/authService';

interface Props {
  onLoginSuccess: () => void;
  onCancel: () => void;
}

function AdminLoginScreen({ onLoginSuccess, onCancel }: Props): React.JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (loading) {
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const result = await loginAdmin(username, password);
      if (result.success) {
        onLoginSuccess();
      } else {
        setError(result.errorMessage ?? 'Giriş başarısız.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.card}>
        <Text style={styles.title}>Admin Girişi</Text>

        <TextInput
          style={styles.input}
          placeholder="Kullanıcı adı"
          placeholderTextColor="rgba(245,245,247,0.4)"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Şifre"
          placeholderTextColor="rgba(245,245,247,0.4)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
          onSubmitEditing={handleSubmit}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#0F1115" />
          ) : (
            <Text style={styles.submitButtonText}>Giriş Yap</Text>
          )}
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={onCancel} disabled={loading}>
          <Text style={styles.cancelButtonText}>Vazgeç</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1115',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#1C1F26',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  title: {
    color: '#F5F5F7',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#0F1115',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F5F5F7',
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
    marginBottom: 12,
  },
  submitButton: {
    backgroundColor: '#3B7CFF',
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
    color: '#0F1115',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelButton: {
    marginTop: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: 'rgba(245,245,247,0.5)',
    fontSize: 13,
  },
});

export default AdminLoginScreen;
