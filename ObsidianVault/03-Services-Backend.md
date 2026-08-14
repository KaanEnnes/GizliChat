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

- **Firestore** — `users`, `users/{uid}/contacts`, `rooms/{roomId}/messages`, `highscores`
  koleksiyonları.
- **Storage** — `rooms/{roomId}/media/{image|video|audio}/` altında sohbet medyası
  (`src/services/mediaService.ts`). Erişim kontrolü `storage.rules`'ta (bkz. aşağıda).

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
  username: string;       // orijinal büyük/küçük harfle, ekranda gösterilen
  usernameLower: string;  // küçük harfli, findUserByUsername() sorgusunun eşleştirdiği alan
  createdAt: number;
}
```

- Doküman `registerAccount()` sırasında bir kere yazılıyor, sonrasında değiştirilmiyor (isim
  değiştirme UI'ı yok).
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

### `rooms/{roomId}/messages/{messageId}` — 1-1 sohbet mesajları

```ts
{
  type: 'text' | 'image' | 'video' | 'audio';
  text: string;            // sadece type: 'text' için doldurulur
  senderId: string;        // Firebase uid
  createdAt: Timestamp;
  mediaUrl?: string;       // image/video/audio için Firebase Storage indirme URL'i
  durationSeconds?: number; // sadece audio için, oynatıcı UI'ında gösterilir
}
```

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
  createdAt: Timestamp;
}
```

- `submitScore(name, score)` / `fetchTopScores()` (`src/services/leaderboardService.ts`, top 20,
  skora göre azalan sıralı).
- Kullanıcı kimliğine bağlı değil, herkes herkesin skorunu görebilir; silme/moderasyon yok.

## Mock admin servisi (Firebase'den bağımsız)

`src/services/authService.ts` → `loginAdmin(username, password)`:
- `adminConfig.ts`'deki sabit kodlanmış `admin`/`admin123` ile karşılaştırır.
- `MOCK_AUTH_DELAY_MS` (600ms) ile sahte ağ gecikmesi simüle eder.
- Yorumda: gerçek bir API çağrısıyla 1:1 değiştirilmek üzere tasarlanmış bir prototip.
- **Bu, Firebase Auth'tan tamamen ayrı bir sistem** — chat/kişi sistemi için kullanılan anonim
  Firebase kimliğiyle hiçbir ilişkisi yok, sadece "gizli özelliğin kapısı" olarak çalışıyor.

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

## Sesli/görüntülü arama (Stream Video)

Firebase'den tamamen ayrı, üçüncü parti bir servis: [Stream Video](https://getstream.io/video/).
`src/services/callService.ts`:
- `getOrCreateStreamClient(uid, username)` — `StreamVideoClient.getOrCreateInstance()`, aynı uid
  için tekrar çağrılırsa aynı client instance'ını döner (SDK'nın kendi cache'i).
- Token üretimi backend olmadığı için **cihazda** yapılıyor: `generateStreamToken(uid)`, `crypto-js`
  ile `STREAM_CONFIG.apiSecret` kullanarak elle bir HS256 JWT (`{user_id, iat}`) imzalıyor. Normalde
  bu bir sunucu sorumluluğu — bkz. [[04-Security-Notes]] "Stream arama token'ları".
- `startVoiceCall()`/`startVideoCall()` — `client.call('default', callId).getOrCreate({ ring: true,
  data: { members: [...] } })`; `callId = [myUid, contact.uid].sort().join('-')` (chatService'in
  `getRoomId()`'ine benzer ama Stream call id'lerinde `__` yerine `-` kullanılıyor, Stream'in kendi
  id kısıtlarına göre).
- Stream tarafında ayrı bir kullanıcı/erişim modeli var (Firebase Auth'tan bağımsız) — her cihaz,
  Firebase uid'ini Stream'e de "user id" olarak veriyor, böylece iki sistem aynı kimliği paylaşıyor
  ama birbirinden habersiz çalışıyor (chat/admin auth'un birbirinden bağımsız olmasına benzer bir
  desen, bkz. [[02-Screens-and-Features]]).
- **Elle yapılması gereken adım:** Stream Dashboard'da (https://dashboard.getstream.io) bir "Video &
  Audio" app oluşturup API Key + Secret'ı `src/config/streamConfig.ts`'e girmek gerekiyor. Detay:
  [[05-Build-Deployment]].

## Firestore Security Rules — repoda VAR ama Firebase'e elle deploy edilmeli

`firestore.rules` (proje kökünde) bu uygulamanın gerçek erişim kontrol kurallarını tanımlıyor. Bu
dosya sadece bir metin dosyası — **Firebase Console'a veya Firebase CLI'a elle yapıştırılıp/deploy
edilmedikçe hiçbir etkisi olmaz**, kod bu dosyayı otomatik olarak Firebase'e göndermiyor (repoda
`firebase.json`/CLI kurulumu yok). Deploy adımları için [[05-Build-Deployment]] → "Firestore
kurallarını deploy etme" bölümüne bak.

Kuralların özeti:
- `users/{uid}`: Herkes (giriş yapmış = anonim dahil) okuyabilir — çünkü kişi eklerken kullanıcı
  adıyla arama (`findUserByUsername`) buna ihtiyaç duyuyor. Sadece profilin sahibi kendi profilini
  oluşturabilir/güncelleyebilir.
- `users/{uid}/contacts/**`: Tamamen özel, sadece sahibi okuyabilir/yazabilir.
- `rooms/{roomId}/messages/**`: Sadece `roomId`'nin içindeki iki uid'den biri olan kullanıcı
  okuyabilir/yazabilir (`roomId = uidA__uidB`, kurallar bunu `split('__')` ile doğruluyor). Mesajlar
  sadece eklenebilir, düzenlenemez/silinemez.
- `highscores/{id}`: Herkese açık okuma, giriş yapmış herkes bir skor ekleyebilir (isim/skor tip
  kontrolü var), ama hiçbir skor sonradan değiştirilemez/silinemez.

**Bilinçli olarak kapatılmayan bir açık:** `users` koleksiyonunun geniş okuma izni, giriş yapmış
herhangi birinin tüm kullanıcı profillerini (isim + kod) teker teker sorgulayarak listeleyebilmesi
anlamına geliyor — kod tabanlı kişi bulma özelliğinin çalışması için bu gerekli, tam kapatmak
istenirse bir Cloud Function ile aramanın sunucu tarafına taşınması gerekir (bu projede yok). Detay:
[[04-Security-Notes]].