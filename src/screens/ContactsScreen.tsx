import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addContact, Contact, subscribeToContacts } from '../services/contactService';
import { Account, findUserByUsername } from '../services/userService';

interface Props {
  account: Account;
  onOpenRoom: (contact: Contact) => void;
  onLogout: () => void;
}

function ContactsScreen({ account, onOpenRoom, onLogout }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToContacts(
      account.uid,
      nextContacts => {
        setContacts(nextContacts);
        setLoadError(null);
      },
      error => setLoadError(`Kişiler yüklenemedi: ${error.message}`),
    );
    return unsubscribe;
  }, [account.uid]);

  const handleAddContact = useCallback(async () => {
    if (adding) {
      return;
    }
    const usernameQuery = usernameDraft.trim();
    if (!usernameQuery) {
      setAddError('Bir kullanıcı adı gir.');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const found = await findUserByUsername(usernameQuery);
      if (!found) {
        setAddError('Bu kullanıcı adıyla bir hesap bulunamadı.');
        return;
      }
      if (found.uid === account.uid) {
        setAddError('Kendini ekleyemezsin.');
        return;
      }
      const nickname = nicknameDraft.trim() || found.username;
      await addContact(account.uid, found.uid, nickname);
      setAddModalVisible(false);
      setUsernameDraft('');
      setNicknameDraft('');
    } catch (error) {
      setAddError(`Kişi eklenemedi: ${(error as Error).message}`);
    } finally {
      setAdding(false);
    }
  }, [adding, usernameDraft, nicknameDraft, account.uid]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={styles.headerTitle}>Kişiler</Text>
          <Text style={styles.headerSubtitle}>@{account.username}</Text>
        </View>
        <Pressable onPress={onLogout} hitSlop={8}>
          <Text style={styles.logoutText}>Çıkış</Text>
        </Pressable>
      </View>

      {loadError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{loadError}</Text>
        </View>
      )}

      <FlatList
        data={contacts}
        keyExtractor={item => item.uid}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            Henüz kişin yok. Aşağıdan bir kullanıcı adı ile ekle.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.contactRow, pressed && styles.contactRowPressed]}
            onPress={() => onOpenRoom(item)}>
            <View style={styles.contactAvatar}>
              <Text style={styles.contactAvatarText}>{item.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <Text style={styles.contactName}>{item.name}</Text>
          </Pressable>
        )}
      />

      <Pressable
        style={[styles.addButton, { marginBottom: insets.bottom + 16 }]}
        onPress={() => {
          setAddError(null);
          setUsernameDraft('');
          setNicknameDraft('');
          setAddModalVisible(true);
        }}>
        <Text style={styles.addButtonText}>+ Kişi Ekle</Text>
      </Pressable>

      <Modal
        visible={addModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Kişi Ekle</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Kullanıcı adı"
              placeholderTextColor="rgba(245,245,247,0.4)"
              value={usernameDraft}
              onChangeText={setUsernameDraft}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              editable={!adding}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Takma ad (opsiyonel)"
              placeholderTextColor="rgba(245,245,247,0.4)"
              value={nicknameDraft}
              onChangeText={setNicknameDraft}
              maxLength={24}
              editable={!adding}
              onSubmitEditing={handleAddContact}
            />
            {addError && <Text style={styles.errorTextModal}>{addError}</Text>}
            <Pressable
              style={[styles.submitButton, adding && styles.submitButtonDisabled]}
              onPress={handleAddContact}
              disabled={adding}>
              {adding ? (
                <ActivityIndicator color="#0F1115" />
              ) : (
                <Text style={styles.submitButtonText}>Ekle</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.cancelButton}
              onPress={() => setAddModalVisible(false)}
              disabled={adding}>
              <Text style={styles.cancelButtonText}>Vazgeç</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1115',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: {
    color: '#F5F5F7',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: 'rgba(245,245,247,0.45)',
    fontSize: 12,
    marginTop: 2,
  },
  logoutText: {
    color: '#FF6B6B',
    fontSize: 14,
  },
  errorBanner: {
    backgroundColor: 'rgba(255,107,107,0.12)',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  errorBannerText: {
    color: '#FF6B6B',
    fontSize: 12.5,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    flexGrow: 1,
  },
  emptyText: {
    color: 'rgba(245,245,247,0.4)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 40,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1F2A',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  contactRowPressed: {
    opacity: 0.75,
  },
  contactAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#3B7CFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  contactAvatarText: {
    color: '#0F1115',
    fontSize: 16,
    fontWeight: '800',
  },
  contactName: {
    color: '#F5F5F7',
    fontSize: 15,
    fontWeight: '600',
  },
  addButton: {
    marginHorizontal: 16,
    backgroundColor: '#3B7CFF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#0F1115',
    fontSize: 15,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10,11,15,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1C1F2A',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalTitle: {
    color: '#F5F5F7',
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalInput: {
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
  errorTextModal: {
    color: '#FF6B6B',
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
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

export default ContactsScreen;
