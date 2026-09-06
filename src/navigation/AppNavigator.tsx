import React, { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import GameHubScreen from '../screens/GameHubScreen';
import AccountScreen from '../screens/AccountScreen';
import ContactsScreen from '../screens/ContactsScreen';
import ChatRoomScreen from '../screens/ChatRoomScreen';
import CallProvider from '../components/CallProvider';
import NotificationCenter from '../components/NotificationCenter';
import EmergencyCloseButton from '../components/EmergencyCloseButton';
import { Contact } from '../services/contactService';
import { Account, logoutAccount, updatePresenceHeartbeat } from '../services/userService';
import { initFcm, notifyChatOpened } from '../services/fcmService';
import { setActiveChatUid } from '../services/notificationService';
import { useFloatingChatBridge } from '../services/floatingChatBridge';

// How often this device stamps itself as "recently active" for other users'
// online indicators — well under ONLINE_THRESHOLD_MS so a contact never
// flickers offline between two consecutive heartbeats.
const PRESENCE_HEARTBEAT_MS = 25_000;

type Screen = 'HOME' | 'ACCOUNT' | 'CONTACTS' | 'CHAT_ROOM';

function AppNavigator(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('HOME');
  const [account, setAccount] = useState<Account | null>(null);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [jumpMessageId, setJumpMessageId] = useState<string | undefined>(undefined);

  useFloatingChatBridge(account?.uid ?? null);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // Geri tuşu her ekrandan tek basışta doğrudan ana ekrana (oyun
      // menüsüne) dönüyor — ara ekranlarda basamak basamak geri gitmiyor.
      // Uygulamanın oyun-kılığı tasarımına uygun: hızlıca "gizli" kısmı
      // gözden kaybettirmek tek bir geri basışla mümkün olsun diye.
      if (screen !== 'HOME') {
        setScreen('HOME');
        return true;
      }
      // HOME ekranında varsayılan davranışa izin ver (uygulamadan çık)
      return false;
    });

    return () => subscription.remove();
  }, [screen]);

  useEffect(() => {
    if (!account) {
      return undefined;
    }
    updatePresenceHeartbeat(account.uid).catch(() => undefined);
    const interval = setInterval(() => {
      updatePresenceHeartbeat(account.uid).catch(() => undefined);
    }, PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [account]);

  useEffect(() => {
    if (!account) {
      return undefined;
    }
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    initFcm(account.uid).then(unsubscribe => {
      if (cancelled) {
        unsubscribe();
      } else {
        cleanup = unsubscribe;
      }
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [account]);

  useEffect(() => {
    const openContactUid = screen === 'CHAT_ROOM' ? activeContact?.uid ?? null : null;
    setActiveChatUid(openContactUid);
    notifyChatOpened(openContactUid);
    return () => setActiveChatUid(null);
  }, [screen, activeContact]);

  const openRoom = (contact: Contact, messageIdToJumpTo?: string) => {
    setActiveContact(contact);
    setJumpMessageId(messageIdToJumpTo);
    setScreen('CHAT_ROOM');
  };

  let content: React.ReactNode;
  if (screen === 'ACCOUNT') {
    content = (
      <AccountScreen
        onAuthenticated={loggedInAccount => {
          setAccount(loggedInAccount);
          setScreen('CONTACTS');
        }}
        onCancel={() => setScreen('HOME')}
      />
    );
  } else if (screen === 'CONTACTS' && account) {
    content = (
      <ContactsScreen
        account={account}
        onOpenRoom={openRoom}
        onOpenGames={() => setScreen('HOME')}
        onLogout={() => {
          logoutAccount().finally(() => {
            setAccount(null);
            setScreen('HOME');
          });
        }}
      />
    );
  } else if (screen === 'CHAT_ROOM' && activeContact && account) {
    content = (
      <ChatRoomScreen
        myUid={account.uid}
        myUsername={account.username}
        contact={activeContact}
        onBack={() => setScreen('CONTACTS')}
        initialJumpMessageId={jumpMessageId}
      />
    );
  } else {
    content = <GameHubScreen onAdminTriggerReached={() => setScreen('ACCOUNT')} />;
  }

  if (account) {
    // Mounted for every screen while logged in (not just CONTACTS/CHAT_ROOM) —
    // otherwise incoming-message toasts and calls would only ever surface
    // while already inside the chat UI, defeating the point of the game-hub
    // disguise being the screen you'd normally be sitting on.
    return (
      <CallProvider myUid={account.uid} myUsername={account.username}>
        <NotificationCenter
          myUid={account.uid}
          activeContactUid={screen === 'CHAT_ROOM' ? activeContact?.uid ?? null : null}
          onOpenRoom={openRoom}>
          {content}
          {screen !== 'HOME' && <EmergencyCloseButton />}
        </NotificationCenter>
      </CallProvider>
    );
  }

  return content;
}

export default AppNavigator;
