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
  render eder. `message.type`'a göre dallanır: `text` → düz metin, `image`/`video` → küçük önizleme
  (tam ekran görüntüleyici modal'ı açar, dokununca), `audio` → `AudioMessagePlayer`, `call` → normal
  balon yerine ortalanmış bir WhatsApp-tarzı "çağrı geçmişi" kapsülü (📞/🎥 ikon, yön oku, süre ya
  da "Cevapsız arama").
- `src/components/AudioMessagePlayer.tsx` — Tek bir sesli mesaj balonu için oynat/duraklat kontrolü,
  `react-native-nitro-sound`'ın (singleton export, `Sound`) oynatma API'sini kullanır.
- `src/components/CallProvider.tsx` — Hesap girişi yapılmış ekranları (`CONTACTS`, `CHAT_ROOM`)
  sarmalayan `StreamVideo` provider'ı. İçindeki `IncomingCallWatcher`, `useCalls()` ile her
  `ringing` çağrıyı (hem gelen hem bu cihazın başlattığı) yakalayıp tam ekran `CallScreen` açar; çağrı
  bitince `CallScreen`'in verdiği `CallSummary`'den `chatService.sendCallLogMessage()` ile sohbete bir
  çağrı-geçmişi kaydı düşer.
- `src/components/NotificationCenter.tsx` — `CallProvider` ile birlikte `AppNavigator`'da
  `CONTACTS`/`CHAT_ROOM` etrafını **tek seferlik** (ekran değişince yeniden kurulmadan) sarmalar.
  Her kişinin odasını `chatService.subscribeToLatestMessage()` ile dinler, kendi mesajlarını/geçmişi/
  o an açık olan sohbeti filtreler, kalan yeni mesajlar için "oyun bildirimi" görünümlü bir toast
  gösterir (`notificationService`/`soundService`/`hapticsService` ile aç/kapa + ses + titreşim).
  Sadece uygulama açık/arka planda çalışırken tetikleniyor — gerçek arka plan push değil, bkz.
  [[Changelog]] ve `YAPILACAKLAR.txt`.
- `src/components/SettingsModal.tsx` — Tema, ses efekti, bildirim, titreşim aç/kapa switch'leri +
  basit bir sürüm bilgisi satırı. `GameHubScreen`'deki gizli dişli ikonuna gecikmeli tek dokunuşla
  açılır (10'lu seri gizli admin jestini bozmadan).

### src/config
- `src/config/firebaseConfig.ts` — Sabit kodlanmış Firebase Web SDK config objesi
  (`projectId: 'kaanchatmercan'` vb.). Yorum: bu değerler tek başına "gizli" değil, gerçek erişim
  kontrolü Firestore Security Rules ile sağlanmalı (bu repoda Security Rules dosyası yok).
- `src/config/streamConfig.ts` — Stream Video (arama) API key/secret. Placeholder değerlerle gelir,
  Stream Dashboard'da bir app oluşturulup elle doldurulmalı (bkz. [[05-Build-Deployment]]).
  "Client-side düz metin secret" deseni — bkz. [[04-Security-Notes]].

### src/navigation
- `src/navigation/AppNavigator.tsx` — Uygulamanın tüm "navigasyon" katmanı. Kütüphane yok; elle
  yazılmış `useState<'HOME'|'ACCOUNT'|'CONTACTS'|'CHAT_ROOM'>` ile ekran anahtarlama. `HOME`
  durumunda `GameHubScreen` render edilir (bkz. aşağıda). Aktif oda (`{ myUid, contact }`)
  `activeRoom` state'inde tutulur, `ContactsScreen`'den bir kişiye dokununca doldurulur. `CONTACTS`/
  `CHAT_ROOM` artık **tek bir** `CallProvider`+`NotificationCenter` sarmalayıcısı içinde (ikisi de
  ekran değişince yeniden kurulmuyor — eskiden her ikisinin de kendi ayrı `CallProvider` render'ı
  vardı). Android donanım geri tuşu (`BackHandler`): `ACCOUNT`/`CONTACTS` → `HOME`,
  `CHAT_ROOM` → `CONTACTS`.

### src/screens
- `src/screens/GameHubScreen.tsx` — Uygulamanın görünen ana ekranı (disguise'ın "ön kapısı"): 5
  oyunu (Blok Çılgınlığı, 2048, Yılan, Renk Hafızası, Köstebek Vurma) gösteren, giriş animasyonlu
  bir kart ızgarası. Gizli 10-dokunuş admin tetikleyicisi + tek-dokunuşla-Ayarlar mekanizması
  burada yaşıyor (eskiden `HomeScreen`'in kendi menü ekranındaydı, artık hangi oyun en son
  oynandığından bağımsız). Bir karta dokununca o oyunu `{ onBack }` prop'uyla tam ekran render eder.
- `src/screens/HomeScreen.tsx` — Tamamen component içinde yazılmış bir **Block-Blast tarzı bulmaca
  oyunu** ("BLOK ÇILGINLIĞI"): 8x8 tahta, 3 zorluk seviyesinde ağırlıklı rastgele parça üretimi,
  `PanResponder`/`Animated` ile sürükle-bırak, satır temizleme, skor, modül içinde tutulan (kalıcı
  olmayan) `bestScore`. Parça yerleştirmede/satır temizlemede/oyun bitişinde `soundService`'ten ses
  çalar. Oyun bitince, daha önce isim kaydedilmemişse bir modal ile bir kere isim sorar
  (`playerNameStorage`'a kaydeder), sonra `leaderboardService.submitScore()` ile skoru gönderir;
  "🏆 Skor Tablosu" butonu `fetchTopScores()` ile top 20'yi bir modalda listeler. Artık `GameHubScreen`
  tarafından render edilen, `{ onBack }` alan sıradan bir oyun ekranı (admin tetikleyici/Ayarlar
  burada değil, bkz. `GameHubScreen`).
- `src/screens/Game2048.tsx` — 4x4 2048 motoru, kararlı `id`'li `TileData[]` temsili sayesinde her
  taş kendi `Animated.ValueXY`'siyle kayarak taşınıyor/birleşiyor/doğuyor (bkz. [[Changelog]]).
- `src/screens/SnakeGame.tsx` — Klasik Yılan, 14x14 kafes, tüm segmentlerin tek bir paylaşılan
  `Animated.Value` üzerinden senkron kaymasıyla akıcı hareket.
- `src/screens/ColorMemoryGame.tsx` — Simon tarzı 4 pedli büyüyen dizi hafıza oyunu.
- `src/screens/WhackAMoleGame.tsx` — 3x3 delik, 30 saniyelik köstebek-vurma turu.
- `src/screens/AccountScreen.tsx` — Gerçek Firebase Auth (email/şifre) tabanlı giriş/kayıt ekranı.
  Mount olunca `getRestoredAccountUser()` ile cihazda zaten kalıcı gerçek bir oturum olup olmadığı
  sessizce kontrol edilir; varsa form hiç gösterilmeden doğrudan `onAuthenticated()` çağrılır. Yoksa
  kullanıcı adı + şifre ile giriş/kayıt formu gösterilir (`userService.loginAccount`/
  `registerAccount`). Başarılı olunca `onAuthenticated({ uid, username })` çağrılır.
- `src/screens/ContactsScreen.tsx` — Kişi listesi ekranı. `account` (`{ uid, username }`) prop
  olarak `AppNavigator`'dan gelir (artık kendi başına auth yapmıyor — `AccountScreen` sonrasında
  zaten gerçek bir hesapla giriliyor). Üstte `@kullaniciadi` gösterilir. `subscribeToContacts()`
  ile kişi listesini canlı dinler. "+ Kişi Ekle" butonu bir modal açar: girilen **kullanıcı adı**
  `findUserByUsername()` ile aranır, bulunursa `addContact()` ile kişi listesine eklenir (tek
  yönlü — karşı taraf da seni eklemek için senin kullanıcı adını girmeli). Bir kişiye dokununca
  `onOpenRoom(contact)` çağrılır. "Çıkış" artık gerçekten `logoutAccount()` çağırıp Firebase
  oturumunu kapatıyor (eski anonim tasarımda sadece navigasyon değişiyordu).
- `src/screens/ChatRoomScreen.tsx` — Gerçek 1-1 sohbet ekranı (eski `AdminChatScreen`'in oda-farkında
  hâli). `getRoomId(myUid, contact.uid)` ile deterministik bir oda id'si hesaplar,
  `subscribeToMessages(roomId, ...)` ile o odaya özel mesajları dinler, `FlatList` + `MessageBubble`
  ile render eder, gönderim `sendMessage(roomId, text, myUid)` ile. Geri oku ile `onBack()` çağrılır
  (`CONTACTS`'a döner). Header'da 📞/🎥 butonları `callService.startVoiceCall()`/`startVideoCall()`'ı
  tetikler. 📎 ataç butonu galeri/kamera'dan fotoğraf/video seçtirir (`react-native-image-picker`),
  🎤 butonu basılı tutulduğu sürece ses kaydeder (`react-native-audio-recorder-player`); her ikisi de
  `mediaService.uploadRoomMedia()` ile Storage'a yüklenip `sendMediaMessage()` ile gönderilir.
- `src/screens/CallScreen.tsx` — Bir `Call` nesnesini `StreamCall` ile sarar, `CallingState`'e göre
  `RingingCallContent` (çalıyor/arıyor ekranı) ile `CallContent` (aktif görüşme: kamera/mikrofon
  kontrolleri) arasında geçiş yapar. `onLeave` artık parametresiz değil — çağrı bitince bir
  `CallSummary` (`otherUserId`, `isVideo`, `isCreatedByMe`, `wasJoined`, `durationSeconds`) verir,
  `CallProvider` bunu sohbete çağrı-geçmişi kaydı düşmek için kullanır. Sesli/görüntülü arama her
  zaman `'speaker'` (hoparlör) rotası kullanıyor — bkz. [[Changelog]] "hoparlör düzeltmesi".

### src/services
- `src/services/firebase.ts` — Firebase başlatma modülü. `initializeApp(FIREBASE_CONFIG)`,
  AsyncStorage destekli kalıcı `auth` (`initializeAuth` + `getReactNativePersistence`, tip
  cast'i ile — RN export condition altında TS tipleri açık değil), `experimentalForceLongPolling: true`
  ile Firestore `db` (bazı Android ağlarında gRPC streaming sorunlarını aşmak için). `ensureAnonymousAuth()`
  export eder: cihazı anonim olarak Firebase'e giriş yaptırır — artık **sadece** skor tablosuna yazma
  izni için kullanılıyor (leaderboard'a puan göndermek `request.auth != null` gerektiriyor, ama oyunu
  oynayan herkes gizli sohbete girmiş/hesap açmış olmuyor). Kişi/sohbet sistemi artık anonim auth'a
  değil `userService.ts`'teki gerçek email/şifre hesaplarına dayanıyor. `getRestoredAccountUser()` da
  export edilir: mevcut oturumun (varsa) **gerçek** (anonim olmayan) bir hesap olup olmadığını
  sessizce kontrol eder, `AccountScreen`'in otomatik-giriş akışında kullanılır.
- `src/services/userService.ts` — **Gerçek hesap sistemi.** Firebase Auth'un email/şifre sağlayıcısı,
  bir "kullanıcı adı" arayüzünün arkasına gizlenerek kullanılıyor: kullanıcı adı, dahili olarak
  `kullaniciadi@gizlichat.local` sahte bir e-postaya çevrilip (`usernameToEmail()`)
  `createUserWithEmailAndPassword`/`signInWithEmailAndPassword`'a öyle veriliyor — kullanıcı hiçbir
  zaman gerçek bir e-posta girmiyor/görmüyor. `registerAccount(username, password)` hesabı oluşturur
  ve `users/{uid}`'e `{ username, usernameLower, createdAt }` yazar; `loginAccount()` giriş yapar;
  `logoutAccount()` çıkış yapar; `findUserByUsername()` kişi eklerken `usernameLower` alanına göre
  arar (büyük/küçük harf duyarsız). `fetchAccountUsername(uid)` zaten oturum açık bir uid için
  kayıtlı kullanıcı adını getirir (`AccountScreen`'in sessiz oturum geri yükleme akışında kullanılır).
  Bu hesap kimliği artık **cihaza değil kullanıcı adı+şifreye bağlı** — aynı hesapla başka bir
  telefonda/kurulumda giriş yapılınca aynı `uid`, aynı kişi listesi ve sohbetler geri geliyor.
  **Şifre kurtarma yok** (gerçek e-posta olmadığı için Firebase'in "şifremi unuttum" e-postası
  gönderilemiyor) — bkz. [[04-Security-Notes]].
- `src/services/contactService.ts` — Kişi listesi katmanı. `users/{myUid}/contacts/{contactUid}`:
  `{ name, addedAt }`. `addContact()` (tek yönlü ekleme) ve `subscribeToContacts()` (canlı, isme göre
  sıralı liste) export eder. `Contact` tipi burada tanımlı, `ChatRoomScreen`/`AppNavigator` tarafından
  da kullanılıyor.
- `src/services/chatService.ts` — Firestore sohbet veri erişim katmanı, artık **oda tabanlı**
  (eskiden tek sabit `'messages'` koleksiyonuydu — o eski tasarım/veri artık kullanılmıyor, bkz.
  [[Changelog]]). `getRoomId(uidA, uidB)` iki uid'i sıralayıp birleştirerek deterministik bir oda id'si
  üretir (kim kimi açarsa açsın aynı id). Mesajlar `rooms/{roomId}/messages` altında (limit 300,
  `createdAt asc`). `MessageType` artık `'text'|'image'|'video'|'audio'|'call'`; `sendCallLogMessage()`
  bir çağrının bitişini (`callVideo`/`callStatus: 'completed'|'missed'`/`durationSeconds`) sohbete
  yazar. `subscribeToLatestMessage(roomId, ...)` — `subscribeToMessages`'ın hafif kardeşi, tek belge
  (`orderBy desc, limit 1`), `NotificationCenter`'ın N oda dinlemesi için (300'lük tam geçmişi N kere
  çekmek yerine).
- `src/services/leaderboardService.ts` — Herkese açık, paylaşılan skor tablosu. Sabit koleksiyon
  `'highscores'`: `{ name, score, createdAt }`. `submitScore(name, score)` ve
  `fetchTopScores()` (top 20, skora göre azalan) export eder. Kullanıcı kimliğine/uid'e bağlı değil —
  herkes herkesin skorunu görür, silme/düzenleme yok.
- `src/services/playerNameStorage.ts` — Oyuncunun leaderboard'da görünecek adını AsyncStorage'da
  saklar (`gizlichat_player_name` anahtarı). `getSavedPlayerName()`/`savePlayerName()`. Bu, chat
  sistemindeki `userService`'ten tamamen ayrı — oyun ismi ile kişi/chat profili birbirine bağlı değil.
- `src/services/soundService.ts` — `react-native-sound` ile ses efektleri. 15 sentetik (üçüncü parti
  ses varlığı olmayan, programatik üretilmiş sinüs/kare dalga) WAV dosyasını `android/app/src/main/
  res/raw/`'dan yükler ve karşılık gelen `playXSound()` fonksiyonlarını export eder (`place`/`clear`/
  `gameover`/`tap`/`merge`/`eat`/`noteA-D`/`wrong`/`hit`/`miss`/`notification`/`win` — hangi oyunun
  hangisini kullandığı için [[Changelog]]'a bak). `isSoundEnabled()`/`setSoundEnabled()` ile
  Ayarlar'dan aç/kapa (AsyncStorage `gizlichat_sound_enabled`). Şu an sadece Android'de etkin
  (`Platform.OS === 'android'` kontrolü) — iOS için ses dosyaları Xcode projesine eklenmedi.
- `src/services/notificationService.ts` / `src/services/hapticsService.ts` — `soundService`'le aynı
  desen (modül seviyesinde cache'lenmiş bayrak + AsyncStorage kalıcılık): sırasıyla `NotificationCenter`
  toast'larının ve oyun-bitti/bildirim titreşimlerinin (`Vibration`, ekstra bağımlılık yok) Ayarlar'dan
  aç/kapa edilmesini sağlar.
- `src/services/mediaService.ts` — `uploadRoomMedia(roomId, kind, localUri, extension)`: bir
  `file://` uri'sini Firebase Storage'a `rooms/{roomId}/media/{kind}/` altına yükler, indirme
  URL'ini döner. Sadece video mesajları için kullanılıyor — fotoğraflar artık Storage'a hiç
  uğramıyor, bkz. [[03-Services-Backend]]. Erişim kontrolü `storage.rules`'ta (aynı oda-üyeliği
  modeli).
- `src/services/callService.ts` — Stream Video entegrasyonu: `getOrCreateStreamClient(uid,
  username)` (aynı uid için her çağrıda aynı client instance'ını döner), `startVoiceCall()`/
  `startVideoCall()` (`client.call('default', callId).getOrCreate({ ring: true, ... })`, `callId`
  iki uid'in sıralanıp `-` ile birleşmesi — `chatService.getRoomId()`'e benzer ama farklı ayraç).
  Token üretimi (`generateStreamToken`) `crypto-js` ile cihazda HS256 JWT imzalıyor — bkz.
  [[04-Security-Notes]] "Stream arama token'ları".

## Bağımlılıklar (package.json)

**dependencies:**
- `firebase` (^12.17.1) — Auth (anonim + email/şifre), Firestore, ve artık **Storage**
  (`mediaService.ts`) kullanılıyor. Functions/Analytics/Remote Config/Crashlytics kullanılmıyor.
- `@react-native-async-storage/async-storage` (^3.1.1) — Firebase Auth persistence'ın yanı sıra artık
  tema modu, ses/bildirim/titreşim aç-kapa tercihleri, ve her mini oyunun en-yüksek-skoru için de
  kullanılıyor (bkz. [[Changelog]]).
- `react-native-safe-area-context` (^5.5.2) — `SafeAreaProvider`/`useSafeAreaInsets`,
  `App.tsx`/`HomeScreen.tsx`/`ContactsScreen.tsx`/`ChatRoomScreen.tsx`'te.
- `react-native-sound` — native ses çalma modülü, `src/services/soundService.ts`'te kullanılıyor
  (oyunun ses efektleri, sohbetin sesli mesajlarından ayrı).
- `react-native-image-picker` — galeri/kameradan fotoğraf/video seçme (`ChatRoomScreen`'in 📎
  butonu). Fotoğraflar `maxWidth`/`maxHeight`/`quality`/`includeBase64` seçenekleriyle cihazda
  küçültülüp base64 olarak alınıyor (bkz. [[03-Services-Backend]] "Fotoğraf mesajları").
- `react-native-video` — sohbetteki video mesajlarını oynatma (`MessageBubble`).
- `react-native-nitro-sound` (+ zorunlu peer `react-native-nitro-modules@0.36.5`, **sabitlenmiş
  sürüm** — başka bir sürüm ABI uyumsuzluğuna yol açabilir) — sesli mesaj kaydı + oynatma. Eski
  `react-native-audio-recorder-player`'ın resmi halefi; o paketin **hiçbir sürümü** RN 0.86.2 ile
  derlenmiyordu (4.x Nitro ABI hatası, 3.x kaldırılmış RN API'lerine referans) — detay:
  [[Changelog]]. API'si sınıf değil, doğrudan bir singleton export ediyor (`import Sound from
  'react-native-nitro-sound'`, `new` ile çağrılmaz).
- `crypto-js` — sadece Stream arama token'ları için HMAC-SHA256 imzalama (`callService.ts`). Saf JS,
  native modül değil.
- `@stream-io/video-react-native-sdk`, `@stream-io/react-native-webrtc`, `react-native-svg` —
  sesli/görüntülü arama (Stream Video SDK ve zorunlu peer bağımlılıkları). Native WebRTC modülü
  içerir, APK rebuild'i gerektirir.
- `@react-native-community/netinfo` (^12.0.1) — Stream Video SDK'nın zorunlu peer bağımlılığı olarak
  zaten kuruluydu ama kullanılmıyordu; `src/hooks/useNetworkStatus.ts` ile artık gerçekten devrede
  (çevrimdışı banner'ı, bkz. [[Changelog]]). Jest mock'u: `__mocks__/@react-native-community/
  netinfo.js` (paketin kendi resmi mock'unu re-export ediyor).
- Native modül içeren tüm yukarıdaki paketler için (`react-native-sound`, `-image-picker`,
  `-nitro-sound`, `-video`, `@stream-io/video-react-native-sdk`) Jest'te native taraf olmadığından
  `__mocks__/` altında manuel mock'lar var (bkz. [[05-Build-Deployment]]).
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
