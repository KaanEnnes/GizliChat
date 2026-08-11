# Ekranlar, Navigasyon Akışı ve Özellikler

Bağlam için önce [[00-START-HERE]] dosyasına bak. Dosya detayları için [[01-Architecture]].

## Navigasyon akışı

Kütüphanesiz, `src/navigation/AppNavigator.tsx` içinde elle yazılmış durum makinesi:

```
HOME (HomeScreen — oyun)
  └─ dişli ikonuna 3.5 sn içinde 10 dokunuş → ACCOUNT (AccountScreen — gerçek kullanıcı adı/şifre girişi)
       ├─ zaten kayıtlı bir oturum varsa → form atlanır, otomatik → CONTACTS
       ├─ giriş/kayıt başarılı → CONTACTS (ContactsScreen — kişi listesi)
       │    ├─ bir kişiye dokun → CHAT_ROOM (ChatRoomScreen — o kişiyle 1-1 sohbet)
       │    │    └─ geri ok → CONTACTS
       │    └─ "Çıkış" → gerçekten Firebase oturumu kapanır (logoutAccount) → HOME
       └─ "Vazgeç" → HOME
```

Android donanım geri tuşu: `ACCOUNT`/`CONTACTS` → `HOME`, `CHAT_ROOM` → `CONTACTS`.

**Eskiden burada iki ayrı "giriş" katmanı vardı** — dişli tetikleyicisi önce sahte/mock bir
`AdminLoginScreen` (decoy şifre, gerçek kimlik doğrulama değil) açıyordu, onu geçince gerçek
`AccountScreen`'e geçiliyordu. Bu decoy katmanı tamamen kaldırıldı (bkz. [[Changelog]]) — artık
gizli tetikleyici doğrudan gerçek Firebase Auth girişine açılıyor. Gizliliğin kaynağı hâlâ jestin
kendisi (dişliye 10 dokunuş) ve bunun görünmez olması, ama artık arkasında sahte bir şifre kontrolü
yok.

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
- Metin gönderimi `sendMessage(roomId, text, myUid)` ile.
- **Fotoğraf/video gönderme:** 📎 butonu bir seçim gösterir (Galeri / Kamera →
  `react-native-image-picker`); seçilen dosya `mediaService.uploadRoomMedia()` ile Storage'a
  yüklenir, sonra `sendMediaMessage(roomId, myUid, 'image'|'video', mediaUrl)` ile gönderilir.
- **Sesli mesaj:** 🎤 butonu basılı tutulduğu sürece kayıt yapar (`react-native-audio-recorder-player`
  singleton'ı), bırakınca kayıt durur, Storage'a yüklenir, süresi (saniye) ile birlikte
  `sendMediaMessage(..., 'audio', mediaUrl, durationSeconds)` ile gönderilir.
- **Arama:** header'daki 📞 (`startVoiceCall`) / 🎥 (`startVideoCall`) butonları
  `callService.ts` üzerinden Stream Video'da o kişiyle `ring: true` bir çağrı oluşturur — arama
  ekranı bu ekrandan değil, `CallProvider`'ın global `IncomingCallWatcher`'ı üzerinden açılır (bkz.
  aşağıdaki "Sesli/görüntülü arama" bölümü).
- Geri ok → `onBack()` ile `CONTACTS`'a döner.

## Sesli/görüntülü arama (Stream Video)

- `AppNavigator`, hesap girişi yapılmış her ekranı (`CONTACTS`, `CHAT_ROOM`) `CallProvider` ile
  sarmalar. `CallProvider`, o oturum için bir Stream Video client'ı kurar ve içine
  `IncomingCallWatcher`'ı yerleştirir.
- `IncomingCallWatcher`, Stream'in `useCalls()` hook'unu dinler; `ringing` durumundaki **herhangi
  bir** çağrıyı (hem bu cihazın az önce başlattığı giden arama, hem karşı taraftan gelen arama) tam
  ekran bir `Modal` içinde `CallScreen` olarak açar — yani arayan ve aranan aynı mekanizmayla
  ekranı görür, sadece Stream'in `RingingCallContent` bileşeni içeriği (arıyor/çalıyor) otomatik
  ayırt eder.
- `CallScreen`, `CallingState`'e göre iki aşama gösterir: `RINGING` → `RingingCallContent` (kabul
  et/reddet, arıyor animasyonu); `JOINED` → `CallContent` (kamera aç/kapa, mikrofon sustur, kapat)
  + üstte canlı süre sayaçlı "Görüşme sürüyor • mm:ss" banner'ı. `LEFT` olur olmaz `onLeave()`
  hemen çağrılır, ekstra bir "görüşme bitti" ekranı yok (kullanıcı isteği, ilk denemede vardı,
  kaldırıldı — bkz. [[Changelog]]).
- `startVoiceCall()`/`startVideoCall()` çağrı oluşturmadan önce `permissionsService.
  requestCallPermissions()` ile mikrofon (+ görüntülüyse kamera) izni ister; `CallProvider`'ın
  `IncomingCallWatcher`'ı da gelen bir çağrı tespit eder etmez aynı izni **aranan** taraf için de
  proaktif olarak istiyor (kabul et'e basılmadan önce izin hazır olsun diye).
  `startVideoCall()` ayrıca çağrı oluşturulur oluşturulmaz `call.camera.enable()` çağırır (sesli
  aramada bunun yerine `call.camera.disable()`); `CallScreen` da `JOINED` durumuna geçilince
  `call.microphone.enable()` çağırıyor (hem arayan hem aranan tarafında).
- **⚠️ BİLİNEN AÇIK SORUN: Sesli aramada ses gelmiyor.** Kamera fix'i (`camera.enable()`) video
  için işe yaramıştı, aynı mantıkla `microphone.enable()` denendi ama sorunu çözmedi — bkz.
  [[Changelog]] "Arama bitince direkt kapanma + mikrofon fix denemesi" kaydındaki araştırma
  notları. Bir sonraki oturumda gerçek zamanlı logcat ile devam edilmeli.
- **Elle yapılması gereken adım:** Stream Dashboard'da bir "Video & Audio" app oluşturup API
  key/secret'ı `src/config/streamConfig.ts`'e girmek gerekiyor, yoksa arama butonları sessizce
  başarısız olur. Detay: [[05-Build-Deployment]].
- **Test ederken dikkat:** Arama, kimliği hesaba bağlı bir özellik olduğu için **iki farklı cihazda
  aynı hesapla test edilemez** — Stream aynı `user_id`'nin iki oturumunu çakışan bir çağrı olarak
  görüp `"Cannot reject a call that has already been accepted"` gibi hatalar verir. Test için iki
  farklı hesap (iki cihazda ayrı ayrı kayıt olup birbirini kişi olarak eklemek) gerekir.

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
- Oyunun "gizli tetikleyici" mantığı (dişliye 10 dokunuş, 3.5 sn) istemci tarafında (JS bundle
  içinde) — reverse-engineering ile kolayca bulunabilir. Bkz [[04-Security-Notes]].
- Fotoğraf/video/sesli mesaj ve sesli/görüntülü arama artık var (yukarı bkz.). **Henüz yok:** grup
  sohbeti/araması (her şey hâlâ 1-1), medyayı cihaza indirme/galeriye kaydetme.
