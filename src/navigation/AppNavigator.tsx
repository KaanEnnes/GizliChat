import React, { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import HomeScreen from '../screens/HomeScreen';
import AdminLoginScreen from '../screens/AdminLoginScreen';
import AccountScreen from '../screens/AccountScreen';
import ContactsScreen from '../screens/ContactsScreen';
import ChatRoomScreen from '../screens/ChatRoomScreen';
import { Contact } from '../services/contactService';
import { Account, logoutAccount } from '../services/userService';

type Screen = 'HOME' | 'ADMIN_LOGIN' | 'ACCOUNT' | 'CONTACTS' | 'CHAT_ROOM';

function AppNavigator(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('HOME');
  const [account, setAccount] = useState<Account | null>(null);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'ADMIN_LOGIN' || screen === 'ACCOUNT' || screen === 'CONTACTS') {
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

  if (screen === 'ADMIN_LOGIN') {
    return (
      <AdminLoginScreen
        onLoginSuccess={() => setScreen('ACCOUNT')}
        onCancel={() => setScreen('HOME')}
      />
    );
  }

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
    );
  }

  if (screen === 'CHAT_ROOM' && account && activeContact) {
    return (
      <ChatRoomScreen
        myUid={account.uid}
        contact={activeContact}
        onBack={() => setScreen('CONTACTS')}
      />
    );
  }

  return <HomeScreen onAdminTriggerReached={() => setScreen('ADMIN_LOGIN')} />;
}

export default AppNavigator;
