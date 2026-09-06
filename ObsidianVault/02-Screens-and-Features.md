# Ekranlar, Navigasyon Akışı ve Özellikler

Bağlam için önce [[00-START-HERE]] dosyasına bak. Dosya detayları için [[01-Architecture]].

## Navigasyon akışı

Kütüphanesiz, `src/navigation/AppNavigator.tsx` içinde elle yazılmış durum makinesi:

```
HOME (GameHubScreen — oyun seçme menüsü)
  ├─ bir oyun kartına dokun → o oyun tam ekran (Blok Çılgınlığı / 2048 / Yılan / Renk Hafızası /
  │    Köstebek Vurma / XOX / Satranç) → "‹ Menü" ile GameHubScreen'e döner
  └─ dişli ikonuna 3.5 sn içinde 10 dokunuş → ACCOUNT (AccountScreen — gerçek kullanıcı adı/şifre girişi)
       ├─ zaten kayıtlı bir oturum varsa → form atlanır, otomatik → CONTACTS
       ├─ giriş/kayıt başarılı → CONTACTS (ContactsScreen — kişi listesi)
       │    ├─ bir kişiye dokun → CHAT_ROOM (ChatRoomScreen — o kişiyle 1-1 sohbet)
       │    │    └─ geri ok → CONTACTS
       │    └─ "Çıkış" → gerçekten Firebase oturumu kapanır (logoutAccount) → HOME
       └─ "Vazgeç" → HOME
```

(Dişliye tek dokunuş, ~550ms gecikmeyle, Ayarlar'ı açar — 10'lu seriyi bozmadan. Bkz. aşağıda
"GameHubScreen — oyun seçme menüsü".)

Android donanım geri tuşu: `ACCOUNT`/`CONTACTS` → `HOME`, `CHAT_ROOM` → `CONTACTS`.

**Eskiden burada iki ayrı "giriş" katmanı vardı** — dişli tetikleyicisi önce sahte/mock bir
`AdminLoginScreen` (decoy şifre, gerçek kimlik doğrulama değil) açıyordu, onu geçince gerçek
`AccountScreen`'e geçiliyordu. Bu decoy katmanı tamamen kaldırıldı (bkz. [[Changelog]]) — artık
gizli tetikleyici doğrudan gerçek Firebase Auth girişine açılıyor. Gizliliğin kaynağı hâlâ jestin
kendisi (dişliye 10 dokunuş) ve bunun görünmez olması, ama artık arkasında sahte bir şifre kontrolü
yok.

## GameHubScreen — oyun seçme menüsü (görünen yüz)

- Uygulamanın gerçek "ön kapısı" — `HOME` durumunda render edilen ekran artık bu, doğrudan Blok
  Çılgınlığı değil. Giriş animasyonlu (`Animated.stagger`, sırayla beliren kartlar) bir 2 sütunlu
  ızgarada artık 7 oyun kartı: Blok Çılgınlığı 🧩, 2048 🔢, Yılan 🐍, Renk Hafızası 🎵, Köstebek Vurma
  🔨, **XOX** ❌ ve **Satranç** ♟️ (son ikisi 2026-08-16/17'de eklendi).
- Bir karta dokununca `playTapSound()` çalar ve o oyun tam ekran render edilir (`{ onBack }` prop'u
  ile — her oyun kendi "‹ Menü" linkiyle buraya geri döner). XOX ve Satranç kartları burada
  **bilgisayara karşı** modu açar (`TicTacToeGame.tsx`, `ChessRoomScreen.tsx`) — sohbetteki bir
  kişiye karşı canlı oynamak ayrı bir giriş noktası, bkz. aşağıda "ChatRoomScreen".
- Skor tablosu artık **oyun bazlı**: her kartın kendi en-yüksek-skoru (rozet) ve `LeaderboardModal`'ı
  `game` anahtarına göre ayrı bir sıralama gösteriyor. XOX/Satranç bu sıralamadan hariç — kazan/
  kaybet/berabere odaklı, sayısal bir skorları yok.
- **Gizli tetikleyici burada yaşıyor:** köşedeki `⚙` ikonuna `REQUIRED_TAPS` (10) kez `TAP_RESET_MS`
  (3.5 sn) içinde dokununca `onAdminTriggerReached()` çağrılır — eskiden bu mekanizma Blok
  Çılgınlığı'nın kendi menü ekranındaydı (yani sadece o oyunun menüsündeyken erişilebilirdi); artık
  hub'da olduğu için hangi oyunu en son oynadığından bağımsız her zaman erişilebilir. Aynı ikona
  gecikmeli (550ms) tek dokunuş `SettingsModal`'ı açar.

## HomeScreen — "BLOK ÇILGINLIĞI" oyunu

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
- Artık `GameHubScreen` tarafından render ediliyor (`{ onBack }` prop'u ile) — gizli tetikleyici ve
  Ayarlar dişlisi burada değil, bkz. yukarıdaki "GameHubScreen" bölümü.

## Diğer mini oyunlar (2048, Yılan, Renk Hafızası, Köstebek Vurma, XOX, Satranç)

Hepsi `GameHubScreen`'den `{ onBack }` prop'uyla açılan, kendi `AsyncStorage` en-yüksek-skor
anahtarına sahip, bağımsız ekranlar. Ortak desen: `useTheme()` ile tema-duyarlı, ses efektleri
`soundService`'ten, oyun bitince `hapticsService.vibrateMedium()`.

- **Game2048** (`src/screens/Game2048.tsx`) — 4x4 klasik 2048. Her taş kararlı bir `id` taşıyor
  (`TileData[]`), bu sayede `moveTiles()` her taşın kayma/birleşme hedefini döndürebiliyor ve her
  taş kendi `Animated.ValueXY`'siyle (native driver) kayarak taşınıyor; birleşince pop/bounce,
  doğunca scale-in, "yutulan" taş hedefe kayıp solarak kayboluyor (`GhostTileView`). İlk kez 2048'e
  ulaşınca `playWinSound()` + kısa bir banner (oyun devam ediyor, klasik 2048 gibi).
- **Yılan** (`src/screens/SnakeGame.tsx`) — 14x14 kafes. Akıcı hareket için tüm yılan segmentleri
  **tek bir paylaşılan** `Animated.Value` (`progress`, 0→1) üzerinden interpolate ediliyor — her
  tick'te `{from,to}` çiftleri hesaplanıp `progress` sıfırlanıp yeniden animate ediliyor, segment
  başına ayrı bir component/ref gerekmiyor. Yem yendikçe tick hızı artıyor (zorluk).
- **Renk Hafızası** (`src/screens/ColorMemoryGame.tsx`) — Simon tarzı: 4 renkli ped, her turda
  dizi bir eleman büyüyor, oynatılırken her ped kendi notasını çalıyor (`playNoteSound(index)`),
  kullanıcı aynı sırayla dokunmalı; yanlışta `playWrongSound()` + oyun biter.
- **Köstebek Vurma** (`src/screens/WhackAMoleGame.tsx`) — 3x3 delik, 30 saniyelik tur. Tek seferde
  bir köstebek aktif, süre boyunca görünme süresi kısalıyor (zorlaşıyor). Kaçırılan köstebek
  (zaman aşımı) `playMissSound()` çalar ama puan kaybettirmiyor.
- **XOX — bilgisayara karşı** (`src/screens/TicTacToeGame.tsx`, 2026-08-16'da eklendi) — Klasik 3x3
  tek oyunculu XOX, GameHub'dan açılır. Sohbetteki bir kişiye karşı **canlı** XOX (`ChatRoomScreen`
  → `OnlineTicTacToeModal`) tamamen ayrı bir mod, aynı skor rozetine dahil değil.
- **Satranç — bilgisayara karşı / oda kodlu online** (`src/screens/ChessRoomScreen.tsx`,
  2026-08-17'de eklendi, 2026-08-17/18'de tam ekran yeniden tasarlandı) — GameHub'dan açılınca üç
  seçenek sunan bir menü: (1) **Oda kur** — 5 karakterli rastgele bir kod üretir (`createChessRoom()`),
  kodu paylaşıp ikinci oyuncunun katılmasını bekler (`status: 'waiting'`); (2) **Kodla katıl** —
  girilen kodu `joinChessRoom()` ile arar, doluysa/yoksa/kendi odansa hata gösterir; (3) **Bilgisayara
  karşı oyna** — kolay/orta/zor zorluk seçilir (`chessBotService.ts`), orta/zor **Stockfish Online
  API**'sini kullanıyor (internet gerektirir), kolay tamamen cihazda çalışan basit bir minimax.
  Oynanan her hamlenin kalitesi (`classifyMove`) değerlendirilip kullanıcıya gösteriliyor. Oda kodlu
  mod, kişi listesinden bağımsız — kodu bilen **herkes** (anonim girişle bile) katılabilir, bkz.
  [[03-Services-Backend]]/[[04-Security-Notes]]. Sohbetteki bir kişiye karşı **canlı** satranç
  (`ChatRoomScreen` → `ChessContactModal`) ayrı, üçüncü bir mod.

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

## ContactsScreen — ana sayfa / gösterge paneli (artık sadece düz kişi listesi değil)

`account` prop olarak gelir (artık kendi başına auth yapmıyor, önceki adımda zaten giriş yapıldı).
2026-08-14'teki geçişle (bkz. [[Changelog]]) bu ekran bir gösterge paneline dönüştürüldü — sıralama
şöyle:

1. **Oyunlar kısayolu** — bir karta dokununca `onOpenGames()` çağrılır (`AppNavigator`'da bu
   `HOME`'a döner, yani `GameHubScreen`'e geri götürür).
2. **Favoriler** — sadece `favorite: true` işaretli kişiler varsa gösterilen yatay satır (★
   simgesine dokunarak sohbet listesindeki herhangi bir satırdan aç/kapa yapılabilir,
   `setContactFavorite()`).
3. **Çevrimiçi** — son 60 saniye içinde bir "kalp atışı" göndermiş kişiler (bkz. [[03-Services-
   Backend]] "Presence/çevrimiçi göstergesi"), en fazla 8 tanesi.
4. **Son Aramalar** — en son mesajı bir çağrı-geçmişi kaydı (`type: 'call'`) olan kişiler, en yeni
   önce, en fazla 5 tanesi. Ekstra bir Firestore sorgusu **yok** — zaten her kişi için çekilen "son
   mesaj" verisinden türetiliyor.
5. **Sohbetler** — asıl kişi listesi, artık alfabetik değil **en son etkinliğe göre** sıralı; her
   satırda bir ★ favori aç/kapa butonu var.

Diğer davranışlar değişmedi: `subscribeToContacts()` ile canlı dinleme, "+ Kişi Ekle" modalı
(`findUserByUsername()` + tek yönlü `addContact()`), bir kişiye dokununca `onOpenRoom(contact)` ile
`CHAT_ROOM`'a geçiş, "Çıkış" → gerçekten `logoutAccount()`.

**2026-08-16'da eklendi — profil fotoğrafı ve depolama kotası:** Üstteki `@kullaniciadi`'nın yanında
artık kendi profil fotoğrafını değiştirebiliyorsun (galeriden seçip `updateProfilePhoto()` ile
`users/{uid}.photoUrl`'e base64 olarak yazılıyor, Storage'sız — fotoğraf mesajlarıyla aynı yöntem);
her kişi satırında da o kişinin (varsa) profil fotoğrafı `Avatar.tsx` ile gösteriliyor
(`subscribeToUserProfile()` ile canlı). Dashboard'un altında kalıcı bir `StorageQuotaBanner`
(`variant="card"`) hesabın video/dosya yükleme kullanımını (`videoBytesUsed` / 5120 MB) gösteriyor —
bu bir sert limit değil, sadece bilgilendirici bir gösterge.

**Önemli — kılık değiştirme (disguise) ile ilişkisi:** Bu gösterge paneli özellikleri bilinçli
olarak **sadece** bu ekrana eklendi, `GameHubScreen`'e (herkesin gördüğü ön kapı) DEĞİL — kullanıcıya
bu ayrım açıkça soruldu ve onaylandı. `GameHubScreen` hâlâ zararsız bir "mini oyunlar" menüsü
olarak kalıyor, son aramalar/favoriler/çevrimiçi durumu gibi hiçbir sohbet ipucu sızdırmıyor.

## ChatRoomScreen — bir kişiyle 1-1 sohbet

- `getRoomId(myUid, contact.uid)` ile deterministik bir oda id'si hesaplanır (iki taraf da aynı
  odayı açar).
- `subscribeToMessages(roomId, ...)` (Firestore canlı dinleyici), `FlatList` + `MessageBubble` ile
  mesaj listesi, yeni mesajda otomatik aşağı kaydırma.
- Metin gönderimi `sendMessage(roomId, text, myUid)` ile.
- **Fotoğraf/video gönderme:** 📎 butonu (`AttachMenuModal`) bir seçim gösterir (Galeri / Kamera →
  `react-native-image-picker`); seçilen dosya `mediaService.uploadRoomMedia()` ile Storage'a
  yüklenir, sonra `sendMediaMessage(roomId, myUid, 'image'|'video', mediaUrl)` ile gönderilir.
  **Gizli medya:** gönderirken "gizli" işaretlenen fotoğraf/video `hidden: true` ile gönderilir;
  `MessageBubble` bunu bir blur/örtü overlay'i ile gösterir ("Gizli Fotoğraf"/"Gizli Video" etiketi +
  göster butonu), alıcı dokununca açılır — sınırsız kez tekrar görüntülenebilir (tek seferlik/
  kendi kendini yok eden bir mekanizma değil).
- **Genel dosya gönderme:** 📎 menüsünden resim/video dışında herhangi bir dosya da seçilip
  gönderilebiliyor (`react-native-documents/picker`, `MessageType: 'file'`); alıcı tarafta dosya adı
  ve boyutu gösteriliyor, dokununca cihazın İndirilenler klasörüne kaydedilebiliyor
  (`react-native-blob-util`).
- **Sesli mesaj:** 🎤 butonu basılı tutulduğu sürece kayıt yapar (`react-native-audio-recorder-player`
  singleton'ı), bırakınca kayıt durur, Storage'a yüklenir, süresi (saniye) ile birlikte
  `sendMediaMessage(..., 'audio', mediaUrl, durationSeconds)` ile gönderilir.
- **Arama:** header'daki 📞 (`startVoiceCall`) / 🎥 (`startVideoCall`) butonları
  `callService.ts` üzerinden Stream Video'da o kişiyle `ring: true` bir çağrı oluşturur — arama
  ekranı bu ekrandan değil, `CallProvider`'ın global `IncomingCallWatcher`'ı üzerinden açılır (bkz.
  aşağıdaki "Sesli/görüntülü arama" bölümü).
- **Çevrimdışı uyarısı:** `useNetworkStatus()` (`@react-native-community/netinfo`) `false` dönerse
  üstte "📡 İnternet bağlantısı yok" banner'ı gösterilir (aynısı `ContactsScreen`'de de var).
- **Depolama kotası:** header'ın altında `StorageQuotaBanner` (`variant="strip"`), video/genel dosya
  yükledikçe artan kullanım göstergesi (bkz. `ContactsScreen` bölümü, aynı mekanizma).
- **Sohbet arka planı (2026-08-16'da eklendi):** Ayarlar menüsünden galeriden bir arka plan resmi
  seçilebiliyor; **sadece bu cihazda**, oda başına saklanıyor (`chatBackgroundService.ts`,
  `AsyncStorage`) — karşı tarafa senkronize edilmiyor, tema tercihiyle aynı ruhta yerel bir görsel
  tercih. "Arka planı kaldır" ile temizlenebiliyor.
- **Mesajı sabitleme/düzenleme/silme (uzun-basma menüsü, 2026-08-18'de eklendi):** Bir mesaja uzun
  basınca açılan aksiyon kartında Yanıtla'nın (aşağı bkz.) yanında: **Sabitle/Sabiti Kaldır**
  (odanın `rooms/{roomId}` dokümanına tek bir sabitlenmiş-mesaj işaretçisi yazar — aynı anda odada tek
  bir sabit mesaj olabilir), sadece kendi gönderdiğin **metin** mesajları için **Düzenle** (`editMessage()`
  — mesaj kutusuna eski metin dolar, "Kaydet" ile üzerine yazar, karşı tarafta "(düzenlendi)" ibaresi
  görünür) ve **Sil** (`deleteMessage()` — mesaj tamamen silinmiyor, içeriği temizlenip `deleted: true`
  işaretleniyor; karşı taraf "Bu mesaj silindi" placeholder'ı görür, "geri alma" yok).
- **Sohbetteki kişiye karşı canlı XOX/Satranç (2026-08-16/17'de eklendi):** Header'daki ilgili
  butonlar `OnlineTicTacToeModal`/`ChessContactModal`'ı açar — bu kişiyle **gerçek zamanlı** bir oyun
  (Firestore `rooms/{roomId}/game/ticTacToe|chess` tek dokümanı iki cihaz tarafından da okunup
  yazılıyor), `GameHubScreen`'deki bilgisayara karşı modlardan tamamen ayrı, bkz. yukarıda "Diğer mini
  oyunlar".
- **Kaydırarak/uzun-basarak yanıtlama (reply, 2026-08-20'de eklendi):** Bir mesaj balonunu sağa ya da
  sola sürükleyip `SWIPE_REPLY_THRESHOLD`'u geçince (WhatsApp tarzı, balon parmağı takip eder,
  bırakınca yaylanarak geri döner) ya da uzun-basma menüsünden "Yanıtla"ya dokununca
  `onReply(message)` tetiklenir (`MessageBubble.tsx`). `ChatRoomScreen` bunu `replyingTo` state'inde
  tutar, gönderim kutusunun üstünde "Yanıtlıyorsun: ..." önizlemesi gösterir (`replyPreviewLabel()` —
  metin olmayan tipler için tek satırlık bir özet üretir), iptal edilebilir. Gönderilen mesaj
  `chatService.ts`'teki `ChatMessage.replyTo` alanına orijinal mesajın bir **anlık görüntüsünü**
  (`messageId`, `text`, `senderId`, `type`) yazar — canlı bir referans değil, bu yüzden orijinal mesaj
  sonradan değişse/silinse bile yanıt balonundaki alıntı doğru render edilmeye devam eder.
  `MessageBubble` bu alıntıyı balonun üstünde küçük bir `replyQuote` kutusu olarak gösterir.
- Geri ok → `onBack()` ile `CONTACTS`'a döner.

## NotificationCenter — uygulama-içi "oyun bildirimi"

- `AppNavigator`'da `CallProvider`'ın hemen içinde, `CONTACTS`/`CHAT_ROOM` ekranlarını sarmalar
  (tek sefer kurulur, ekran değişince yeniden kurulmaz — bkz. [[01-Architecture]]).
- Her kişinin odasını `chatService.subscribeToLatestMessage()` ile dinler; kendi mesajlarını, mount
  öncesi geçmişi, ve şu an açık olan sohbetin (`activeContactUid`) mesajlarını filtreler.
- Kalan yeni mesaj için ekranın üstünde 🎮 rozetli, kişi adı + kısa önizgeli, oyuna özgü hissettiren
  bir toast gösterir (Android'in standart "X kişisinden Y bildirimi geldi" formatından bilinçli
  olarak farklı — kullanıcı isteği) + `sfx_notification` sesi + kısa titreşim. Dokununca o sohbeti
  açar.
- **Sadece uygulama açık/arka planda çalışırken tetiklenir** — uygulama tamamen kapalıyken bildirim
  gelmez. Bu bilinçli bir seçim (gerçek arka plan push, Firebase Cloud Messaging + Blaze plan +
  Cloud Function gerektiriyordu); bkz. `YAPILACAKLAR.txt`'in sonundaki opsiyonel bölüm.
- Ayarlar'dan (`notificationService`) tamamen kapatılabilir.

## Sesli/görüntülü arama (Stream Video)

> 2026-09-06'da özellik baştan aşağı revize edildi (akış + tasarım + 14 hata) ve **iki emülatörde
> uçtan uca test edildi** — bkz. [[Changelog]] v8.8. Aşağısı test sonrası güncel hâli anlatır.

- `AppNavigator`, hesap girişi yapılmış **her** ekranı (oyun ekranı dâhil) `CallProvider` ile
  sarmalar; böylece kullanıcı oyun kamuflajında otururken de arama gelir. `CallProvider`, o oturum
  için bir Stream Video client'ı kurar ve içine `IncomingCallWatcher`'ı yerleştirir.
- `IncomingCallWatcher`, Stream'in `useCalls()` hook'unu dinler; `ringing` durumundaki **herhangi
  bir** çağrıyı (hem bu cihazın az önce başlattığı giden arama, hem karşı taraftan gelen arama) tam
  ekran bir `Modal` içinde `CallScreen` olarak açar — yani arayan ve aranan aynı mekanizmayla ekranı
  görür. Zaten bir görüşmedeyken gelen ikinci çağrı **sessizce yok sayılmaz**, `reason: 'busy'` ile
  gerçekten reddedilir (önceden karşı taraf boşuna çalıyordu).
- **`CallScreen` tamamen kendi tasarımımız.** SDK'nın `RingingCallContent`/`CallContent`
  bileşenleri artık hiç kullanılmıyor. Ekran her iki temada da koyu, tam ekran bir yüzey (gerçek
  telefonların arama ekranı gibi; video karolarının beyaz çerçevede kalmasını da önler):
  - `RINGING` → marka rengine boyanmış radyal gradyan arka plan (`CallBackdrop`), avatarın
    arkasından yayılan iki halkalı nabız (`PulsingRings`), isim, ve (giden aramada tek "Vazgeç" /
    gelen aramada "Reddet" + yeşil "Kabul Et") butonları.
  - `JOINED` (sesli) → avatar + isim + canlı süre + sustur / kapat / ses çıkışı.
  - `JOINED` (görüntülü) → **karşı taraf tam ekran** (`ParticipantView`, `objectFit="cover"`),
    kendi kameran üstte **sürüklenebilir** küçük yuvarlatılmış bir dikdörtgende
    (`DraggableSelfView`; bırakınca en yakın köşeye yaylanır). Üstte isim + süre çubuğu, altta
    yarı saydam kontrol yuvası (sustur, kamera aç/kapa, kamerayı çevir, ses çıkışı, kapat).
  - `RECONNECTING` → aktif ekran altında uyarı banner'ı, ekran değişmez.
    `RECONNECTING_FAILED` → kısa bir "Görüşme koptu" ekranı, sonunda gerçekten `call.leave()`.
  - `LEFT` olur olmaz `onLeave()` çağrılır, ekstra bir "görüşme bitti" ekranı yok.
- **Bütün kontroller SVG ikon** (`CallIcons.tsx`), emoji değil — emoji her Android sürümünde farklı
  görünüyor ve renklendirilemiyordu, dolayısıyla "sessize alındı" gibi durumlar ifade edilemiyordu.
  Artık etkin durum düğmeyi aydınlık dolguya çeviriyor (`ControlButton`'ın `active` prop'u).
- `startVoiceCall()`/`startVideoCall()` çağrı oluşturmadan önce `permissionsService.
  requestCallPermissions()` ile mikrofon (+ görüntülüyse kamera) izni ister; `IncomingCallWatcher`
  aynı izni **aranan** taraf için de proaktif ister (kabul et'e basılmadan hazır olsun diye), ama
  yalnızca aranan tarafta — arayan aynı izni zaten `startCall`'da yanıtlamıştı, orada tekrar sormak
  çalan ekranın üstüne ikinci bir dialog açıyordu.
- **Ses rotası:** sesli arama kulaklıktan (earpiece), görüntülü arama hoparlörden başlar
  (`callManager.start({ audioRole: 'communicator', deviceEndpointType })`, temizlikte
  `callManager.stop()` rotayı işletim sistemine geri verir). Bir dönem her iki tür de `'speaker'`
  idi, çünkü kulaklık rotası uygulamanın tüm ses oturumuna yapışıyordu (oyun/bildirim sesleri de
  kulak hoparlöründen çıkıyordu); o sızıntının çaresi kesin olarak çağrılan `stop()` temizliği.
  **Sızıntı tekrarlarsa bakılacak ilk yer `CallScreen.tsx`'teki `deviceEndpointType`.**
- **Bitiş senaryoları:** cevaplanmayan giden arama 45 sn sonra kendini iptal eder
  (`RINGING_TIMEOUT_MS`). Karşı taraf kapattığında `call.session_participant_left` /
  `call.ended` / `call.session_ended` olayları dinlenerek arama bu tarafta da kapanır — Stream
  birebir aramayı bir katılımcı ayrıldı diye kendiliğinden sonlandırmıyor, bu yüzden önceden kalan
  taraf çalışan bir sayaç ve açık mikrofonla "Görüşme sürüyor" ekranında kalıyordu. Yedek olarak
  uzak katılımcı 2,5 sn boyunca yoksa da kapatılır.
- **Çağrı geçmişi:** çağrı bitince `CallProvider` sohbete WhatsApp tarzı bir kayıt düşer
  (`chatService.sendCallLogMessage`). Durum artık üç değerli: **tamamlandı / cevapsız / reddedildi**
  — reddedilen arama, arayan tarafta `call.rejected` olayının `reason`'ı okunarak ayırt edilir
  (`'cancel'`/`'timeout'` reddetme sayılmaz). Hem arayan hem aranan bu kaydı bağımsız düştüğü için
  doküman kimliği paylaşılan `call_<streamCallId>`'dir ve yazma bir **transaction**'dır: `senderId`
  daima ARAYANIN uid'si (yön oku yazma yarışına göre değişmesin diye), durum geriye düşmez, süre
  iki tarafın gördüğü en uzun değerdir. Bunun çalışması için `firestore.rules`'a arama kaydına
  özel `create`/`update` carve-out'ları eklendi — bkz. [[03-Services-Backend]].
- **Ses çıkış cihazı seçici (2026-08-17'de eklendi):** Arama sırasında bir buton, hoparlör/kulaklık/
  Bluetooth arasında canlı cihaz listesiyle geçiş yapmayı sağlıyor (`audioOutputService.ts`), tercih
  `AsyncStorage`'da kalıcı ve Ayarlar'dan da değiştirilebiliyor. Artık koyu bir bottom-sheet.
- **Elle yapılması gereken adım:** Stream Dashboard'da bir "Video & Audio" app oluşturup API
  key/secret'ı `src/config/streamConfig.ts`'e girmek gerekiyor, yoksa arama butonları başarısız olur.
  Detay: [[05-Build-Deployment]].
- **Test ederken dikkat:** Arama kimliği hesaba bağlı olduğu için **iki cihazda aynı hesapla test
  edilemez** — Stream aynı `user_id`'nin iki oturumunu çakışan bir çağrı sayıp
  `"Cannot reject a call that has already been accepted"` gibi hatalar verir. İki ayrı hesap gerekir.
- **Bilinen sınır:** uygulama tamamen kapalıyken gelen arama çalmaz — Stream client'ı yalnızca
  uygulama açıkken bağlı. Gerçek bir "kilit ekranında çalan arama" için FCM data-push + `notifee`
  full-screen intent (ya da CallKeep) gerekiyor; henüz yapılmadı.

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
- Fotoğraf/video/sesli mesaj, genel dosya gönderme, gizli medya (aç/kapa), mesaj yanıtlama
  (kaydırma/uzun-basma) ve sesli/görüntülü arama artık var (yukarı bkz.). **Henüz yok:** grup
  sohbeti/araması (her şey hâlâ 1-1).
- Uygulama içi APK güncelleme banner'ı da var artık (`UpdateBanner.tsx`, `updateService.ts`) —
  detay [[03-Services-Backend]] ve [[05-Build-Deployment]].
- Mobil dışında bir de **PC istemcisi** var (`pc-client/index.html`, 2026-08-16'da eklendi) — aynı
  Firebase hesabıyla giriş yapılan, tek dosyalık bir masaüstü sohbet sayfası (metin/fotoğraf/video,
  kişiye karşı canlı XOX/satranç, depolama kotası, masaüstü bildirimleri; arama/sesli mesaj/yanıtlama/
  düzenleme/silme/sabitleme/gizli medya yok). Bir React Native ekranı değil, ayrıntısı için
  [[01-Architecture]] → "PC istemcisi".
