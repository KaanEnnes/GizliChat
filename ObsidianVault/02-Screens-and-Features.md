# Ekranlar, Navigasyon Akışı ve Özellikler

Bağlam için önce [[00-START-HERE]] dosyasına bak. Dosya detayları için [[01-Architecture]].

## Navigasyon akışı

Kütüphanesiz, `src/navigation/AppNavigator.tsx` içinde elle yazılmış durum makinesi:

```
HOME (HomeScreen — oyun)
  └─ dişli ikonuna 3.5 sn içinde 10 dokunuş → ADMIN_LOGIN (AdminLoginScreen)
       ├─ başarılı mock login → CONTACTS (ContactsScreen — kişi listesi)
       │    ├─ bir kişiye dokun → CHAT_ROOM (ChatRoomScreen — o kişiyle 1-1 sohbet)
       │    │    └─ geri ok → CONTACTS
       │    └─ "Çıkış" → HOME
       └─ "Vazgeç" → HOME
```

Android donanım geri tuşu: `ADMIN_LOGIN`/`CONTACTS` → `HOME`, `CHAT_ROOM` → `CONTACTS`.

## HomeScreen — "BLOK ÇILGINLIĞI" oyunu (görünen yüz)

- 8x8 tahta, parçalar `PanResponder` + `Animated` ile sürüklenip bırakılıyor.
- 3 zorluk seviyesinde ağırlıklı rastgele parça üretimi.
- Satır/sütun temizleme mantığı ve skor sistemi var.
- **Ses efektleri:** parça yerleşiminde `playPlaceSound()`, satır temizlemede `playClearSound()`,
  oyun bitişinde `playGameOverSound()` (`soundService`, sadece Android).
- `bestScore` modül seviyesinde (React state değil) tutuluyor → ekran unmount/remount olsa da
  (admin/kişi ekranlarına gidip gelince) hayatta kalıyor, ama **uygulama tamamen kapatılınca
  sıfırlanıyor** (AsyncStorage'a yazılmıyor — `bestScore` ile leaderboard/oyuncu adı birbirinden
  bağımsız kalıcılık mekanizmaları kullanıyor).
- **Oyun bitince (leaderboard akışı):** `triggerGameOver(finalScore)` çağrılır. Daha önce
  `playerNameStorage`'da kayıtlı bir isim yoksa bir modal ile **bir kere** isim sorulur (kaydedilip
  bir daha sorulmaz); isim zaten kayıtlıysa hiçbir prompt olmadan otomatik olarak
  `leaderboardService.submitScore(name, finalScore)` çağrılır. Oyun bitti kartındaki "🏆 Skor
  Tablosu" butonu `fetchTopScores()` ile en yüksek 20 skoru bir modalda listeler.
- Gizli tetikleyici: köşedeki `⚙` ikonuna `REQUIRED_TAPS` (10) kez `TAP_RESET_MS` (3.5 sn) içinde
  dokununca `onAdminTriggerReached()` çağrılıyor.

## AdminLoginScreen — gizli girişin kapısı

- Kullanıcı adı/şifre inputları, `authService.loginAdmin()` çağırıyor (gerçek backend değil, mock).
- Yükleniyor spinner'ı, satır içi hata mesajı.
- Başarılı → `onLoginSuccess()` (→ `CONTACTS`), iptal → `onCancel()`.

## ContactsScreen — kişi listesi (gizli özelliğin yeni giriş noktası)

- Mount → `ensureAnonymousAuth()` → `ensureUserProfile()`: kullanıcının `users/{uid}` profili
  (isim + 6 haneli paylaşılabilir kod) getirilir/oluşturulur, üstte "Senin kodun: XXXXXX" olarak
  gösterilir.
- `subscribeToContacts()` ile kişi listesi canlı dinlenir (isme göre alfabetik sıralı).
- "+ Kişi Ekle" → modal: karşı tarafın kodu girilir, `findUserByCode()` ile aranır, bulunursa
  (kendi kodun değilse) `addContact()` ile listene eklenir. **Tek yönlü** — karşı tarafın da seni
  görebilmesi için senin kodunu kendisi girmesi gerekir, otomatik karşılıklı ekleme yok.
- Bir kişiye dokununca `onOpenRoom(myUid, contact)` ile `CHAT_ROOM`'a geçilir.
- "Çıkış" → `onLogout()` ile `HOME`'a döner (Firebase oturumu kapanmaz, sadece navigasyon).

## ChatRoomScreen — bir kişiyle 1-1 sohbet

- `getRoomId(myUid, contact.uid)` ile deterministik bir oda id'si hesaplanır (iki taraf da aynı
  odayı açar).
- `subscribeToMessages(roomId, ...)` (Firestore canlı dinleyici), `FlatList` + `MessageBubble` ile
  mesaj listesi, yeni mesajda otomatik aşağı kaydırma.
- Gönderim `sendMessage(roomId, text, myUid)` ile.
- Geri ok → `onBack()` ile `CONTACTS`'a döner.

## Önemli davranışsal notlar

- Artık **çok kişili, gerçek 1-1 sohbet odaları** var (eskiden tek paylaşılan oda vardı, bkz.
  [[Changelog]] — o eski model tamamen kaldırıldı). Her kişi çiftinin kendi izole `rooms/{roomId}`
  koleksiyonu var.
- Kişi ekleme sistemi kimlik doğrulaması yapmıyor — kod bilen herkes o kodun sahibini kişi olarak
  ekleyebilir ve varlığını (adını) öğrenebilir. Bkz [[04-Security-Notes]].
- Admin şifresi ve oyunun "gizli tetikleyici" mantığı istemci tarafında (JS bundle içinde) —
  reverse-engineering ile kolayca bulunabilir. Bkz [[04-Security-Notes]].
- **Henüz yok (planlanan sonraki aşamalar):** fotoğraf/görsel/video mesajı gönderme, görüntülü
  konuşma (hazır bir video SDK'sı ile yapılması kararlaştırıldı, henüz entegre edilmedi).
