import React, { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import HomeScreen from '../screens/HomeScreen';
import AdminLoginScreen from '../screens/AdminLoginScreen';
import ContactsScreen from '../screens/ContactsScreen';
import ChatRoomScreen from '../screens/ChatRoomScreen';
import { Contact } from '../services/contactService';

type Screen = 'HOME' | 'ADMIN_LOGIN' | 'CONTACTS' | 'CHAT_ROOM';

interface ActiveRoom {
  myUid: string;
  contact: Contact;
}

function AppNavigator(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('HOME');
  const [activeRoom, setActiveRoom] = useState<ActiveRoom | null>(null);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'ADMIN_LOGIN' || screen === 'CONTACTS') {
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
        onLoginSuccess={() => setScreen('CONTACTS')}
        onCancel={() => setScreen('HOME')}
      />
    );
  }

  if (screen === 'CONTACTS') {
    return (
      <ContactsScreen
        onOpenRoom={(myUid, contact) => {
          setActiveRoom({ myUid, contact });
          setScreen('CHAT_ROOM');
        }}
        onLogout={() => setScreen('HOME')}
      />
    );
  }

  if (screen === 'CHAT_ROOM' && activeRoom) {
    return (
      <ChatRoomScreen
        myUid={activeRoom.myUid}
        contact={activeRoom.contact}
        onBack={() => setScreen('CONTACTS')}
      />
    );
  }

  return <HomeScreen onAdminTriggerReached={() => setScreen('ADMIN_LOGIN')} />;
}

export default AppNavigator;
