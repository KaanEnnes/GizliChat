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
  name: string;    // takma ad (eklerken girilen, veya bulunan kullanıcının kayıtlı adı)
  addedAt: number;
}
```

- `addContact()` / `subscribeToContacts()` (`src/services/contactService.ts`).
- **Tek yönlü**: sadece ekleyen tarafın kendi `contacts` alt koleksiyonuna yazılır, karşı tarafa
  otomatik olarak hiçbir şey eklenmez.

### `rooms/{roomId}/messages/{messageId}` — 1-1 sohbet mesajları

```ts
{
  text: string;
  senderId: string;   // Firebase uid
  createdAt: Timestamp;
}
```

- `roomId = getRoomId(uidA, uidB)` — iki uid sıralanıp `__` ile birleştiriliyor, hangi taraf
  başlatırsa başlatsın aynı id çıkıyor (`src/services/chatService.ts`).
- Sorgu: `orderBy('createdAt', 'asc')`, `MESSAGE_LIMIT = 300`.
- `subscribeToMessages(roomId, ...)` (`onSnapshot` canlı dinleyici) ve
  `sendMessage(roomId, text, senderId)` (`addDoc` + `serverTimestamp()`).
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