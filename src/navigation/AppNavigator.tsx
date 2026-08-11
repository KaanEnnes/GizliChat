import React, { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import HomeScreen from '../screens/HomeScreen';
import AccountScreen from '../screens/AccountScreen';
import ContactsScreen from '../screens/ContactsScreen';
import ChatRoomScreen from '../screens/ChatRoomScreen';
import CallProvider from '../components/CallProvider';
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

  if (screen === 'CONTACTS' && account) {
    return (
      <CallProvider myUid={account.uid} myUsername={account.username}>
        <ContactsScreen
          account={account}
          onOpenRoom={contact => {
            setActiveContact(contact);
            setScreen('CHAT_ROOM');
          }}
          onLogout={() => {
            logoutAccount().finally(() => {
              setAccount(null);
              setScreen('HOME');
            });
          }}
        />
      </CallProvider>
    );
  }

  if (screen === 'CHAT_ROOM' && account && activeContact) {
    return (
      <CallProvider myUid={account.uid} myUsername={account.username}>
        <ChatRoomScreen
          myUid={account.uid}
          myUsername={account.username}
          contact={activeContact}
          onBack={() => setScreen('CONTACTS')}
        />
      </CallProvider>
    );
  }

  return <HomeScreen onAdminTriggerReached={() => setScreen('ACCOUNT')} />;
}

export default AppNavigator;
