# Servisler ve Backend (Firebase)

Bağlam için önce [[00-START-HERE]] dosyasına bak.

## Backend

Google Firebase projesi `kaanchatmercan` (config: `src/config/firebaseConfig.ts`). İki Firebase
servisi kullanılıyor, hiçbir custom backend/API sunucusu yok:

- **Auth** — sadece anonim giriş (`signInAnonymously`). Email/şifre, Google, telefon auth yok.
- **Firestore** — `users`, `users/{uid}/contacts`, `rooms/{roomId}/messages`, `highscores`
  koleksiyonları.

## Auth akışı

`src/services/firebase.ts` → `ensureAnonymousAuth()`:
1. `initializeAuth` ile AsyncStorage destekli kalıcı oturum kurulur
   (`getReactNativePersistence(AsyncStorage)` — tip cast gerekiyor çünkü RN export condition
   altında TS tipleri açık değil).
2. Zaten giriş yapılmamışsa `signInAnonymously` çağrılır.
3. Dönen `uid` artık iki amaçla kullanılıyor: (a) mesaj gönderirken `senderId` / `isMine` hizalama,
   (b) `users/{uid}` altındaki kalıcı kişi/kod profilinin anahtarı. Uygulama yeniden kurulmadığı
   sürece aynı uid, aynı profil ve aynı kod korunur.

## Firestore veri modeli

### `users/{uid}` — kullanıcı profili (kişi sistemi)

```ts
{
  name: string;      // varsayılan "Kullanıcı", updateMyName() ile değiştirilebilir (henüz UI'da yok)
  code: string;      // 6 haneli, paylaşılabilir, benzersiz olması beklenen kod
  createdAt: number;
}
```

- `ensureUserProfile(uid, defaultName)` (`src/services/userService.ts`) — yoksa oluşturur, varsa
  getirir.
- `findUserByCode(code)` — `where('code', '==', code)` sorgusu, kişi eklerken kullanılıyor.
- Kodlar rastgele üretiliyor, **benzersizlik garantisi Firestore/kod seviyesinde yok** — çok düşük
  ama sıfır olmayan bir çakışma ihtimali var (6 karakter, 33 karakterlik alfabe → ~1.3 milyar
  kombinasyon, küçük kullanıcı sayısında pratik risk yok).

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
- `users/{uid}`: Herkes (giriş yapmış = anonim dahil) okuyabilir — çünkü kişi eklerken kod ile arama
  (`findUserByCode`) buna ihtiyaç duyuyor. Sadece profilin sahibi kendi profilini
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