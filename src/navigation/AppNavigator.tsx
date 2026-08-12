import React, { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import GameHubScreen from '../screens/GameHubScreen';
import AccountScreen from '../screens/AccountScreen';
import ContactsScreen from '../screens/ContactsScreen';
import ChatRoomScreen from '../screens/ChatRoomScreen';
import CallProvider from '../components/CallProvider';
import NotificationCenter from '../components/NotificationCenter';
import { Contact } from '../services/contactService';
import { Account, logoutAccount } from '../services/userService';

type Screen = 'HOME' | 'ACCOUNT' | 'CONTACTS' | 'CHAT_ROOM';

function AppNavigator(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('HOME');
  const [account, setAccount] = useState<Account | null>(null);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'ACCOUNT' || screen === 'CONTACTS') {
        setScreen('HOME');
        return true;
      }
      if (screen === 'CHAT_ROOM') {
        setScreen('CONTACTS');
        return true;
      }
      // HOME ekranında varsayılan davranışa izin ver (uygulamadan çık)
      return false;
    });

    return () => subscription.remove();
  }, [screen]);

  if (screen === 'ACCOUNT') {
    return (
      <AccountScreen
        onAuthenticated={loggedInAccount => {
          setAccount(loggedInAccount);
          setScreen('CONTACTS');
        }}
        onCancel={() => setScreen('HOME')}
      />
    );
  }

  if ((screen === 'CONTACTS' || screen === 'CHAT_ROOM') && account) {
    const openRoom = (contact: Contact) => {
      setActiveContact(contact);
      setScreen('CHAT_ROOM');
    };

    return (
      <CallProvider myUid={account.uid} myUsername={account.username}>
        {/* Mounted once for both CONTACTS/CHAT_ROOM (rather than duplicated per-branch
            like it used to be) so its per-room Firestore listeners aren't torn down
            and rebuilt on every screen switch. */}
        <NotificationCenter
          myUid={account.uid}
          activeContactUid={screen === 'CHAT_ROOM' ? activeContact?.uid ?? null : null}
          onOpenRoom={openRoom}>
          {screen === 'CONTACTS' && (
            <ContactsScreen
              account={account}
              onOpenRoom={openRoom}
              onLogout={() => {
                logoutAccount().finally(() => {
                  setAccount(null);
                  setScreen('HOME');
                });
              }}
            />
          )}
          {screen === 'CHAT_ROOM' && activeContact && (
            <ChatRoomScreen
              myUid={account.uid}
              myUsername={account.username}
              contact={activeContact}
              onBack={() => setScreen('CONTACTS')}
            />
          )}
        </NotificationCenter>
      </CallProvider>
    );
  }

  return <GameHubScreen onAdminTriggerReached={() => setScreen('ACCOUNT')} />;
}

export default AppNavigator;
