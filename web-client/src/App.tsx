import React, { useEffect, useState } from 'react';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import { useIsMobileLayout } from './hooks/useMediaQuery';
import AuthScreen from './screens/AuthScreen';
import ContactsScreen from './screens/ContactsScreen';
import ChatRoomScreen from './screens/ChatRoomScreen';
import GameHubScreen from './screens/GameHubScreen';
import { fetchAccountUsername, logoutAccount, updatePresenceHeartbeat, watchAuthState, type Account } from './services/userService';
import type { Contact } from './services/contactService';
import { initFcm } from './services/fcmService';
import { setActiveChatUid } from './services/notificationService';

const PRESENCE_HEARTBEAT_MS = 25_000;

// Bare-bones contact stub reconstructed from history state on back/forward —
// only uid/name are ever read by ChatRoomScreen, so addedAt/favorite are
// filled with harmless defaults rather than persisted.
type ContactStub = Pick<Contact, 'uid' | 'name'>;

// Everything that changes when the user "navigates" inside the app. Pushed
// onto the browser's history stack (via history.pushState) on every
// transition, with the URL itself left untouched — the app's whole premise
// is a disguised games hub, so the address bar must never spell out
// "revealed" or "chat" or leak who's being messaged. This is what makes the
// browser's back/forward buttons and reload behave sanely without giving
// any of that away.
interface NavState {
  revealed: boolean;
  hubOverride: boolean;
  activeContact: ContactStub | null;
  /** Set when the room was opened from a global search result — passed through to ChatRoomScreen to jump to and highlight that message. */
  jumpMessageId: string | null;
}

const INITIAL_NAV_STATE: NavState = { revealed: false, hubOverride: false, activeContact: null, jumpMessageId: null };

function pushNavState(next: NavState): void {
  window.history.pushState(next, '');
}

function AppShell(): React.JSX.Element {
  const { theme } = useTheme();
  const isMobileLayout = useIsMobileLayout();
  const [account, setAccount] = useState<Account | null | undefined>(undefined); // undefined = auth state still resolving
  const [activeContact, setActiveContactState] = useState<Contact | null>(null);
  const [jumpMessageId, setJumpMessageIdState] = useState<string | null>(null);
  // Whether the hidden gesture on the games hub has revealed the real login —
  // mirrors the mobile app's disguise: an anonymous session (created just for
  // leaderboard score submission) must never auto-reveal the real chat UI.
  const [revealed, setRevealedState] = useState(false);
  // Manually navigating back to the games hub from inside the chat UI (the
  // "Ana Sayfa" button) without logging out — the Firebase session stays
  // authenticated, so hitting the secret gesture again jumps straight back
  // to the chat instead of asking to log in again.
  const [hubOverride, setHubOverrideState] = useState(false);

  // Replaces the three plain setState calls above: every navigation both
  // updates React state and pushes a history entry carrying the same shape,
  // so the back/forward buttons (and popstate below) can restore it later.
  const navigate = (next: Partial<NavState>) => {
    const merged: NavState = {
      revealed: next.revealed ?? revealed,
      hubOverride: next.hubOverride ?? hubOverride,
      activeContact: next.activeContact !== undefined ? next.activeContact : activeContact,
      jumpMessageId: next.jumpMessageId !== undefined ? next.jumpMessageId : jumpMessageId,
    };
    setRevealedState(merged.revealed);
    setHubOverrideState(merged.hubOverride);
    setActiveContactState(merged.activeContact as Contact | null);
    setJumpMessageIdState(merged.jumpMessageId);
    pushNavState(merged);
  };

  useEffect(() => {
    // Seed the initial history entry so the very first popstate (hitting
    // "back" once) has somewhere defined to land instead of leaving the app.
    window.history.replaceState(INITIAL_NAV_STATE, '');
    const handlePopState = (event: PopStateEvent) => {
      const state = (event.state as NavState | null) ?? INITIAL_NAV_STATE;
      setRevealedState(state.revealed);
      setHubOverrideState(state.hubOverride);
      setActiveContactState(state.activeContact as Contact | null);
      setJumpMessageIdState(state.jumpMessageId ?? null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const setActiveContact = (contact: Contact | null, messageIdToJumpTo?: string) =>
    navigate({ activeContact: contact, jumpMessageId: messageIdToJumpTo ?? null });
  const setRevealed = (value: boolean) => navigate({ revealed: value });
  const setHubOverride = (value: boolean) => navigate({ hubOverride: value });

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

  useEffect(() => {
    if (!account) return;
    initFcm(account.uid).catch(() => undefined);
  }, [account]);

  useEffect(() => {
    setActiveChatUid(activeContact?.uid ?? null);
  }, [activeContact]);

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
    const handleAuthenticated = (loggedInAccount: Account) => {
      // Insert a silent "hub" history entry behind the upcoming Contacts
      // entry, so a single back-button press right after logging in lands
      // on the disguise's hub screen — matching the mobile app's back-button
      // behavior — instead of the (now-meaningless) pre-login reveal state,
      // which renders identically to Contacts once account is set and so
      // would make the back button look like it does nothing.
      pushNavState({ revealed: true, hubOverride: true, activeContact: null, jumpMessageId: null });
      setAccount(loggedInAccount);
      navigate({ revealed: true, hubOverride: false, activeContact: null });
    };
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  // Logged in, but manually navigated back to the hub — already authenticated,
  // so the secret gesture skips the login form and returns straight to chat.
  if (hubOverride) {
    return <GameHubScreen onSecretTriggerReached={() => setHubOverride(false)} />;
  }

  const handleLogout = () => {
    logoutAccount().catch(() => undefined);
    navigate({ activeContact: null, revealed: false, hubOverride: false });
  };

  const handleGoHome = () => {
    navigate({ activeContact: null, hubOverride: true });
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
            <ChatRoomScreen account={account} contact={activeContact} onBack={() => setActiveContact(null)} initialJumpMessageId={jumpMessageId ?? undefined} />
          ) : (
            <div className="split-empty" style={{ color: theme.textFaint }}>Sohbet açmak için soldan bir kişi seç.</div>
          )}
        </div>
      </div>
    );
  }

  return activeContact ? (
    <ChatRoomScreen account={account} contact={activeContact} onBack={() => setActiveContact(null)} initialJumpMessageId={jumpMessageId ?? undefined} />
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
