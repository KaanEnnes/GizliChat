import React, { useState } from 'react';
import { registerAccount, loginAccount, type Account } from '../services/userService';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  onAuthenticated: (account: Account) => void;
}

function AuthScreen({ onAuthenticated }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Kullanıcı adı ve şifre gerekli.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const account = isRegisterMode ? await registerAccount(username, password) : await loginAccount(username, password);
      onAuthenticated(account);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen" style={{ background: theme.background }}>
      <form className="auth-card" style={{ background: theme.surface, borderColor: theme.border }} onSubmit={handleSubmit}>
        <h1 style={{ color: theme.text }}>GizliChat</h1>
        <p style={{ color: theme.textMuted }}>Web'den yazışmaya devam et.</p>
        {error && <div className="auth-error" style={{ color: theme.danger }}>{error}</div>}
        <input
          className="auth-input"
          style={{ background: theme.inputBackground, color: theme.text, borderColor: theme.border }}
          type="text"
          placeholder="Kullanıcı adı"
          autoComplete="username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          disabled={submitting}
        />
        <input
          className="auth-input"
          style={{ background: theme.inputBackground, color: theme.text, borderColor: theme.border }}
          type="password"
          placeholder="Şifre"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          disabled={submitting}
        />
        <button className="auth-submit" style={{ background: theme.accent, color: theme.accentText }} type="submit" disabled={submitting}>
          {submitting ? '...' : isRegisterMode ? 'Kayıt ol' : 'Giriş yap'}
        </button>
        <div className="auth-toggle" style={{ color: theme.identity }} onClick={() => setIsRegisterMode(prev => !prev)}>
          {isRegisterMode ? 'Zaten hesabın var mı? Giriş yap' : 'Hesabın yok mu? Kayıt ol'}
        </div>
      </form>
    </div>
  );
}

export default AuthScreen;
