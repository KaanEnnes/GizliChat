# Servisler ve Backend (Firebase)

Bağlam için önce [[00-START-HERE]] dosyasına bak.

## Backend

Google Firebase projesi `kaanchatmercan` (config: `src/config/firebaseConfig.ts`). İki Firebase
servisi kullanılıyor, hiçbir custom backend/API sunucusu yok:

- **Auth** — **iki farklı kullanım şekli aynı anda var:**
  1. Anonim giriş (`signInAnonymously`) — sadece skor tablosuna (`highscores`) yazma izni için,
     `leaderboardService.submitScore()` içinde otomatik tetikleniyor.
  2. Email/şifre giriş (`createUserWithEmailAndPassword`/`signInWithEmailAndPassword`) — kişi/sohbet
     sisteminin gerçek kimliği. Kullanıcı asla gerçek bir e-posta görmüyor: girdiği "kullanıcı adı"
     dahili olarak `kullaniciadi@gizlichat.local` sahte adresine çevrilip Firebase'e email/şifre
     hesabı gibi veriliyor (`src/services/userService.ts`).

  **⚠️ Firebase Console'da Authentication → Sign-in method altında "Email/Password" sağlayıcısının
  etkinleştirilmesi gerekiyor** — bu repodan yapılamaz, elle bir adım (bkz. [[05-Build-Deployment]]).
  Anonim giriş muhtemelen daha önceden zaten etkindi (chat sistemi ilk hâliyle ona dayanıyordu).

- **Firestore** — `users`, `users/{uid}/contacts`, `rooms/{roomId}` (+ `messages`, `game`
  altkoleksiyonları), `chessRooms`, `highscores`, `app_config` koleksiyonları.
- **Storage** — `rooms/{roomId}/media/{image|video|audio|file}/` altında sohbet medyası
  (`src/services/mediaService.ts`). Erişim kontrolü `storage.rules`'ta (bkz. aşağıda).
- **Fonksiyonlar dışı bir "istemci":** `pc-client/index.html` (2026-08-16'da eklendi), aynı
  `kaanchatmercan` Firebase projesine mobil uygulamayla **birebir aynı yöntemle** (aynı config, aynı
  kullanıcı adı→sahte e-posta auth şeması) bağlanan, build'siz tek bir HTML dosyası — ayrı bir backend
  değil, sadece ikinci bir istemci. Detay: [[01-Architecture]] → "PC istemcisi".

## Auth akışı

**Skor gönderme (anonim, hafif):** `leaderboardService.submitScore()` içinde
`ensureAnonymousAuth()` çağrılır — zaten herhangi bir oturum (anonim veya gerçek hesap) varsa hiçbir
şey yapmaz, yoksa sessizce anonim giriş yapar. Oyunu oynayan ama gizli sohbete hiç girmeyen
kullanıcılar için leaderboard'un çalışmasını sağlayan tek amaç bu.

**Hesap girişi (gerçek, kalıcı — kişi/sohbet sistemi):** `src/screens/AccountScreen.tsx` →
`src/services/userService.ts`:
1. `registerAccount(username, password)` — `usernameToEmail()` ile sahte e-postaya çevrilip
   `createUserWithEmailAndPassword` çağrılır, sonra `users/{uid}`'e `{ username, usernameLower,
   createdAt }` yazılır.
2. `loginAccount(username, password)` — aynı sahte e-posta ile `signInWithEmailAndPassword`,
   sonra `users/{uid}`'den kayıtlı `username` okunur.
3. Bu oturum da `initializeAuth`'un AsyncStorage kalıcılığı sayesinde uygulama kapatılıp
   açıldığında korunur — ama artık **hesap kimliği kullanıcı adı+şifreye bağlı, cihaza değil**:
   aynı bilgilerle başka bir telefonda giriş yapan biri aynı `uid`'e, dolayısıyla aynı kişi
   listesine ve sohbetlere ulaşır.
4. `logoutAccount()` (`ContactsScreen`'deki "Çıkış") gerçekten `signOut(auth)` çağırır — bir
   sonraki gizli girişte tekrar kullanıcı adı/şifre istenir.

## Firestore veri modeli

### `users/{uid}` — kullanıcı hesabı profili (kişi sistemi)

```ts
{
  username: string;         // orijinal büyük/küçük harfle, ekranda gösterilen
  usernameLower: string;    // küçük harfli, findUserByUsername() sorgusunun eşleştirdiği alan
  createdAt: number;
  photoUrl?: string;        // 2026-08-16'da eklendi — profil fotoğrafı, base64 data URI (Storage'sız)
  videoBytesUsed?: number;  // 2026-08-16'da eklendi — video/dosya yükleme kotası sayacı (bkz. aşağıda)
  lastActiveAt?: Timestamp; // 2026-08-14'te eklendi — presence/çevrimiçi göstergesi (bkz. aşağıda)
  fcmToken?: string;        // ESKİ (v8.7'de bırakıldı) tek cihazlık push token'ı — artık her cihaz
                            // ayrı bir dokümana yazıyor: users/{uid}/fcmTokens/{token}
                            // ({platform, updatedAt}). Tek alan olduğu sürece telefon ve PC
                            // birbirinin token'ının üzerine yazıp diğerini bildirimsiz bırakıyordu.
                            // Cloud Function (onNewMessage) tüm token'lara sendEachForMulticast ile
                            // gönderiyor; bu eski alan sadece geçiş dönemi yedeği olarak okunuyor.
  notificationsEnabled?: boolean; // Ayarlar'daki bildirim aç/kapa tercihinin sunucu tarafı kopyası —
                                    // functions/'taki Cloud Function push gönderirken buna bakıyor
}
```

- Doküman `registerAccount()` sırasında bir kere yazılıyor; isim değiştirme UI'ı hâlâ yok ama yukarıdaki
  ek alanlar (`photoUrl`, `videoBytesUsed`, `lastActiveAt`, `fcmToken`, `notificationsEnabled`) sonradan
  `{merge: true}` ile parça parça yazılıyor.
- 2026-08-16'da eklendi: `updateProfilePhoto(uid, dataUriOrNull)` — `photoUrl`'i yazar/temizler.
  `subscribeToUserProfile(uid, cb)` — `photoUrl`/`videoBytesUsed`'i canlı dinler (`Avatar.tsx`,
  `StorageQuotaBanner`). `addVideoBytesUsed(uid, bytes)` — `increment()` ile `videoBytesUsed`'i
  artırır, video ya da genel dosya mesajı her gönderildiğinde çağrılır. `VIDEO_STORAGE_QUOTA_BYTES`
  (5120 × 1024 × 1024, 5 GB) sabiti sadece UI'da bir oran/uyarı için kullanılıyor — **sunucu
  tarafında uygulanan bir sert limit değil**, `firestore.rules` yükleme miktarını kısıtlamıyor.
- `findUserByUsername(username)` — `where('usernameLower', '==', ...)` sorgusu, kişi eklerken
  kullanılıyor. Kullanıcı adının **benzersizliği Firebase Auth tarafından garanti ediliyor** (aynı
  sahte e-posta ile ikinci kayıt `auth/email-already-in-use` hatası alır) — eski rastgele kod
  sisteminin aksine çakışma ihtimali yok.

### `users/{uid}/contacts/{contactUid}` — kişi listesi

```ts
{
  name: string;      // takma ad (eklerken girilen, veya bulunan kullanıcının kayıtlı adı)
  addedAt: number;
  favorite: boolean; // 2026-08-14'te eklendi — ContactsScreen'in "Favoriler" satırı için
}
```

- `addContact()` / `subscribeToContacts()` / `setContactFavorite()` (`src/services/contactService.ts`).
- **Tek yönlü**: sadece ekleyen tarafın kendi `contacts` alt koleksiyonuna yazılır, karşı tarafa
  otomatik olarak hiçbir şey eklenmez.

### Presence / çevrimiçi göstergesi (2026-08-14'te eklendi)

Gerçek bir online/offline event sistemi değil, hafif bir "son ne zaman aktifti" mekanizması:

- `src/services/userService.ts` → `updatePresenceHeartbeat(uid)`, `users/{uid}.lastActiveAt`'i
  `serverTimestamp()` ile günceller (`{merge: true}`). `AppNavigator`, hesap girişliyken bunu 25
  saniyede bir çağırır.
- `subscribeToPresence(uid, cb)` başka bir kullanıcının `lastActiveAt`'ini dinler; `cb` ham bir
  zaman damgası (ms) veya `null` alır — "çevrimiçi mi" kararını **çağıran taraf** verir
  (`ONLINE_THRESHOLD_MS` = 60.000 ms sınırıyla), çünkü bir Firestore dinleyicisi sadece yeni bir
  yazma olduğunda tekrar tetiklenir, salt zaman geçmesiyle değil — `ContactsScreen` bu yüzden ayrıca
  20 saniyede bir "şu an kaç" diye yeniden değerlendiren bir zamanlayıcı tutuyor.
- Firestore kuralı değişikliği gerekmedi — `users/{userId}` için zaten "sahibi güncelleyebilir,
  herkes (giriş yapmış) okuyabilir" kuralı var.

### `rooms/{roomId}` — oda dokümanı (2026-08-18'de eklendi, sabitlenmiş mesaj işaretçisi)

```ts
{
  pinnedMessageId?: string; // pinMessage()/unpinMessage() — odada aynı anda en fazla bir sabit mesaj
}
```

- `chatService.pinMessage(roomId, messageId)` / `unpinMessage(roomId)` — `ChatRoomScreen`'deki uzun
  basma menüsünün "Sabitle"/"Sabiti Kaldır" seçeneği. Öncesinde bu doküman sadece `messages`
  altkoleksiyonunun ebeveyni olarak var olurdu (kendi alanı yoktu); artık gerçek bir içerik taşıyor.
  Erişim kuralı mesajlarla aynı: `isRoomMember(roomId)`.

### `rooms/{roomId}/game/{ticTacToe|chess}` — sohbetteki kişiye karşı canlı oyun durumu (2026-08-16/17)

```ts
// doküman id: 'ticTacToe' ya da 'chess', odada aynı anda tek bir aktif oyun
// XOX:
{ board: (Mark|null)[9]; playerX: string; playerO: string; turnUid: string; status: 'active'|'finished'; outcome: 'x'|'o'|'draw'|null; updatedAt: Timestamp }
// Satranç:
{ fen: string; playerWhite: string; playerBlack: string; status: 'waiting'|'active'|'finished'; outcome: 'white'|'black'|'draw'|null; updatedAt: Timestamp }
```

- `src/services/ticTacToeService.ts` / `src/services/chessService.ts` (contact mode). İki cihaz da
  aynı dokümanı `onSnapshot` ile dinleyip aynı dokümana yazıyor — mesajlarla aynı "paylaşılan doküman,
  istemciler arasında hakemsiz" modeli: bir hamlenin gerçekten legal/sırası kendinde mi olduğu
  **istemci tarafında** kontrol ediliyor (`ticTacToeService.playMove`, `chess.js`'in `Chess.move()`'u),
  `firestore.rules` bunu **doğrulamıyor** — bkz. aşağıda "Firestore Security Rules" ve
  [[04-Security-Notes]].
- `src/components/OnlineTicTacToeModal.tsx` / `ChessContactModal.tsx` bu dokümanları `ChatRoomScreen`
  içinden açılan modal'lar olarak render ediyor.

### `chessRooms/{code}` — oda kodlu, kişi listesinden bağımsız satranç (2026-08-17'de eklendi)

```ts
{
  fen: string;
  playerWhite: string;  // odayı kuran
  playerBlack: string;  // ikinci oyuncu katılana kadar boş string
  status: 'waiting' | 'active' | 'finished';
  outcome: 'white' | 'black' | 'draw' | null;
  updatedAt: Timestamp;
}
```

- Doküman id'si 5 karakterlik, kolay okunur bir kod (`CODE_CHARS` — 0/O/1/I karıştırılmasın diye
  hariç). `createChessRoom()` (rastgele kod üretip çakışma ihtimaline karşı 3 deneme yapar),
  `joinChessRoom()` (iki kişinin aynı anda `playerBlack` doldurmasını önlemek için `runTransaction`
  kullanır), `restartChessRoom()`, `playRoomChessMove()` (`src/services/chessService.ts`, "room-code
  mode").
- **Kişi listesinden tamamen bağımsız** — kodu bilen **herkes** katılabilir, hatta gizli sohbete hiç
  girmemiş (sadece anonim auth'lu) biri bile: `firestore.rules`'ta `chessRooms` okuma/oluşturma/
  güncelleme `isSignedIn()` yeterli (anonim dahil), `isRoomMember`/kişi listesi kontrolü **yok**. Bu,
  projedeki genel "gizli sohbet kişi listesine bağlı" modelinin bilinçli bir istisnası — bkz.
  [[04-Security-Notes]].

### `rooms/{roomId}/messages/{messageId}` — 1-1 sohbet mesajları

```ts
{
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'call' | 'chess' | 'song' | 'location';
  text: string;            // sadece type: 'text' için doldurulur
  senderId: string;        // Firebase uid
  createdAt: Timestamp;
  mediaUrl?: string;       // image/video/audio/file için Firebase Storage indirme URL'i
  durationSeconds?: number; // sadece audio için, oynatıcı UI'ında gösterilir
  hidden?: boolean;        // image/video için — true ise MessageBubble bir örtü/blur gösterir,
                            // alıcı dokununca sınırsız kez açılabilir ("gizli video/fotoğraf")
  fileName?: string;       // sadece type: 'file' için — orijinal dosya adı
  fileSize?: number;       // sadece type: 'file' için — bayt cinsinden boyut
  replyTo?: {               // 2026-08-20'de eklendi — kaydırarak/uzun-basarak yanıtlama
    messageId: string;
    text: string;
    senderId: string;
    type: MessageType;
  };
  // --- sadece type: 'call' için ---
  callVideo?: boolean;
  callStatus?: 'completed' | 'missed' | 'declined';
}
```

- `type: 'call'` — bitmiş bir aramanın sohbet kaydı. Doküman kimliği rastgele DEĞİL, `call_<streamCallId>`:
  arayan ve aranan cihaz aramanın bittiğini birbirinden bağımsız fark edip ikisi de yazdığı için
  paylaşılan bir kimlik gerekiyor, yoksa her arama sohbette iki kez görünürdü. Bu yüzden
  `sendCallLogMessage()` düz bir `merge` değil, bir **transaction**: `senderId` her iki tarafta da
  ARAYANIN uid'si (yön oku yazma yarışına göre değişmesin diye), durum asla geriye düşmüyor
  (`completed` > `declined` > `missed`) ve süre iki tarafın gördüğü en uzun değer oluyor.
  `createdAt` yalnızca ilk yazan tarafından damgalanır ki kayıt sohbette yerinden oynamasın.

- `type: 'location'` (2026-09-06'da eklendi) — `latitude`/`longitude` (mevcut konum, hiç
  değişmez) veya `liveLocation: true` + `liveExpiresAt` (canlı konum — aynı dokümanın
  `latitude`/`longitude`'u sender tarafından periyodik üzerine yazılır). `firestore.rules`'ta
  bunun için özel bir carve-out var (bkz. aşağıda "Firestore Security Rules"). Sadece mobil
  istemcide var. Detay: [[02-Screens-and-Features]], [[Changelog]].
- `type: 'file'` (2026-08-20'de eklendi) — resim/video dışında herhangi bir dosya; `react-native-
  documents/picker` ile seçilip `mediaService.uploadRoomMedia(roomId, 'file', ...)` ile Storage'a
  yükleniyor. Alıcı tarafta `react-native-blob-util` ile cihazın İndirilenler klasörüne
  kaydedilebiliyor.
- `hidden` alanı sadece `image`/`video` mesajlarında anlamlı; UI tarafındaki "gizli video" özelliği
  bu alana dayanıyor (uygulamanın genel "Gizli" temasıyla aynı isim ama farklı bir mekanizma —
  şifreleme değil, sadece istemci tarafında bir reveal-overlay).

- `roomId = getRoomId(uidA, uidB)` — iki uid sıralanıp `__` ile birleştiriliyor, hangi taraf
  başlatırsa başlatsın aynı id çıkıyor (`src/services/chatService.ts`).
- Sorgu: `orderBy('createdAt', 'asc')`, `MESSAGE_LIMIT = 300`.
- `subscribeToMessages(roomId, ...)` (`onSnapshot` canlı dinleyici), `sendMessage(roomId, text,
  senderId)` (metin, `type: 'text'`) ve `sendMediaMessage(roomId, senderId, type, mediaUrl,
  durationSeconds?)` (fotoğraf/video/ses, `addDoc` + `serverTimestamp()`).
- Medya dosyasının kendisi burada değil, Storage'da (`rooms/{roomId}/media/...`) tutulur; bu alanda
  sadece indirme URL'i saklanır (bkz. aşağıda "Storage" bölümü).
- **Eski model artık yok:** önceden tüm uygulama tek sabit `messages` koleksiyonunu paylaşıyordu
  (2 kişilik, odasız). O koleksiyondaki eski veriler Firestore'da duruyor olabilir ama hiçbir kod
  artık ona bakmıyor/yazmıyor — migrate edilmedi, orphan veri.

### `highscores/{id}` — herkese açık skor tablosu

```ts
{
  name: string;    // playerNameStorage'da (AsyncStorage) saklanan, oyunda bir kere sorulan isim
  score: number;
  game: string;    // 2026-08-17'de eklendi — GameHubScreen'in GameKey'i, hangi oyunun skoru olduğunu ayırt eder
  createdAt: Timestamp;
}
```

- `submitScore(name, score, game)` / `fetchTopScores(game)` (`src/services/leaderboardService.ts`,
  top 20, skora göre azalan, `game` alanına göre filtreli sorgu). Öncesinde tek bir karma tablo vardı
  (2026-08-17'de oyun bazlı hâle getirildi, bkz. [[Changelog]]) — XOX/Satranç bu tabloya hiç skor
  yazmıyor (kazan/kaybet/berabere odaklı, sayısal skorları yok).
- Kullanıcı kimliğine bağlı değil, herkes herkesin skorunu görebilir; silme/moderasyon yok.

## Fotoğraf ve sesli mesajlar — Storage YOK, doğrudan Firestore (base64)

Fotoğraflar ve sesli mesajlar Firebase Storage'a hiç uğramıyor — bilinçli bir tercih: Storage,
Firebase projesini Blaze (ücretli) plana geçirmeyi gerektiriyor, bu proje Spark (ücretsiz) planda
kalmak istiyor.

- **Fotoğraf:** `ChatRoomScreen.tsx`'teki `handlePickMedia`, `react-native-image-picker`'ın
  `maxWidth: 1280, maxHeight: 1280, quality: 0.7, includeBase64: true` seçenekleriyle fotoğrafı
  cihazda küçültüp sıkıştırıyor, `data:image/jpeg;base64,...` bir URI oluşturuyor.
- **Sesli mesaj:** `ChatRoomScreen.tsx`'teki `handleStopRecording`, kaydedilen dosyayı
  `mediaService.localFileToDataUri()` ile (`fetch` + `Blob` + `FileReader.readAsDataURL()`)
  `data:audio/...;base64,...` bir URI'ye çeviriyor. (İlk halinde bu unutulup sesli mesajlar hâlâ
  Storage'a gönderiliyordu, kullanıcı testinde fark edilip düzeltildi — bkz. [[Changelog]].)

İkisi de bu URI'yi **doğrudan** `sendMediaMessage(roomId, myUid, type, dataUri, ...)` ile Firestore
mesaj dokümanının `mediaUrl` alanına yazıyor. `MessageBubble.tsx`'teki `<Image>`/`AudioMessagePlayer`
normal bir HTTPS URL'i ile bir data URI'yi ayrım yapmadan render ettiği için ekran tarafında ekstra
bir kod gerekmedi. Firestore'un tek doküman limiti 1 MiB olduğundan `ChatRoomScreen.tsx`'te bir
`MAX_INLINE_MEDIA_DATA_URI_LENGTH` (900.000 karakter, fotoğraf ve ses için ortak) güvenlik sınırı
var; aşılırsa kullanıcıya hata gösterilip gönderim iptal edilir. Bu yaklaşımın firestore kurallarına
bir etkisi yok — mesaj alanları zaten `isRoomMember(roomId)` kuralına tabi, içeriğin base64 olması
ekstra bir kural gerektirmiyor.

## Video mesajları — hâlâ Firebase Storage üzerinden

Fotoğrafın aksine video dosyaları base64/Firestore için pratik değil (dosyalar çok büyük, 1 MiB
limitini kolayca aşar). Video mesajları hâlâ eski yöntemle gidiyor: `src/services/mediaService.ts`
→ `uploadRoomMedia(roomId, 'video', localUri, 'mp4')`, `rooms/{roomId}/media/video/` yoluna yükler,
`getDownloadURL()` ile bir indirme URL'i döner, bu URL `mediaUrl` alanına yazılır. **Bu yüzden video
mesajı göndermek isteyen biri hâlâ Firebase Storage'ın aktif olmasına (Blaze plan) ve
`storage.rules`'ın deploy edilmiş olmasına ihtiyaç duyar** — fotoğraf bundan artık muaf. Erişim
kontrolü `storage.rules`'ta: `firestore.rules`'daki `isRoomMember(roomId)` ile birebir aynı mantık
(roomId'yi `__` ile ayırıp uid'lerden biriyle eşleştiriyor). Bu dosya da `firestore.rules` gibi
sadece bir metin dosyası — Firebase Console'a elle deploy edilmedikçe hiçbir etkisi yok, bkz.
[[05-Build-Deployment]].

## `app_config/{configId}` — uygulama içi güncelleme yapılandırması (2026-08-20'de eklendi)

```ts
// doküman id: 'android'
{
  versionCode: number;   // android/app/build.gradle'daki versionCode ile karşılaştırılır
  versionName: string;   // banner'da gösterilen "1.2.3" gibi metin
  apkUrl: string;        // Firebase Hosting'e deploy edilmiş APK'nın herkese açık URL'i
  notes?: string;        // "Neler yeni" metni, banner'ın altında gösterilir
}
```

- `src/services/updateService.ts` uygulama açılışında bu dokümanı okuyup (`fetchLatestVersion()`)
  cihazın kurulu `versionCode`'uyla (`react-native-device-info`) karşılaştırıyor; daha yeni bir sürüm
  varsa `src/components/UpdateBanner.tsx` bir "Yeni sürüm hazır" bandı gösteriyor. "Güncelle"ye
  basılınca APK `react-native-fs` ile indirilip (ilerleme çubuğu ile) `NativeModules.ApkInstaller`
  (`android/app/src/main/java/com/mobile/ApkInstallerModule.kt`) ile sistem paket yükleyicisine
  teslim ediliyor (`FileProvider`, `res/xml/file_paths.xml`).
- **Firestore kuralı bilerek salt-okunur:** `firestore.rules`'ta `app_config/{configId}` için
  `allow read: if isSignedIn(); allow write: if false;` — bu doküman **hiçbir zaman** istemciden ya da
  Admin SDK/CLI'dan otomatik yazılmıyor, sadece Firebase Console'dan elle güncelleniyor (projenin
  diğer "Console-only" adımlarıyla aynı bilinçli desen). Yayınlama akışı:
  1. `android/app/build.gradle`'da `versionCode`/`versionName` artırılıp release APK derlenir
     (`gradlew assembleRelease`).
  2. Derlenen APK, proje kökündeki `public/` klasörüne `app-release-X.Y.Z.apk` adıyla kopyalanır
     (her sürüm için farklı dosya adı) ve `firebase deploy --only hosting` ile
     `https://kaanchatmercan.web.app/app-release-X.Y.Z.apk` adresine yayınlanır. `public/*.apk`
     `.gitignore`'da — bu ikili dosyalar asla commit edilmez, sadece hosting'e deploy edilir.
  3. Firebase Console → Firestore Database → `app_config` → `android` dokümanı elle
     `versionCode`/`versionName`/`apkUrl`/`notes` ile güncellenir (bkz.
     `GUNCELLEME-ELLE-ADIM.txt`/`YAPILACAKLAR.txt` madde 6). Bu adım atlanırsa yeni APK yayında olsa
     bile eski cihazlarda banner ya hiç çıkmaz ya da yanlış sürüme işaret eder.
  Detay/komutlar: [[05-Build-Deployment]].

## Sesli/görüntülü arama (Stream Video)

Firebase'den tamamen ayrı, üçüncü parti bir servis: [Stream Video](https://getstream.io/video/).
`src/services/callService.ts`:
- `getOrCreateStreamClient(uid, username)` — `StreamVideoClient.getOrCreateInstance()`, aynı uid
  için tekrar çağrılırsa aynı client instance'ını döner (SDK'nın kendi cache'i).
- `disconnectStreamClient()` — çıkışta (`userService.logoutAccount()`) çağrılır. `getOrCreateInstance`
  uid başına önbelleğe alıp kendiliğinden kapanmadığı için, bu olmadan önceki hesap Stream'e bağlı
  kalıyor ve bir sonraki hesabın oturumunun üstüne tam ekran gelen-arama açabiliyordu.
- Token üretimi backend olmadığı için **cihazda** yapılıyor: `generateStreamToken(uid)`, `crypto-js`
  ile `STREAM_CONFIG.apiSecret` kullanarak elle bir HS256 JWT (`{user_id, iat, exp}`) imzalıyor;
  `exp` 24 saat (Stream `tokenProvider`'ı süresi dolmadan yenisini istiyor). Normalde bu bir sunucu
  sorumluluğu — bkz. [[04-Security-Notes]] "Stream arama token'ları".
- `startVoiceCall()`/`startVideoCall()` — `client.call('default', callId).getOrCreate({ ring: true,
  data: { members: [...], custom: { isVideo } } })`. `custom.isVideo`, alıcının katılmadan önce
  aramanın türünü öğrenebilmesinin tek yolu; `CallScreen` bunu `useCallCustomData()` ile okur.
- **`callId` üretimi (`buildCallId`) — iki ayrı tuzak, ikisi de yaşandı:**
  1. Stream arama kimlikleri KALICI. Bitmiş bir aramanın kimliğiyle `getOrCreate` çağrılırsa aynı,
     sonlanmış arama nesnesi döner ve ÇALMAZ. Eski kimlik (`[uidA, uidB].sort().join('-')` + tür)
     kişi başına sabit olduğu için bir kişiyle sadece İLK arama çalışıyordu; ayrıca sohbetteki
     `call_<callId>` kayıt dokümanı da her aramada üzerine yazıldığı için arama geçmişi hiç
     birikmiyordu. Çözüm: kimliğe rastgele bir sonek.
  2. Kimlik **en fazla 64 karakter**; aşarsa Stream `400 "id must be at maximum 64 characters in
     length"` döner ve arama hiç başlamaz. İki tam 28 karakterlik Firebase uid'i + tür zaten 63
     karakterdi — sınırın TAM bir altı — yani (1)'in ilk denemesinde eklenen sonek her aramayı
     bozdu. Çözüm: her uid'in ilk 8 karakteri (~34 karakter) + `MAX_CALL_ID_LENGTH` kırpması.
- Stream tarafında ayrı bir kullanıcı/erişim modeli var (Firebase Auth'tan bağımsız) — her cihaz,
  Firebase uid'ini Stream'e de "user id" olarak veriyor, böylece iki sistem aynı kimliği paylaşıyor
  ama birbirinden habersiz çalışıyor (chat/admin auth'un birbirinden bağımsız olmasına benzer bir
  desen, bkz. [[02-Screens-and-Features]]).
- **Elle yapılması gereken adım:** Stream Dashboard'da (https://dashboard.getstream.io) bir "Video &
  Audio" app oluşturup API Key + Secret'ı `src/config/streamConfig.ts`'e girmek gerekiyor. Detay:
  [[05-Build-Deployment]].

## Firestore Security Rules — repoda VAR, `firebase.json` üzerinden deploy edilebiliyor

`firestore.rules` (proje kökünde) bu uygulamanın gerçek erişim kontrol kurallarını tanımlıyor. Bu
dosya sadece bir metin dosyası — **Firebase CLI ile `firebase deploy` çalıştırılmadıkça ya da elle
Console'a yapıştırılmadıkça hiçbir etkisi olmaz**, kod bu dosyayı otomatik olarak Firebase'e
göndermiyor. **Not:** proje artık bir `firebase.json` içeriyor (firestore/storage rules, `functions/`,
`public/`'i Hosting kaynağı olarak tanımlıyor) — `firebase deploy --only firestore:rules` (CLI kurulup
`firebase login` yapıldıktan sonra) doğrudan çalışır, ayrıca `firebase init` gerekmez; Console'dan elle
yapıştırma da hâlâ geçerli bir alternatif. Deploy adımları için [[05-Build-Deployment]] → "Firestore
kurallarını deploy etme" bölümüne bak.

Kuralların özeti:
- `users/{uid}`: Herkes (giriş yapmış = anonim dahil) okuyabilir — çünkü kişi eklerken kullanıcı
  adıyla arama (`findUserByUsername`) buna ihtiyaç duyuyor. Sadece profilin sahibi kendi profilini
  oluşturabilir/güncelleyebilir (bu, 2026-08-16'da eklenen `photoUrl`/`videoBytesUsed` gibi alanlar
  için de geçerli — hepsi aynı "sahibi güncelleyebilir" kuralının kapsamında, ayrı bir kural gerekmedi).
- `users/{uid}/contacts/**`: Tamamen özel, sadece sahibi okuyabilir/yazabilir.
- `rooms/{roomId}`: Oda dokümanı (sabitlenmiş mesaj işaretçisi) — sadece `isRoomMember(roomId)`
  okuyabilir/yazabilir.
- `rooms/{roomId}/messages/**`: Sadece `roomId`'nin içindeki iki uid'den biri olan kullanıcı
  okuyabilir/yazabilir (`roomId = uidA__uidB`, kurallar bunu `split('__')` ile doğruluyor). Mesajlar
  temelde eklenebilir/güncellenemez, ama 2026-08-18/20'de eklenen **dar carve-out**'lar var (her biri
  `affectedKeys().hasOnly([...])` ile sadece o alanlara izin veriyor): (1) emoji tepkisi — bir üye
  sadece kendi `reactions.{uid}` anahtarını yazabilir; (2) iletildi/okundu tikleri — sadece **karşı**
  üye (gönderenin kendisi değil) `deliveredAt`/`readAt`'i damgalayabilir; (3) düzenleme — sadece
  gönderen, sadece `type: 'text'`, sadece henüz silinmemiş bir mesajın `text`+`editedAt`'ini
  yazabilir; (4) silme — sadece gönderen, `deleted`'i `true`'ya çevirip aynı anda
  `text`/`mediaUrl`/`fileName`/`fileSize`'ı temizleyebilir. Mesajlar hâlâ **silinemez** (Firestore
  doküman olarak), sadece bu carve-out'larla "soft" güncellenebilir; `allow delete: if false` aynen
  duruyor. 2026-09-06'da **arama kaydı için iki carve-out daha** eklendi: (a) `create` — `senderId`
  normalde `request.auth.uid` olmak zorunda, ama arama kaydında ARAYANIN uid'si yazıldığı için alıcı
  kendi olmadığı bir mesajı oluşturuyor; bu yüzden `type == 'call'` + `call_` önekli doküman kimliği
  + `senderId`'in odanın üyelerinden biri olması (`isRoomParticipant`) şartıyla izin veriliyor.
  (b) `update` — ikinci yazan cihazın SADECE `callStatus`/`durationSeconds`/`callVideo` alanlarını
  uzlaştırmasına izin var. Bu kural eklenmeden önce alıcının yazısı sessizce reddediliyordu, yani
  arayanın uygulaması kaydı yazamadıysa (çöktü/kapandı/çevrimdışıydı) sohbette hiç kayıt kalmıyordu.
  2026-09-06'da **canlı konum için bir carve-out daha (#7)** eklendi ve deploy edildi: sadece
  mesajın `senderId`'si, `type == 'location'` bir mesajın SADECE `['latitude','longitude']` ya da
  SADECE `['liveLocation','liveExpiresAt']` alanlarını güncelleyebiliyor — bu olmadan canlı konum
  güncelleme/durdurma sessizce `permission-denied` alıyordu.
- `rooms/{roomId}/game/{gameId}` (XOX/satranç, kişiye karşı): Sadece oda üyeleri okuyup yazabilir,
  ama **hamlenin gerçekten legal/sırası kendinde mi olduğu kural tarafından doğrulanmıyor** — bilinçli
  bir gevşek model, bkz. [[04-Security-Notes]].
- `chessRooms/{code}` (oda kodlu satranç): `isSignedIn()` (anonim dahil) yeterli okumak için; oluşturma
  sadece kendini `playerWhite` yapan bir doküman kurabiliyor; güncelleme kurucu ya da boş
  `playerBlack`'i dolduran ikinci oyuncu — iki kişinin aynı anda katılmasını önleyen asıl mekanizma
  kuralda değil, `chessService.joinChessRoom()`'daki `runTransaction`'da.
- `highscores/{id}`: Herkese açık okuma, giriş yapmış herkes bir skor ekleyebilir (isim/skor tip
  kontrolü var, artık `game` alanı da yazılıyor), ama hiçbir skor sonradan değiştirilemez/silinemez.
- `app_config/{configId}`: Herkes (giriş yapmış) okuyabilir, **hiç kimse yazamaz** (`allow write: if
  false`) — sadece Console'dan elle güncelleniyor, bkz. yukarıda "app_config/{configId}".

**Bilinçli olarak kapatılmayan bir açık:** `users` koleksiyonunun geniş okuma izni, giriş yapmış
herhangi birinin tüm kullanıcı profillerini (isim + kod) teker teker sorgulayarak listeleyebilmesi
anlamına geliyor — kod tabanlı kişi bulma özelliğinin çalışması için bu gerekli, tam kapatmak
istenirse bir Cloud Function ile aramanın sunucu tarafına taşınması gerekir (bu projede yok). Detay:
[[04-Security-Notes]].