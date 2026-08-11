# Mimari ve Dosya Haritası

Bağlam için önce [[00-START-HERE]] dosyasına bak.

## Üst seviye dosyalar

| Yol | Ne işe yarar |
|---|---|
| `App.tsx` | Kök bileşen. `SafeAreaProvider` ile sarar, cihaz renk şemasına göre `StatusBar` stilini ayarlar, `AppNavigator`'ı render eder. |
| `index.js` | RN giriş noktası; `App`'i `app.json`'daki isimle `AppRegistry`'ye kaydeder. |
| `app.json` | `"name": "Mobile"`, `"displayName": "Mobile"` — uygulama iç olarak hâlâ "Mobile". |
| `package.json` | `name: "Mobile"`, RN 0.86.2, React 19.2.3. Bağımlılıklar için aşağıya bak. |
| `babel.config.js` | Sadece `module:@react-native/babel-preset` — path alias yok. |
| `metro.config.js` | Standart Metro config + özel bir resolver hack'i: `@firebase/firestore` importlarını doğrudan `node_modules/@firebase/firestore/dist/index.rn.js`'e yönlendiriyor (Metro'nun Firestore RN build'iyle ilgili package-exports çözümleme bug'ını aşmak için). |
| `tsconfig.json` | `@react-native/typescript-config`'i extend eder, Jest tiplerini ekler. |
| `run-app.bat` | Windows yardımcı script: ADB/Android SDK bulur, cihaz bağlantısını kontrol eder, Metro'yu yeni terminalde başlatır, `adb reverse` ile port 8081, `gradlew installDebug` çalıştırır, `com.mobile/.MainActivity`'yi cihazda başlatır. Konsol çıktısı Türkçe. |
| `Mobile/` | Kökte başıboş bir klasör, içinde neredeyse boş bir `.git` reposu var — eski bir scaffold/clone artığı, hiçbir kod tarafından referans verilmiyor. Silinmesi güvenli ama şu ana kadar dokunulmadı. |
| `android/`, `ios/` | Native platform projeleri, aşağıda ayrıca ele alınıyor. |

## src/ klasörü

### src/components
- `src/components/MessageBubble.tsx` — Tek bir sohbet mesajı satırı. Gönderen kullanıcı ise (`isMine`)
  sağa yaslı/mavi, karşı taraf ise sola yaslı/gri stil. `message.createdAt`'ten `HH:MM` saat damgası
  render eder.

### src/config
- `src/config/firebaseConfig.ts` — Sabit kodlanmış Firebase Web SDK config objesi
  (`projectId: 'kaanchatmercan'` vb.). Yorum: bu değerler tek başına "gizli" değil, gerçek erişim
  kontrolü Firestore Security Rules ile sağlanmalı (bu repoda Security Rules dosyası yok).
- `src/config/adminConfig.ts` — Sabit kodlanmış mock admin bilgileri (`admin` / `admin123`) ve
  `MOCK_AUTH_DELAY_MS` (600ms, sahte ağ gecikmesi). Yorumda açıkça "prototip, gerçek backend ile
  değiştirilecek" yazıyor.

### src/navigation
- `src/navigation/AppNavigator.tsx` — Uygulamanın tüm "navigasyon" katmanı. Kütüphane yok; elle
  yazılmış `useState<'HOME'|'ADMIN_LOGIN'|'CONTACTS'|'CHAT_ROOM'>` ile ekran anahtarlama. Aktif oda
  (`{ myUid, contact }`) `activeRoom` state'inde tutulur, `ContactsScreen`'den bir kişiye dokununca
  doldurulur. Android donanım geri tuşu (`BackHandler`): `ADMIN_LOGIN`/`CONTACTS` → `HOME`,
  `CHAT_ROOM` → `CONTACTS`.

### src/screens
- `src/screens/HomeScreen.tsx` — Projenin en büyük dosyası. Tamamen component içinde yazılmış bir
  **Block-Blast tarzı bulmaca oyunu** ("BLOK ÇILGINLIĞI"): 8x8 tahta, 3 zorluk seviyesinde ağırlıklı
  rastgele parça üretimi, `PanResponder`/`Animated` ile sürükle-bırak, satır temizleme, skor, modül
  içinde tutulan (kalıcı olmayan) `bestScore`. Parça yerleştirmede/satır temizlemede/oyun bitişinde
  `soundService`'ten ses çalar. Oyun bitince, daha önce isim kaydedilmemişse bir modal ile bir kere
  isim sorar (`playerNameStorage`'a kaydeder), sonra `leaderboardService.submitScore()` ile skoru
  gönderir; "🏆 Skor Tablosu" butonu `fetchTopScores()` ile top 20'yi bir modalda listeler. Ekranın
  köşesindeki `⚙` dişli ikonuna 3.5 saniye içinde 10 kez dokununca `onAdminTriggerReached()` çağrılır
  — uygulamanın admin/gizli giriş tetikleyicisi burada gizli.
- `src/screens/AdminLoginScreen.tsx` — Kullanıcı adı/şifre formu, `authService.ts`'deki `loginAdmin`'i
  çağırır; başarılıysa `onLoginSuccess()` (→ `CONTACTS`), iptal ile `onCancel()` (→ home). Yükleniyor
  spinner'ı ve satır içi hata mesajı gösterir.
- `src/screens/ContactsScreen.tsx` — Kişi listesi ekranı (eski tek-odalı `AdminChatScreen`'in yerini
  aldı). Mount olunca `ensureAnonymousAuth()` → `ensureUserProfile()` ile kullanıcının Firestore
  profilini (isim + paylaşılabilir 6 haneli kod) hazırlar/getirir, ekranın üstünde "Senin kodun"
  banner'ında gösterir. `subscribeToContacts()` ile kişi listesini canlı dinler. "+ Kişi Ekle"
  butonu bir modal açar: girilen kod `findUserByCode()` ile aranır, bulunursa `addContact()` ile
  kişi listesine eklenir (tek yönlü — karşı taraf da seni eklemek için senin kodunu girmeli). Bir
  kişiye dokununca `onOpenRoom(myUid, contact)` çağrılır.
- `src/screens/ChatRoomScreen.tsx` — Gerçek 1-1 sohbet ekranı (eski `AdminChatScreen`'in oda-farkında
  hâli). `getRoomId(myUid, contact.uid)` ile deterministik bir oda id'si hesaplar,
  `subscribeToMessages(roomId, ...)` ile o odaya özel mesajları dinler, `FlatList` + `MessageBubble`
  ile render eder, gönderim `sendMessage(roomId, text, myUid)` ile. Geri oku ile `onBack()` çağrılır
  (`CONTACTS`'a döner).

### src/services
- `src/services/firebase.ts` — Firebase başlatma modülü. `initializeApp(FIREBASE_CONFIG)`,
  AsyncStorage destekli kalıcı `auth` (`initializeAuth` + `getReactNativePersistence`, tip
  cast'i ile — RN export condition altında TS tipleri açık değil), `experimentalForceLongPolling: true`
  ile Firestore `db` (bazı Android ağlarında gRPC streaming sorunlarını aşmak için). `ensureAnonymousAuth()`
  export eder: cihazı anonim olarak Firebase'e giriş yaptırır; bu uid artık hem "benim mesajım / karşı
  tarafın mesajı" ayrımı için, hem de `users/{uid}` altındaki kalıcı kişi/kod profili için kullanılıyor.
- `src/services/userService.ts` — Kullanıcının Firestore kimliği (`users/{uid}`: `{ name, code,
  createdAt }`). `ensureUserProfile(uid, defaultName)` profili getirir/oluşturur (yoksa rastgele 6
  haneli, karıştırılması zor karakterlerden oluşan bir `code` üretir). `findUserByCode(code)` — kişi
  eklerken kodla kullanıcı arar (`where('code','==',...)` sorgusu). `updateMyName()` de var ama şu an
  hiçbir ekran tarafından çağrılmıyor (isim değiştirme UI'ı henüz yok).
- `src/services/contactService.ts` — Kişi listesi katmanı. `users/{myUid}/contacts/{contactUid}`:
  `{ name, addedAt }`. `addContact()` (tek yönlü ekleme) ve `subscribeToContacts()` (canlı, isme göre
  sıralı liste) export eder. `Contact` tipi burada tanımlı, `ChatRoomScreen`/`AppNavigator` tarafından
  da kullanılıyor.
- `src/services/chatService.ts` — Firestore sohbet veri erişim katmanı, artık **oda tabanlı**
  (eskiden tek sabit `'messages'` koleksiyonuydu — o eski tasarım/veri artık kullanılmıyor, bkz.
  [[Changelog]]). `getRoomId(uidA, uidB)` iki uid'i sıralayıp birleştirerek deterministik bir oda id'si
  üretir (kim kimi açarsa açsın aynı id). Mesajlar `rooms/{roomId}/messages` altında (limit 300,
  `createdAt asc`). `ChatMessage { id, text, senderId, createdAt }`, `subscribeToMessages(roomId, ...)`
  ve `sendMessage(roomId, text, senderId)` export eder.
- `src/services/leaderboardService.ts` — Herkese açık, paylaşılan skor tablosu. Sabit koleksiyon
  `'highscores'`: `{ name, score, createdAt }`. `submitScore(name, score)` ve
  `fetchTopScores()` (top 20, skora göre azalan) export eder. Kullanıcı kimliğine/uid'e bağlı değil —
  herkes herkesin skorunu görür, silme/düzenleme yok.
- `src/services/playerNameStorage.ts` — Oyuncunun leaderboard'da görünecek adını AsyncStorage'da
  saklar (`gizlichat_player_name` anahtarı). `getSavedPlayerName()`/`savePlayerName()`. Bu, chat
  sistemindeki `userService`'ten tamamen ayrı — oyun ismi ile kişi/chat profili birbirine bağlı değil.
- `src/services/soundService.ts` — `react-native-sound` ile ses efektleri. Üç sentetik (üçüncü parti
  ses varlığı olmayan, programatik üretilmiş) WAV dosyasını (`sfx_place`, `sfx_clear`, `sfx_gameover`)
  `android/app/src/main/res/raw/`'dan yükler; `playPlaceSound()`/`playClearSound()`/`playGameOverSound()`
  export eder. Şu an sadece Android'de etkin (`Platform.OS === 'android'` kontrolü) — iOS için ses
  dosyaları Xcode projesine eklenmedi.
- `src/services/authService.ts` — Mock admin login servisi (Firebase Auth değil).
  `loginAdmin(username, password)` `MOCK_AUTH_DELAY_MS` bekler, `adminConfig.ts`'deki sabit
  bilgilerle karşılaştırır, `{ success, errorMessage? }` döner. Chat için kullanılan Firebase anonim
  auth'tan tamamen bağımsız — uygulamada birbirinden habersiz iki ayrı "auth" sistemi var.

## Bağımlılıklar (package.json)

**dependencies:**
- `firebase` (^12.17.1) — sadece Auth (anonim) ve Firestore (`messages` koleksiyonu) kullanılıyor.
  Storage/Functions/Analytics/Remote Config/Crashlytics kullanılmıyor.
- `@react-native-async-storage/async-storage` (^3.1.1) — sadece Firebase Auth persistence için
  kullanılıyor, başka hiçbir yerde local cache/storage yok.
- `react-native-safe-area-context` (^5.5.2) — `SafeAreaProvider`/`useSafeAreaInsets`,
  `App.tsx`/`HomeScreen.tsx`/`ContactsScreen.tsx`/`ChatRoomScreen.tsx`'te.
- `react-native-sound` — native ses çalma modülü, `src/services/soundService.ts`'te kullanılıyor.
  Native bir modül olduğu için eklendiğinde/güncellendiğinde APK'nın yeniden derlenmesi (sadece JS
  bundle değil) gerekiyor. Jest'te native tarafı olmadığı için `__mocks__/react-native-sound.js`
  manuel mock'u var (bkz. [[05-Build-Deployment]]).
- `react` 19.2.3, `react-native` 0.86.2, `@react-native/new-app-screen` — RN CLI boilerplate,
  `App.tsx` tamamen değiştirildiği için kullanılmıyor.

**Yok (dikkat):** navigasyon kütüphanesi, state management kütüphanesi, şifreleme kütüphanesi,
push notification, crash reporting.

## android/ ve ios/

- Android `applicationId`/`namespace`: `com.mobile` (`android/app/build.gradle`). `versionCode 1`,
  `versionName "1.0"`. Custom native modül yok, sadece standart RN Kotlin scaffold
  (`MainActivity.kt`, `MainApplication.kt`).
- iOS bundle id hâlâ RN CLI varsayılanı (`org.reactjs.native.example.$(PRODUCT_NAME...)`),
  release için özelleştirilmemiş. Custom native modül yok, standart Swift `AppDelegate.swift`.
- `compileSdkVersion`/`targetSdkVersion`: 36, `minSdkVersion`: 24, `buildToolsVersion`: 36.0.0,
  `ndkVersion`: 27.1.12297006 (bkz. `android/build.gradle`).
