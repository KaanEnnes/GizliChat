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
| `android/`, `ios/` | Native platform projeleri, aşağıda ayrıca ele alınıyor. |

> Not: Proje kökü artık **düz (flat)** bir yapı — eski iç içe `GizliChat/GizliChat/` klasörü ve
> kökteki başıboş `Mobile/` scaffold artığı kaldırıldı, ikisi de artık yok.

## src/ klasörü

### src/components
- `src/components/MessageBubble.tsx` — Tek bir sohbet mesajı satırı. Gönderen kullanıcı ise (`isMine`)
  sağa yaslı/mavi, karşı taraf ise sola yaslı/gri stil. `message.createdAt`'ten `HH:MM` saat damgası
  render eder. `message.type`'a göre dallanır: `text` → düz metin, `image`/`video` → küçük önizleme
  (tam ekran görüntüleyici modal'ı açar, dokununca), `audio` → `AudioMessagePlayer`, `call` → normal
  balon yerine ortalanmış bir WhatsApp-tarzı "çağrı geçmişi" kapsülü. Kapsül `CallIcons.tsx`'ten SVG
  ikon (bağlanan arama → telefon/kamera, bağlanmayan → `MissedCallIcon`), yön oku ve duruma göre
  süre / "Cevapsız arama" / "Reddedildi" gösterir; bağlanmayan her arama `dangerSoft` zeminde kırmızı
  görünür. Yön oku `isMine`'a bakar ve `isMine` artık ARAYANIN uid'sine göre belirlenir, yazan cihaza
  göre değil — bkz. `chatService.sendCallLogMessage()`.
- `src/components/AudioMessagePlayer.tsx` — Tek bir sesli mesaj balonu için oynat/duraklat kontrolü,
  `react-native-nitro-sound`'ın (singleton export, `Sound`) oynatma API'sini kullanır.
- `src/components/CallProvider.tsx` — Hesap girişi yapılmış TÜM ekranları (oyun ekranı dâhil, bkz.
  `AppNavigator`) sarmalayan `StreamVideo` provider'ı. İçindeki `IncomingCallWatcher`, `useCalls()`
  ile her `ringing` çağrıyı (hem gelen hem bu cihazın başlattığı) yakalayıp tam ekran `CallScreen`
  açar; çağrı bitince `CallScreen`'in verdiği `CallSummary`'den `chatService.sendCallLogMessage()`
  ile sohbete bir çağrı-geçmişi kaydı düşer. Zaten bir görüşmedeyken gelen ikinci çağrı sessizce
  yok sayılmaz, `leave({ reject: true, reason: 'busy' })` ile gerçekten reddedilir (aksi hâlde karşı
  taraf boşuna çalıyordu). Kayıt yazarken `senderId` olarak bu cihazın değil ARAYANIN uid'si
  kullanılır, böylece iki taraf aynı yön okunu görür; `onLeave` iki kez tetiklenirse (koptu →
  ardından ayrıldı) kayıt bir kez yazılır.
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
- `src/components/LeaderboardModal.tsx` (2026-08-14'te eklendi, 2026-08-17'de **oyun bazlı** hâle
  getirildi) — Paylaşılan/global skor tablosu modalı (`leaderboardService.fetchTopScores(game)`),
  `HomeScreen`'in kendi içine gömülü kopyasından ayrı, tek bir bileşene çıkarıldı. Artık tek bir karma
  tablo değil, her oyunun (`GameHubScreen`'in `GameKey`'i) kendi ayrı sıralaması var — `highscores`
  dokümanlarına eklenen `game` alanına göre filtreleniyor (bkz. [[03-Services-Backend]]).
- `src/components/Avatar.tsx` (2026-08-16'da eklendi) — Kişiler/sohbet başlığında kullanılan dairesel
  avatar: `photoUrl` varsa fotoğraf, yoksa isim baş harfinden bir renkli placeholder; `online` prop'u
  verilirse köşede yeşil bir "çevrimiçi" noktası çiziyor.
- `src/components/StorageQuotaBanner.tsx` (2026-08-16'da eklendi) — Hesabın video/dosya yükleme
  kotasını (`userService.VIDEO_STORAGE_QUOTA_BYTES`, 5120 MB) kalıcı bir bar olarak gösterir; `variant`
  prop'u `ContactsScreen` (`'card'`) ile `ChatRoomScreen` (`'strip'`, header altına yapışık ince şerit)
  arasında farklı bir görünüm sağlıyor. %85'i geçince renk uyarıya dönüyor.
- `src/components/CallIcons.tsx` (2026-08-16'da eklendi) — Arama/video/geri gibi ikonlar artık emoji
  yerine `react-native-svg` ile çizilen ince çizgi ikonlar (`CallScreen`, header butonları).
- `src/components/AttachMenuModal.tsx`, `src/components/UpdateBanner.tsx` — bkz. [[Changelog]]
  2026-08-20 kaydı (gizli medya/genel dosya gönderme, uygulama içi güncelleme).
- `src/components/OnlineTicTacToeModal.tsx` (2026-08-16'da eklendi) — Sohbetteki kişiye karşı **canlı**
  XOX: `rooms/{roomId}/game/ticTacToe` tek bir Firestore dokümanını iki cihaz da aynı anda okuyup
  yazıyor (mesajlarla aynı "paylaşılan doküman, istemciler arasında hakemsiz" modeli, bkz.
  `ticTacToeService.ts`). `ChatRoomScreen`'den açılıyor, `GameHubScreen`'deki bilgisayara karşı XOX'tan
  (`TicTacToeGame.tsx`) tamamen ayrı bir mod.
- `src/components/ChessContactModal.tsx` (2026-08-17'de eklendi) — Aynı desende, sohbetteki kişiye
  karşı canlı satranç (`rooms/{roomId}/game/chess`, `chessService.ts`'in "contact mode"u). Satranç
  tahtası render'ı `ChessBoard.tsx`'ten paylaşılıyor.
- `src/components/ChessBoard.tsx` (2026-08-17'de eklendi, 2026-08-17/18'de yeniden tasarlandı) —
  `chess.js`'in FEN string'ini 8x8 bir tahtaya çizen, dokunarak taş seçme/hamle yapma bileşeni;
  `ChessContactModal` ve `ChessRoomScreen` arasında paylaşılıyor. Ekran boyutuna göre kendini
  ölçeklendiriyor (`size` prop'u), koordinat etiketleri ve gölge var.

### src/config
- `src/config/firebaseConfig.ts` — Sabit kodlanmış Firebase Web SDK config objesi
  (`projectId: 'kaanchatmercan'` vb.). Yorum: bu değerler tek başına "gizli" değil, gerçek erişim
  kontrolü Firestore Security Rules ile sağlanmalı. **Not:** proje kökünde artık gerçekten bir
  `firestore.rules` dosyası var ve deploy ediliyor (bkz. [[03-Services-Backend]],
  [[05-Build-Deployment]]) — bu satırdaki eski "bu repoda Security Rules dosyası yok" notu artık
  doğru değildi, düzeltildi.
- `src/config/streamConfig.ts` — Stream Video (arama) API key/secret. Placeholder değerlerle gelir,
  Stream Dashboard'da bir app oluşturulup elle doldurulmalı (bkz. [[05-Build-Deployment]]).
  "Client-side düz metin secret" deseni — bkz. [[04-Security-Notes]].

### src/theme
- `src/theme/ThemeContext.tsx` — Uygulamanın **tek** renk kaynağı (2026-08-14'te tamamen yeniden
  kuruldu, bkz. [[Changelog]]). `ThemePalette` arayüzü koyu/açık iki paleti tanımlıyor: `background`/
  `surface` mavi kimlik, `accent`/`accentText` turuncu (**sadece** birincil eylem butonları için —
  gönder/kabul-et/kaydet/ekle), `identity`/`identityText` marka mavisi (avatar/nokta/link gibi küçük
  vurgular, CTA değil), `bubbleMine`/`bubbleOther` (mesaj balonları, ikisi de mavi/nötr — turuncu
  değil), `danger`/`warning`/`success`/`*Soft` varyantları. `useTheme()` hook'u + `ThemeProvider`
  (mod tercihi `AsyncStorage`'da kalıcı). Oyunların kendi iç renk paletlerine (2048 taş renkleri,
  yılan gövdesi vb.) bilinçli olarak dokunulmadı — bkz. [[02-Screens-and-Features]].

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
- `src/screens/GameHubScreen.tsx` — Uygulamanın görünen ana ekranı (disguise'ın "ön kapısı"): artık 7
  oyunu (Blok Çılgınlığı, 2048, Yılan, Renk Hafızası, Köstebek Vurma, **XOX**, **Satranç** — son ikisi
  2026-08-16/17'de eklendi) gösteren, giriş animasyonlu bir kart ızgarası. Gizli 10-dokunuş admin
  tetikleyicisi + tek-dokunuşla-Ayarlar mekanizması burada yaşıyor (eskiden `HomeScreen`'in kendi
  menü ekranındaydı, artık hangi oyun en son oynandığından bağımsız). Bir karta dokununca o oyunu
  `{ onBack }` prop'uyla tam ekran render eder. Skor tablosu artık **oyun bazlı** — XOX/Satranç bu
  listeden hariç tutuluyor (`SCORE_LEADERBOARD_GAMES`), çünkü ikisi kazanma/kaybetmeye dayalı, bir
  sayısal skoru yok.
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
- `src/screens/TicTacToeGame.tsx` (2026-08-16'da eklendi) — `GameHubScreen`'den açılan, **bilgisayara
  karşı** tek oyunculu XOX (kişiye karşı canlı moddan tamamen ayrı, bkz. yukarıda
  `OnlineTicTacToeModal.tsx`).
- `src/screens/ChessRoomScreen.tsx` (2026-08-17'de eklendi, 2026-08-17/18'de genişletildi) —
  `GameHubScreen`'den açılan satranç ekranı, `Stage` durum makinesiyle dört mod arasında geçiş yapar:
  `menu` (oda kur / kodla katıl / bilgisayara karşı oyna seçimi), `joining` (5 karakterlik oda kodu
  girme, `chessService.joinChessRoom()`), `in_room` (oda kodlu online oyun, `subscribeToChessRoom()`
  ile canlı `chessRooms/{code}` dokümanını izler), `bot_difficulty`/`vs_bot` (bilgisayara karşı, bkz.
  `chessBotService.ts`). Tahta ekranın gerçek boyutunu (yükseklik dahil) dolduracak şekilde
  ölçekleniyor (`ChessBoard.tsx`).
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
  oturumunu kapatıyor (eski anonim tasarımda sadece navigasyon değişiyordu). 2026-08-16'da eklendi:
  kendi profil fotoğrafını değiştirme (`updateProfilePhoto()`, `Avatar.tsx`'te gösterilir) ve
  `StorageQuotaBanner` (`variant="card"`, video/dosya yükleme kotası).
- `src/screens/ChatRoomScreen.tsx` — Gerçek 1-1 sohbet ekranı (eski `AdminChatScreen`'in oda-farkında
  hâli). `getRoomId(myUid, contact.uid)` ile deterministik bir oda id'si hesaplar,
  `subscribeToMessages(roomId, ...)` ile o odaya özel mesajları dinler, `FlatList` + `MessageBubble`
  ile render eder, gönderim `sendMessage(roomId, text, myUid)` ile. Geri oku ile `onBack()` çağrılır
  (`CONTACTS`'a döner). Header'da (artık `CallIcons.tsx` ile çizgi ikonlar, eskiden emoji) 📞/🎥
  butonları `callService.startVoiceCall()`/`startVideoCall()`'ı tetikler; ayrıca kişiyle canlı XOX
  (`OnlineTicTacToeModal`) ve satranç (`ChessContactModal`) açan butonlar var. 📎 ataç butonu
  (`AttachMenuModal`) galeri/kamera'dan fotoğraf/video seçtirir (`react-native-image-picker`, gizli
  medya olarak da işaretlenebilir) veya genel bir dosya seçtirir (`react-native-documents/picker`),
  🎤 butonu basılı tutulduğu sürece ses kaydeder (`react-native-audio-recorder-player`); hepsi
  `mediaService.uploadRoomMedia()` ile Storage'a yüklenip ilgili `sendMediaMessage()` ile gönderilir;
  video/dosya yüklemeleri `addVideoBytesUsed()` ile kota sayacına ekleniyor (`StorageQuotaBanner`,
  `variant="strip"`, header altında). 2026-08-16'da eklendi: oda başına, sadece bu cihazda saklanan
  bir sohbet arka plan resmi (`chatBackgroundService.ts`, `AsyncStorage`). 2026-08-18'de eklendi:
  bir mesaja uzun basınca açılan aksiyon menüsü — **Yanıtla** (bkz. [[02-Screens-and-Features]]),
  **Sabitle/Sabiti Kaldır** (oda dokümanına tek bir "pinned message" işaretçisi yazan
  `pinMessage()`/`unpinMessage()`), sadece kendi **metin** mesajları için **Düzenle**
  (`editMessage()`, `editedAt` damgası ekler) ve **Sil** (`deleteMessage()`, mesajı tamamen silmek
  yerine içeriğini temizleyip `deleted: true` işaretleyen bir "soft delete" — karşı taraf "Bu mesaj
  silindi" placeholder'ı görür).
- `src/screens/CallScreen.tsx` — Bir `Call` nesnesini `StreamCall` ile sarar; `CallingState`'e göre
  kendi yazdığımız `RingingScreen` / `StatusOverlay` / `ActiveVoiceScreen` / `ActiveVideoScreen`
  ekranları arasında geçiş yapar (SDK'nın `RingingCallContent`/`CallContent` bileşenleri artık
  kullanılmıyor, 2026-09-06 revizyonu). `onLeave` bir `CallSummary` (`otherUserId`, `isVideo`,
  `isCreatedByMe`, `status`, `durationSeconds`) verir; `status` `'completed' | 'missed' | 'declined'`
  — reddedilen arama, arayan tarafta `call.rejected` olayının `reason`'ı okunarak cevapsızdan
  ayırt edilir (`'cancel'`/`'timeout'` reddetme sayılmaz).

  Tasarım: her iki temada da koyu, tam ekran bir yüzey (`SURFACE` sabiti). `react-native-svg` ile
  marka rengine boyanmış radyal gradyan arka plan (`CallBackdrop`), çalarken avatarın arkasından
  yayılan iki halkalı nabız (`PulsingRings`), ve tüm kontroller `CallIcons.tsx`'teki SVG ikonlarla
  (`ControlButton`; `active` durumu düğmeyi aydınlık dolguya çevirir). Görüntülü aramada karşı taraf
  tam ekran (`ParticipantView`, `objectFit="cover"`), kendi kameran ise üstte sürüklenebilir küçük
  bir dikdörtgende (`DraggableSelfView` — `PanResponder` + `Animated.ValueXY`, bırakınca en yakın
  köşeye yaylanır; `videoZOrder={1}` şart, yoksa uzak görüntünün ARKASINDA kalıp hiç görünmez).

  Davranış düzeltmeleri: sesli arama kulaklıktan / görüntülü arama hoparlörden başlar
  (`callManager.start`'ın `deviceEndpointType`'ı; temizlikte `callManager.stop()` rotayı işletim
  sistemine geri verir). Cevaplanmayan giden arama `RINGING_TIMEOUT_MS` (45 sn) sonunda kendini
  iptal eder. Karşı taraf kapattığında `call.session_participant_left` / `call.ended` /
  `call.session_ended` olayları dinlenerek arama bu tarafta da kapatılır (Stream birebir aramayı
  kendiliğinden sonlandırmıyor); yedek olarak uzak katılımcı `REMOTE_GONE_GRACE_MS` (2,5 sn)
  boyunca yoksa da kapatılır. `useCallCustomData` hook'u kullanılır (`call.state.custom`
  doğrudan okunduğunda alıcıda geç gelen veri render tetiklemiyordu).

  2026-08-17'de eklendi: arama sırasında ses çıkış cihazını (hoparlör/kulaklık/Bluetooth) değiştirmek
  için bir buton + alt menü (`audioOutputService.ts`, canlı cihaz listesi, Ayarlar'da kalıcı tercih).

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
  gönderilemiyor) — bkz. [[04-Security-Notes]]. 2026-08-16'da eklendi: `updateProfilePhoto(uid,
  dataUri)` (profil fotoğrafını `users/{uid}.photoUrl`'e base64 data URI olarak yazar, `mediaService`
  gibi Storage'sız), `subscribeToUserProfile(uid, cb)` (canlı profil dinleyici, `photoUrl`/
  `videoBytesUsed` döner), `VIDEO_STORAGE_QUOTA_BYTES` (5120 × 1024 × 1024 — 5 GB, sabit/self-imposed
  bir sınır) ve `addVideoBytesUsed(uid, bytes)` (`increment()` ile `users/{uid}.videoBytesUsed`'i
  artırır — video ya da genel dosya mesajı gönderilince çağrılır, **uygulanan bir sert limit değil**,
  sadece bilgilendirici bir sayaç/banner).
- `src/services/contactService.ts` — Kişi listesi katmanı. `users/{myUid}/contacts/{contactUid}`:
  `{ name, addedAt }`. `addContact()` (tek yönlü ekleme) ve `subscribeToContacts()` (canlı, isme göre
  sıralı liste) export eder. `Contact` tipi burada tanımlı, `ChatRoomScreen`/`AppNavigator` tarafından
  da kullanılıyor.
- `src/services/chatService.ts` — Firestore sohbet veri erişim katmanı, artık **oda tabanlı**
  (eskiden tek sabit `'messages'` koleksiyonuydu — o eski tasarım/veri artık kullanılmıyor, bkz.
  [[Changelog]]). `getRoomId(uidA, uidB)` iki uid'i sıralayıp birleştirerek deterministik bir oda id'si
  üretir (kim kimi açarsa açsın aynı id). Mesajlar `rooms/{roomId}/messages` altında (limit 300,
  `createdAt asc`). `MessageType` artık `'text'|'image'|'video'|'audio'|'file'|'call'`;
  `sendCallLogMessage()` bir çağrının bitişini (`callVideo`/`callStatus: 'completed'|'missed'`/
  `durationSeconds`) sohbete yazar. `subscribeToLatestMessage(roomId, ...)` — `subscribeToMessages`'ın
  hafif kardeşi, tek belge (`orderBy desc, limit 1`), `NotificationCenter`'ın N oda dinlemesi için
  (300'lük tam geçmişi N kere çekmek yerine). 2026-08-18'de eklendi: `editMessage(roomId, messageId,
  newText)` (sadece gönderen, sadece `text` tipi, `editedAt` damgalar), `deleteMessage(roomId,
  messageId)` (soft-delete: `deleted: true` + içerik alanlarını temizler, doküman/sıra korunur),
  `pinMessage()`/`unpinMessage()` (`rooms/{roomId}` doküman seviyesinde tek bir sabitlenmiş-mesaj
  işaretçisi — oda başına aynı anda sadece bir sabit mesaj olabilir). 2026-08-20'de eklendi: `replyTo`
  alanı (bkz. [[02-Screens-and-Features]] "kaydırarak/uzun-basarak yanıtlama"), `fileName`/`fileSize`
  (`type: 'file'` için) ve `hidden` (`image`/`video` için "gizli medya" bayrağı). Tüm bu kısmi
  güncellemeler `firestore.rules`'ta dar, alan-bazlı `allow update` carve-out'larıyla korunuyor (bkz.
  [[03-Services-Backend]]).
- `src/services/leaderboardService.ts` — Herkese açık, paylaşılan skor tablosu. Sabit koleksiyon
  `'highscores'`: `{ name, score, game, createdAt }`. `submitScore(name, score, game)` ve
  `fetchTopScores(game)` (top 20, skora göre azalan, `game` alanına göre filtreli) export eder.
  2026-08-17'de **oyun bazlı** hâle getirildi (öncesinde tek karma tablo vardı, bkz. [[Changelog]]) —
  her `GameHubScreen` oyununun kendi ayrı sıralaması var. Kullanıcı kimliğine/uid'e bağlı değil —
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
- `src/services/callService.ts` — Stream Video entegrasyonu: `getOrCreateStreamClient(uid,
  username)` (aynı uid için her çağrıda aynı client instance'ını döner), `disconnectStreamClient()`
  (çıkışta `userService.logoutAccount()` içinden çağrılır — yoksa önceki hesap Stream'e bağlı kalıp
  kendi arama olaylarını almaya devam ediyordu), `startVoiceCall()`/`startVideoCall()`
  (`client.call('default', callId).getOrCreate({ ring: true, ... })`).

  **`callId` üretimi (`buildCallId`) iki kez ısırdı, dikkat:**
  1. Kimlik KALICI'dır: bitmiş bir aramanın kimliğiyle `getOrCreate` çağrılırsa aynı, sonlanmış
     arama nesnesi döner ve bir daha çalmaz. Eskiden kimlik sadece iki uid + tür idi, bu yüzden bir
     kişiyle YALNIZCA ilk arama çalışıyordu. Artık rastgele bir sonek var.
  2. Kimlik **en fazla 64 karakter** olabilir; aşarsa Stream `400 "id must be at maximum 64
     characters in length"` döner ve arama hiç başlamaz. İki tam 28 karakterlik Firebase uid'i +
     tür zaten 63 karakterdi (sınırın bir altı), yani (1)'in ilk denemesinde eklenen sonek her
     aramayı bozdu. Şimdi her uid'in ilk 8 karakteri alınıyor (~34 karakter) ve sonuç ayrıca
     `MAX_CALL_ID_LENGTH`'e kırpılıyor.

  Token üretimi (`generateStreamToken`) `crypto-js` ile cihazda HS256 JWT imzalıyor; token'da artık
  24 saatlik bir `exp` var (Stream `tokenProvider`'ı gerektiğinde yenisini istiyor) — bkz.
  [[04-Security-Notes]] "Stream arama token'ları".
- `src/services/audioOutputService.ts` (2026-08-17'de eklendi) — Arama sırasındaki ses çıkış cihazı
  tercihini (hoparlör/kulaklık/Bluetooth) canlı cihaz listesiyle sunar, seçim `AsyncStorage`'da kalıcı.
- `src/services/ticTacToeService.ts` (2026-08-16'da eklendi) — Sohbetteki kişiye karşı canlı XOX'un
  Firestore katmanı: `rooms/{roomId}/game/ticTacToe` (sabit doküman id, aynı anda odada tek bir aktif
  oyun). `startGame()` (başlatan her zaman X), `playMove()` (sırası kendindeyse ve hücre boşsa hamleyi
  uygular, kazanma/berabere kontrolü client-side), `subscribeToGame()`. Mesajlarla aynı "paylaşılan
  doküman, istemciler arasında hakemsiz" güven modeli — bkz. [[04-Security-Notes]].
- `src/services/chessService.ts` (2026-08-17'de eklendi) — `chess.js` ile satranç kural motoru + iki
  ayrı Firestore modu: **contact mode** (`rooms/{roomId}/game/chess`, `ticTacToeService`'in birebir
  aynısı deseni, sadece sohbetteki kişiyle) ve **room-code mode** (`chessRooms/{code}`, 5 karakterlik
  rastgele bir kodla **kişi listesi dışından herkesin** katılabildiği, anonim auth'la bile erişilebilen
  ayrı bir oyun — `createChessRoom()`/`joinChessRoom()` (yarış durumunu önlemek için `runTransaction`
  ile), `restartChessRoom()`). Hamleler `chess.js`'in `Chess.move()`'u ile legal mi diye kontrol
  edilip FEN string'i güncelleniyor; illegal bir hamle sessizce yok sayılıyor.
- `src/services/chessBotService.ts` (2026-08-18'de eklendi) — Bilgisayara karşı satranç: kolay
  zorlukta basit bir yerel minimax (derinlik 1), orta/zor zorlukta **Stockfish Online API**'ye
  (`https://stockfish.online/api/s/v2.php`, 3. parti, ücretsiz, kimlik doğrulama gerektirmiyor) FEN
  pozisyonu gönderip en iyi hamleyi istiyor (9 sn timeout, API başarısız olursa yerel minimax'e geri
  dönüyor). Ayrıca oynanan hamlenin kalitesini (`classifyMove`) sınıflandırıp UI'da gösteriyor.
  **Gizlilik notu:** bu API çağrısı FEN (yalnızca tahta pozisyonu, kimlik bilgisi taşımıyor) gönderiyor
  — bkz. [[04-Security-Notes]].
- `src/services/chatBackgroundService.ts` (2026-08-16'da eklendi) — Oda başına, **sadece bu cihazda**
  saklanan (iki taraf arasında senkronize edilmeyen, tema tercihiyle aynı ruh) bir sohbet arka plan
  resmi: `getChatBackground(roomId)`/`setChatBackground(roomId, dataUriOrNull)`, `AsyncStorage`.
- `src/services/mediaService.ts` — `uploadRoomMedia(roomId, kind, localUri, extension)`: bir
  `file://` uri'sini Firebase Storage'a `rooms/{roomId}/media/{kind}/` altına yükler, indirme URL'i
  ve yüklenen boyutu (`sizeBytes`, 2026-08-16'da `StorageQuotaBanner`/`addVideoBytesUsed` için eklendi)
  döner. Video ve genel dosya (`type: 'file'`) mesajları için kullanılıyor — fotoğraflar hâlâ Storage'a
  hiç uğramıyor, bkz. [[03-Services-Backend]]. Erişim kontrolü `storage.rules`'ta (aynı oda-üyeliği
  modeli).

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
- `chess.js` (2026-08-17'de eklendi) — Satranç kural motoru (legal hamle kontrolü, FEN parse/serialize,
  şah/mat/berabere tespiti), `src/services/chessService.ts`'te kullanılıyor. Saf JS, native modül değil
  — `pc-client/index.html` de aynı paketi (`chess.js@1.4.0`) `esm.sh` CDN'inden import edip aynı
  hamle mantığını tekrarlıyor (bkz. aşağıda "PC istemcisi").
- `react-native-fs`, `react-native-blob-util`, `react-native-device-info`,
  `@react-native-documents/picker` (2026-08-20'de eklendi) — sırasıyla: güncelleme APK'sını indirme
  (`updateService.ts`), genel dosya mesajlarını cihaza kaydetme, cihazın kurulu `versionCode`'unu
  okuma, ve genel dosya seçme. Hepsi için `__mocks__/` altında Jest mock'u var.
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
crash reporting.

**Push notification — artık kısmen entegre (eskiden hiç yoktu):** `@notifee/react-native` ve
`@react-native-firebase/messaging` sadece kurulu duran boş bağımlılıklar değil, gerçekten kullanılıyor:
`src/services/fcmService.ts` FCM token'ını alıp `users/{uid}/fcmTokens/{token}` dokümanına yazıyor
(v8.7 öncesinde tek bir `users/{uid}.fcmToken` alanıydı; telefon ve PC birbirinin token'ını eziyordu),
bir notifee kanalı
kuruyor (`game_notifications_v2`) ve hem foreground (`onMessage`) hem arka plan/kapalı
(`setBackgroundMessageHandler`, `index.js`'te kayıtlı) mesajlar için "Mini Oyunlar" kılıklı sahte bir
bildirim gösteriyor (`displayFakeGameNotification`) — disguise bozulmasın diye bildirime dokununca
sohbete deep-link yapmıyor, sadece uygulamayı normal açıyor. Sunucu tarafı (gerçek push'u tetikleyen
Cloud Function) `functions/` altında; `users/{uid}.notificationsEnabled` alanına bakıyor
(`fcmService.syncNotificationsEnabledToServer`, Ayarlar'daki aç/kapa ile senkron). Bu, proje artık
Blaze planında olduğu için mümkün oldu — bkz. `YAPILACAKLAR.txt`'in eski "opsiyonel" push bölümü,
büyük ölçüde tamamlanmış durumda.

**Uygulama içi güncelleme sistemi (yeni):** `src/services/updateService.ts` +
`src/components/UpdateBanner.tsx`, Firestore `app_config/android` dokümanından
(`versionCode`/`versionName`/`apkUrl`/`notes`) daha yeni bir sürüm olup olmadığını kontrol eder
(`react-native-device-info` ile cihazın kurulu `versionCode`'unu okuyup karşılaştırır), varsa APK'yı
`react-native-fs` ile indirip `NativeModules.ApkInstaller` (custom native modül, bkz. aşağıda) ile
sistem paket yükleyicisine teslim eder. Detay: [[03-Services-Backend]], [[05-Build-Deployment]].

## android/ ve ios/

- Android `applicationId`/`namespace`: `com.mobile` (`android/app/build.gradle`). `versionCode 6`,
  `versionName "1.2.3"` (sık güncellenir, güncel değer için doğrudan `build.gradle`'a bak). Standart
  RN Kotlin scaffold'un yanında artık bir **custom native modül** var: `ApkInstallerModule.kt` +
  `ApkInstallerPackage.kt` (`android/app/src/main/java/com/mobile/`) — `updateService.ts`'in indirdiği
  APK dosyasını `FileProvider` (`res/xml/file_paths.xml`) üzerinden sistem paket yükleyicisine
  (`ACTION_INSTALL_PACKAGE` intent'i) veren tek metotlu (`install(path)`) bir modül,
  `MainApplication.kt`'a `ApkInstallerPackage` olarak kayıtlı.
- iOS bundle id hâlâ RN CLI varsayılanı (`org.reactjs.native.example.$(PRODUCT_NAME...)`),
  release için özelleştirilmemiş. Custom native modül yok, standart Swift `AppDelegate.swift`.

## PC istemcisi (`pc-client/`, 2026-08-16'da eklendi)

`pc-client/index.html` — **tek dosyalık**, build adımı olmayan bir masaüstü sohbet istemcisi. React
Native/Metro/Node ile hiçbir ilişkisi yok; bu proje ağacında sadece Firestore veri modelini paylaştığı
için duruyor. Kullanım: dosyaya çift tıklayıp doğrudan tarayıcıda `file://` protokolüyle açmak
(paketlenmiş bir uygulama değil, internete de yayınlanmıyor — hosting'e/`public/`e dahil değil).

- **Mimari:** Firebase JS SDK'sını doğrudan `https://www.gstatic.com/firebasejs/12.17.1/...` CDN'inden
  ES module olarak import ediyor (`firebase-app`/`firebase-auth`/`firebase-firestore`/
  `firebase-storage`), `src/config/firebaseConfig.ts` ile **aynı** `kaanchatmercan` proje config'ini
  elle kopyalanmış olarak içinde tutuyor (tek dosya, build/paylaşılan config sistemi yok — mobil
  taraf `firebaseConfig.ts`'i değiştirirse burası da elle güncellenmeli). Ayrı bir backend/API sunucusu
  **yok** — mobil uygulamanın kullandığı aynı Firestore koleksiyonlarına (`users`, `rooms/{roomId}/
  messages`, `rooms/{roomId}/game/*`, `chessRooms/{code}`) doğrudan istemciden okuyup yazıyor, aynı
  `firestore.rules`/`storage.rules` kuralları geçerli.
- **Kimlik doğrulama:** Mobil ile birebir aynı desen — `usernameToEmail()` kullanıcı adını sahte bir
  e-postaya çeviriyor, `signInWithEmailAndPassword`/`createUserWithEmailAndPassword` ile giriş/kayıt.
  Yani **aynı hesapla** hem telefonda hem PC'de aynı anda oturum açılabiliyor, aynı kişi listesi/
  sohbetler görünüyor (backend zaten cihazdan bağımsız kimlik üzerine kurulu, bkz.
  [[03-Services-Backend]]).
- **`file://` kaynaklı auth persistence sorunu (2026-08-16, `4c73d04`'te düzeltildi):** Firebase Auth'un
  varsayılan IndexedDB tabanlı kalıcılığı `file://` origin'inde Chrome'da "Database is closing/hidden"
  hatasıyla girişi tamamen bozuyordu — çözüm `browserLocalPersistence` yerine elle `localStorage`
  tabanlı bir persistence kullanmak oldu (dosyanın içindeki yorumda detaylı açıklanıyor).
- **Desteklenen özellikler:** Metin/fotoğraf/video mesajlaşma (fotoğraf base64/Firestore, video
  Storage'a yükleme — mobille aynı model), kişi listesi (canlı `onSnapshot`), sohbetteki kişiye karşı
  canlı **XOX** ve **satranç** (aynı `rooms/{roomId}/game/{ticTacToe|chess}` dokümanlarını okuyup
  yazıyor — yani bir PC kullanıcısıyla bir telefon kullanıcısı aynı XOX/satranç oyununu karşılıklı
  oynayabilir), depolama kotası göstergesi (`renderQuota`, mobildeki `StorageQuotaBanner` ile aynı
  `videoBytesUsed`/5120 MB mantığı), açık/koyu tema (mobil `ThemeContext.tsx`'in renk paletiyle elle
  senkronize tutulan CSS custom property'leri), gerçek içerikli **masaüstü bildirimleri** (tarayıcının
  yerleşik `Notification` API'si — mobildeki "Mini Oyunlar" kılıklı sahte bildirimden farklı olarak PC
  istemcisi disguise kaygısı taşımıyor, doğrudan kişi adı/mesaj metnini gösteriyor).
- **Desteklenmeyenler:** Sesli/görüntülü arama (Stream Video entegrasyonu yok), sesli mesaj, mesaj
  yanıtlama/düzenleme/silme/sabitleme/emoji tepkisi/okundu-tikleri (bunlar sadece mobil tarafta var),
  gizli medya/genel dosya gönderme, uygulama içi güncelleme sistemi (zaten bir "uygulama" değil, tek
  bir HTML dosyası).
- **Güvenlik notu:** Bu dosya `src/config/firebaseConfig.ts` ile aynı (public olsa da) Firebase
  config'ini içinde taşıyor; mobil tarafındaki tüm "gerçek erişim kontrolü Firestore Security
  Rules'a bağlı" uyarıları burada da birebir geçerli — bkz. [[04-Security-Notes]].
- `compileSdkVersion`/`targetSdkVersion`: 36, `minSdkVersion`: 24, `buildToolsVersion`: 36.0.0,
  `ndkVersion`: 27.1.12297006 (bkz. `android/build.gradle`).
