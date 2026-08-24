import React, { useEffect, useState } from 'react';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import { useIsMobileLayout } from './hooks/useMediaQuery';
import AuthScreen from './screens/AuthScreen';
import ContactsScreen from './screens/ContactsScreen';
import ChatRoomScreen from './screens/ChatRoomScreen';
import GameHubScreen from './screens/GameHubScreen';
import { fetchAccountUsername, logoutAccount, updatePresenceHeartbeat, watchAuthState, type Account } from './services/userService';
import type { Contact } from './services/contactService';

const PRESENCE_HEARTBEAT_MS = 25_000;

function AppShell(): React.JSX.Element {
  const { theme } = useTheme();
  const isMobileLayout = useIsMobileLayout();
  const [account, setAccount] = useState<Account | null | undefined>(undefined); // undefined = auth state still resolving
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  // Whether the hidden gesture on the games hub has revealed the real login —
  // mirrors the mobile app's disguise: an anonymous session (created just for
  // leaderboard score submission) must never auto-reveal the real chat UI.
  const [revealed, setRevealed] = useState(false);
  // Manually navigating back to the games hub from inside the chat UI (the
  // "Ana Sayfa" button) without logging out — the Firebase session stays
  // authenticated, so hitting the secret gesture again jumps straight back
  // to the chat instead of asking to log in again.
  const [hubOverride, setHubOverride] = useState(false);

  useEffect(() => {
    return watchAuthState(async user => {
      if (!user || user.isAnonymous) {
        setAccount(null);
        return;
      }
      const username = (await fetchAccountUsername(user.uid)) ?? user.email?.split('@')[0] ?? 'Kullanıcı';
      setAccount({ uid: user.uid, username });
    });
  }, []);

  useEffect(() => {
    if (!account) return;
    updatePresenceHeartbeat(account.uid).catch(() => undefined);
    const interval = setInterval(() => updatePresenceHeartbeat(account.uid).catch(() => undefined), PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [account]);

  if (account === undefined) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme.background, color: theme.textMuted }}>
        Yükleniyor…
      </div>
    );
  }

  // Not logged in with a real account, and the hidden gesture hasn't fired
  // yet — show the harmless games hub (the app's disguised front door).
  if (!account && !revealed) {
    return <GameHubScreen onSecretTriggerReached={() => setRevealed(true)} />;
  }

  if (!account) {
    return <AuthScreen onAuthenticated={setAccount} />;
  }

  // Logged in, but manually navigated back to the hub — already authenticated,
  // so the secret gesture skips the login form and returns straight to chat.
  if (hubOverride) {
    return <GameHubScreen onSecretTriggerReached={() => setHubOverride(false)} />;
  }

  const handleLogout = () => {
    logoutAccount().catch(() => undefined);
    setActiveContact(null);
    setRevealed(false);
    setHubOverride(false);
  };

  const handleGoHome = () => {
    setActiveContact(null);
    setHubOverride(true);
  };

  // Desktop/tablet: contacts + chat room side by side, like the pc-client.
  // Mobile-width: one pane at a time, like the mobile app's stack navigator.
  if (!isMobileLayout) {
    return (
      <div className="split-layout">
        <div className="split-sidebar" style={{ borderColor: theme.border }}>
          <ContactsScreen account={account} onOpenRoom={setActiveContact} onLogout={handleLogout} onGoHome={handleGoHome} />
        </div>
        <div className="split-main">
          {activeContact ? (
            <ChatRoomScreen account={account} contact={activeContact} onBack={() => setActiveContact(null)} />
          ) : (
            <div className="split-empty" style={{ color: theme.textFaint }}>Sohbet açmak için soldan bir kişi seç.</div>
          )}
        </div>
      </div>
    );
  }

  return activeContact ? (
    <ChatRoomScreen account={account} contact={activeContact} onBack={() => setActiveContact(null)} />
  ) : (
    <ContactsScreen account={account} onOpenRoom={setActiveContact} onLogout={handleLogout} onGoHome={handleGoHome} />
  );
}

function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

export default App;
