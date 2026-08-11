# Ekranlar, Navigasyon Akışı ve Özellikler

Bağlam için önce [[00-START-HERE]] dosyasına bak. Dosya detayları için [[01-Architecture]].

## Navigasyon akışı

Kütüphanesiz, `src/navigation/AppNavigator.tsx` içinde elle yazılmış durum makinesi:

```
HOME (HomeScreen — oyun)
  └─ dişli ikonuna 3.5 sn içinde 10 dokunuş → ADMIN_LOGIN (AdminLoginScreen, mock decoy şifre)
       ├─ başarılı mock login → ACCOUNT (AccountScreen — gerçek kullanıcı adı/şifre girişi)
       │    ├─ zaten kayıtlı bir oturum varsa → form atlanır, otomatik → CONTACTS
       │    ├─ giriş/kayıt başarılı → CONTACTS (ContactsScreen — kişi listesi)
       │    │    ├─ bir kişiye dokun → CHAT_ROOM (ChatRoomScreen — o kişiyle 1-1 sohbet)
       │    │    │    └─ geri ok → CONTACTS
       │    │    └─ "Çıkış" → gerçekten Firebase oturumu kapanır (logoutAccount) → HOME
       │    └─ "Vazgeç" → HOME
       └─ "Vazgeç" → HOME
```

Android donanım geri tuşu: `ADMIN_LOGIN`/`ACCOUNT`/`CONTACTS` → `HOME`, `CHAT_ROOM` → `CONTACTS`.

**İki ayrı "giriş" katmanı olduğuna dikkat:** `ADMIN_LOGIN` hâlâ eski mock/decoy şifre kontrolü
(`admin`/`admin123`, gerçek kimlik doğrulama değil, sadece "gizli özelliğin var olduğunu gizleme"
katmanı). `ACCOUNT` ise ondan tamamen bağımsız, gerçek bir Firebase Auth hesabı — birini geçmek
diğerini atlamaz, ikisi de sırayla geçilmesi gereken ayrı adımlar.

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

## AdminLoginScreen — gizli girişin kapısı (decoy)

- Kullanıcı adı/şifre inputları, `authService.loginAdmin()` çağırıyor (gerçek backend değil, mock).
- Yükleniyor spinner'ı, satır içi hata mesajı.
- Başarılı → `onLoginSuccess()` (→ `ACCOUNT`), iptal → `onCancel()`.

## AccountScreen — gerçek hesap girişi/kaydı

- Mount → `getRestoredAccountUser()` ile sessizce kontrol: cihazda zaten gerçek (anonim olmayan)
  bir oturum varsa form hiç gösterilmeden `onAuthenticated()` çağrılır (kullanıcı her seferinde
  şifre girmek zorunda kalmaz — Firebase Auth oturumu AsyncStorage'da kalıcı).
- Yoksa kullanıcı adı + şifre formu: "Giriş Yap" / "Kayıt Ol" arasında geçiş yapılabilir.
- Kayıt: `registerAccount(username, password)` — kullanıcı adı dahili olarak sahte bir e-postaya
  çevrilip Firebase Auth email/şifre hesabı olarak oluşturuluyor, otomatik giriş yapılıyor.
- Giriş: `loginAccount(username, password)`.
- Başarılı olan her iki durumda da `onAuthenticated({ uid, username })` çağrılır → `CONTACTS`.
- "Vazgeç" → `onCancel()` (→ `HOME`).

## ContactsScreen — kişi listesi

- `account` prop olarak gelir (artık kendi başına auth yapmıyor, önceki adımda zaten giriş yapıldı).
  Üstte `@kullaniciadi` gösterilir.
- `subscribeToContacts()` ile kişi listesi canlı dinlenir (isme göre alfabetik sıralı).
- "+ Kişi Ekle" → modal: karşı tarafın **kullanıcı adı** girilir, `findUserByUsername()` ile aranır,
  bulunursa (kendin değilse) `addContact()` ile listene eklenir. **Tek yönlü** — karşı tarafın da
  seni görebilmesi için senin kullanıcı adını kendisi girmesi gerekir, otomatik karşılıklı ekleme
  yok.
- Bir kişiye dokununca `onOpenRoom(contact)` ile `CHAT_ROOM`'a geçilir.
- "Çıkış" → `logoutAccount()` (gerçekten Firebase oturumunu kapatır) sonra `onLogout()` ile
  `HOME`'a döner. Bir sonraki gizli girişte tekrar kullanıcı adı/şifre istenir.

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
- Kimlik artık **kullanıcı adı + şifreye bağlı**, cihaza değil — aynı hesapla başka bir telefonda
  giriş yapılınca aynı kişi listesi/sohbetler geri gelir (eski anonim + rastgele kod sistemi
  tamamen kaldırıldı, bkz. [[Changelog]]).
- Kişi ekleme sistemi ekstra bir doğrulama yapmıyor — kullanıcı adını bilen herkes o hesabı kişi
  olarak ekleyebilir ve varlığını öğrenebilir. Bkz [[04-Security-Notes]].
- **Şifre kurtarma yok.** Kullanıcı adı sahte bir e-postaya çevrildiği için Firebase'in "şifremi
  unuttum" e-posta akışı çalışmaz — şifresini unutan biri o hesaba bir daha giremez, yeni bir
  kullanıcı adıyla yeni hesap açmak zorunda kalır. Bkz [[04-Security-Notes]].
- Admin şifresi ve oyunun "gizli tetikleyici" mantığı istemci tarafında (JS bundle içinde) —
  reverse-engineering ile kolayca bulunabilir. Bkz [[04-Security-Notes]].
- **Henüz yok (planlanan sonraki aşamalar):** fotoğraf/görsel/video mesajı gönderme, görüntülü
  konuşma (hazır bir video SDK'sı ile yapılması kararlaştırıldı, henüz entegre edilmedi).
