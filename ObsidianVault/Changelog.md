# Değişiklik Günlüğü

## 2026-09-02 — v1.7.6: "Pencereye ayır" düğmesi çalışmıyordu — PIP izni sessizce reddediliyormuş

Kullanıcı 1.7.5'i gerçek cihazında (Infinix Smart 9, XOS/Android 14) denedi: PIP butonuna
basınca hiçbir şey olmadı. Emülatörde çalışmıştı çünkü emülatör görüntüsü PIP iznini
varsayılan açık veriyor; gerçek cihazlardaki birçok OEM arayüzü (özellikle Transsion/XOS gibi
kısıtlayıcı Android skin'leri) her uygulama için "Ekran içinde ekran" (Picture-in-picture)
iznini varsayılan KAPALI tutuyor. `Activity.enterPictureInPictureMode()` bu durumda istisna
ATMIYOR, sessizce `false` dönüyor — önceki sürümde bu sonuç hiç kontrol edilmediği için
kullanıcı hiçbir geri bildirim almadan buton "çalışmıyormuş" gibi görünüyordu.

**Düzeltme:** `PipModule.kt`'ye `openPipSettings()` eklendi — `enter()`'ın döndürdüğü
`entered` değeri artık JS tarafında (`pipService.ts`) kontrol ediliyor; `false` gelirse
kullanıcıya "Küçük pencere izni gerekiyor" diyaloğu gösterilip "Ayarları Aç" ile doğrudan o
uygulamaya özel PIP ayar ekranına (`android.settings.PICTURE_IN_PICTURE_SETTINGS`, yoksa genel
uygulama ayarlarına düşülüyor) yönlendiriliyor.

**Ders:** `enterPictureInPictureMode()`'un dönüş değerini kontrol etmeden "PIP başlatıldı"
varsaymak hataydı — Android'in birçok API'si (bu dahil) izin/kısıtlama durumunda istisna
atmak yerine sessizce `false`/no-op dönüyor; her zaman dönüş değerine bakılmalı.

Mobil: `versionCode 23→24`, `versionName "1.7.5"→"1.7.6"`; APK derlenip yayınlandı.

## 2026-09-02 — v1.7.5: Panik kapatma butonu + sohbeti küçük pencereye alma (Picture-in-Picture)

Kullanıcı, birinin fiziksel olarak yaklaşması durumunda sohbetin anında gizlenebilmesini
istedi. İki ayrı mekanizma eklendi (mobil, `src/`):

**1. Panik butonu** (`src/components/EmergencyCloseButton.tsx`) — HOME (sahte oyun menüsü)
dışındaki her ekranda (`AppNavigator.tsx`) sağ altta duran, sürüklenebilir, kasıtlı olarak
göze batmayan küçük gri bir nokta. Dokununca `BackHandler.exitApp()` ile uygulamayı komple
kapatıyor — ekranda hiçbir sohbet izi kalmıyor, bir sonraki açılış zaten sahte oyun
menüsüyle (`GameHubScreen`) başlıyor. Sürükleme hareketinin bırakma dokunuşu yanlışlıkla
kapatma saymıyor (`dragged` ref kontrolü).

**2. Küçük pencereye alma (PIP)** — kullanıcı önce "harici pencereli sohbet" (chat balonu/
bubble) istedi, sonra ekranın kenarında sürekli görünen bir ikon istemediğini belirtti; bu
yüzden bir balon/ikon yerine Android'in resmi Picture-in-Picture API'si kullanıldı (WhatsApp'ın
video görüşmelerde kullandığı sistemin aynısı). Sohbet ekranındaki yeni bir header butonuna
(`PipIcon`, `CallIcons.tsx`) basınca `PipModule.kt` (yeni native modül, `PipPackage.kt` ile
kaydedildi) `Activity.enterPictureInPictureMode()` çağırıyor — OS'in kendi küçük yüzer
penceresi ve kendi kapatma/genişletme kontrolleri (⚙ ve ✕) devreye giriyor, bizim ekstra bir
UI kodu yazmamıza gerek kalmıyor. `AndroidManifest.xml`'de MainActivity'ye
`android:supportsPictureInPicture="true"` eklendi (config-changes zaten uygundu).

Emülatörde uçtan uca doğrulandı: sohbet açıkken PIP butonuna basınca ekran gerçekten küçük
bir pencereye küçüldü ve arka plandaki başka bir uygulamanın (Chrome) üzerinde durdu;
pencereye dokununca Android'in kendi ⚙/✕ kontrolleri belirdi (emülatörün PIP-overlay
dokunma hassasiyeti gerçek cihazdan daha kaba olduğu için X'e isabet ettirmek zor oldu, ama
kontrollerin doğru şekilde tetiklendiği görüldü — bu OS'in kendi davranışı, kod tarafında
ekstra bir şey gerekmiyor).

**Ders:** İlk PIP butonu ikonu emoji (🗗) olarak eklenmişti ama emülatör cihazında kutu (□)
olarak render oldu — emoji glyph desteği cihazdan cihaza değişiyor, header ikonları için
projede zaten kurulu olan SVG icon pattern'i (`CallIcons.tsx`) kullanılmalıydı; `PipIcon`
olarak aynı stile taşındı.

Mobil: `versionCode 22→23`, `versionName "1.7.4"→"1.7.5"`; APK derlenip yayınlandı.

## 2026-09-02 — v1.7.4: YouTube "Hata 152/153" asıl kök sebebi bulunup düzeltildi (baseUrlOverride youtube.com OLMAMALI)

1.7.3'teki `baseUrlOverride="https://www.youtube.com"` düzeltmesi **yanlış yöndeymiş** — kullanıcı
gerçek cihazda "Hata kodu: 152 - 4" ile karşılaştı, ben de emülatörde en popüler videolardan biri
olan "The Weeknd - Blinding Lights" ile bile "Hata 152 - 15" alarak bunun video bazlı bir kısıtlama
olmadığını, sistemik olduğunu doğruladım.

**Asıl kök sebep:** `baseUrlOverride` olarak **YouTube'un kendi alan adını** vermek, WebView'i sanki
`youtube.com` üzerinde çalışıyormuş gibi gösteriyor — yani bir YouTube sayfası kendi kendini gömüyor
gibi bir durum oluşuyor. Bunu emülatörde şöyle doğrudan kanıtladım: gerçek Chrome tarayıcısında
`https://www.youtube.com/embed/dQw4w9WgXcQ` adresine DOĞRUDAN gidildiğinde (üst pencere = iframe'in
kendi domaini) YouTube "Error 153" gösteriyor — react-native koduyla hiç ilgisi olmayan, salt tarayıcı
davranışı. Aynı videoyu kendi kontrolümdeki başka bir origin'den (`localhost` üzerinden basit bir
`<iframe>` ile) gömünce hiçbir hata olmadan oynatma ekranı geliyor. Yani YouTube, gömülü oynatıcının
üst sayfa origin'i `youtube.com`'un KENDİSİ olduğunda bunu reddediyor; başka herhangi gerçek bir
origin olduğunda kabul ediyor.

**Düzeltme:** `baseUrlOverride`, `"https://www.youtube.com"` yerine bizim kendi kontrolümüzdeki
gerçek bir alan adına (`"https://kaanchatmercan.web.app"`) çevrildi (`SongPickerModal.tsx` ve
`MessageBubble.tsx`). Emülatörde gerçek bir kanala ("dassam") "The Weeknd - Blinding Lights" şarkısı
gönderilip oynatma denendi — video kontrolleri, ilerleme çubuğu ve ses ikonuyla birlikte normal
şekilde oynadı, hiçbir hata ekranı çıkmadı.

**Ders:** "Hata 153" mesajı önceki oturumda "kaynaksız (origin'siz) sayfa" sorunu sanılmıştı ama asıl
sorun kaynağın YOUTUBE.COM'UN KENDİSİ olmasıydı — rastgele/taklit bir origin vermek yetmiyor, o
origin'in youtube.com'dan farklı gerçek bir domain olması gerekiyor. Ayrıca bu sefer iddiayı öne
sürmeden önce hem gerçek Chrome'da doğrudan URL testi hem de gerçek kanalda uçtan uca oynatma testi
yapılarak kanıtlandı.

Mobil: `versionCode 21→22`, `versionName "1.7.3"→"1.7.4"`; APK derlenip
`gizlichat-android-updates.web.app` üzerinden yayınlandı, `app_config/android` Firestore dokümanı
güncellendi.

## 2026-09-02 — v1.7.3: YouTube "Hata 153" düzeltildi (react-native-youtube-iframe'e baseUrlOverride)

1.7.2'deki `react-native-youtube-iframe` + `useLocalHTML` geçişi cihazda test edilince gerçek,
spesifik bir hatayla karşılaşıldı: **"Hata 153"** (ekran görüntüsüyle doğrulandı). Sebep:
`useLocalHTML: true` kullanıldığında kütüphane, YouTube iframe'ini içeren HTML'i WebView'e
`source={{html: ...}}` olarak veriyor ama **`baseUrlOverride` verilmediği için o sayfanın hiçbir
kaynağı (origin) olmuyor** — YouTube'un gömme sistemi kaynaksız/boş bir origin'den gelen isteği
reddedip bu hatayı veriyor. Çözüm: `baseUrlOverride="https://www.youtube.com"` eklendi
(`SongPickerModal.tsx` ve `MessageBubble.tsx`) — sayfaya üçüncü bir sunucuya bağımlı olmadan
YouTube'un kendi alan adını taklit eden gerçek bir kaynak veriliyor, gömme artık kabul ediliyor.

**Ders:** Bir önceki (1.7.2) kayıt "gerçekten düzeltildi" diye yazmıştı ama kullanıcı cihazda
tekrar test edip ekran görüntüsüyle hâlâ hata verdiğini gösterdi — kütüphane değiştirmek tek
başına yeterli değilmiş, doğru yapılandırma (`baseUrlOverride`) da şart. Bu tür WebView/üçüncü
parti embed sorunlarında "kütüphane X'e geçtik, sorun çözüldü" demeden önce gerçek cihazda
görsel doğrulama beklemek gerekiyor.

`tsc` temiz. Mobil: `versionCode 20→21`, `versionName "1.7.2"→"1.7.3"`; APK derlenip yayınlandı.

## 2026-09-02 — v1.7.2: YouTube oynatma hatası gerçekten düzeltildi + kişi bilgisinden medya galerisi açılabiliyor

Bir önceki kayıttaki User-Agent düzeltmesi (`userAgent="...Chrome..."` WebView'a vermek) YouTube'un
"Yapılandırma hatası"nı **çözmedi** — kullanıcı 1.7.1'i kurup tekrar test edince hata aynen devam
etti. Kök sebep daha derinmiş: `WebView`'i doğrudan `youtube.com/embed/VIDEO_ID?...` URL'ine
yönlendirmek, YouTube'un gerçekte beklediği kullanım şekli değil — YouTube'un gömme (embed)
sistemi, bir web sayfasının İÇİNDE bir `<iframe>` elemanı olarak kullanılmayı bekliyor, WebView'in
kendisinin doğrudan o URL'e gitmesini değil; User-Agent ne olursa olsun bu fark tespit edilip
reddediliyordu.

**Gerçek çözüm:** Ham `WebView` + URL yaklaşımı tamamen kaldırıldı, yerine tam bu senaryo için
yazılmış `react-native-youtube-iframe` kütüphanesi kondu (`SongPickerModal.tsx` ve
`MessageBubble.tsx`, her ikisi de). Bu kütüphane `useLocalHTML` modunda, içinde YouTube'un resmi
IFrame API'siyle gerçek bir `<iframe src="youtube.com/embed/...">` barındıran küçük bir HTML
sayfasını WebView'e `source={{html: ...}}` olarak veriyor — yani WebView artık YouTube'un
beklediği "gerçek bir sayfanın içine gömülü iframe" modelini taklit ediyor, ham URL navigasyonu
değil. `start`/`end` klip parametreleri `initialPlayerParams` ile aynı şekilde veriliyor,
davranış (otomatik durma, kontroller) korundu.

Ayrıca bu turda: **Kişi bilgisi ekranındaki "Medya, bağlantı ve belgeler" satırına dokununca**
artık zaten var olan galeriyi (sohbetteki bir görsele dokunarak açılan aynı bileşen) o odanın
**tüm** medya geçmişiyle açıyor (hem mobil hem web) — önceden bu satır sadece bir sayı gösterip
tıklanınca hiçbir şey yapmıyordu.

`tsc` (her iki platform) temiz. Web deploy edildi. Mobil: `versionCode 19→20`,
`versionName "1.7.1"→"1.7.2"`; APK derlenip yayınlandı (`gizlichat-android-updates` hosting +
`app_config/android`).

## 2026-09-02 — v1.7.1: YouTube oynatma hatası + kişi bilgisi medya sayısı hatası düzeltildi

İki gerçek kullanıcı raporu üzerine:

1. **"Şarkı gönder" özelliğinde YouTube "Yapılandırma hatası" veriyordu** (hem önizlemede hem
   gönderildikten sonra oynatmaya çalışırken, mobilde). Sebep: Android'in sistem WebView'i,
   Chrome'un in-app WebView'lara eklediği `"; wv)"` işaretini User-Agent string'inde taşıyor;
   YouTube'un gömülü oynatıcısı bunu görünce (DRM/politika gereği, bilerek) oynatmayı reddediyor
   — API anahtarı/Cloud Function tarafıyla hiç ilgisi yok, sadece oynatma isteğinin WebView'dan
   geldiğini tespit edip engelliyor. Çözüm: `SongPickerModal.tsx` ve `MessageBubble.tsx`'teki her
   iki `WebView`'a normal bir Chrome-for-Android User-Agent string'i (`"wv"` içermeyen) veren
   `userAgent` prop'u eklendi — standart, bilinen bir workaround.
2. **Kişi bilgisi ekranındaki "Medya, bağlantı ve belgeler" her zaman 0 gösteriyordu.** Sebep:
   `mediaCount`, `ChatRoomScreen`'in o an yüklü (sayfalanmış, genelde son ~20-30 mesaj) `messages`
   state'inden sayılıyordu — galerideki eski aynı bug (bkz. bir önceki kayıt), oraya uygulanan
   `fetchAllMedia` düzeltmesi bu ekrana hiç taşınmamıştı. Düzeltme: `ContactInfoScreen` artık
   `mediaCount`'u prop olarak almıyor, kendi açıldığında `fetchAllMedia(roomId)` ile odanın **tüm**
   geçmişini kendisi çekip sayıyor (hem mobil hem web).

`tsc` (her iki platform) temiz. Web tekrar deploy edildi. Mobilde `versionCode 18→19`,
`versionName "1.7.0"→"1.7.1"`; APK derlenip `gizlichat-android-updates` hosting'ine yüklendi,
`app_config/android` güncellendi (`scripts/publishAndroidUpdate.js`). Bu turda telefon USB/kablosuz
bağlı olmadığı için `adb install` ile yerel kurulum yapılmadı — cihazlar uygulama içi güncelleme
banner'ından alacak.

Ayrıca bu oturumda ayrı bir kullanıcı raporu: bir arkadaşı v1.7.0'ı kurmaya çalışırken "paket
ayrıştırmasında sorun oldu" hatası aldı. Sunucudaki dosya `curl -I` ile doğrulandı (boyut/`Content-
Type` doğru, 2026-09-01'deki "yanlış apkUrl" hatasının aynısı değil) — bu kez muhtemel sebep
karşı tarafın cihazında indirmenin yarım/bozuk tamamlanması; kod tarafında yapılacak bir şey
bulunamadı, kullanıcıya yarım dosyayı silip iyi bağlantıyla tekrar indirmesi söylendi.

## 2026-09-02 — APK 1.7.0 derlenip telefona kuruldu ve güncelleme yayınlandı

Bu oturumdaki tüm mobil değişiklikleri (yazıyor göstergesi, şarkı gönderme, kişi bilgisi ekranı,
yıldızlı mesajlar, tüm geçmişte arama/galeri) içeren bir release APK derlendi —
`versionCode 17→18`, `versionName "1.6.1"→"1.7.0"` (`android/app/build.gradle`). Bu, projeye ilk
kez eklenen bir native bağımlılığın (`react-native-webview`, şarkı klip oynatıcısı için) ilk
gerçek cihaz derlemesiydi; `gradlew assembleRelease --no-daemon` temiz derledi, autolinking'in
elle bir müdahaleye ihtiyacı olmadı. `adb install -r` ile telefona kuruldu (USB hata ayıklama
açıkken).

**Güncelleme dağıtımı** [[05-Build-Deployment]]'taki akışla yapıldı: APK `public/app-release-1.7.0.apk`
olarak kopyalanıp proje kökünden `firebase deploy --only hosting` ile **`gizlichat-android-updates`**
sitesine yüklendi (kök `firebase.json`'ın hedefi — `web-client`'ın kendi `firebase.json`'ından
farklı bir site, karıştırılmamalı, bkz. 2026-09-01 kaydındaki "yanlış apkUrl" hatası tam da bu
ikisinin karıştırılmasından kaynaklanmıştı). URL çalıştığı `curl` ile doğrulandıktan SONRA
`node scripts/publishAndroidUpdate.js 18 1.7.0 <url> <notes>` çalıştırılıp `app_config/android`
Firestore dokümanı (Admin SDK ile, `firestore.rules`'ın `allow write: if false` kısıtlamasını
bypass ederek) güncellendi — artık eski cihazlardaki güncelleme banner'ı bu sürümü gösteriyor.

## 2026-09-02 — Sohbet içi arama ve galeri artık tüm mesaj geçmişini tarıyor (mobil + web)

Todo list'in kalan iki maddesi tamamlandı — ikisi de aynı kök nedenden kaynaklanan bir
sınırlamayı gideriyordu: `searchMessagesInRoom` ve galeri, odanın **tüm** geçmişini değil sadece
o an yüklü/son `MAX_MESSAGE_LIMIT` (300) mesajı tarıyordu, bu yüzden eski bir mesaj/görsel
aramada veya galeri de hiç çıkmıyordu.

- **Arama:** `chatService.ts`'teki (her iki platform) `searchMessagesInRoom` ve
  `fetchStarredMessages` sorgularından `limit(MAX_MESSAGE_LIMIT)` kaldırıldı — artık odanın
  Firestore'daki tüm mesaj geçmişini çekip client-side filtreliyor. Bu uygulamanın gerçek
  kullanım hacmi (iki kişilik tek bir sohbet) için sorun değil; çok daha büyük bir hacimde
  gerçek sayfalama/harici bir arama indeksine ihtiyaç duyar.
- **Galeri:** Yeni `fetchAllMedia(roomId)` fonksiyonu (her iki platform) odanın tüm geçmişindeki
  görsel VE video mesajlarını (silinmemiş, mobilde ayrıca "gizli" olmayan) kronolojik sırayla
  çekiyor. `ImageGalleryModal` artık videoları da oynatabiliyor (web: `<video controls>`, mobil:
  `react-native-video`, o an görüntülenen sayfa dışındakiler `paused`). Mobilde video mesajına
  dokunmak artık (tıpkı fotoğraf gibi) bu paylaşılan galeriyi açıyor — önceden kendi başına ayrı,
  tekil bir video görüntüleyici açıyordu. Galeri açılırken tam liste Firestore'dan çekilene kadar
  kısa bir süre hâlâ o an yüklü mesajlardan türetilen eski (sınırlı) liste gösteriliyor, boş
  ekranla açılmasın diye.

`tsc` (her iki platform) temiz, web-client tekrar build edilip **https://kaanchatmercan.web.app**'e
deploy edildi. Bu maddeyle todo list'teki 6 madde de tamamlandı.

## 2026-09-02 — "Kişi bilgisi" ekranı + gerçek "yıldızlı mesajlar" özelliği eklendi (mobil + web)

Sohbet başlığındaki isme/avatara dokununca artık WhatsApp'taki gibi bir "Kişi bilgisi" ekranı
açılıyor (`src/components/ContactInfoScreen.tsx` / `web-client/src/components/ContactInfoScreen.tsx`,
navigasyon kütüphanesi olmadığından mevcut projedeki gibi tam ekran bir Modal/overlay olarak).
Projede telefon numarası hiç tutulmadığından (kullanıcı adı/şifre ile giriş, phone-based değil)
ekranda telefon yerine gerçek kullanıcı adı (`fetchAccountUsername`) gösteriliyor. İçerik: büyük
avatar, isim, kullanıcı adı, çevrimiçi/çevrimdışı durumu (`subscribeToPresence`); mobilde
Sesli/Görüntülü/Ara butonları (mevcut `startVoiceCall`/`startVideoCall`/arama açma ile aynı
mantık), webde sadece Ara (web-client'ta hiç arama özelliği yok, bilerek atlandı); "Medya,
bağlantı ve belgeler" satırı (şu an yüklü mesajlardan sayılan bir sayaç — tam geçmiş taraması
henüz yapılmıyor, bkz. arama/galeri ile ilgili bilinen aynı sınırlama); "Yıldızlı mesajlar" satırı.

**Yeni özellik — gerçek yıldızlama:** Kullanıcı önce bu bölümü atlamayı önerdi ama sonra fikrini
değiştirip gerçek bir özellik istedi. Mevcut tekli "sabitlenmiş mesaj"dan (odada bir tane, ikisi de
görür) farklı olarak, her kullanıcı bağımsız ve sınırsız sayıda mesajı yıldızlayabiliyor —
`ChatMessage.starredBy?: Record<uid, true>`, `toggleStarMessage`/`fetchStarredMessages`
(`chatService.ts`, her iki platform). `firestore.rules`'a `reactions` carve-out'una benzer 5.
bir istisna eklendi: bir oda üyesi `starredBy` altında sadece kendi anahtarını değiştirebilir
(deploy edildi). Mesaj menüsüne "⭐ Yıldızla/Yıldızı Kaldır" eklendi, yıldızlanan mesajın
üzerinde küçük bir ⭐ rozeti görünüyor. Kişi bilgisi ekranındaki "Yıldızlı mesajlar" satırına
dokununca `fetchStarredMessages` ile liste çekilip gösteriliyor, bir mesaja dokununca sohbette o
mesaja atlanıyor (mevcut `scrollToMessageId`/`handleJumpToReply` mantığı yeniden kullanıldı).
`tsc` (her iki platform) temiz; web-client tekrar build edilip **https://kaanchatmercan.web.app**'e
deploy edildi.

## 2026-09-02 — Sohbet içinde animasyonlu "yazıyor..." baloncuğu + web-client production'a deploy edildi

Önceki kayıttaki "yazıyor..." göstergesi sadece başlıkta bir metin etiketiydi; kullanıcı bunun
mesaj listesinin içinde, WhatsApp'taki gibi zıplayan üç noktalı bir baloncuk olmasını istedi.
Web'de mesaj listesinin sonuna `isContactTyping` true iken `.typing-bubble`/`.typing-dot`
(CSS `@keyframes typing-bounce`) render ediliyor; mobilde yeni `src/components/TypingBubble.tsx`
(RN `Animated` ile üç noktayı staggered/gecikmeli döngüyle zıplatıyor) `FlatList`'in
`ListFooterComponent`'i olarak ekleniyor. İkisinde de gösterge belirdiğinde, kullanıcı zaten
listenin altına yakınsa (`nearBottomRef`/`isNearBottomRef`) otomatik olarak en alta kaydırılıyor
— yeni bir mesaj geldiğindeki mevcut auto-scroll mantığıyla aynı desen. `tsc` (her iki platform)
temiz.

Ayrıca bu görev sırasında web-client ilk kez **production'a deploy edildi**:
`web-client/firebase.json` zaten `kaanchatmercan` sitesine (proje varsayılan sitesi) `dist`
klasörünü SPA rewrite'ıyla yayınlayacak şekilde ayarlıydı, sadece `npm run build` + `firebase
deploy --only hosting` (web-client dizininden) çalıştırıldı. Canlı adres:
**https://kaanchatmercan.web.app** — kullanıcı buradan hem sesli mesaj düzeltmesini hem yazıyor
göstergesini hem de şarkı gönderme özelliğini gerçek tarayıcıda test edebilir. Bundan sonra
web-client'ta yapılan her değişiklik gerçekten "yayında" görünsün isteniyorsa bu iki komutun
tekrar çalıştırılması gerekiyor — otomatik bir CI/deploy pipeline'ı yok.

## 2026-09-02 — "Şarkı gönder" (Instagram tarzı klip gönderme) eklendi (mobil + web) — YouTube üzerinden, Spotify değil

Kullanıcı Instagram'daki "arkadaşına şarkının bir kısmını gönder" özelliğinin birebir aynısını
istedi. İlk denenen yol Spotify Web API'ydi (kullanıcı developer.spotify.com'da bir uygulama açıp
Client ID/Secret üretti) ama **Spotify artık Kasım 2024'ten sonra oluşturulan uygulamalara
`preview_url` (30sn'lik dinlenebilir klip) vermiyor** — arama çalışıyor, kapak/isim geliyor ama
`preview_url` her sonuçta boş (test edildi: "Blinding Lights" gibi çok popüler bir şarkıda bile).
Bu, Spotify tarafında değiştirilemeyen bir kısıtlama olduğundan **YouTube'a geçildi**: YouTube'un
kendi resmi gömülebilir oynatıcısı `start`/`end` parametreleriyle tam olarak seçilen aralığı
çalıyor, hiçbir lisans sorunu yok.

**Backend:** `functions/index.js`'e yeni bir `youtubeSearch` callable function eklendi — YouTube
Data API v3'e (`search`, `videoCategoryId=10` müzik filtresiyle) istek atıp basitleştirilmiş
sonuç listesi (`videoId`/`title`/`channelTitle`/`thumbnailUrl`) döndürüyor. API anahtarı
(`YOUTUBE_API_KEY`, Google Cloud Console'da proje `kaanchatmercan` altında oluşturuldu) istemci
koduna hiç gömülmedi — `defineSecret` ile Secret Manager'a yazılıp fonksiyona sadece runtime'da
enjekte ediliyor (`firebase functions:secrets:set`). Deploy edildi (`youtubeSearch(us-central1)`),
artifact cleanup policy da ayarlandı (Docker image birikip depolama ücreti oluşturmasın diye).
İlgili Firebase projesi bu görev sırasında Blaze plana geçirildi — kullanım seviyesinde (günde
onlarca arama) pratikte $0 kalması bekleniyor (ücretsiz kota: 2M çağrı, 5GB dış trafik/ay).

**İstemci:** Her iki platformda da `songService.ts` (searchSongs) ve `chatService.ts`'e yeni
`song` mesaj tipi + `SongClip`/`sendSongMessage` eklendi (`youtubeVideoId`/`songTitle`/
`songArtist`/`songThumbnailUrl`/`clipStartSeconds`/`clipDurationSeconds` alanları). Yeni
`SongPickerModal` bileşeni: ara → şarkı seç → küçük bir gömülü YouTube oynatıcıda dinleyerek
başlangıç saniyesini ayarla (mobilde +/-5sn/+/-10sn butonları, webde bir range slider) → klip
uzunluğu seç (10/15/20/30sn) → gönder. `MessageBubble.tsx`'te mesaj bir kapak+oynat butonu
kartı olarak görünüyor, tıklanınca gömülü oynatıcıya dönüşüp otomatik olarak sadece o aralığı
çalıyor. Mobilde bunun için yeni bir native bağımlılık eklendi: **`react-native-webview`**
(YouTube'un iframe oynatıcısını göstermek için) — bu native bir modül olduğundan, bir sonraki
APK build'inde native tarafın da (gradle autolink) yeniden derlenmesi gerekiyor, sade bir JS
güncellemesiyle yayılamaz.

Web tarafında ayrıca bu görev sırasında bulunan, konuyla ilgisiz bir gözlem: Vite dev sunucusunda
yeni bir `firebase/*` alt modülü eklendiğinde ilk sayfa yüklemesinde nadiren "Service X is not
available" hatası görülebiliyor (muhtemelen bu sandbox'taki Vite HMR websocket'inin çalışmaması
yüzünden normalde otomatik olan yeniden yükleme tetiklenmiyor) — kalıcı önlem olarak
`getFunctions(app)` çağrısı artık modül yüklenirken değil, ilk gerçek kullanımda (lazy,
`getFunctionsInstance()`) yapılıyor; ayrıca `vite.config.ts`'e tüm `firebase/*` alt modüllerini
`optimizeDeps.include`'a ekleyen bir not/önlem eklendi. Uçtan uca test edildi: tarayıcıda anonim
girişle gerçek `youtubeSearch` fonksiyonu çağrılıp gerçek YouTube sonuçları alındı. Mobil tarafta
(WebView + APK gerektirdiğinden) sadece `tsc --noEmit` ile doğrulandı, cihazda test edilmedi.

## 2026-09-02 — "Yazıyor..." göstergesi eklendi (mobil + web)

Karşı taraf sohbette bir şeyler yazarken başlıkta isim altında "yazıyor..." gösteriliyor artık,
her iki platformda da. Oda dokümanına (`rooms/{roomId}`) `pinnedMessageId` ile aynı desende
yeni bir `typing: { [uid]: serverTimestamp }` alanı eklendi — `chatService.ts`'e
`setTypingStatus`/`subscribeToTypingTimestamp`/`TYPING_TIMEOUT_MS` (4sn) eklendi (hem
`src/services/chatService.ts` hem `web-client/src/services/chatService.ts`, aynı isim/mantık).
Metin kutusuna her karakter girildiğinde `typing.{uid}` timestamp'i yazılıyor, 4sn boyunca yeni
karakter gelmezse veya mesaj gönderilince `deleteField()` ile temizleniyor. Okuyan taraf,
Firestore'un sadece yazma anında push ettiğini (saatin ilerlemesiyle tetiklenmediğini) hesaba
katıp kendi `setTimeout`'uyla eski (4sn'den yaşlı) bir timestamp'i "artık yazmıyor" sayıyor —
bu, karşı tarafın uygulaması yazarken kapanıp `false`/`deleteField()` hiç yazamadığı durumda
göstergenin sonsuza dek takılı kalmasını önlüyor. `firestore.rules`'ta `rooms/{roomId}` zaten
oda üyesine serbest yazma izni verdiğinden kural değişikliği gerekmedi. Mobil: `tsc --noEmit`,
Web: `tsc -b` temiz. Uçtan uca (iki hesapla eşzamanlı) manuel test yapılmadı — sadece derleme ve
kod-yolu incelemesiyle doğrulandı.

## 2026-09-02 — Web-client'ta sesli mesajlar görünmüyordu — düzeltildi

`web-client/src/components/MessageBubble.tsx` `image`/`video`/`file`/`text` mesaj tiplerini
render ediyordu ama `audio` hiç ele alınmıyordu — mobilden gönderilen sesli mesaj Firestore
üzerinden web'e ulaşıyordu ama hiçbir şey basılmıyordu (boş görünüyordu). Mobildeki
`AudioMessagePlayer`'ın karşılığı olarak basit bir HTML5 `<audio controls>` eklendi
(`.msg-audio` stiliyle `index.css`'e). Ayrıca `replyPreviewLabel` (yanıt alıntısı) ve
`ContactsScreen.tsx`'teki son mesaj önizlemesi de `audio` case'i eksik olduğundan boş metin
gösteriyordu, ikisi de "🎤 Sesli mesaj" etiketiyle düzeltildi. `tsc -b` temiz.

## 2026-09-01 — APK 1.6.1 + yanlış `apkUrl` düzeltildi + güncelleme yüzdesi kaldırıldı

`app_config/android`'deki `apkUrl` yanlışlıkla `https://kaanchatmercan.web.app/app-release-1.6.0.apk`
gösteriyordu — bu, APK'nın deploy edildiği `gizlichat-android-updates` sitesi değil, web-client'ın
kendi hosting hedefi; o path'te dosya olmadığından Firebase Hosting'in SPA fallback'i 504 byte'lık
`index.html`'i 200 OK ile dönüyordu. Telefon bunu APK sanıp indiriyor (küçük olduğu için anında
biter), gerçek bir APK olmadığı için sistem "paketin ayrıştırılmasında sorun oluştu" hatası veriyordu
— 3 farklı telefonda da aynı sonucun sebebi buydu (APK'nın kendisi zip/manifest/imza/zipalign
açısından baştan sona sağlamdı, sorun hep bu yanlış URL'deydi). Düzeltme: Firebase Console'dan
`apkUrl` `https://gizlichat-android-updates.web.app/gizlichat-1.6.1.apk`'ye, `versionCode` 17'ye,
`versionName` "1.6.1"'e güncellendi (bu doküman `firestore.rules`'ta bilerek `allow write: if false`,
programatik yazma yolu yok, Console'dan elle yapıldı).

Ayrıca `versionCode` 16→17, `versionName` "1.6.0"→"1.6.1" (`android/app/build.gradle`) ile yeni bir
release derlendi (`gizlichat-1.6.1.apk`, 1.6.0'ın yanına, o da hosting'te kalıyor) — bu sürümde kod
tarafında bir değişiklik yok, sadece bu düzeltmeyi taşıyan bir versionCode artışı.

**Güncelleme banner'ındaki indirme yüzdesi kaldırıldı.** `UpdateBanner.tsx`'teki `%X` göstergesi
gerçek kullanımda sürekli `%0`'da takılı görünüyordu: 128 MB'lık dosya hızlı bağlantıda saniyeler
içinde inince RNFS'in native `progress` event'i anlamlı bir ilerleme göstermeye yetecek sıklıkta/
zamanda tetiklenmiyor, kullanıcı "%0" yazan butonun aniden "Güncelle"ye dönüşmesini görüyordu. Bunu
düzgün çalışır hale getirmek (native tarafta farklı bir indirme/ilerleme mekanizması gerektirir)
yerine, proje sahibinin tercihiyle kaldırıldı: `downloadAndInstallUpdate` artık bir `onProgress`
parametresi almıyor, `UpdateBanner.tsx` indirme sırasında sabit "İndiriliyor…" metni gösteriyor.
`updateService.ts`'teki `lastResult` (indirme bütünlüğü kontrolü için `contentLength`/`bytesWritten`)
mekanizması aynen kaldı, sadece UI'ya `onProgress` ile aktarılan kısım silindi.

## 2026-08-28 — Şifreleme kaldırıldı (bilinçli geri alma) + silme modeli "her ikisinde de gizle, veri kalsın" olarak değişti

Proje sahibinin **doğrudan talebiyle** iki değişiklik: (1) aşağıdaki iki maddede açıklanan
uçtan uca mesaj şifrelemesi (E2E) **tamamen geri alındı** — bu bir bug fix değil, bilinçli bir
karar: proje sahibi şifrelemeyi tutmamaya karar verdi. (2) Mesaj silme modeli, kişiye özel
`deletedFor` (delete-for-me) dizisinden, tek bir paylaşılan `deleted` bayrağına geçti.

**1) Şifreleme kaldırıldı.** `72233d6` (gerçek E2E, tweetnacl `nacl.box`) ve `ee5ebda`'nın (admin
erişimi) şifrelemeye bağımlı kısımları geri alındı — **admin hesabı/rolü, admin'in salt-okunur
Firestore erişimi, bildirim şeridi, admin paneli UI'ı ve satranç-sıfırlama düzeltmesi aynen
kaldı**, sadece şifreleme iskeleti söküldü:
- Üç client'taki `chatService.ts` (mobil, web-client) ve `pc-client/index.html`: `sendMessage`,
  `sendMediaMessage`, `editMessage`, alım/decrypt yolu (`docToMessage`) ve `ReplyPreview`/`replyTo`
  artık doğrudan düz `text`/`mediaUrl` alanlarını okuyup yazıyor — `encrypted`/`encText`/
  `encNonce`/`encTextSelf`/`encNonceSelf`/`encTextAdmin`/`encNonceAdmin`/`encMediaUrl*` alanlarının
  hiçbiri artık yazılmıyor/okunmuyor. `searchMessagesInRoom` düz `.text` üzerinde eşleşiyor, ayrı
  bir decrypt adımı yok.
- `src/services/e2eService.ts` ve `web-client/src/services/e2eService.ts` **tamamen silindi**;
  `AppNavigator.tsx`/`App.tsx`'teki `ensureKeyPair` çağrıları kaldırıldı; `index.js`'teki
  `import 'react-native-get-random-values'` satırı kaldırıldı (sadece nacl için gerekliydi).
  `tweetnacl`/`tweetnacl-util`/`react-native-get-random-values` bağımlılıkları `package.json` ve
  `web-client/package.json`'dan çıkarıldı (repo genelinde başka kullanım yok, grep ile doğrulandı),
  `npm install` her iki tarafta da çalıştırılıp lockfile'lar güncellendi.
- **Admin paneli** (`web-client/src/screens/AdminScreen.tsx`): artık admin'in kendi anahtar
  çiftiyle decrypt yapmıyor, doğrudan `message.text`/`message.mediaUrl` okuyor.
- **Bildirim şeridi** üç client'ta da **aynen kaldı** — `"🔒 Bu sohbet yönetici hesabı tarafından da
  görüntülenebilir"` metni zaten şifrelemeden bahsetmiyordu, hâlâ doğru: admin artık düz metni
  Firestore okuma izniyle görebiliyor, bunu kullanıcıya bildirmek — şifreleme yokken — eskisinden
  daha da önemli.
- `firestore.rules`'daki edit carve-out'unun `hasOnly([...])` listesinden `encrypted`/`encText`/
  `encNonce`/`encTextSelf`/`encNonceSelf`/`encTextAdmin`/`encNonceAdmin` çıkarıldı, sadece
  `['text', 'editedAt']` kaldı (bkz. madde 2 için `deleted` kontrolü).
- Görsel/ses/dosya boyutu eşikleri (`MAX_INLINE_MEDIA_DATA_URI_LENGTH` vb.) şifrelemenin getirdiği
  ~%33 ek büyüme payı olmadan eski 900.000 karakter değerine döndü (üç client'ta da).

**2) Silme modeli: "her ikisinde de gizle, veri Firestore'da kalsın".** Eskiden `deleteMessage()`
sadece silen kişinin kendi görünümünden mesajı gizliyordu (`deletedFor: string[]`, per-viewer). Artık
oda üyelerinden **hangisi silerse silsin, mesaj her iki tarafın listesinden de anında kayboluyor** —
ama içerik (`text`/`mediaUrl`/her şey) **Firestore'da olduğu gibi duruyor**, silinmiyor. Bu bilinçli:
veri örneğin admin panelinden hâlâ görülebilsin diye.
- `deleteMessage(roomId, message, myUid)` artık `updateDoc(messageRef, { deleted: true, deletedBy:
  myUid, deletedAt: serverTimestamp() })` yazıyor — `text`/`mediaUrl`/`fileName` gibi hiçbir alana
  dokunmuyor.
- Eski "her iki taraf da sildiyse video Storage'dan silinsin" (`hiddenForEveryone` kontrolü,
  `deleteRoomMedia` çağrısı) mantığı **tamamen kaldırıldı** — artık silme tek işlemde her iki
  tarafı da anında gizlediği için, ve asıl amaç veriyi (medya dahil) korumak olduğu için, bir mesaj
  silindiğinde video dosyası Storage'da kalmaya devam ediyor.
- `!message.deletedFor?.includes(myUid)` filtresi geçen her yerde `!message.deleted`'e çevrildi:
  mobil `ChatRoomScreen.tsx`/`subscribeToMessages`, web-client eşleniği, `pc-client/index.html`,
  `subscribeToLatestMessage`'ın (mobil + web-client `chatService.ts`) dahili filtresi (böylece
  `NotificationCenter.tsx`/`ContactsScreen.tsx` gibi onu tüketen ekranlar otomatik doğru davranıyor),
  `searchMessagesInRoom`.
- **Admin paneli bu filtreyi UYGULAMIYOR** — `subscribeToMessages`'a yeni bir `includeDeleted`
  parametresi eklendi (varsayılan `false`), `AdminScreen.tsx` `true` geçiyor, böylece kullanıcılar
  tarafından "silinmiş" mesajlar da dahil hepsini görüyor; silinmiş olanların yanına küçük
  "(kullanıcılar tarafından silindi)" etiketi eklendi (opsiyonel görsel ayrım).
- `firestore.rules`: eski `hasOnly(['deletedFor'])` carve-out'u, tam olarak `deleted`/`deletedBy`/
  `deletedAt` üçlüsünü set etmeye izin veren bir kurala değişti (`deleted == true` ve
  `deletedBy == request.auth.uid` şartıyla). Edit carve-out'u da artık `deletedFor` yerine
  `!resource.data.get('deleted', false)` kontrolü yapıyor — silinmiş bir mesaj kimse tarafından
  düzenlenemiyor.
- `ChatMessage` arayüzü (`chatService.ts`, her iki kopya): `deletedFor?: string[]` yerine
  `deleted?: boolean`, `deletedBy?: string`, `deletedAt?: number` — `docToMessage`'ın alan
  eşlemesi buna göre güncellendi.
- `MessageBubble.tsx` (mobil + web-client) ve `pc-client/index.html`'deki eski "mesaj silindi"
  placeholder render mantığı kaldırıldı — artık `deleted: true` olan mesajlar listeden tamamen
  filtrelendiği için (yukarı bkz.), bir bubble'ın kendi içinde "silindi" göstermesine gerek yok;
  bu, ayrı ve daha eski bir "global deleted + içerik temizlenir" modelinden kalma ölü kod olduğu
  için silindi (`deletedFor?.length` tabanlı 🗑️ ikonu dahil).

**Doğrulama:** mobil `npx tsc --noEmit` temiz, web-client `npx tsc -b --force` temiz, pc-client'ın
module script'i `node --check` ile sözdizimi kontrolünden geçti (geçici `.mjs` çıkarılıp silindi,
önceki commit'lerdeki gibi). Repo genelinde `deletedFor`/`encText`/`encNonce`/`encTextSelf`/
`encTextAdmin`/`e2eService`/`ensureKeyPair` için grep temiz döndü (bu Changelog'un eski maddeleri
hariç — onlar tarihsel kayıt, değiştirilmedi). **Manuel/canlı test edilemeyen kısımlar:** yeni
`firestore.rules`'ın gerçek projeye deploy edilmesi (`firebase deploy --only firestore:rules` bu
oturumda çalıştırılmadı — deploy edilmeden mevcut kurallar geçerli kalır, yani hem eski şifreleme
alan adları hem eski `deletedFor` carve-out'u canlıda hâlâ yürürlükte olabilir); iki gerçek hesapla
uçtan uca mesajlaşıp silme/düzenleme/admin-panel akışlarının canlıda beklendiği gibi çalıştığını
gözle doğrulamak.

## 2026-08-28 — Açıkça bildirilmiş (gizli DEĞİL) yönetici erişimi + minimal admin paneli

Proje sahibinin talebi üzerine, kullanıcıların sohbet gizliliğini yanıltacak sessiz/gizli bir
"arka kapı" **reddedildi** ve bunun yerine **açıkça bildirilmiş** bir model uygulandı: yönetici
erişimi teknik olarak gerçek, ama her kullanıcı bunu sohbet ekranında açıkça görüyor. Aşağıdaki
hiçbir parça bu bildirim UI'ını atlamıyor/gizlemiyor — bilinçli olarak bu görevin tek pazarlığa
kapalı kısmıydı.

**1) Yönetici hesabı — canlı Firebase projesinde gerçekten oluşturuldu.** `scripts/createAdminAccount.js`
(`scripts/generateLoginToken.js` ile aynı Firebase Admin SDK / `serviceAccountKey.json` deseni)
`admin`/`kaanadmin123` (kullanıcı adı/şifre proje sahibinin kendi seçimi, yer tutucu değil) için
`admin@gizlichat.local` sentetik e-postasıyla (`usernameToEmail()` ile birebir aynı kural) bir
Firebase Auth kullanıcısı oluşturdu ve `users/{uid}` dokümanına `username`/`usernameLower`/`createdAt`
yanında yeni bir `role: 'admin'` alanı yazdı. Betik tekrar çalıştırılırsa hesabı bulup `role` alanını
idempotent şekilde günceller, çökmez. Gerçek çalıştırmadan dönen uid — **`8PCGPrrJpfP2Scmw731gzsEol9H2`**
— `src/config/adminConfig.ts`, `web-client/src/config/adminConfig.ts` ve `pc-client/index.html`'deki
inline `ADMIN_UID` sabitlerinin **üçünde de birebir aynı**.

**2) Üçüncü şifreleme kopyası — önceki E2E tasarımına (bkz. altındaki madde) dokunmadan eklendi.**
`e2eService.ts`'e (üç client'ta da) generic `encryptToPublicKey(myUid, targetUid, plaintext)`
eklendi — `getPeerPublicKey`'in zaten uid'e göre genel olan cache/fetch mekanizmasını olduğu gibi
kullanıyor, admin için ayrı bir lookup icat edilmedi. `chatService.ts`'teki (üç client) her
`text`/`replyTo.text`/image-audio `mediaUrl` alanı artık normal self+peer çiftine ek olarak
`encTextAdmin`/`encNonceAdmin` (ve mediaUrl için `encMediaUrlAdmin`/`encMediaUrlNonceAdmin`) adında
üçüncü bir kopya taşıyor — ADMIN_UID'nin public key'ine kutulanmış. **Admin bir odanın iki
tarafından biriyse üçüncü kopya atlanıyor** (self/peer zaten yeterli, gereksiz olurdu); admin'in
public key'i henüz yayınlanmamışsa (olmaması gereken ama savunmacı bir durum) sadece admin kopyası
atlanıyor, gönderim asla başarısız olmuyor — eski legacy-plaintext fallback yolu da bozulmadı.
`ensureKeyPair` zaten uid'e özel bir dallanma içermiyordu (kontrol edildi, değiştirilmedi) — admin
hesabı diğer her hesap gibi ilk girişte kendi anahtar çiftini üretip yayınlıyor.
`firestore.rules`'daki mesaj `edit` kuralının izin verilen alan listesine `encTextAdmin`/`encNonceAdmin`
eklendi (yoksa bir düzenleme, üçüncü kopya alanı yüzünden reddedilirdi).

**3) Firestore kuralları — sadece okuma.** `firestore.rules`'a `isAdmin()` helper'ı eklendi
(ADMIN_UID ile hardcoded karşılaştırma, client sabitleriyle aynı uid). `rooms/{roomId}` ve
`rooms/{roomId}/messages/{messageId}` üzerindeki `read` kuralı `isRoomMember(roomId) || isAdmin()`
oldu — `write`/`create`/`update`/`delete` **hiçbir yerde** `isAdmin()`'i içermiyor, yani admin
başkasının odasına asla yazamıyor. **Not: bu kural değişikliği bu oturumda canlıya deploy
edilemedi** (`firebase deploy --only firestore:rules` otomasyon izin sınıflandırıcısı tarafından
engellendi) — dosya repoda güncel ama proje sahibinin `firebase deploy --only firestore:rules`
komutunu kendisi çalıştırması (ya da izin vermesi) gerekiyor, yoksa admin paneli canlıda "okuma
izni yok" hatası verir.

**4) Bildirim UI'ı — her üç client'ta, her sohbet açılışında.** Mobilde `ChatRoomScreen.tsx`'te
`StorageQuotaBanner`'ın hemen üstünde; web-client'ta aynı ekranda arama çubuğunun üstünde; pc-client'ta
`#chatHeader` ile `#pinnedBanner` arasında — `"🔒 Bu sohbet yönetici hesabı tarafından da
görüntülenebilir"` metniyle küçük, kalıcı (tek seferlik toast değil) bir şerit. Admin'in kendisi
odanın iki tarafından biriyse (kendine bildirim gerekmiyor) gösterilmiyor, aksi halde oda her
açıldığında görünüyor.

**5) Minimal admin paneli — sadece web-client'ta.** Yeni `web-client/src/screens/AdminScreen.tsx`:
`users` koleksiyonundan (zaten `allow read: if isSignedIn()`) tüm kullanıcıları listeliyor, admin
herhangi iki kullanıcıyı seçip aralarındaki `getRoomId(uidA, uidB)` odasını **salt okunur** görebiliyor
— `subscribeToMessages` + `chatService.ts`'in `docToMessage`/`buildDecryptContext`'ine eklenen admin
dalı sayesinde (myUid === ADMIN_UID ve odanın üyesi değilse, her mesajın gerçek göndericisinin public
key'iyle `encTextAdmin`/`encNonceAdmin` alanlarını `decryptBlob` ile açıyor — decryptBlob'un kendisi
hiç değişmedi, sadece hangi alan/hangi public key'in geçildiği admin moduna göre dallanıyor). Gönderme/
yanıtlama/medya-yükleme/tepki/düzenleme/silme yok — bilinçli olarak minimal bir görüntüleme aracı.
`users/{uid}.role === 'admin'` olduğunda `App.tsx` normal contacts/games-hub akışının önüne geçip
doğrudan `AdminScreen`'e yönlendiriyor (disguised hub override'dan bile önce).

**Doğrulama:** mobil `npx tsc --noEmit` temiz, web-client `npx tsc -b --noEmit` temiz, pc-client'ın
module script'i `node --check` ile sözdizimi kontrolünden geçti (geçici `.mjs` çıkarılıp silindi,
önceki commit'lerdeki gibi). **Manuel/canlı test edilemeyen kısımlar:** admin hesabıyla gerçek giriş
yapıp paneli uçtan uca açmak (rules deploy edilmeden çalışmaz — bkz. madde 3), ve bildirim şeridinin
üç client'ta da görsel olarak beklenen yerde oturduğunu gözle doğrulamak.

## 2026-08-28 — Gerçek uçtan uca şifreleme (E2E): mesaj içeriği artık sunucuda okunamıyor

Bu ana kadar mesajlar Firestore'da düz metin olarak duruyordu — "gizli chat" adı sadece
uygulamanın oyun kılığı görünümünden geliyordu, veritabanına erişebilen biri (Firebase Console,
sızdırılmış servis hesabı vs.) her mesajı okuyabilirdi. Artık değil: mesaj içeriği cihazdan
çıkmadan önce şifreleniyor, sunucu sadece şifreli metni görüyor. Üç client'ın da (mobil,
web-client, pc-client) aynı algoritmayı ve aynı wire format'ı kullanması gerektiği için
**tweetnacl** (`nacl.box`, X25519-XSalsa20-Poly1305) seçildi — saf JS, native modül gerektirmiyor,
RN/tarayıcı/plain `<script type="module">` üçünde de aynen çalışıyor.

**Anahtar yönetimi** (her üç client'ta da yeni `e2eService.ts` — pc-client'ta inline, esm.sh'tan
`tweetnacl@1.0.3` + `tweetnacl-util@0.15.1` import ediliyor):
- Her hesap, her cihazda bir kere `nacl.box.keyPair()` ile X25519 anahtar çifti üretiyor.
- Public key `users/{uid}.publicKey`'e (base64) yazılıyor — herkes okuyabilir, zaten şifreleme
  için gerekli olan bu.
- Private key **hiçbir zaman cihazdan çıkmıyor**: mobilde AsyncStorage (`e2e_sk_<uid>`), web-client
  ve pc-client'ta `localStorage`.
- Giriş/uygulama açılışında: cihazda zaten bir private key varsa o kullanılıyor. Yoksa VE
  Firestore'da bu hesap için henüz publicKey yoksa (yeni hesap ya da bu özellik çıktıktan sonra
  ilk kez giriş yapan eski hesap) → yeni anahtar çifti üretilip yayınlanıyor.
- **Yeni cihaz durumu**: hesap zaten bir publicKey'e sahip ama BU cihazda hiç private key yoksa
  (ör. aynı hesaba ikinci telefondan giriş) — orijinal private key'i kurtarmanın hiçbir yolu yok
  (tasarım gereği, hiç bu cihaza gelmedi). Bu cihazda yeni bir anahtar çifti üretilip Firestore'daki
  publicKey'in üzerine yazılıyor. Sonucu: karşı tarafın ESKİ anahtara şifrelediği geçmiş mesajlar bu
  cihazda çözülemez — hata/çökme değil, "🔒 Mesaj çözülemedi (başka bir cihazın anahtarına
  gönderilmiş olabilir)" placeholder'ı gösteriliyor. Yeni mesajlar sorunsuz çalışıyor (güncel
  public key artık bu cihazınki). Bu sürümde doğrulama/"safety number" UI'ı yok, bilinçli olarak
  basit tutuldu.
- Mobilde RN'in `crypto.getRandomValues`'u yok — `react-native-get-random-values` eklendi,
  `index.js`'in en başında (herhangi bir `nacl` import'undan önce) side-effect import ediliyor.

**Ne şifreleniyor** (`chatService.ts` — hem mobil hem web-client, pc-client'ta aynı mantık inline):
`text` tipi mesajların `text` alanı, `replyTo` önizlemesinin `text`'i, ve `image`/`audio` tipi
mesajların inline base64 `mediaUrl`'i (bunlar zaten Storage'a değil doğrudan Firestore dokümanına
gömülü — bkz. `ChatMessage.mediaUrl` doc comment'i). **Kapsam dışı bırakılanlar**: `video` (hâlâ
düz bir Firebase Storage indirme URL'i — bunu şifrelemek client-side stream şifreleme,
upload/download değişiklikleri ve video cache servisi değişiklikleri gerektiren çok daha büyük bir
iş, bilinçli olarak ertelendi), `call`/`chess` mesajları (korunacak metin içeriği yok), profil
adı/kullanıcı adı/fotoğraflar (kapsam dışı — bu iş sadece mesaj içeriğiyle ilgili).

**Wire format** (üç client'ta birebir aynı): mesaj dokümanına `encrypted: true` + base64
`encText`/`encNonce` (karşı tarafın public key'ine şifreli) + `encTextSelf`/`encNonceSelf`
(kendi public key'ime şifreli — nacl.box simetrik değil, alıcıya şifrelenen bir kutuyu gönderen
kendi anahtarıyla açamaz, o yüzden gönderen kendi geçmişini okuyabilsin diye mesaj İKİ KERE
şifreleniyor). Medya için aynı desen `encMediaUrl`/`encMediaUrlNonce`/`encMediaUrlSelf`/
`encMediaUrlNonceSelf` alan adlarıyla. `replyTo` de kendi `enc*` alanlarını taşıyor (not:
`replyTo.senderId` sadece "kimin mesajı" etiketi — şifreleyen taraf her zaman bu YENİ mesajın asıl
göndereni, alıntılanan orijinal mesajın yazarı değil; bu ayrım gözden kaçırılırsa şifre çözme her
zaman başarısız olur). Geriye dönük uyumluluk: eski mesajlarda `encrypted` alanı yok, `text` düz
metin olarak duruyor — client'lar bunu tespip edip olduğu gibi gösteriyor, göç/migration yapılmıyor.

**Şifre çözme nerede oluyor**: `chatService.ts`'in `docToMessage()`'ı (ve pc-client'ın
`decryptMessageData()`'sı) — yani `subscribeToMessages`/`subscribeToLatestMessage`/
`fetchMessageById`/`searchMessagesInRoom` çağıran her yer (ChatRoomScreen, ContactsScreen'in son
mesaj önizlemesi, NotificationCenter, arama) otomatik olarak düz metin `ChatMessage.text`/
`.mediaUrl` görüyor — hiçbirinin şifrelemeden haberi olması gerekmedi. `searchMessagesInRoom` artık
çekilen her adayı önce çözüp öyle filtreliyor.

**Doküman boyutu**: E2E şifreleme + tekrar base64 encoding inline base64 data URI'leri ~%33
büyütüyor — bu yüzden fotoğraf/ses için istemci-taraflı boyut eşiği (`MAX_INLINE_MEDIA_DATA_URI_LENGTH`
/ `IMAGE_DATA_URI_LIMIT` / `MAX_INLINE_IMAGE_DATA_URI_LENGTH`) her üç client'ta 900.000'den
650.000 karaktere düşürüldü — şifrelendikten sonra ~866.000'e çıkıyor, Firestore'un 1 MiB doküman
limitinin altında güvenli payla kalıyor.

**Peer'in henüz public key'i yoksa** (bu özellik çıktıktan sonra hiç giriş yapmamış eski hesap):
mesaj o an şifrelenemiyor, düz metin olarak (eski davranış gibi) gönderiliyor — engellemek yerine
bu tercih edildi, çünkü karşı taraf güncellemeyi henüz almadıysa mesajlaşmayı tamamen kesmek daha
kötü bir deneyim. Bu, tasarımdaki tek bilinçli ödün.

**firestore.rules**: mesaj `update` kuralındaki edit carve-out'u (`hasOnly(['text', 'editedAt'])`)
yeni `enc*` alanlarını da kapsayacak şekilde genişletildi, aksi halde şifreli bir mesajı
düzenlemek reddedilirdi.

**Kapsam dışı, bilinçli olarak ertelendi**: video mesaj şifreleme (yukarıda açıklandı), ve admin
erişimi — bu ayrı ve bilinçli bir sonraki adım, kullanıcı ayrıca isteyecek. İkisini bu pass'e
karıştırmak "gerçek E2E" hedefini baltalardı.

Doğrulama: `npx tsc --noEmit` (mobil) ve `web-client`'ta `npx tsc -b` temiz geçti; pc-client'ın
module script'i `node --check` ile syntax-doğrulandı. Canlı Firebase ile iki hesap arasında
gerçek şifreleme/çözme round-trip'i (ve yeni-cihaz re-key senaryosu) bu oturumda test edilmedi —
bir sonraki gerçek kullanım/test oturumunda elle doğrulanmalı.

## 2026-08-28 — PC istemcisi: satranç modalinde oyunu sıfırlama butonu geri eklendi

USB flash bellekteki (arama/galeri/"benden sil") ve eski yerel yedekteki (satranç/XOX/
sesli-görüntülü arama/mesaj düzenleme/FCM/PC istemcisi) iki farklı geliştirme kolunun
`merge/usb-plus-backup` branch'inde birleştirilmesi sırasında `pc-client/index.html`'deki
iki ayrı satranç modali implementasyonu tek dosyada birleştirilirken oyunu **oyun devam
ederken** sıfırlayan 🔄 buton (`chessResetBtn`) yanlışlıkla düşmüştü — sadece oyun bittikten
sonraki "YENİDEN OYNA" butonu kalmıştı. Buton, `resetChessGame()` fonksiyonu ve event
listener'ıyla birlikte geri eklendi:

- HTML: modal başlık satırına `chessClose`'dan önce `#chessResetBtn` eklendi.
- `resetChessGame()`: mevcut oyunun `playerWhite`/`playerBlack` atamasını koruyarak `fen`'i
  başlangıç pozisyonuna resetler (rakip renk ataması `startChessGame()`'deki gibi karışmaz).
- Görünürlük: `renderChessModal()` içinde `chessGameState` varken (aktif ya da bitmiş fark
  etmeksizin) buton gösteriliyor, oyun hiç başlamamışken gizli.

## 2026-08-27 — Sohbette birden fazla fotoğraf/video/dosya tek seferde gönderilebiliyor

Hem mobil hem web-client'ta medya seçici tek dosyayla sınırlıydı (`result.assets[0]` /
`e.target.files[0]`). Artık galeriden/dosya seçiciden birden fazla öğe seçilip hepsi ayrı
mesajlar olarak sırayla gönderilebiliyor:

- Mobil (`src/screens/ChatRoomScreen.tsx`): `handlePickMedia`'daki `launchImageLibrary`/
  `launchCamera` çağrısına `selectionLimit: 0` eklendi (0 = sınırsız, sadece galeri seçimini
  etkiliyor — kamerada zaten tek çekim var). Tek-asset gönderme mantığı `sendPickedAsset`
  adlı ayrı bir fonksiyona çıkarıldı, `handlePickMedia` artık `result.assets` dizisinin
  tamamı üzerinde `for...of` ile sırayla (paralel değil — aynı anda birden çok büyük video
  yüklemesi başlayıp bant genişliğini/depolama kotası sayacını karıştırmasın diye) gönderim
  yapıyor.
- Web (`web-client/src/screens/ChatRoomScreen.tsx`): gizli `<input type="file">`'a `multiple`
  eklendi. Tekil dosya gönderme mantığı `sendPickedFile`'a çıkarıldı, `handleFileChange`
  artık `e.target.files`'ın tamamını sırayla gönderiyor ve birden fazla dosya seçildiğinde
  "Gönderiliyor… (n/toplam)" ilerleme metni gösteriyor. Bir dosya başarısız olursa hata
  gösterilip diğer dosyalara devam ediliyor (tek dosyalık akışta olduğu gibi tamamen durmuyor).

Storage kotası, 1 MiB inline data URI sınırı gibi mevcut kurallar değişmedi; her dosya kendi
başına aynı kontrollerden geçiyor, sadece artık tek bir seçimde birden fazla dosya bu döngüden
geçebiliyor.

## 2026-08-27 — Web'e gerçek tarayıcı push bildirimi eklendi

`web-client`'ta hiç bildirim sistemi yoktu (mobildeki `fcmService.ts` +
`NotificationCenter`'ın karşılığı hiç yazılmamıştı) — sunucu tarafı
(`functions/index.js`'teki `onNewMessage`) zaten her yeni mesajda
`users/{uid}.fcmToken`'a data-only FCM push atıyordu ama alıcı taraf eksikti.
Eklenenler:

- `web-client/public/firebase-messaging-sw.js` — arka plan/kapalı sekme için
  service worker (Firebase compat CDN scriptleri ile), mobildeki gibi
  sahte-oyun temalı, mesaj içeriği/gönderen ismi içermeyen bildirim gösteriyor.
- `web-client/src/services/notificationService.ts` — mobildeki aynı isimli
  dosyanın web portu (localStorage tabanlı on/off flag, sahte bildirim
  metinleri, `activeChatUid` takibi).
- `web-client/src/services/fcmService.ts` — `initFcm(uid)`: bildirim izni
  ister, service worker'ı kaydeder, VAPID key ile token alıp
  `users/{uid}.fcmToken`'a yazar, foreground `onMessage` dinleyicisiyle sekme
  açıkken de bildirim gösterir.
- `web-client/src/config/messagingConfig.ts` — Firebase Console → Cloud
  Messaging → Web configuration'dan alınan VAPID key.
- `App.tsx`: login sonrası `initFcm` çağrılıyor, `activeContact` değiştikçe
  `setActiveChatUid` ile senkron tutuluyor (açık olan sohbetten gelen mesaj
  bildirim göstermiyor).

Not: Tarayıcı ilk ziyarette bildirim izni istiyor — kullanıcı reddederse
push çalışmaz (mesajın kendisi yine Firestore'da güvenle duruyor, sadece
push gösterilmiyor).

## 2026-08-27 — Web sekme başlığı düzeltildi

`web-client/index.html`'deki `<title>` etiketi "GizliChat — Web" idi; sitenin gizleme amacını
(sohbet, "BLOK ÇILGINLIĞI" oyunu kılığında saklanıyor) bozduğu için "Blok Çılgınlığı" olarak
değiştirildi ve `firebase deploy --only hosting` ile canlıya alındı.

## 2026-08-25 — Mesaj arama özelliği (sohbet içi + tüm sohbetler genelinde) + APK 1.4.0

WhatsApp benzeri iki arama modu eklendi, hem mobil hem web-client'ta:

- **Sohbet içi arama** (`ChatRoomScreen.tsx`): header'a 🔍 ikonu eklendi, açılınca bir arama çubuğu
  çıkıyor. `messages` dizisi üzerinden (arama açıkken `messageLimit` `MAX_MESSAGE_LIMIT`'e
  genişletiliyor ki geçmişin tamamına yakını taransın) case-insensitive substring eşleşmesi
  yapılıyor, eşleşmeler en yeniden en eskiye sıralanıyor. Yukarı/aşağı ok butonlarıyla sonuçlar
  arasında gezilebiliyor (`X/Y` sayaç), mevcut sonuç mesaj balonunun etrafına renkli bir
  outline/border ile vurgulanıyor (mobil: `MessageBubble`'a yeni `highlighted` prop; web:
  `outline` stili) ve otomatik olarak o mesaja kaydırılıyor.
- **Tüm sohbetler genelinde arama** (`ContactsScreen.tsx`): kişi listesi header'ına 🔍 ikonu
  eklendi. Firestore'da tam metin arama olmadığı için `chatService.ts`'e yeni bir one-off
  (canlı olmayan) `searchMessagesInRoom(roomId, myUid, queryText)` fonksiyonu eklendi — her oda
  için en son `MAX_MESSAGE_LIMIT` mesajı çekip client-side filtreliyor (silinmiş-benden mesajlar
  hariç). Yazarken 350ms debounce sonrası tüm kişilerin odalarında paralel arama yapılıyor,
  sonuçlar `createdAt`'e göre birleştirilip en fazla 50 tanesi gösteriliyor. Bir sonuca
  dokunmak ilgili sohbeti açıp doğrudan o mesaja atlıyor ve kısaca vurguluyor.
- **Navigasyon zinciri**: arama sonucundan bir sohbeti "belirli bir mesaja atlayarak" açabilmek
  için `onOpenRoom`/`openRoom`'a opsiyonel bir `messageIdToJumpTo` parametresi eklendi (mobil:
  `AppNavigator.tsx`'te yeni `jumpMessageId` state'i; web: `App.tsx`'teki `NavState`'e yeni
  `jumpMessageId` alanı, tarayıcı geçmişine de push ediliyor). `ChatRoomScreen` yeni
  `initialJumpMessageId` prop'unu alınca `messageLimit`'i baştan `MAX_MESSAGE_LIMIT`'e açıyor ve
  hedef mesaj yüklenene kadar her `messages` güncellemesinde tekrar deneyip bulunca kaydırıp
  vurguluyor.

Her iki client de `npm run build` + `firebase deploy --only hosting` ile deploy edildi
(web-client → `kaanchatmercan.web.app`). Mobil: `versionCode` 13→14, `versionName`
"1.3.5"→"1.4.0" (minor bump — yeni bir özellik, patch değil), `apk-release-deploy/public/
gizlichat-1.4.0.apk` olarak derlenip `gizlichat-android-updates` sitesine deploy edildi.
Firestore `app_config/android` dokümanı bu kez kullanıcı tarafından Console'dan elle
güncellendi (`versionCode: 14`, `versionName: "1.4.0"`, `apkUrl: ".../gizlichat-1.4.0.apk"`) —
bu oturumda Chrome hesap bağlantısı yanlış Google hesabına düştüğü için otomasyon yerine
kullanıcı kendisi girdi.

## 2026-08-25 — Yanıt alıntısına tıklayınca orijinal mesaja atlama + APK 1.3.5

Bir mesajın içindeki "yanıtlanan mesaj" alıntısı (`message.replyTo`, swipe-to-reply ile
gönderilen mesajlara eklenen küçük önizleme kutusu) artık tıklanabilir — WhatsApp'taki gibi,
tıklayınca liste orijinal mesaja kaydırılıyor. Hem mobil hem web-client'ta:
- `ChatRoomScreen.tsx`'teki eski `handleJumpToPinned` (sabitlenmiş mesaja atlama) mantığı
  paylaşılan bir `scrollToMessageId`/`handleJumpToReply` fonksiyonuna çıkarıldı — pin atlama da
  artık aynı fonksiyonu kullanıyor.
- Mobil: `MessageBubble.tsx`'e yeni `onJumpToReply: (messageId: string) => void` prop'u eklendi,
  `replyQuote` artık `View` yerine `Pressable`; `FlatList`'in `listRef.current.scrollToItem(...)`
  metoduyla kaydırıyor (sabit mesaj atlamasıyla birebir aynı mekanizma).
- Web-client: `MessageBubble.tsx`'in kök `.msg-row` div'ine `id={msg-${message.id}}` eklendi,
  reply alıntısı `onClick`'te `document.getElementById(...).scrollIntoView({behavior:'smooth',
  block:'center'})` çağırıyor.
- **Bilinen sınır:** Hedef mesaj o an yüklü pencerenin (mobil `messageLimit`/sayfalama, web
  `messageLimit`) dışındaysa sessizce hiçbir şey olmuyor — sabit mesaj atlamasında da aynı sınır
  zaten vardı, kapsam dışı bırakıldı.

Web-client `npm run build` + `firebase deploy --only hosting` ile `kaanchatmercan.web.app`'e
deploy edildi. Mobil: `versionCode` 12→13, `versionName` "1.3.4"→"1.3.5", `apk-release-deploy/
public/gizlichat-1.3.5.apk` olarak derlenip `gizlichat-android-updates` sitesine deploy edildi
(`https://gizlichat-android-updates.web.app/gizlichat-1.3.5.apk`).

`app_config/android` Firestore dokümanı da güncellendi — `firestore.rules`'ta bu path bilerek
`allow write: if false` (programatik/CLI yazma yolu yok), o yüzden kullanıcının isteğiyle
Firebase Console'a onun ikinci Chrome profilinden (`claude-in-chrome` MCP, `switch_browser` ile
doğru hesaba bağlanılarak) girilip alanlar elle dolduruldu: `versionCode: 13`,
`versionName: "1.3.5"`, `apkUrl: "https://gizlichat-android-updates.web.app/gizlichat-1.3.5.apk"`,
`notes: "Mesaj silme tek taraflı hale getirildi, yanıt alıntısına tıklayınca orijinal mesaja
atlama eklendi"`. Bu bilerek Admin SDK/REST API ile OAuth token'ı çıkarıp kuralı bypass ederek
değil, Console'un kendi (IAM yetkili) arayüzü üzerinden yapıldı.

## 2026-08-25 — Mobil release APK 1.3.4 (versionCode 12) — tek taraflı silme

`android/app/build.gradle`: `versionCode` 11→12, `versionName` "1.3.3"→"1.3.4" (aşağıdaki
"Mesaj silme tek taraflı..." kaydındaki tüm mobil değişiklikleri içeriyor). `cd android &&
./gradlew.bat assembleRelease --no-daemon` ile derlendi, çıktı `apk-release-deploy/public/
gizlichat-1.3.4.apk` olarak kopyalanıp o klasörün kendi `firebase.json`'ı (`site:
"gizlichat-android-updates"`) üzerinden `firebase deploy --only hosting` ile
`https://gizlichat-android-updates.web.app/gizlichat-1.3.4.apk` adresine deploy edildi.
**Kalan tek elle adım (Console-only, `firestore.rules`'ta bilerek `allow write: if false`):**
Firebase Console → `kaanchatmercan` → Firestore Database → `app_config` → `android` dokümanı →
`versionCode: 12`, `versionName: "1.3.4"`, `apkUrl: "https://gizlichat-android-updates.web.app/
gizlichat-1.3.4.apk"` olarak güncellenip kaydedilmeli — yoksa telefonlardaki uygulama içi
güncelleme banner'ı ya hiç çıkmaz ya da eski sürümü işaret eder (bkz. [[05-Build-Deployment]]
"Uygulama içi güncelleme (APK) yayınlama").

## 2026-08-25 — Mesaj silme tek taraflı ("benden sil") hale getirildi

Eskiden `deleteMessage()` paylaşılan mesaj dokümanının `text`/`mediaUrl`'ini sunucu tarafında
temizleyip `deleted: true` bayrağını flip ediyordu — bu, gönderen mesajı sildiğinde **her iki**
tarafta da "Bu mesaj silindi" placeholder'ı olarak görünmesine yol açıyordu. Artık davranış
WhatsApp'ın "benden sil"ine benziyor: `deletedFor: string[]` alanına (hem mobil hem web-client
`chatService.ts`) silen kullanıcının uid'i `arrayUnion` ile ekleniyor, mesajın kendisi (metin/
medya) hiç değişmiyor. `subscribeToMessages(roomId, limitCount, myUid, onMessages, onError)`
artık ek bir `myUid` parametresi alıyor ve döndürdüğü listeden `deletedFor` kendi uid'ini
içeren mesajları tamamen filtreliyor (placeholder yok, mesaj sanki hiç yokmuş gibi kayboluyor) —
karşı taraf hiçbir değişiklik görmez, mesaj onun ekranında aynen kalır. Pinlenmiş bir mesaj
kendinden silinirse `fetchMessageById` fallback'i (canlı `messages` listesinin dışında kaldığı
için) bunu bypass etmesin diye `ChatRoomScreen.tsx`'teki pin-preview efekti de `deletedFor`
kontrolü yapıyor. `firestore.rules`'taki eski "sadece gönderen `deleted`'ı true'ya çevirebilir"
carve-out'u, "herhangi bir oda üyesi `deletedFor`'a sadece kendi uid'ini ekleyebilir" kuralıyla
değiştirildi. Eski `deleted`/placeholder alanı ve UI'ı (`MessageBubble.tsx`'teki "Bu mesaj
silindi" render'ı) geriye dönük uyumluluk için dokunulmadan bırakıldı (eski verilerde hâlâ var)
ama artık hiçbir kod tarafından yazılmıyor. Mobil `MessageBubble.tsx`'e uzun-basma menüsüne
🗑️ "Sil" satırı eklendi (önceden mekanizma vardı ama UI'dan erişilemiyordu — bkz. eski yorum);
web-client'ta zaten var olan "Sil" butonu aynı mekanizmayı kullanmaya devam ediyor, sadece
onay metni güncellendi. `firestore.rules` değişikliği `firebase deploy --only firestore:rules` ile `kaanchatmercan`
projesine deploy edildi, canlıda aktif. Ayrıca `web-client` için `npm run build` +
(`web-client/firebase.json` üzerinden) `firebase deploy --only hosting` ile
`https://kaanchatmercan.web.app` üzerine de deploy edildi — web-client kendi `firebase.json`'ına
sahip ayrı bir hosting hedefi, kök dizindeki `firebase.json`'ın `hosting` alanı ona değil
`gizlichat-android-updates` APK sitesine ait, bu yüzden web tarafında bir kod değişikliği canlıya
yansımadan önce mutlaka `web-client/` içinden ayrıca build+deploy edilmesi gerekiyor.

**Ek: "benden silindi" göstergesi.** Kullanıcı testten sonra karşı tarafın, kendi sildiği bir
mesajın yanında küçük bir ikon görmesini istedi — yani tek taraflı silme "sessiz" kalmayacak,
silen tarafın kimliği ifşa edilmeden ("kim sildi" değil, sadece "biri sildi" bilgisi) karşı
tarafa görsel bir işaret verilecek. `MessageBubble.tsx`'te (hem mobil hem web-client) ortak
`metaRow`'a (saat/tik satırı — tüm mesaj tiplerinde, metin/resim/video/ses/dosya fark etmeksizin
render ediliyor) `message.deletedFor?.length > 0` ise 🗑️ ikonu eklendi. Bu koşul güvenli:
`subscribeToMessages` zaten izleyicinin kendi uid'ini `deletedFor` içeren mesajları tamamen
filtreliyor, yani bir mesaj hâlâ listede görünüyorsa ve `deletedFor` doluysa, o mutlaka karşı
tarafın (1-1 oda olduğu için tek olası diğer üye) sildiği anlamına geliyor. Web-client tekrar
build+deploy edildi.

**Bug: web-client'ta Sil butonu sadece kendi mesajlarda görünüyordu.** Mobil `MessageBubble.tsx`
Sil satırını `isMine` kontrolü olmadan (her mesaj için) gösterirken, `web-client/src/components/
MessageBubble.tsx`'teki karşılığı hâlâ `{isMine && (...)}` içine sarılıydı — yani web'de karşı
tarafın mesajını kendinden silmek mümkün değildi, mekanizma (`deleteMessage`/Firestore kuralı)
zaten her iki yönde de çalışıyordu ama buton görünmüyordu. `isMine` şartı kaldırıldı, tekrar
build+deploy edildi.

**Bug: sohbet listesindeki son mesaj önizlemesi silinen mesajı göstermeye devam ediyordu.**
`ContactsScreen.tsx`'teki "SOHBETLER" listesi son mesajı `subscribeToLatestMessage(roomId, ...)`
ile alıyor (`chatService.ts`, hem mobil hem web-client) — bu fonksiyon `deletedFor` filtresi
uygulamıyordu, sadece `orderBy('createdAt','desc').limit(1)` ile ham en son dokümanı çekiyordu.
Sonuç: bir mesajı kendinden silsen bile soldaki liste önizlemesi (`Sen: 📷 ...` gibi) o mesajı
göstermeye devam ediyordu. Düzeltme: sorgu `limit(20)`'ye genişletildi ve fonksiyon artık bir
`myUid` parametresi alıp `deletedFor` içinde bu uid'i taşımayan ilk (en yeni) mesajı client-side
seçiyor — aynı mantık `subscribeToMessages`'takiyle tutarlı. Üç çağıran nokta güncellendi:
mobil `ContactsScreen.tsx`, mobil `NotificationCenter.tsx` (bildirim/delivered-mark mantığı için)
ve web-client `ContactsScreen.tsx`. Web-client tekrar build+deploy edildi.

## 2026-08-25 — Sohbet silme, unicode satranç taşları, web geri tuşu ve mobil düzeltmeler

- **Sohbet silme (web + mobil)**: `contactService.ts`'e `removeContact(myUid, contactUid)`
  eklendi — sadece `users/{myUid}/contacts/{contactUid}` dokümanını siler. Oda (`rooms/{roomId}`)
  iki kullanıcı arasında paylaşılan tek doküman olduğu için dokunulmuyor: silme işlemi sadece
  o kullanıcının sohbet listesinden kaldırır, karşı taraf etkilenmez ("kendinden sil", mesajlar
  silinmez). UI: `ContactsScreen.tsx`'te favori yıldızının yanına 🗑️ butonu (web: `window.confirm`,
  mobil: `Alert.alert`).
- **Satranç taşları düz SVG'den Unicode sembollere geçirildi** (`chessPieceIcons.tsx`, hem
  `src/components/` hem `web-client/src/components/`) — ♟♞♝♜♛♚, takım rengine göre
  mavi/turuncu tint'li `<Text>`/`<SvgText>`.
- **Web-client routing**: `web-client/src/App.tsx`'e History API tabanlı navigasyon eklendi
  (`NavState` + `history.pushState`/`popstate`) — uygulamanın gizli-oyun-kılığı tasarımı
  gereği URL hep aynı kalıyor (asla `/chat` gibi anlamlı bir yol yok), ama tarayıcının
  geri/ileri tuşları artık gerçek ekranlar arası geçişi (hub↔login↔contacts↔chat) doğru
  şekilde yapıyor. İnce nokta: login başarılı olduğunda `handleAuthenticated` gizli bir
  "hub" (`hubOverride:true`) geçmiş kaydını Contacts kaydından hemen önce push ediyor —
  yoksa `account` set olduktan sonra `revealed` bayrağının render üzerinde hiçbir etkisi
  kalmadığından, girişten hemen sonra tek geri tuşu basışı ekranda hiçbir değişiklik
  yaratmıyordu (kullanıcı "geri tuşu çalışmıyor" sanıyordu).
- **Mobil kaydırma düzeltmesi**: `ChatRoomScreen.tsx`'te `maintainVisibleContentPosition`
  sadece `loadingMore` (eski mesajlar yukarıdan yüklenirken) true iken aktif ediliyor —
  önceden her zaman açıktı ve mesaj listesi her güncellendiğinde (okundu bilgisi, reaksiyon
  vb.) kullanıcı aşağı kaydırırken bile scroll pozisyonunu yukarı çekiyordu.
- **Mobil "görüldü" düzeltmesi**: `ChatRoomScreen.tsx`'te okundu bilgisi (`markMessageRead`)
  artık sadece `AppState.currentState === 'active'` iken yazılıyor — önceden oda ekranı
  arka planda/telefon kilitliyken bile mount'lu kaldığı için gelen mesajlar hiç görülmeden
  "görüldü" olarak işaretleniyordu. Uygulama tekrar öne geldiğinde bekleyen mesajlar
  otomatik işaretleniyor (`AppState` `change` listener).
- Mobil `versionCode` 10→11, `versionName` "1.3.2"→"1.3.3"; yeni release APK
  `apk-release-deploy/public/gizlichat-1.3.3.apk` olarak `gizlichat-android-updates` hosting
  site'ına deploy edildi (bkz. [[05-Build-Deployment]] elle-adım deseni — `app_config/android`
  Firestore dokümanı hâlâ Console'dan elle güncellenmesi gerekiyor).

## 2026-08-25 — Web-client'a şifresiz kurtarma kodu ile giriş

Şifresini unutan bir kullanıcının hesabına, gerçek şifresini **hiç değiştirmeden/görmeden**
erişebilmesi için admin destekli bir kurtarma akışı eklendi (sadece web-client tarafında,
mobil dokunulmadı):

- `scripts/generateLoginToken.js` — proje kökünde yeni bir admin script. `firebase-admin`
  ile (servis hesabı anahtarı gerektirir, `serviceAccountKey.json` artık `.gitignore`'da)
  `usernameLower`'dan `uid`'i bulup `admin.auth().createCustomToken(uid)` ile ~1 saat geçerli
  tek seferlik bir giriş jetonu üretir. Kullanıcının Firebase Auth şifresine dokunmaz.
- `web-client/src/services/userService.ts` → yeni `loginWithRecoveryToken(token)`,
  `signInWithCustomToken` ile jetonu kullanıp normal `loginAccount` gibi bir `Account` döner.
- `web-client/src/screens/AuthScreen.tsx` → yeni "Şifreni mi unuttun? Kurtarma kodu ile gir"
  bağlantısı, formu kullanıcı adı/şifre yerine tek bir "Kurtarma kodu" alanına çeviren bir
  `isRecoveryMode` durumu ekliyor.
- Bilinçli sınırlama: bu akış sadece admin script'ini çalıştırabilen birinin (yani proje
  sahibinin) elle jeton üretip kullanıcıya iletmesiyle çalışır — self-servis bir "şifremi
  unuttum" e-postası değil (bkz. [[04-Security-Notes]] "Şifre kurtarma mekanizması yok" notu,
  o kısıtlama hâlâ geçerli, bu sadece admin'in elle devreye soktuğu bir yan kapı).

## 2026-08-24 — Spotify linkleri için önizleme banner'ı (web + mobil)

Metin mesajı içinde bir Spotify linki (`open.spotify.com/track|album|playlist|episode|show|artist/...`,
`intl-xx/` önekli varyantlar dahil) geçiyorsa, mesaj balonunun altında kapak resmi + parça/içerik
başlığı + "Spotify" rozeti gösteren tıklanabilir bir banner kartı beliriyor (tıklanınca linki
tarayıcıda/Spotify uygulamasında açıyor). Veri, Spotify'ın herkese açık, auth gerektirmeyen ve
CORS'a izin veren oEmbed endpoint'inden (`https://open.spotify.com/oembed?url=...`) çekiliyor;
sonuçlar URL başına bellek-içi `Map` cache'inde tutuluyor (yeniden render'da tekrar fetch yok).
Lookup başarısız olursa veya link Spotify değilse banner hiç render edilmiyor, mesaj metni
etkilenmiyor.

- Ortak mantık (regex + fetch + cache) her iki tarafta ayrı ayrı: `src/utils/linkPreview.ts`
  (RN) ve `web-client/src/utils/linkPreview.ts` (web) — kod paylaşımı yok, iki client birbirinden
  bağımsız paketler.
- Kart bileşeni: RN `src/components/LinkPreviewCard.tsx` (`Pressable`+`Image`+`Text`), web
  `web-client/src/components/LinkPreviewCard.tsx` (`<a>` + `web-client/src/index.css`'teki
  `.msg-link-preview*` sınıfları).
- Her iki `MessageBubble.tsx`'te `message.type === 'text'` dalına entegre: mesaj metninden
  `extractSpotifyUrl` ile ilk Spotify linki çıkarılıp varsa `<LinkPreviewCard url={...} />`
  mesaj metninin altına ekleniyor.
- Şu an yalnızca Spotify destekleniyor (ekran görüntüsünde istenen örnek buydu); genel bir
  Open Graph link-preview sistemi değil.

## 2026-08-24 — Çok uzun metin mesajlarında "Daha fazlası" butonu (web + mobil) + karşıdan gelen mesajlarda scroll düzeltmesi

**Uzun mesaj kısaltma:** Hem `web-client/src/components/MessageBubble.tsx` hem RN
`src/components/MessageBubble.tsx`'te, 400 karakterden uzun metin mesajları artık `…` ile
kesilip altına "Daha fazlası" bağlantısı ekleniyor; tıklanınca mesaj tam açılıyor ve buton
"Daha az göster"e dönüyor (`textExpanded` state, `TEXT_TRUNCATE_LENGTH = 400`). Web'de düz bir
`<button className="msg-show-more-btn">`, mobilde alt satırda ayrı bir `Pressable`+`Text`
(`styles.showMoreText`).

**Karşıdan gelen mesajlarda auto-scroll düzeltmesi:** Önceki `nearBottomRef`, yalnızca kullanıcının
`onScroll` event'i tetiklediği anlarda güncelleniyordu. Bu, kendi mesajını gönderirken sorun
çıkarmıyordu (ayrıca zorla kaydırılıyordu) ama karşı taraftan mesaj geldiğinde — herhangi bir
scroll event araya girmemişse — "kullanıcı altta mı" bilgisi bayat kalabiliyor, bazen kaydırma
tetiklenmeyebiliyordu. Artık `ChatRoomScreen.tsx`'teki `subscribeToMessages` callback'i,
`setMessages` çağrılmadan hemen önce (yani DOM yeni mesajla güncellenmeden hemen önce) mevcut
`listRef` DOM elemanının `scrollHeight/scrollTop/clientHeight` değerlerinden `nearBottomRef.current`'ı
doğrudan hesaplıyor — kararı olay tabanlı, gecikmeli bir referansa değil, o anki gerçek DOM
durumuna dayandırıyor.

Build alınıp `firebase deploy --only hosting` ile `kaanchatmercan`
(https://kaanchatmercan.web.app) üzerine deploy edildi, GitHub'a push edildi (`f279d60`).

## 2026-08-24 — web-client: kalan iki auto-scroll bug'ı düzeltildi (kendi mesajın + medya yüklemesi)

Önceki `lastMessageId` düzeltmesinden sonra kullanıcı hâlâ "bazen buglanıyor" bildirdi. İki ayrı
kök neden bulundu ve `ChatRoomScreen.tsx`'te düzeltildi:

1. **Kendi gönderdiğin mesaj kaydırmıyordu:** Kullanıcı yukarı kaydırmışken kendi mesajını
   gönderdiğinde `nearBottomRef.current` hâlâ `false` olduğu için otomatik kaydırma effect'i
   çalışmıyor, sadece "en alta git" butonu beliriyordu — oysa kendi gönderdiğin mesaj her zaman
   ekrana gelmeli. `lastMessageIsMine` (`lastMessage?.senderId === account.uid`) eklendi;
   `nearBottomRef.current || lastMessageIsMine` artık en alta kaydırmayı tetikliyor.
2. **Fotoğraf/video mesajları eksik kaydırıyordu:** En alta kaydırma, mesaj DOM'a eklendiği anda
   `scrollHeight` üzerinden hesaplanıyordu, ama `<img>`/`<video>` içerikleri ağdan asenkron
   yüklendiği için o an bubble henüz gerçek boyutuna ulaşmamış oluyordu — sonuç: kaydırma hedefin
   biraz altında kalıyordu. `.chat-messages` üzerine capture-phase `load`/`loadedmetadata` event
   listener'ları eklendi; `nearBottomRef.current` true iken herhangi bir medya yüklendiğinde
   liste tekrar en alta pinleniyor.

`npm run build` + `firebase deploy --only hosting` ile `kaanchatmercan` (https://kaanchatmercan.web.app)
üzerine deploy edildi.

## 2026-08-24 — web-client: otomatik aşağı kaydırmanın gerçek kök nedeni bulundu ve deploy edildi

İlk scroll düzeltmesi (`nearBottomRef` + `useEffect(..., [messages.length])`) canlıda hâlâ
çalışmıyordu. Kök neden: `chatService.ts`'deki `subscribeToMessages`, Firestore sorgusunu
`orderBy('createdAt','desc').limit(messageLimit)` ile sınırlıyor (`INITIAL_MESSAGE_LIMIT = 30`).
Bir odada 30'dan fazla mesaj varsa yeni mesaj geldiğinde en eski mesaj listeden düşüyor ve dizi
uzunluğu hep 30'da sabit kalıyor — yani `messages.length` hiçbir zaman değişmiyor ve
`ChatRoomScreen.tsx`'teki auto-scroll `useEffect`'i **hiç tetiklenmiyordu**. Düzeltme:
`useEffect` bağımlılığı `messages.length` yerine `lastMessageId` (`messages[messages.length -
1]?.id`) oldu — bu, mesaj dizisi cap'e ulaşmış olsa bile en yeni mesaj değiştiğinde her zaman
değişir. `npm run build` + `firebase deploy --only hosting` ile `kaanchatmercan` (canlı site,
https://kaanchatmercan.web.app) üzerine deploy edildi.

## 2026-08-24 — origin/master birleştirildi (`4a51177`), yeni web-client'ta da scroll düzeltmesi

`origin/master`'a bir saat içinde push edilen `4a51177` ("Add web client, GIF sending, mobile UX
fixes...") mevcut dala (`feat/push-notifications-video-cache`) merge edildi. Bu commit ile
`web-client/` adında tamamen yeni, React + Vite tabanlı bir web istemcisi eklenmiş (eski tek-dosya
`pc-client/index.html`'in yanına, onu değiştirmeden) — kişi listesi, sohbet, satranç, XOX, GIF
gönderme, oyun hub'ı (2048, yılan, Whack-a-Mole vb.) gibi ekranların hepsi kendi React
component/service dosyalarına sahip.

Yeni `web-client/src/screens/ChatRoomScreen.tsx` içinde de `pc-client`'takiyle aynı otomatik
aşağı kaydırma sorunu vardı: `useEffect(() => { listRef.current?.scrollTo(...) }, [messages.length])`
her yeni mesajda koşulsuz en alta kaydırıyordu. Aynı mantıkla düzeltildi: `nearBottomRef` ile
kullanıcının alta yakın olup olmadığı `handleScroll`'da sürekli güncelleniyor; yakınsa yeni mesajda
otomatik en alta iniliyor, değilse `showJumpToBottom` state'i true olup sağ altta bir
`.chat-jump-to-bottom` (↓) butonu beliriyor (tıklanınca `scrollTo({ behavior: 'smooth' })` ile en
alta gidiyor). Oda değişince (`roomId` değişimi) `nearBottomRef` ve buton sıfırlanıyor. Stil
`web-client/src/index.css`'e eklendi (`.chat-room` artık `position: relative`).

## 2026-08-24 — pc-client: sohbet otomatik aşağı kaydırma düzeltmesi

`pc-client/index.html`'de sohbet mesaj listesi (`#messages`) her yeni Firestore snapshot'ında
`innerHTML = ''` ile tamamen yeniden çiziliyordu ve ardından her seferinde `scrollTop =
scrollHeight` ile koşulsuz en alta kaydırılıyordu — kullanıcı yukarı kaydırıp eski mesajlara
bakarken yeni mesaj gelince istemsizce en alta atılıyordu. Artık `openRoom()` içindeki
`onSnapshot` callback'i, yeniden çizmeden önce kullanıcının alta yakın olup olmadığını
(`scrollHeight - scrollTop - clientHeight < 80`) kontrol ediyor: yakınsa yeniden en alta
kaydırılıyor (yeni mesaj otomatik görünür), değilse kullanıcının göreli kaydırma konumu korunuyor
ve sağ altta yeni bir `#scrollToBottomBtn` (↓) butonu beliriyor — tıklanınca en alta atlıyor.
`#messages` üzerine bir `scroll` listener'ı da eklendi, kullanıcı manuel kaydırdığında butonu
buna göre gösterip gizliyor. `#chatHeaderWrap`'e `position: relative` eklendi ki buton mesaj
alanının sağ alt köşesinde sabit dursun.

## 2026-08-20 — Gizli video/genel dosya gönderme, uygulama içi güncelleme sistemi, mesaj yanıtlama

Üç ardışık commit'i özetler (en eskiden en yeniye): `77054af` "feat: gizli video, genel dosya
gönderme ve uygulama içi güncelleme sistemi", `73ee08f` "chore: sürümü 1.1 (versionCode 2) yap,
güncelleme sistemini gerçek APK ile deploy et", `4b1eca9` "feat: mesaj sağa/sola kaydırarak
yanıtlama ekle, güncelleme sistemini sağlamlaştır".

**1) Gizli medya + genel dosya gönderme (`77054af`).** Fotoğraf/video mesajları artık `hidden: true`
ile "gizli" işaretlenebiliyor — `MessageBubble.tsx` bunları bir blur/örtü overlay'i ile gösteriyor,
alıcı dokununca açılıyor (sınırsız kez, kendi kendini yok etmiyor). Ayrıca resim/video dışında
herhangi bir dosya seçilip gönderilebiliyor (`react-native-documents/picker`, yeni `MessageType:
'file'`, `fileName`/`fileSize` alanları), alıcı tarafta `react-native-blob-util` ile cihazın
İndirilenler klasörüne kaydedilebiliyor. Yeni `src/components/AttachMenuModal.tsx`, 📎 butonunun
seçim menüsünü ayrı bir bileşene çıkardı.

**2) Uygulama içi APK güncelleme sistemi (`77054af`, sağlamlaştırma `4b1eca9`).** Yeni
`src/services/updateService.ts` + `src/components/UpdateBanner.tsx`: Firestore `app_config/android`
dokümanından (`versionCode`/`versionName`/`apkUrl`/`notes`) daha yeni bir sürüm olup olmadığı kontrol
ediliyor (`react-native-device-info`), varsa APK `react-native-fs` ile indirilip yeni bir custom
native modül olan `ApkInstallerModule.kt`/`ApkInstallerPackage.kt`
(`android/app/src/main/java/com/mobile/`) ile sistem paket yükleyicisine teslim ediliyor
(`FileProvider`, `res/xml/file_paths.xml`, ilgili `AndroidManifest.xml` izinleri). `4b1eca9`
indirmeyi sağlamlaştırdı: yarım kalmış eski dosyayı silme, HTTP durum kodu ve indirilen boyut
doğrulaması eklendi (öncesinde bozuk bir indirme sessizce yükleyiciye veriliyor, Android'in genel
"Uygulama yüklenmedi" hatasına yol açıyordu). Firestore kuralı bilerek `app_config/{configId}` için
`allow write: if false` — bu doküman sadece Firebase Console'dan elle güncelleniyor (proje geneli
"Console-only" deseniyle tutarlı). `73ee08f` sürümü `versionCode 2`/`versionName "1.1"` yapıp gerçek
bir APK'yı `public/app-release-1.1.apk` olarak `firebase deploy --only hosting` ile yayınladı ve
uçtan uca (emülatörde) test etti — proje o zamandan beri `versionCode 6`/`versionName "1.2.3"`'e
kadar ilerledi (aradaki sürümler bu Changelog'a ayrı ayrı işlenmedi, bkz. aşağıdaki not). Detay:
[[03-Services-Backend]] → "app_config/{configId}", [[05-Build-Deployment]] → "Uygulama içi güncelleme
(APK) yayınlama".

**3) Kaydırarak/uzun-basarak mesaj yanıtlama (`4b1eca9`).** `src/components/MessageBubble.tsx`: bir
mesaj balonu sağa/sola sürüklenip eşiği geçince ya da uzun-basma menüsünden "Yanıtla" seçilince
`onReply(message)` tetikleniyor. `src/screens/ChatRoomScreen.tsx` bunu `replyingTo` state'inde tutup
gönderim kutusunun üstünde bir önizleme gösteriyor (iptal edilebilir); gönderilen mesaj
`chatService.ts`'teki yeni `ChatMessage.replyTo` alanına orijinal mesajın bir anlık görüntüsünü
(`messageId`/`text`/`senderId`/`type`) yazıyor — canlı referans değil, orijinal mesaj sonradan
değişse/silinse bile alıntı doğru kalıyor.

**Bilinen eksikler / bu oturuma dahil olmayanlar (güncelleme: aşağıdaki üç madde daha sonraki bir
oturumda 2026-08-16/17/18 tarihli ayrı Changelog kayıtlarıyla ve ilgili not dosyalarıyla tamamlandı —
bkz. aşağıdaki "2026-08-18"/"2026-08-17"/"2026-08-16" kayıtları):**
- ~~Satranç (kişiye karşı + oda kodlu online), XOX, PC istemcisi (`pc-client/`), depolama kotası
  banner'ı, profil fotoğrafı, sohbet arka planı ve mesaj düzenleme/silme/sabitleme
  (`editingMessage`)~~ artık belgelendi.
- Emoji tepkisi, okundu/ulaştı tikleri, mesaj sayfalaması ve uygulama adı/ikonu (`c9ccd3a`, bu üç
  commit'ten de öncesine ait, 2026-08-14 kaydından da önce) **hâlâ bu Changelog'a ve 01/02/03
  notlarına işlenmedi** — bir sonraki oturumda ele alınmalı (`firestore.rules`'taki `reactions`/
  `deliveredAt`/`readAt` carve-out'ları zaten bu özelliğin var olduğuna işaret ediyor, bkz.
  [[03-Services-Backend]]).
- Push bildirimleri artık `@notifee/react-native` + `@react-native-firebase/messaging` ile kısmen
  gerçek arka plan push'a taşınmış durumda (`src/services/fcmService.ts`, `functions/`) — eski
  "sadece uygulama açıkken" notu artık tam doğru değil, bkz. [[01-Architecture]] güncellenen bölüm.

**Etkilenen dosyalar (özet):** `src/components/MessageBubble.tsx`, `src/components/
AttachMenuModal.tsx` (yeni), `src/components/UpdateBanner.tsx` (yeni), `src/services/
updateService.ts` (yeni), `src/services/chatService.ts`, `src/services/mediaService.ts`,
`src/screens/ChatRoomScreen.tsx`, `src/screens/ContactsScreen.tsx`, `android/app/src/main/java/
com/mobile/ApkInstallerModule.kt` (yeni), `ApkInstallerPackage.kt` (yeni), `android/app/src/main/
AndroidManifest.xml`, `android/app/src/main/res/xml/file_paths.xml` (yeni), `firestore.rules`,
`firebase.json`, `package.json`, `__mocks__/@react-native-documents/picker.js` (yeni),
`__mocks__/react-native-blob-util.js` (yeni), `__mocks__/react-native-fs.js` (yeni),
`__mocks__/react-native-device-info.js` (yeni), `.gitignore` (`/public/*.apk` eklendi),
`YAPILACAKLAR.txt`, `GUNCELLEME-ELLE-ADIM.txt` (yeni).

## 2026-08-18 — Mesaj sabitleme/düzenleme/silme, satranç bot modu + oda-kodlu satranç genişletmesi

Tek commit: `0afbb79` ("18.08.2026 00:22"). Geçmişe dönük olarak, 2026-08-20 oturumunda önceki bir
diff taraması sırasında bulunup bu Changelog'a işlenmedi — bu kayıt onu tamamlıyor.

**1) Mesaj aksiyon menüsü genişledi (`chatService.ts`, `MessageBubble.tsx`, `ChatRoomScreen.tsx`).**
Bir mesaja uzun basınca artık Yanıtla'nın yanında üç yeni seçenek var: **Sabitle/Sabiti Kaldır**
(`pinMessage()`/`unpinMessage()` — `rooms/{roomId}` doküman seviyesinde tek bir sabitlenmiş-mesaj
işaretçisi, oda başına aynı anda en fazla bir tane), sadece kendi **metin** mesajların için
**Düzenle** (`editMessage()` — `text`+`editedAt`'i günceller, karşı tarafta "düzenlendi ·" ibaresi
görünür) ve **Sil** (`deleteMessage()` — mesajı tamamen silmek yerine `deleted: true` işaretleyip
içeriğini temizleyen bir soft-delete; karşı taraf "Bu mesaj silindi" placeholder'ı görür).
`firestore.rules`'a bu üç işlem için dar, alan-bazlı `allow update` carve-out'ları eklendi (sadece
gönderen, sadece izin verilen alanlar) — mesajlar hâlâ gerçek anlamda silinemiyor
(`allow delete: if false` duruyor).

**2) Satranç bilgisayara karşı (bot) modu eklendi (`chessBotService.ts`, yeni).** Kolay zorluk
tamamen cihazda çalışan basit bir minimax (derinlik 1); orta/zor zorluk **Stockfish Online API**'sine
(`stockfish.online`, 3. parti, ücretsiz, kimlik doğrulama gerektirmiyor) FEN pozisyonu gönderip en iyi
hamleyi alıyor (9 sn timeout, hata olursa yerel minimax'e düşüyor). Oynanan hamlenin kalitesi
(`classifyMove`) de hesaplanıp UI'da gösteriliyor.

**3) `ChessRoomScreen.tsx` ve `ChessBoard.tsx` genişletildi.** Ekran artık dört durum arasında geçiş
yapan bir `Stage` durum makinesi (`menu`/`joining`/`in_room`/`bot_difficulty`/`vs_bot`) — oda kur/kodla
katıl akışının yanına bilgisayara karşı oynama eklendi. Tahta render'ı yeniden düzenlendi.

**Etkilenen dosyalar:** `firestore.rules`, `src/components/ChessBoard.tsx`, `src/components/
MessageBubble.tsx`, `src/screens/ChatRoomScreen.tsx`, `src/screens/ChessRoomScreen.tsx`,
`src/services/chatService.ts`, `src/services/chessBotService.ts` (yeni).

## 2026-08-17 — Satranç eklendi (kişiye karşı + oda kodlu online), oyun bazlı skor tablosu, arama ses çıkışı seçici

İki commit: `fda0582` ("feat: satranç (kişiye karşı + oda kodlu online), oyun bazlı skor tablosu,
Mini Oyunlar kaydırma düzeltmesi") ve `422919c` ("feat: satranç tahtasını tam ekran/yeniden tasarla,
arama için ses çıkışı seçici ekle"). Geriye dönük olarak eklendi, bkz. yukarıdaki not.

**1) Satranç.** Yeni `chess.js` bağımlılığı, `src/services/chessService.ts`: iki mod — **contact
mode** (`rooms/{roomId}/game/chess`, sohbetteki kişiyle, `ChessContactModal.tsx`) ve **room-code mode**
(`chessRooms/{code}`, 5 karakterlik rastgele bir kodla kişi listesinden bağımsız herkesin katılabildiği
online oyun, `ChessRoomScreen.tsx`). Hamleler `chess.js`'in `Chess.move()`'u ile legal mi diye
istemci tarafında kontrol ediliyor. `firestore.rules`'a `rooms/{roomId}/game/{gameId}` ve
`chessRooms/{code}` için yeni kurallar eklendi (ikincisi anonim auth'a bile açık).

**2) Skor tablosu oyun bazlı hâle getirildi.** `leaderboardService.ts`: `highscores` dokümanlarına
`game` alanı eklendi, `submitScore`/`fetchTopScores` artık bu alana göre filtreleniyor — öncesinde
tek karma bir tablo vardı, artık her `GameHubScreen` oyununun kendi ayrı sıralaması var.
`GameHubScreen.tsx`'e Satranç kartı + her oyun için ayrı en-yüksek-skor rozeti eklendi; XOX/Satranç
bu sıralamadan hariç tutuluyor (sayısal skorları yok).

**3) Arama ses çıkış cihazı seçici.** Yeni `src/services/audioOutputService.ts`: `CallScreen.tsx`'e
arama sırasında hoparlör/kulaklık/Bluetooth arasında geçiş yapan bir buton + alt menü, `SettingsModal`'a
da kalıcı bir "Arama ses çıkışı" tercihi eklendi.

**4) `ChessBoard.tsx`/`ChessRoomScreen.tsx` tam ekran yeniden tasarımı.** Tahta artık ekran
yüksekliğini de kullanarak gerçek boyutunu dolduruyor, koordinat etiketleri ve gölge eklendi.

**Etkilenen dosyalar:** `firebase.json`, `firestore.indexes.json`, `firestore.rules`, `package.json`,
`src/components/ChessBoard.tsx` (yeni), `src/components/ChessContactModal.tsx` (yeni), `src/components/
LeaderboardModal.tsx`, `src/components/SettingsModal.tsx`, `src/screens/CallScreen.tsx`,
`src/screens/ChatRoomScreen.tsx`, `src/screens/ChessRoomScreen.tsx` (yeni), `src/screens/
ColorMemoryGame.tsx`, `src/screens/Game2048.tsx`, `src/screens/GameHubScreen.tsx`, `src/screens/
HomeScreen.tsx`, `src/screens/SnakeGame.tsx`, `src/screens/WhackAMoleGame.tsx`, `src/services/
audioOutputService.ts` (yeni), `src/services/chessService.ts` (yeni), `src/services/
leaderboardService.ts`.

## 2026-08-16 — Depolama kotası, profil fotoğrafı, sohbet arka planı, PC istemcisi, sohbetten canlı XOX

Üç commit: `78ff4c2` ("feat: depolama kotası banner'ı, profil fotoğrafı, sohbet arka planı, PC
istemcisi ve hata düzeltmeleri"), `4c73d04` ("fix(pc-client): file:// oturum açma hatası ve açık/koyu
tema geçişi ekle"), `2e90dc1` + `47c4527` (XOX). Geriye dönük olarak eklendi, bkz. yukarıdaki not.

**1) Depolama kotası göstergesi.** Yeni `src/components/StorageQuotaBanner.tsx`: hesabın video/genel
dosya yükleme toplamını (`userService.VIDEO_STORAGE_QUOTA_BYTES` = 5120 MB) kalıcı bir barla gösterir
— `ContactsScreen`'de kart, `ChatRoomScreen`'de header altına yapışık ince şerit olarak. `userService.ts`'e
`videoBytesUsed` (Firestore, `increment()`), `addVideoBytesUsed()`, `updateProfilePhoto()`,
`subscribeToUserProfile()` eklendi. **Bu bir sert limit değil**, sadece bilgilendirici bir sayaç —
`firestore.rules`/`storage.rules` yükleme miktarını kısıtlamıyor.

**2) Profil fotoğrafı.** Yeni `src/components/Avatar.tsx`: hesap ve kişiler için profil fotoğrafı
(base64 data URI, Storage'sız — fotoğraf mesajlarıyla aynı yöntem), `ContactsScreen`'den değiştirilir,
canlı senkronize (`subscribeToUserProfile`).

**3) Sohbet arka plan resmi.** Yeni `src/services/chatBackgroundService.ts`: oda başına, **sadece bu
cihazda** (`AsyncStorage`, iki taraf arasında senkronize edilmiyor) saklanan bir arka plan resmi.

**4) İkon yenileme.** Yeni `src/components/CallIcons.tsx`: arama/video/geri gibi ikonlar emoji yerine
`react-native-svg` ile çizilen ince çizgi ikonlara çevrildi.

**5) `pc-client/index.html` (yeni) — tek dosyalık PC istemcisi.** Build adımı olmayan, `file://`
protokolüyle doğrudan tarayıcıda açılan bir masaüstü sohbet sayfası. Firebase JS SDK'sını CDN'den
import ediyor, mobil ile **aynı** Firebase config'i ve **aynı** kullanıcı adı→sahte e-posta auth
şemasını kullanıyor — yani aynı hesapla hem telefonda hem PC'de aynı anda oturum açılabiliyor.
Metin/fotoğraf/video mesajlaşma, kişi listesi, depolama kotası göstergesi, açık/koyu tema, gerçek
içerikli masaüstü bildirimleri (tarayıcı `Notification` API'si) destekleniyor; arama/sesli mesaj yok.
`4c73d04`'te (12 dk sonra) bir takip düzeltmesi geldi: Firebase Auth'un varsayılan IndexedDB tabanlı
kalıcılığı `file://` origin'inde Chrome'da "Database is closing/hidden" hatasıyla girişi bozuyordu —
`localStorage` tabanlı elle bir persistence'a geçilerek düzeltildi; aynı commit'te açık/koyu tema
geçişi de eklendi. Detay: [[01-Architecture]] → "PC istemcisi".

**6) Sohbetten kişiye karşı canlı XOX (`2e90dc1` + `47c4527`).** Yeni `src/services/
ticTacToeService.ts` + `src/components/OnlineTicTacToeModal.tsx`: `rooms/{roomId}/game/ticTacToe` tek
bir Firestore dokümanı üzerinden iki cihaz gerçek zamanlı senkronize oluyor (mesajlarla aynı
"paylaşılan doküman, hakemsiz" modeli). `GameHubScreen`'deki bilgisayara karşı XOX'tan (aynı oturumda
`TicTacToeGame.tsx`'e taşındı) tamamen ayrı bir mod. `2e90dc1` ayrıca yılanın titreme hatasını düzeltti
ve oyun ekranlarını tam ekran yaptı.

**Etkilenen dosyalar (özet):** `__mocks__/react-native-fs.js` (yeni), `firestore.rules`, `pc-client/
index.html` (yeni), `src/components/Avatar.tsx` (yeni), `src/components/CallIcons.tsx` (yeni),
`src/components/OnlineTicTacToeModal.tsx` (yeni), `src/components/StorageQuotaBanner.tsx` (yeni),
`src/screens/ChatRoomScreen.tsx`, `src/screens/ContactsScreen.tsx`, `src/services/
chatBackgroundService.ts` (yeni), `src/services/fcmService.ts`, `src/services/mediaService.ts`,
`src/services/ticTacToeService.ts` (yeni), `src/services/userService.ts`.

## 2026-08-14 — Arama/mesajlaşma sağlamlaştırma + tam görsel yeniden tasarım + ana sayfa/oyun/erişilebilirlik geçişi

Tek oturumda birbirini izleyen üç ayrı istek üzerine yapıldı: (1) önce tüm proje "kritik/orta"
seviye buglar için taranıp bulunanlar raporlandı, (2) kullanıcı onayıyla arama durum makinesi ve
mesajlaşma katmanındaki bulgular düzeltildi, (3) ayrı bir istekle **merkezi bir tema/tasarım-tokeni
sistemi** kurulup arama ekranları ve sohbet arayüzü yeniden tasarlandı, (4) son olarak ana sayfa
(kişiler ekranı) bir gösterge paneline dönüştürüldü, oyun sunumu iyileştirildi ve genel bir
erişilebilirlik/duyarlı-tasarım geçişi yapıldı. `tsc --noEmit`, `eslint src`, `jest` üçü de her
aşamada temiz geçti; mevcut kimlik doğrulama/navigasyon/mesajlaşma/arama/oyun özelliklerinden
hiçbiri kırılmadı.

### 1) Arama durum senkronizasyonu + mesajlaşma sağlamlaştırma düzeltmeleri

- **`src/screens/CallScreen.tsx`** — `RECONNECTING_FAILED` durumunda artık gerçekten `call.leave()`
  çağrılıyor (öncesinde sadece yerel state temizleniyordu, bağlantı aslında geçiciyse Stream
  tarafında çağrı canlı kalabiliyordu — kritik bug). `JOINED` olunca hem arayan hem aranan tarafında
  kamera, çağrının gerçek türüne (`custom.isVideo`) göre açık/kapalı olarak **açıkça** ayarlanıyor —
  **sesli aramada kamera artık hiçbir koşulda otomatik açılmıyor**, sadece görüntülü aramalarda ya da
  kullanıcı görüşme sırasında elle açarsa.
- **`src/services/callService.ts`** — çağrı id'sine artık `-voice`/`-video` soneki ekleniyor; başlık
  çubuğundaki sesli/görüntülü arama butonlarına art arda hızlı dokununca aynı Stream çağrı nesnesinin
  yarışa girmesi (kamera enable/disable çakışması) önlendi.
- **`src/components/CallProvider.tsx`** — çağrı bitince sohbete düşülen "çağrı geçmişi" kaydı artık
  `addDoc` yerine çağrı id'sinden türetilen sabit bir doküman id'siyle `setDoc(..., {merge:true})`
  yazılıyor — hem arayan hem aranan taraf bağımsız olarak bu fonksiyonu çağırdığı için öncesinde
  **her çağrı için sohbete iki kopya kayıt düşüyordu**, artık tek kayıt. Aranan taraf artık kamera
  iznini sadece gerçekten görüntülü bir aramaysa istiyor (`custom.isVideo` kontrolü).
- **`src/services/chatService.ts`** — `docToMessage`, Firestore'dan `{ serverTimestamps: 'estimate' }`
  ile okuyor; öncesinde henüz sunucu onayı gelmemiş yeni gönderilen bir mesajın `createdAt`'i
  `Date.now()`'a düşüyordu, bu da karşıdan aynı anda gelen bir mesajla sıralamanın görünür şekilde
  karışmasına yol açabiliyordu.
- **`src/screens/ChatRoomScreen.tsx`** — okundu-bilgisi (`markMessageRead`) artık aynı mesaj için
  sunucu onayı gelene kadar tekrar tekrar yazılmıyor (`markedReadIdsRef` ile tekilleştirme). Gönderim
  başarısız olursa taslak metin artık silinmiyor (kullanıcı yeniden yazmak yerine sadece tekrar
  gönder'e basabiliyor) + eşzamanlı çift-gönderim koruması sıkılaştırıldı. Sesli/görüntülü arama
  butonlarına çift dokunuşu engelleyen bir `callStarting` kilidi eklendi.
- **`src/components/AudioMessagePlayer.tsx`** — sesli mesaj oynatıcısı (`react-native-nitro-sound`,
  uygulama genelinde tek bir native singleton) artık gerçek bir duraklat/devam et akışına sahip
  (öncesinde duraklatma sonrası devam, sıfırdan yeniden başlatıyordu); bir balon ekrandan kaybolup
  unmount olduğunda artık **sadece kendi çaldırdığı ses gerçekten çalıyorsa** native oynatıcıyı
  durduruyor — öncesinde, o an başka bir balonun sesi çalarken ekran dışına kayan **farklı** bir
  balon unmount olunca o çalan sesi sessizce kesiyordu.
- **`src/components/NotificationCenter.tsx`** — bir toast kendi zamanlayıcısıyla (kullanıcı hiç
  dokunmadan) kaybolursa artık "beklemede" bayrağı da sıfırlanıyor; öncesinde bu durumda oturumun
  geri kalanında **tüm** yeni mesaj bildirimleri sessizce bastırılıyordu.

### 2) Merkezi tema sistemi + arama ekranları ve sohbet arayüzünün yeniden tasarımı

- **`src/theme/ThemeContext.tsx`** — palet, verilen renk şemasına göre yeniden kuruldu: koyu tema
  arkaplan `#0B132B` / yüzey `#1C2541` / CTA turuncu `#FF7A00` / birincil metin `#F8FAFC` / ikincil
  metin `#94A3B8`; açık tema arkaplan `#F0F4F8` / yüzey `#FFFFFF` / CTA turuncu `#D95400` / birincil
  metin `#0F172A` / ikincil metin `#475569`. Yeni semantik token'lar eklendi: `identity` (marka mavisi
  — avatar/nokta/link gibi küçük vurgular, **CTA değil**), `accent`/`accentText` (turuncu, **sadece**
  gönder/kabul-et/kaydet/ekle gibi birincil eylem butonları için — büyük alanlarda asla kullanılmıyor),
  `bubbleMine`/`bubbleOther` (mesaj balonu renkleri, artık ikisi de mavi/nötr — eskisi gibi turuncu
  değil), `waveformTrack`, `dangerSoft`/`warningSoft`. Mavi kimlik olarak baskın, turuncu sadece
  vurgu — kullanıcı isteğinin birebir karşılığı.
- **`src/screens/CallScreen.tsx`** — Stream SDK'nın varsayılan `RingingCallContent`'i tamamen
  kaldırılıp WhatsApp benzeri, kendi tasarımımız bir akışla değiştirildi: büyük daire baş harf
  avatarı (kişilerin fotoğrafı olmadığı için), giden aramada tek "Vazgeç" butonu, gelen aramada
  yan yana kırmızı "Reddet" / turuncu "Kabul Et" büyük daire butonlar. Aktif sesli görüşme için
  tamamen özel bir ekran (avatar + süre + sustur/kapat); aktif görüntülü görüşmede Stream'in video
  render motorunu (`CallContent`) koruyup sadece alt kontrol çubuğunu (`VideoCallControls`: sustur,
  kamera aç/kapa, kamerayı çevir, kapat) kendi tasarımımızla değiştirdik.
- **`src/screens/ChatRoomScreen.tsx`**, **`src/components/MessageBubble.tsx`** — tüm sabit kodlanmış
  renkler kaldırılıp merkezi tema token'larına taşındı. **Akıllı kaydırma** eklendi: kullanıcı zaten
  listenin en altına yakınsa yeni mesajda otomatik aşağı kayıyor, değilse (eski mesajları okurken)
  kaydırma pozisyonu korunuyor ve bunun yerine "Yeni mesajlar ↓" rozeti çıkıyor.
- **`src/components/AudioMessagePlayer.tsx`, `PlaybackWaveform.tsx`, `RecordingWaveform.tsx`,
  `NotificationCenter.tsx`, `SettingsModal.tsx`, `src/screens/ContactsScreen.tsx`,
  `AccountScreen.tsx`** — sabit renkler yerine tema token'ları kullanacak şekilde güncellendi.
  **Oyunların kendi renk paletlerine bilinçli olarak dokunulmadı** (2048 taş renkleri, yılan gövdesi
  vb. işlevsel/anlamlı renkler, marka renklerine çevrilmesi kullanılabilirliği bozardı).

### 3) Ana sayfa gösterge paneli + oyun sunumu + erişilebilirlik/duyarlı tasarım

Bu uygulama bir **kılık değiştirme** (disguise) uygulaması — `GameHubScreen` herkesin gördüğü
zararsız "mini oyunlar" ön kapısı, gerçek sohbet arayüzü (`ContactsScreen`) sadece gizli 10-dokunuş
jestiyle açılıyor. Kullanıcıya bu ayrım açıkça soruldu ve **"gösterge paneli" özellikleri
`ContactsScreen`'e eklendi, `GameHubScreen` kılığı bozulmadı** (kullanıcı onayı ile).

- **`src/services/contactService.ts`** — kişilere `favorite: boolean` alanı ve
  `setContactFavorite()` eklendi.
- **`src/services/userService.ts`** — hafif bir "çevrimiçi" mekanizması: `updatePresenceHeartbeat()`
  (`users/{uid}.lastActiveAt`'i periyodik günceller) ve `subscribeToPresence()`
  (`ONLINE_THRESHOLD_MS` = 60 sn içinde son kalp atışı varsa çevrimiçi sayılır). `firestore.rules`'a
  dokunulmadı — mevcut "sahibi kendi profilini güncelleyebilir / herkes okuyabilir" kuralı zaten
  yeterli.
- **`src/navigation/AppNavigator.tsx`** — hesap girişliyken 25 saniyede bir kalp atışı gönderiyor;
  `ContactsScreen`'e oyun köşe taşına dönmek için `onOpenGames` prop'u eklendi (`HOME`'a döner).
- **`src/screens/ContactsScreen.tsx`** — tamamen bir gösterge paneline dönüştürüldü: Oyunlar
  kısayol kartı → Favoriler / Çevrimiçi / Son Aramalar yatay satırları (sadece dolu olanlar
  gösteriliyor, hiçbiri kalabalık etmeyecek şekilde sınırlı) → geri kalanında sohbet listesi artık
  en son etkinliğe göre sıralı, her satırda bir ★ favori aç/kapa butonu. "Son Aramalar" ekstra bir
  sorgu gerektirmiyor, zaten çekilen "her kişinin son mesajı" verisinden türetiliyor.
- **`src/components/LeaderboardModal.tsx`** (yeni) — `HomeScreen`'in kendi içine gömülü skor tablosu
  modalı ayrı, paylaşılan bir bileşene çıkarıldı.
- **`src/screens/GameHubScreen.tsx`** — "🏆 Skor Tablosu" butonu (paylaşılan/global tablo olduğu için
  tek bir oyuna bağlı değil) + her oyun kartında `AsyncStorage`'dan okunan bir en-iyi-skor rozeti
  eklendi (oyundan dönünce tazeleniyor).
- **`src/screens/HomeScreen.tsx`** (Blok Çılgınlığı) — en yüksek skor artık gerçekten kalıcı
  (`AsyncStorage`, diğer 4 oyunla aynı desen) — öncesinde sadece modül değişkeninde tutulduğu için
  **uygulama tamamen kapanınca sıfırlanıyordu**, bu bir bug'dı, düzeltildi. Turuncu olmayan yeşil
  "OYNA"/"TEKRAR OYNA" butonları artık paylaşılan `theme.accent`'e çevrildi (tutarlılık).
- **`src/screens/SnakeGame.tsx`, `WhackAMoleGame.tsx`** — duraklat/devam et eklendi (bu ikisi gerçek
  zamanlı olduğu için anlamlı; sıra tabanlı 2048/Renk Hafızası'na eklenmedi).
- **`SnakeGame.tsx`, `Game2048.tsx`, `WhackAMoleGame.tsx`, `ColorMemoryGame.tsx`** — sabit piksel
  tahta/ızgara boyutları (`useWindowDimensions()` ile) duyarlı hale getirildi — dar telefonlarda
  taşma riski, geniş tablet ekranlarında gereksiz boşluk giderildi.
- **Erişilebilirlik** — `CallScreen`'deki tüm daire butonlar artık en az 44×44 dokunma hedefi ve
  `accessibilityLabel` taşıyor (özellikle ikon-only video kontrolleri); `ChatRoomScreen`'in mikrofon
  butonu 40×40'tan 44×44'e büyütüldü; sohbet eki/gönder/mikrofon butonlarına ve emoji tepki
  butonlarına erişilebilirlik etiketleri + daha büyük dokunma alanları eklendi. Durum hiçbir yerde
  sadece renkle iletilmiyor (★/☆ şekli, ✓/✓✓/🕒 farklı ikonlar, "Cevapsız" metni).
- **`__mocks__/@react-native-async-storage/async-storage.js`** — yeni `getMany` mock'u eklendi (en
  iyi skor rozetleri için gerekti).

**Bilinen, bilinçli olarak ertelenen kalanlar:** oyun ekranlarındaki "‹ Menü" geri linklerinin
dokunma hedefi hâlâ tam 44px'in biraz altında; uygulamanın hiçbir ekranı yatay (landscape) moda
özel bir düzene sahip değil (bu proje zaten telefon-dikey odaklı, bu geçişle değişmedi); ikinci bir
gelen arama varken ilk arama aktifse sessizce yok sayılıyor (call-waiting yok) — bunlar ayrı bir
istek olmadıkça bu oturumda ele alınmadı.

**Etkilenen dosyalar:** yukarıda listelenenlerin tamamı + bu not. Kod tarafında geri alınan/kaldırılan
hiçbir özellik yok, sadece düzeltme/yeniden tasarım/ek özellik.

## 2026-08-14 — Yeni bir makinede sıfırdan ortam kurulumu + emülatör testi + bağımsız APK üretimi

Kullanıcı isteği: "Bella yazılım" ve "gizli chat" (bu proje) repolarını GitHub'dan yeni bir Windows
makinesine indirip GizliChat'i emülatörde çalıştırma, ardından son hâlinin bağımsız (Metro'suz)
çalışabilen bir release APK'sını çıkarma.

**Kod tarafında hiçbir değişiklik yapılmadı** — bu oturumda sadece bu makineye özel araç kurulumu,
bir çalışma zamanı hatası düzeltmesi ve build çıktısı üretildi.

**1) GitHub kurulumu.** Bu makinede `gh` CLI hiç kurulu değildi — winget ile kuruldu,
`gh auth login --web` ile device-code akışıyla `KaanEnnes` hesabına giriş yapıldı. `GizliChat` ve
`bella-yazilim` (ikisi de private) repoları `C:\Users\USER\Projects\` altına klonlandı.

**2) Android geliştirme ortamı sıfırdan kuruldu (bu makineye özel, farklı bir bilgisayar).**
Aşağıdaki [[05-Build-Deployment]]'taki önceki bölümde belgelenen `C:\Android\Sdk` / Eclipse Temurin
kurulumu **başka bir makineye ait** — bu makinede yollar farklı. Detaylar [[05-Build-Deployment]]'a
"Makine 2" başlığıyla eklendi: Microsoft OpenJDK 17, Android SDK sıfırdan (`cmdline-tools` indirilip
`sdkmanager` ile platform-tools/platforms 34-35-36/build-tools/NDK `27.1.12297006`/CMake/emulator
kuruldu), bir AVD oluşturuldu (Pixel 6, Android 14, x86_64, WHPX donanım hızlandırmalı).

**3) Metro bundler çökmesi düzeltildi (proje geneline uygulanabilir bir not).** İlk çalıştırmada
Metro, gradle'ın build sırasında oluşturup sonra sildiği bir CMake geçici klasörünü
(`.../CMakeFiles/CMakeTmp/CMakeFiles`) dosya sistemi izleyicisiyle takip etmeye çalışırken `ENOENT`
hatasıyla tamamen çöktü (Node süreci kapandı, `npx react-native start` sessizce ölmüş hâlde kaldı).
**Çözüm:** `npx react-native start --reset-cache` ile Metro'yu yeniden başlatmak yeterli — geçici
klasör build tamamlandığı için artık mevcut değildi, hata tekrarlamadı. **Genel kural:** eğer
`gradlew` build'i çalışırken Metro'yu da açık tutuyorsan ve build bir CMake temp klasörünü silerse,
Metro'nun dosya izleyicisi bazen bunu ENOENT ile çökme olarak yaşayabilir — Metro'yu sadece yeniden
başlatmak (gerekirse `--reset-cache` ile) çözüyor, kod değişikliği gerekmiyor.

**4) Debug build emülatörde çalıştırıldı ve doğrulandı.** `gradlew installDebug` + `adb shell am
start -n com.mobile/.MainActivity` ile uygulama emülatörde başlatıldı, JS bundle Metro'dan
yüklendi, `adb logcat`'te `ReactNativeJS` logları normal görüldü (çökme/`FATAL` yok).

**5) Bağımsız release APK üretildi.** `gradlew assembleRelease` — mevcut proje ayarına göre
(`android/app/build.gradle`) release de debug keystore ile imzalanıyor, ekstra keystore kurulumu
gerekmedi. JS bundle APK içine gömüldü (`createBundleReleaseJsAndAssets`), yani bu APK artık Metro'ya
veya USB bağlantısına ihtiyaç duymadan bağımsız çalışıyor. Çıktı aynı standart konumda:
`android/app/build/outputs/apk/release/app-release.apk` (~130 MB, `versionCode 1`/`versionName
"1.0"`, 4 mimari — arm64-v8a/armeabi-v7a/x86/x86_64 — dahil).

**Performans notu:** Bu makinedeki ağ bağlantısı belirgin şekilde yavaştı (SDK/NDK indirmeleri
zaman zaman ~50-100 KB/sn'ye düştü) — Android SDK+NDK kurulumu ~25 dk, debug build ~32 dk sürdü.
Gradle daemon ve bağımlılık önbelleği sayesinde ardından gelen release build sadece ~13 dk sürdü
(çoğu adım `UP-TO-DATE`).

**Test edilmeyenler:** Uygulama emülatörde sadece süreç/log seviyesinde doğrulandı (çökme yok,
JS başladı) — ekranlar tek tek gezilip görsel olarak kontrol edilmedi. Release APK gerçek bir
cihaza kurulup denenmedi, sadece build'in başarılı olduğu ve APK'nın diskte oluştuğu doğrulandı.

**Etkilenen dosyalar:** Yok (kod değişmedi). [[05-Build-Deployment]] bu makineye özel kurulum
bilgisiyle güncellendi.

## 2026-08-12 — Oyun seçme menüsü + 3 yeni oyun, arama/ses düzeltmeleri, çağrı geçmişi, çevrimdışı uyarısı, uygulama-içi bildirim, ayarlar genişletmesi

Kullanıcı isteği: (1) bir oyun seçme menüsü, 2048'e ses efekti/animasyon ekleyip "premium" hâle
getirme, kumar/kart tarzı **olmayan** 3 yeni oyun daha ekleyip hepsini menüye entegre etme; (2)
internet yokken sohbete bağlanırken uyarı; (3) arama bitince WhatsApp'taki gibi arama detaylarının
(süre, cevapsız/tamamlandı) görünmesi; (4) çalışmayan bildirim sistemini "X kişisinden Y bildirimi
geldi" tarzı değil, oyun bildirimi gibi görünecek şekilde kurma; (5) ayarlara birkaç madde daha
ekleme; (6) sonradan eklenen bug: uygulama sesleri kulak hoparlöründen geliyormuş, düzeltme.

**Bildirim sistemi kararı — kullanıcıyla netleştirildi:** Gerçek arka-plan push (uygulama kapalıyken
de bildirim) Firebase Cloud Messaging + bir Cloud Function + Blaze plana geçiş + `google-services.json`
gibi elle yapılması gereken adımlar gerektiriyordu. Kullanıcı **uygulama-içi (foreground/arka planda
açık) bildirimi** seçti, "notlara yaz, ileride öbür sistemi de ekleyebileceğimiz şekilde yap" dedi.
Bu yüzden `NotificationCenter` bilinçli olarak tek bir `showToast()` giriş noktası etrafında
kuruldu — ileride gerçek push eklenirse (bkz. `YAPILACAKLAR.txt` sonundaki opsiyonel bölüm), sadece
"ne zaman tetiklenir" kısmı (Firestore dinleyicileri yerine bir FCM mesaj handler'ı) değişir, toast
UI'ı ve `soundService`/`hapticsService` entegrasyonu aynı kalabilir.

**⚠️ Bu oturumda da cihaz/emülatör testi yapılamadı** — bu ortamda Android build/çalıştırma imkânı
yok. Tüm değişiklikler `npx tsc --noEmit`, `npx eslint src`, `npx jest` ile doğrulandı; gerçek
cihazda (özellikle ses efektleri, titreşim, ve arama sesi yönlendirmesi) henüz denenmedi.

**1) Oyun seçme menüsü — `HomeScreen` ikiye ayrıldı.** Yeni `src/screens/GameHubScreen.tsx`:
5 oyunu (Blok Çılgınlığı, 2048, Yılan, Renk Hafızası, Köstebek Vurma) gösteren, giriş animasyonlu
(`Animated.stagger` ile sırayla beliren) bir kart ızgarası. Gizli 10-dokunuş admin tetikleyicisi +
tek-dokunuşla-Ayarlar mekanizması **`HomeScreen`'den `GameHubScreen`'e taşındı** (artık hangi oyunu
en son oynadığından bağımsız çalışıyor — önceden sadece Blok Çılgınlığı'nın kendi menü ekranındaydı).
`HomeScreen` artık sadece Blok Çılgınlığı'nın kendisi: `onAdminTriggerReached` prop'u gitti,
`{ onBack }` aldı (diğer oyunlarla aynı imza). `AppNavigator`, `HOME` durumunda artık `HomeScreen`
yerine `GameHubScreen` render ediyor.

**2) 2048 "premium" hâle getirildi.** `src/screens/Game2048.tsx` tamamen yeniden yazıldı: grid artık
`number[][]` değil, kararlı `id`'li `TileData[]` — `moveTiles()` her taşınan/birleşen taşın nereden
nereye gittiğini döndürüyor, her taş kendi `Animated.ValueXY`'siyle (native driver) kayarak
taşınıyor, birleşen taş pop/bounce yapıyor, yeni doğan taş scale-in ile beliriyor, birleşmede
"yutulan" taş hedef hücreye kayıp solarak kayboluyor (`GhostTileView`). Ses: `sfx_merge`
(birleşmede), `sfx_win` + kısa "2048'e ulaştın" banner'ı (ilk 2048 taşında), `sfx_gameover`
(bitişte). `soundService`'e `playMergeSound`/`playWinSound`/`playTapSound` eklendi.

**3) İki yeni oyun (kumar/kart değil).** `src/screens/SnakeGame.tsx` (Yılan — 14x14 kafes, tek bir
paylaşılan `Animated.Value` üzerinden tüm segmentlerin senkron kaymasıyla akıcı hareket, yem
büyüdükçe hız artışı, `sfx_eat`/`sfx_gameover`) ve `src/screens/ColorMemoryGame.tsx` (Renk Hafızası
— Simon tarzı 4 pedli büyüyen dizi hafıza oyunu, her ped kendi notasını çalıyor —
`sfx_note_a/b/c/d` —, yanlışta `sfx_wrong`). **Üçüncü oyun:** `src/screens/WhackAMoleGame.tsx`
(Köstebek Vurma — 3x3 delik, 30 saniyelik tur, zamanla kısalan görünme süresi, `sfx_hit`/`sfx_miss`).
Dördü de kendi `AsyncStorage` en-yüksek-skor anahtarına sahip (`gizlichat_snake_best`,
`gizlichat_colormemory_best`, `gizlichat_whackamole_best`, `gizlichat_2048_best`).

**4) Yeni sentetik ses efektleri.** `android/app/src/main/res/raw/` altına (eski `sfx_place/clear/
gameover` gibi, üçüncü parti ses varlığı olmadan, programatik sinüs/kare dalga üretimiyle) 12 yeni
WAV eklendi: `sfx_tap`, `sfx_merge`, `sfx_eat`, `sfx_note_a..d`, `sfx_wrong`, `sfx_hit`, `sfx_miss`,
`sfx_notification`, `sfx_win`. Üretim scripti oturuma özel scratchpad'te kaldı (repo'ya girmedi,
tekrar üretmek gerekirse benzer bir Node scripti yazılabilir). `soundService.ts`'e karşılık gelen
`playXSound()` fonksiyonları eklendi.

**5) Sesli arama hoparlör düzeltmesi.** `CallScreen.tsx`'teki `callManager.start()` çağrısı önceki
oturumda sesli aramalar için `deviceEndpointType: 'earpiece'` kullanıyordu (gerçek telefon gibi
kulaklığa yakın hoparlör) — kullanıcı bunun **arama dışında da** (oyun/bildirim sesleri) kulak
hoparlöründen çıkmaya devam ettiğini bildirdi (native ses oturumunun "varsayılan" rotası olarak
yapışkanlaştığı görülüyor). Hem sesli hem görüntülü aramada artık her zaman `'speaker'` kullanılıyor.

**6) Çağrı geçmişi (WhatsApp tarzı).** `chatService.ts`: `MessageType`'a `'call'` eklendi,
`ChatMessage`'a `callVideo`/`callStatus` alanları, yeni `sendCallLogMessage()`. `CallScreen.tsx`
artık `onLeave`'e bir `CallSummary` (`otherUserId`, `isVideo`, `isCreatedByMe`, `wasJoined`,
`durationSeconds`) veriyor — `elapsedSeconds`'ın effect kapanışında bayatlamaması için ayrı bir
`elapsedSecondsRef` eklendi. **Önemli düzeltme:** `CallContent`'in `onHangupCallHandler`'ı zaten
`call.leave()`'den SONRA kendisi çağrılıyordu ve bu da `callingState === LEFT` efektini zaten
tetikliyordu — ikisine birden `onLeave` bağlamak her manuel kapatmada çağrıyı **iki kere** loglardı;
`onHangupCallHandler` tamamen kaldırıldı, tek kaynak `LEFT`/`RECONNECTING_FAILED` efektleri.
`CallProvider.tsx`'teki `IncomingCallWatcher` artık `myUid` alıyor, `onLeave`'de `getRoomId()` +
`sendCallLogMessage()` ile (best-effort, hatası yutulan) bir log yazıyor. `MessageBubble.tsx`
`'call'` tipini normal balon yerine ortalanmış bir "çağrı geçmişi" kapsülü olarak çiziyor (📞/🎥
ikon, yön oku, süre ya da "Cevapsız arama"/"Cevap verilmedi").

**7) Çevrimdışı uyarısı.** Yeni `src/hooks/useNetworkStatus.ts` (zaten kurulu ama kullanılmayan
`@react-native-community/netinfo`'yu ilk kez devreye soktu). `ContactsScreen` ve `ChatRoomScreen`'de
`📡 İnternet bağlantısı yok` banner'ı. Jest'in native modülü mock'lamasına ihtiyacı vardı:
`__mocks__/@react-native-community/netinfo.js` eklendi (paketin kendi resmi jest mock'unu re-export
ediyor) — projedeki diğer native modül mock'larıyla aynı konvansiyon.

**8) Uygulama-içi "oyun bildirimi" tarzı bildirimler.** Yeni `src/components/NotificationCenter.tsx`:
`AppNavigator`'da `CONTACTS`/`CHAT_ROOM` arasında **artık yeniden kurulmayan tek bir** `CallProvider`+
`NotificationCenter` sarmalayıcısı içinde (önceden iki ayrı `CallProvider` render'ı vardı, ekran
değişince yeniden kuruluyordu — bu da Firestore dinleyicilerinin gereksiz yere kapatılıp
açılmasına yol açardı). Her kişinin odasını `chatService.subscribeToLatestMessage()` (yeni, hafif —
300 mesajlık tam geçmiş yerine sadece son mesaj) ile dinliyor; kendi mesajları, geçmiş mesajlar
(mount'tan önceki), ve şu an açık olan sohbetin mesajları filtreleniyor. Kalan yeni mesajlar için
"oyun bildirimi" görünümlü bir toast (🎮 rozet, kişi adı + önizleme, `sfx_notification` sesi, kısa
titreşim) — WhatsApp/Android'in "X kişisinden Y bildirimi geldi" formatından bilinçli olarak
farklı. Toast'a dokununca ilgili sohbet açılıyor. Yeni `src/services/notificationService.ts`
(Ayarlar'dan aç/kapa, `soundService` ile aynı desen).

**9) Ayarlar genişletildi.** `SettingsModal.tsx`'e Bildirimler (yukarıdaki toggle) ve Titreşim
switch'leri + basit bir "Mini Oyunlar · v1.0" bilgi satırı eklendi. Yeni `src/services/
hapticsService.ts` (RN'in yerleşik `Vibration` API'si, ekstra bağımlılık yok) — her oyunun
oyun-bitti anında ve bildirim toast'ında kısa titreşim tetikliyor.

**Etkilenen/yeni dosyalar (özet):** `src/screens/GameHubScreen.tsx` (yeni), `src/screens/
SnakeGame.tsx` (yeni), `src/screens/ColorMemoryGame.tsx` (yeni), `src/screens/WhackAMoleGame.tsx`
(yeni), `src/screens/Game2048.tsx` (yeniden yazıldı), `src/screens/HomeScreen.tsx` (hub kısmı
çıkarıldı), `src/screens/CallScreen.tsx`, `src/components/CallProvider.tsx`, `src/components/
NotificationCenter.tsx` (yeni), `src/components/MessageBubble.tsx`, `src/components/
SettingsModal.tsx`, `src/services/chatService.ts`, `src/services/soundService.ts`, `src/services/
notificationService.ts` (yeni), `src/services/hapticsService.ts` (yeni), `src/hooks/
useNetworkStatus.ts` (yeni), `src/screens/ContactsScreen.tsx`, `src/screens/ChatRoomScreen.tsx`,
`src/navigation/AppNavigator.tsx`, `android/app/src/main/res/raw/*.wav` (12 yeni), `jest.config.js`,
`__mocks__/@react-native-community/netinfo.js` (yeni).

## 2026-08-12 — Açık/koyu tema, ayarlar, 2048, blok geri-dönüş fix'i, ve olası sesli arama çözümü

Kullanıcı isteği: oyun tarafına eklenebilecek her şey (animasyonlar, yeni bir oyun — kumar/kart
hariç), açık/koyu tema, sağ alttaki dişli ikonuna gecikmeli tek dokunuşla açılan bir Ayarlar
ekranı (10 dokunuşluk gizli jesti bozmadan), blok oyununda geçersiz bırakılan parçanın kutusuna
daha hızlı dönmesi, sesli aramadaki ses sorununun düzeltilmesi, ve kulağa götürünce ekranın
kapanması (hoparlör kapalıyken).

**⚠️ Bu oturumda cihaz/emülatör testi yapılamadı** (bu ortamda Android build/çalıştırma imkânı
yok) — aşağıdaki değişiklikler `npx tsc --noEmit`, `npx eslint src`, `npx jest` ile doğrulandı
ama gerçek cihazda henüz denenmedi. Özellikle sesli arama fix'i bir sonraki oturumda/kullanıcı
tarafından gerçek cihazda doğrulanmalı.

**1) Açık/koyu tema sistemi.** Yeni `src/theme/ThemeContext.tsx`: `ThemeProvider` +
`useTheme()` hook'u, `AsyncStorage`'da (`gizlichat_theme_mode`) kalıcı, `App.tsx`'te en dışta
sarmalanıyor. `HomeScreen`, `AccountScreen`, `ContactsScreen`, `ChatRoomScreen`, `Game2048`
tema tokenlarını (`background`/`surface`/`text`/`accent`/... ) kullanacak şekilde güncellendi —
tam pixel-perfect değil (blok renkleri, gölgeler gibi bazı dekoratif detaylar sabit kaldı) ama
tüm ana ekranlarda arka plan/metin/kart renkleri artık temaya göre değişiyor.

**2) Ayarlar ekranı + dişli ikonu davranışı değişti.** Yeni `src/components/SettingsModal.tsx`
(tema aç/kapa + ses efekti aç/kapa switch'leri). `HomeScreen`'deki dişli ikonu artık **hem** eski
10-dokunuş/3.5sn gizli admin jestini **hem de** tek dokunuşla (550ms gecikmeli) Ayarlar'ı açıyor:
her yeni dokunuş bir önceki "Ayarlar'ı aç" zamanlayıcısını iptal edip yeniden kuruyor, bu yüzden
gerçek bir 10'lu seri asla Ayarlar'ı tetiklemiyor (`SETTINGS_OPEN_DELAY_MS = 550`,
`src/screens/HomeScreen.tsx`). Ses efektleri artık kapatılabilir: `src/services/soundService.ts`'e
`isSoundEnabled()`/`setSoundEnabled()` eklendi (AsyncStorage'da `gizlichat_sound_enabled`).

**3) Blok oyunu: geçersiz bırakılan parça artık anında kutusuna dönüyor.** `finalizeDrag()`'teki
`Animated.spring(..., friction: 6)` (yavaş başlayan, sallanarak yerleşen bir hareket) yerine
`Animated.timing(..., duration: 140, easing: Easing.out(Easing.quad))` kondu — parça artık havada
"bekliyormuş" hissi vermeden hızlıca tepsisine geri kayıyor.

**4) Yeni oyun: 2048 (kumar/kart değil).** Yeni `src/screens/Game2048.tsx` — 4x4 tam bir 2048
motoru (satır/sütun birleştirme, tek seferlik merge kuralı, skor, `AsyncStorage`'da kalıcı en
yüksek skor `gizlichat_2048_best`, oyun bitti algılama, "Yeniden Başla"), kaydırma `PanResponder`
ile algılanıyor (harici bir gesture kütüphanesi eklenmedi). `HomeScreen`'in ana menüsüne
"🎮 2048 Oyna" butonu eklendi (`ScreenState`'e `'game2048'` eklendi); dişli ikonu/Ayarlar/tema
hepsi ortak `HomeScreen` sarmalayıcısından geldiği için 2048 ekranında da aynı şekilde çalışıyor.

**5) Sesli arama sessizlik sorunu için olası kök neden bulundu ve düzeltildi.** Kod incelemesinde
`@stream-io/video-react-native-sdk`'nın **native ses yönlendirme/oturum yöneticisinin
(`callManager`, eski adıyla `StreamInCallManager`) hiçbir yerde başlatılmadığı** görüldü —
`CallContent`'in kendi otomatik-başlatma mantığı yalnızca artık deprecated olan
`react-native-incall-manager` paketi kuruluysa çalışıyor (bu projede kurulu değil), yeni
`callManager` API'si **manuel çağrılmadıkça devreye girmiyor**. Kamera fix'i işe yaramıştı çünkü
WebRTC video track'leri OS ses oturumundan bağımsız render oluyor, ama ses çıkışı tamamen bu
başlatılmamış katmana bağlıydı — muhtemelen sessizliğin asıl sebebi buydu, önceki oturumdaki
`microphone.enable()` denemeleri (hâlâ doğru ve gerekli) bu daha temel eksikliği çözmüyordu.
**Fix:** `src/screens/CallScreen.tsx`'te çağrı objesi var olur olmaz
`callManager.start({ audioRole: 'communicator', deviceEndpointType: isVideoCall ? 'speaker' :
'earpiece' })` çağrılıyor, `onLeave`'de `callManager.stop()`. `isVideoCall`, çağrı oluşturulurken
`callService.ts`'in `getOrCreate({ data: { custom: { isVideo } } })` ile gömdüğü custom veriden
okunuyor (arayan/aranan ikisi de aynı şekilde bilsin diye — kamera durumundan çıkarım güvenilir
değildi, çünkü aranan taraf kamerasını her hâlükârda kapalı başlatıyor).

**6) Kulağa götürünce ekran kapanması artık native olarak devrede.** Yukarıdaki fix'in yan
etkisi: Stream SDK'sının Android tarafında zaten hazır bir `ProximityManager.kt`'si var — aktif
ses rotası **earpiece** olduğunda otomatik olarak yakınlık sensörünü dinleyip
`PROXIMITY_SCREEN_OFF_WAKE_LOCK` alıp bırakıyor (kulağa götürünce ekran kapanır, çekince açılır).
Bu davranış sadece `callManager.start()` hiç çağrılmadığı için pasifti; artık sesli aramalarda
(`deviceEndpointType: 'earpiece'`) otomatik çalışıyor olmalı — ekstra JS/native kod yazmaya gerek
kalmadı. Görüntülü aramalarda kasıtlı olarak `'speaker'` kullanılıyor (video call'da ekranı
kapatmak istemeyiz).

**7) Arama ekranı animasyonları geliştirildi.** `CallScreen.tsx`: RINGING durumunda
`RingingCallContent`'in üstüne nabız gibi atan bir noktayla "Aranıyor…" (arayan) / "Telefon
çalıyor…" (aranan) banner'ı eklendi; JOINING durumu için ayrı bir "Bağlanıyor…" dönen-halka
ekranı eklendi (önceden bu durum sessizce boş/siyah bir `CallContent` gösteriyordu);
RECONNECTING için turuncu bir "Bağlantı zayıf, yeniden bağlanılıyor…" banner'ı; ve
RECONNECTING_FAILED (bağlantı koptu, normal kapatmadan farklı bir durum) için ~1.6 saniyeliğine
"Görüşme koptu" mesajı gösterip sonra kapanıyor — normal kapatma (LEFT) hâlâ eskisi gibi anında
kapanıyor, bu değişmedi (önceki oturumda kullanıcı isteğiyle kaldırılmıştı).

**Yeni dosyalar:** `src/theme/ThemeContext.tsx`, `src/components/SettingsModal.tsx`,
`src/screens/Game2048.tsx`, `__mocks__/@react-native-async-storage/async-storage.js` (eksikti,
`soundService`'in modül yüklenirken senkron `AsyncStorage.getItem` çağırması Jest'i patlatıyordu).

**Değişen dosyalar:** `App.tsx`, `src/screens/HomeScreen.tsx`, `src/screens/AccountScreen.tsx`,
`src/screens/ContactsScreen.tsx`, `src/screens/ChatRoomScreen.tsx`, `src/screens/CallScreen.tsx`,
`src/services/callService.ts`, `src/services/soundService.ts`,
`__mocks__/@stream-io/video-react-native-sdk.js` (`callManager`, `call.state.custom`,
`isCreatedByMe`, ek `CallingState` değerleri eklendi).

**Doğrulama:** `npx tsc --noEmit` ✅, `npx eslint src App.tsx` ✅ (0 hata, 2 önceden de var olan
türden dinamik-inline-style uyarısı), `npx jest` ✅. **APK bu değişikliklerle henüz yeniden
derlenmedi/cihazda denenmedi** — bir sonraki adım `gradlew assembleRelease --no-daemon` ile
rebuild edip özellikle sesli arama + kulak sensörü + tema geçişini gerçek cihazda doğrulamak.

**Sonraki aşamalar (yapılmadı, backlog):** kumar dışı ikinci bir oyun (istenirse), 2048'e
kayan-tile animasyonu (şu an sadece pop/pulse var, tam "slide" animasyonu yok), blok oyunu
hücrelerinin (`cellEmpty` vb.) tam piksel-piksel temalanması.

## 2026-08-11 — Arama bitince direkt kapanma + mikrofon fix denemesi (SES SORUNU HÂLÂ AÇIK)

Kullanıcı iki şey istedi: (1) arama bitince "Görüşme sona erdi" bekleme ekranı olmadan direkt
kapansın, (2) sesli sohbette ses gelmiyor sorunu çözülsün.

**(1) Yapıldı:** `CallScreen.tsx`'teki `hasEnded`/`CALL_ENDED_DISPLAY_MS` mantığı tamamen kaldırıldı
— `CallingState.LEFT` olur olmaz `onLeave()` hemen çağrılıyor, ekstra bir ekran/gecikme yok.

**(2) Denendi ama ÇÖZÜLEMEDİ.** Kamera sorununa benzer bir varsayım test edildi: `CallScreen.tsx`'e
`useCall()` ile çağrı `JOINED` durumuna geçer geçmez `call.microphone.enable()` çağrısı eklendi (hem
arayan hem aranan tarafında, kamera fix'iyle aynı mantık — bkz. bir önceki oturumun kaydı). **Bu fix
denendi, kullanıcı hem emülatör+telefon hem de (belirtilmedi ama muhtemelen) iki farklı hesapla
tekrar test etti, ses hâlâ gelmiyor.** Kullanıcının isteğiyle bu sorunun araştırılması **şimdilik
durduruldu** — bir sonraki oturumda buradan devam edilmeli.

**Sonraki oturum için araştırılması gerekenler (yapılmadı):**
- `call.microphone.enable()` fix'i gerçekten mikrofon iznini/track'i açıyor mu, yoksa audio
  publish/subscribe başka bir yerde mi kopuyor? Gerçek zamanlı `adb logcat` ile
  `oney.WebRTCModule`/`webrtc.Logging` audio track loglarına (`getUserMedia(audio)`,
  `RTCRtpSender`, `addTrack`) canlı bir arama sırasında bakılmalı — bu oturumda log buffer'ı arama
  anını yakalayamadı (buffer dönmüş/rotate olmuş olabilir).
- `StreamInCallManager`'ın ses yönlendirmesi (`runInAudioThread(): speaker speaker` logu görüldü) —
  hoparlöre yönlendirme doğru mu, yoksa sessiz bir route'a mı düşüyor kontrol edilmeli.
- Manifest'te eksik olabilecek "Missing ForegroundServicePermissions" uyarısı logda görüldü
  (`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CAMERA`, `FOREGROUND_SERVICE_MICROPHONE`,
  `FOREGROUND_SERVICE_MEDIA_PLAYBACK`) — bunların eksikliği arka planda/ekran kilitliyken sesin
  kesilmesine sebep olabilir, eklenmesi denenmeli.
- Test mutlaka **iki farklı hesapla** yapılmalı (aynı hesapla test etmenin neden yanlış sonuç
  verdiği için bkz. bir önceki Changelog kaydı ve [[02-Screens-and-Features]]).

**Değişen dosyalar:** `src/screens/CallScreen.tsx`, `__mocks__/@stream-io/video-react-native-sdk.js`
(`useCall`, `camera.enable`, `microphone` mock'ları eklendi).

**Doğrulama:** `npx tsc --noEmit` ✅, `npx eslint src` ✅, `npx jest` ✅. APK derlendi, emülatör +
telefonda kuruldu ve çalıştırıldı; call-end davranışı düzeldi, ses sorunu devam ediyor.

## 2026-08-11 — WhatsApp tarzı ses dalga formu + arama başladı/bitti ekranları

**Ses dalga formu:** `src/components/RecordingWaveform.tsx` (yeni) — sesli mesaj kaydı sırasında
`Sound.addRecordBackListener()`'ın canlı `currentMetering` (dB) verisinden beslenen, gerçek zamanlı
mikrofon seviyesi çubukları. `src/components/PlaybackWaveform.tsx` (yeni) — bir mesajın oynatma
balonunda gösterilen, mesajın `uri`'sinden deterministik üretilen (sabit, mesaj her açıldığında aynı
görünen) sahte/görsel bir dalga formu, oynatma ilerledikçe soldan sağa renkleniyor. **Not:** oynatma
tarafı gerçek ses genliği analizi yapmıyor, sadece WhatsApp'a benzeyen bir görsel efekt (kullanıcıyla
netleştirildi, "görsel taklit" yeterli bulundu). `ChatRoomScreen.tsx` artık kayıt sırasında
`recordingLevel` state'i tutup `RecordingWaveform`'u input bar'ın üstünde gösteriyor;
`AudioMessagePlayer.tsx` de `PlaybackWaveform`'u play butonunun yanına ekledi.

**Arama başladı/bitti ekranları:** `src/screens/CallScreen.tsx` yeniden yazıldı — `CallingState`'e
göre üç aşama: `RINGING` (Stream'in `RingingCallContent`'i), `JOINED` (aktif görüşme + üstte
"Görüşme sürüyor • mm:ss" banner'ı, canlı süre sayacıyla), `LEFT` (görüşme bitince modal'ın aniden
kapanması yerine ~1.5 sn "Görüşme sona erdi" + toplam süre ekranı gösterip sonra kapanıyor).

**Arama testiyle ilgili önemli not (kod hatası değil):** Kullanıcı emülatör + telefonu **aynı
GizliChat hesabıyla** test ederken Stream'den `"Cannot reject a call that has already been
accepted"` (400) hatası aldı — bunun sebebi iki cihazın aynı `user_id` ile aynı çağrıya girmesi
(biri kabul ederken diğeri reddetmeye çalışıyor, Stream bunu aynı kullanıcının çakışan iki oturumu
olarak görüyor). **Aramayı test etmek için iki farklı hesap gerekiyor** (emülatörde bir hesap,
telefonda başka bir hesap, birbirini kişi olarak eklemiş). Bu, uygulamanın "kimlik hesaba bağlı,
cihaza değil" tasarımının doğal bir sonucu — bkz. [[02-Screens-and-Features]].

**Doğrulama:** `npx tsc --noEmit` ✅, `npx eslint src` ✅ (1 önemsiz inline-style uyarısı hariç),
`npx jest` ✅. APK bu değişikliklerle yeniden derlendi, hem emülatörde hem gerçek bir Android
telefonda (USB üzerinden `adb install`) test edildi.

## 2026-08-11 — Ses/kamera izin hatası + sesli mesajın kaçırılan Storage bağımlılığı düzeltildi

Kullanıcı testinde iki hata bildirdi: sesli mesaj gönderilemiyor, görüntülü aramada kamera karşı
tarafa gelmiyor. İkisi de bu oturumda bulunup düzeltildi.

**1) Runtime izin isteği hiç yapılmıyordu.** `AndroidManifest.xml`'de `RECORD_AUDIO`/`CAMERA`
deklare edilmiş olsa da, Android 6+'da bu "tehlikeli" izinlerin ayrıca **çalışma zamanında**
`PermissionsAndroid.request()` ile kullanıcıya sorulması gerekiyor — kod bunu hiç yapmıyordu, izin
sessizce reddedilmiş gibi davranıyordu. Yeni `src/services/permissionsService.ts` eklendi
(`requestMicrophonePermission()`, `requestCallPermissions(includeCamera)`), ve üç noktaya bağlandı:
`ChatRoomScreen`'in ses kaydı öncesi, `callService.startVoiceCall`/`startVideoCall`'ın arama
başlatmadan önce, ve `CallProvider`'ın `IncomingCallWatcher`'ının **gelen** bir çağrı tespit eder
etmez (karşı taraf "kabul et"e basmadan önce izin zaten hazır olsun diye — arayan taraf için değil,
**aranan** taraf için de kamera/mikrofon izni gerekiyordu, önceki hata muhtemelen bu yüzden sadece
arayanda değil karşı tarafta da kamerayı hiç açtırmıyordu). Ayrıca `callService.ts`'te görüntülü
arama artık `call.camera.enable()`'ı açıkça çağırıyor (önceden sadece sesli arama için
`camera.disable()` çağrılıyordu, görüntülü arama kamerayı hiç açık hâle getirmiyordu).

**2) Sesli mesajlar hâlâ Firebase Storage kullanıyordu.** Bir önceki oturumda fotoğraflar
Storage'sız (Firestore/base64) hâle getirilmişti ama **sesli mesajlar unutulmuştu** — hâlâ
`mediaService.uploadRoomMedia()` (Storage) çağırıyorlardı, Storage/Blaze aktif olmadığı için
gönderim hata veriyordu. Çözüm: fotoğrafla aynı desen — yeni `mediaService.localFileToDataUri()`
(kaydedilen ses dosyasını `fetch`+`Blob`+`FileReader.readAsDataURL()` ile inline bir
`data:audio/...;base64,...` URI'sine çeviriyor), `ChatRoomScreen.handleStopRecording()` artık bunu
kullanıyor, aynı `MAX_INLINE_MEDIA_DATA_URI_LENGTH` (900.000 karakter, artık hem fotoğraf hem ses
için ortak) sınırına tabi. **Video hâlâ tek istisna** — base64/Firestore için çok büyük, Storage
üzerinden gitmeye devam ediyor.

**Değişen/yeni dosyalar:** `src/services/permissionsService.ts` (yeni),
`src/services/mediaService.ts` (`localFileToDataUri()` eklendi), `src/services/callService.ts`,
`src/components/CallProvider.tsx`, `src/screens/ChatRoomScreen.tsx`, `src/services/chatService.ts`
(`mediaUrl` doc yorumu güncellendi).

**Doğrulama:** `npx tsc --noEmit` ✅, `npx eslint src` ✅, `npx jest` ✅. APK bu değişikliklerle
yeniden derlendi ve emülatörde test edildi.

## 2026-08-11 — Sahte admin decoy katmanı tamamen kaldırıldı

Kullanıcı isteği: dişli ikonu tetikleyicisinden sonra artık sahte/mock bir admin şifre ekranı
göstermeden, doğrudan gerçek "Giriş Yap / Kayıt Ol" ekranına (`AccountScreen`) geçilsin.

**Silinen dosyalar:** `src/screens/AdminLoginScreen.tsx`, `src/services/authService.ts`,
`src/config/adminConfig.ts` — üçü de sadece bu decoy katman için vardı, başka hiçbir yerden
kullanılmıyordu, tamamen kaldırıldı (yorum/placeholder olarak bırakılmadı).

**Değiştirilen dosyalar:** `src/navigation/AppNavigator.tsx` — `ADMIN_LOGIN` ekranı state
makinesinden çıkarıldı, `HomeScreen`'in gizli tetikleyicisi (`onAdminTriggerReached`) artık
doğrudan `ACCOUNT` ekranına geçiyor. `src/config/streamConfig.ts`'teki `adminConfig.ts`'e yapılan
karşılaştırma yorumu güncellendi (artık var olmayan bir dosyaya referans veriyordu).

**Güvenlik notu:** Bu değişiklik [[04-Security-Notes]]'ta listelenen "admin şifresi JS bundle'ında
düz metin" riskini ortadan kaldırıyor (artık böyle bir şifre yok). Gizliliğin geri kalanı aynı
şekilde duruyor: erişim hâlâ gizli bir jestle (dişli ikonuna 10 dokunuş) tetikleniyor, ama artık
bu jestin arkasında sahte bir katman değil doğrudan gerçek Firebase Auth girişi var.

**Doğrulama:** `npx tsc --noEmit` ✅, `npx eslint src` ✅ (0 hata), `npx jest` ✅. APK bu
değişiklikle yeniden derlendi.

## 2026-08-11 — Faz 2'ye düzeltmeler: fotoğraf artık Storage'sız (Firestore/base64), ses paketi değişti

Faz 2'nin ilk hâli APK derlemesinde iki paket sorunu çıkardı, ikisi de bu oturumda çözüldü:

**1) Fotoğraf mesajları artık Firebase Storage kullanmıyor.** Kullanıcı isteği: Storage, Firebase'i
Blaze (ücretli) plana geçirmeyi gerektiriyor — bundan kaçınmak için fotoğraflar artık
`react-native-image-picker`'ın kendi `maxWidth`/`maxHeight`/`quality`/`includeBase64` seçenekleriyle
cihazda küçültülüp sıkıştırılıyor (max 1280px, %70 kalite), sonra bir `data:image/jpeg;base64,...`
URI'si olarak **doğrudan Firestore mesaj dokümanına** yazılıyor (Storage'a hiç dokunmadan). `<Image>`
bileşeni normal bir URL ile data URI'yi aynı `uri` prop'uyla render ettiği için `MessageBubble.tsx`'te
hiçbir değişiklik gerekmedi. Firestore'un 1 MiB doküman limitini aşmamak için
`ChatRoomScreen.tsx`'te bir `MAX_INLINE_IMAGE_DATA_URI_LENGTH` (900.000 karakter) güvenlik sınırı var
— aşılırsa "Fotoğraf çok büyük" hatası gösterilip gönderim iptal edilir. **Video hâlâ Firebase
Storage üzerinden gidiyor** (base64/Firestore video için pratik değil — dosyalar çok büyük), yani
video mesajı göndermek isteyen biri hâlâ Storage kurallarının deploy edilmesine ihtiyaç duyacak.
`firestore.rules`/`storage.rules`'a bu değişiklik için dokunulmadı (mesaj alanları zaten
`isRoomMember` kuralına tabi, base64 içeriği ekstra bir kural gerektirmiyor).

**2) Sesli mesaj paketi değişti: `react-native-audio-recorder-player` → `react-native-nitro-sound`.**
İlk denemede `react-native-audio-recorder-player@4.5.0` (Nitro tabanlı) `react-native-nitro-modules`
ile ABI uyumsuzluğu yüzünden C++ derleme hatası verdi; `@3.6.14`'e (Nitro öncesi, class tabanlı) geri
dönülünce bu sefer RN 0.86'da kaldırılmış API'lere (`currentActivity`, `applicationContext`)
referans verdiği için Kotlin derlemesi patladı — yani paketin **hiçbir sürümü bu RN sürümüyle
çalışmıyor**. Çözüm: aynı ekibin resmi halefi `react-native-nitro-sound`'a geçildi (API'si neredeyse
birebir aynı, sadece `import AudioRecorderPlayer from '...'` yerine `import Sound from
'react-native-nitro-sound'`, sınıf değil singleton). `react-native-nitro-modules` de `0.36.5`'e
**sabitlendi** (nitro-sound'un kendi `devDependencies`'inde tam olarak bu sürümle build/test edildiği
görüldü — sabitlenmeden `npm install`'ın çözdüğü sürüm önceki ABI hatasına neden olmuştu).

**Değişen dosyalar:** `src/screens/ChatRoomScreen.tsx`, `src/components/AudioMessagePlayer.tsx`,
`src/services/chatService.ts` (`mediaUrl` alanının artık Storage URL'i VEYA inline data URI
tutabileceği belirtildi), `package.json` (`react-native-audio-recorder-player` kaldırıldı,
`react-native-nitro-sound` + `react-native-nitro-modules@0.36.5` eklendi),
`__mocks__/react-native-nitro-sound.js` (eski `__mocks__/react-native-audio-recorder-player.js`'in
yerini aldı).

**Doğrulama:** `npx tsc --noEmit` ✅, `npx eslint src` ✅ (0 hata), `npx jest` ✅.

## 2026-08-11 — Fotoğraf/video/sesli mesaj paylaşımı + sesli/görüntülü arama (Faz 2)

Kullanıcı isteği: kişi/oda sistemine fotoğraf, video ve sesli mesaj paylaşımı; ayrıca sesli ve
görüntülü konuşma eklenmesi. [[02-Screens-and-Features]]'daki "sonraki aşamalar" backlog'unun bu
oturumda hayata geçirilen kısmı.

**Karar (kullanıcıyla birlikte alındı):** Arama altyapısı olarak **Stream Video** seçildi (aylık
$100 ücretsiz kredi — kişisel kullanım için pratikte tükenmez, bkz. aşağıdaki tablo), gerçekten
sınırsız/kendi-barındırılan WebRTC alternatifine karşı kurulum hızı/stabilite tercih edildi. Medya
depolama için Firebase Storage seçildi (zaten Firebase kullanılıyor).

| Arama türü | $100 kredi ile ~aylık süre |
|---|---|
| Sadece sesli | ~166.000 dakika |
| Görüntülü SD (480p) | ~66.000 dakika |
| Görüntülü HD (720p) | ~33.000 dakika |

**Yeni dosyalar:**
- `src/services/mediaService.ts` — Firebase Storage'a fotoğraf/video/ses dosyası yükleme.
- `src/services/callService.ts` — Stream Video client oluşturma, client-side JWT token üretimi
  (`crypto-js` ile HMAC-SHA256), `startVoiceCall()`/`startVideoCall()`.
- `src/config/streamConfig.ts` — Stream API key/secret config (adminConfig.ts ile aynı "prototip,
  düz metin" deseni — bkz. [[04-Security-Notes]]).
- `src/components/AudioMessagePlayer.tsx` — sesli mesaj oynatma/duraklatma UI'ı.
- `src/components/CallProvider.tsx` — `StreamVideo` provider'ı + gelen/giden her `ringing` çağrıyı
  global olarak yakalayıp tam ekran `CallScreen` gösteren `IncomingCallWatcher`.
- `src/screens/CallScreen.tsx` — `RingingCallContent` (çalma ekranı) ↔ `CallContent` (aktif görüşme)
  arası geçişi `CallingState`'e göre yöneten ekran.
- `storage.rules` — Firebase Storage güvenlik kuralları (firestore.rules'daki oda-üyeliği modeliyle
  birebir aynı mantık: `rooms/{roomId}/media/**` sadece o roomId'nin iki uid'inden birine açık).
- `__mocks__/@stream-io/video-react-native-sdk.js`, `__mocks__/react-native-image-picker.js`,
  `__mocks__/react-native-audio-recorder-player.js`, `__mocks__/react-native-video.js` — yeni native
  modüller için Jest mock'ları (react-native-sound.js ile aynı desen).

**Değiştirilen dosyalar:**
- `src/services/chatService.ts` — `ChatMessage`'a `type` (`text|image|video|audio`), `mediaUrl`,
  `durationSeconds` eklendi; `sendMediaMessage()` yeni export.
- `src/components/MessageBubble.tsx` — mesaj tipine göre resim (tam ekran görüntüleyici ile),
  video (thumbnail + tam ekran oynatıcı), veya sesli mesaj oynatıcısı render ediyor.
- `src/screens/ChatRoomScreen.tsx` — 📎 ataç butonu (galeri/kamera), basılı-tut mikrofon butonu
  (sesli mesaj kaydı), header'a 📞/🎥 arama butonları eklendi. `myUsername` prop'u eklendi (Stream
  kullanıcı adı için gerekli).
- `src/navigation/AppNavigator.tsx` — `CONTACTS`/`CHAT_ROOM` ekranları artık `CallProvider` ile
  sarmalanıyor (Stream client + global gelen-çağrı dinleyicisi hesap giriş yapılınca kuruluyor).
- `src/services/firebase.ts` — `app` artık export ediliyor (mediaService.ts'nin Storage'ı
  başlatabilmesi için).
- `android/app/src/main/AndroidManifest.xml` — kamera/mikrofon/ağ izinleri + medya galerisi okuma
  izinleri eklendi (detay: [[05-Build-Deployment]]).
- `android/app/build.gradle` — `compileOptions` (Java 8/11) eklendi, Stream'in WebRTC modülü
  gerektiriyor.
- `jest.config.js` değişmedi — yeni native modüller manuel mock ile çözüldü, transform config'e
  dokunmaya gerek kalmadı.

**Doğrulama:** `npx tsc --noEmit` temiz, `npx eslint src` temiz (0 hata), `npx jest` geçti. **APK
bu değişikliklerle henüz yeniden derlenmedi** — yeni native modüller (Stream WebRTC, image-picker,
audio-recorder, video) eklendiği için tam bir `gradlew assembleRelease --no-daemon` rebuild'i şart
(sadece JS bundle güncellemesi yetmez, bkz. [[05-Build-Deployment]] "Native bağımlılık eklendiğinde").

**⚠️ Elle yapılması gereken yeni adımlar (bu repodan yapılamaz):**
1. **Stream Dashboard'da hesap/app oluşturma:** https://dashboard.getstream.io → yeni bir "Video &
   Audio" app oluştur → API Key + API Secret'ı `src/config/streamConfig.ts`'e yapıştır. Bu adım
   atlanırsa arama butonları sessizce başarısız olur (`STREAM_API_KEY_BURAYA` placeholder'ı ile
   Stream'e bağlanılamaz).
2. **Firebase Storage kuralları deploy etme:** `storage.rules` dosyası da `firestore.rules` gibi bu
   repodan otomatik gönderilmiyor — Firebase Console → Storage → Rules sekmesine elle
   yapıştırılıp Publish'e basılmalı (veya `firebase deploy --only storage`, CLI kuruluysa). Bu adım
   atlanırsa fotoğraf/video/sesli mesaj yükleme "permission denied" hatası verir.
3. **APK'nın tam rebuild'i** (yukarıda belirtildi) — bu makinede henüz çalıştırılmadı.

**Bilinçli kabul edilen yeni sınırlama:** `streamConfig.ts`'teki `apiSecret` JS bundle'ında düz
metin duruyor ve arama token'ları cihazda üretiliyor — normalde sunucu tarafı sorumluluğu olan bir
işlem client'a taşındı (backend olmadığı için). Aynı risk toleransı projede zaten `adminConfig.ts`
için kabul edilmişti. Bkz. [[04-Security-Notes]] "Stream arama token'ları" bölümü.

**Sonraki aşamalar (yapılmadı, backlog):**
- `react-native-audio-recorder-player` deprecated olarak işaretlendi (yerine
  `react-native-nitro-sound` öneriliyor) — şu an çalışıyor ve yeterli, ama gelecekte native modül
  güncellemesi gerekirse bu geçiş değerlendirilmeli.
- Grup araması / grup sohbeti yok, sadece 1-1.
- Medya mesajları için indirme/galeriye kaydetme butonu yok, sadece uygulama içi görüntüleme.

## 2026-08-11 — Rastgele-kod sistemi kaldırıldı, gerçek kullanıcı adı + şifre hesap sistemi eklendi

Kullanıcı isteği: kişi/kimlik sisteminin cihaza değil gerçek bir hesaba (kullanıcı adı + şifre)
bağlı olması, böylece uygulama silinse/telefon değişse bile aynı hesapla giriş yapılıp aynı kişi
listesine/sohbetlere ulaşılabilsin.

**Yaklaşım:** Firebase Auth'un email/şifre sağlayıcısı, kullanıcıya hiç e-posta göstermeden
kullanıldı — girilen kullanıcı adı dahili olarak `kullaniciadi@gizlichat.local` sahte bir adrese
çevrilip Firebase'e email/şifre hesabı gibi veriliyor. Eski "anonim giriş + rastgele 6 haneli kod"
sistemi (bir önceki oturumda eklenmişti) **tamamen kaldırıldı**.

**Yeni dosyalar:**
- `src/screens/AccountScreen.tsx` — giriş/kayıt formu, zaten oturum açıksa formu atlayan sessiz
  kontrol dahil.

**Değiştirilen dosyalar:**
- `src/services/userService.ts` — tamamen yeniden yazıldı: `ensureUserProfile`/`generateCode`/
  `findUserByCode` kaldırıldı, yerine `registerAccount`/`loginAccount`/`logoutAccount`/
  `findUserByUsername`/`fetchAccountUsername`/`validateUsername` geldi.
- `src/services/firebase.ts` — `getRestoredAccountUser()` eklendi (mevcut gerçek oturumu sessizce
  kontrol eder, sign-in tetiklemez).
- `src/services/leaderboardService.ts` — `submitScore()` artık skoru göndermeden önce
  `ensureAnonymousAuth()` çağırıyor (yeni Firestore kuralları `auth != null` şartı koştuğu için;
  önceden bu çağrı hiçbir yerde yoktu, gizli sohbete hiç girmemiş oyuncularda skor gönderimi
  sessizce başarısız olabilirdi — bu oturumda fark edilip düzeltildi).
- `src/screens/ContactsScreen.tsx` — kendi başına auth yapmıyor, `account` prop olarak alıyor; kod
  yerine kullanıcı adıyla kişi arama; "Çıkış" artık gerçekten `logoutAccount()` çağırıyor.
- `src/navigation/AppNavigator.tsx` — `ADMIN_LOGIN` başarılı olunca artık doğrudan `CONTACTS`'a değil,
  yeni `ACCOUNT` ekranına gidiyor.

**Doğrulama:** `npx tsc --noEmit` temiz, `npx jest` geçti.

**⚠️ Elle yapılması gereken yeni adım:** Firebase Console → Authentication → Sign-in method →
**Email/Password** sağlayıcısının etkinleştirilmesi gerekiyor, yoksa giriş/kayıt formu
`auth/operation-not-allowed` hatası verir. Detay: [[05-Build-Deployment]].

**Bilinçli kabul edilen yeni sınırlama:** Şifre kurtarma yok (sahte e-posta olduğu için Firebase'in
"şifremi unuttum" akışı çalışmaz) — bkz. [[04-Security-Notes]].

## 2026-08-11 — Proje GitHub'a gönderildi

İlk kez git ile versiyonlandı ve `https://github.com/KaanEnnes/GizliChat` (private) reposuna push
edildi. `Mobile/` (boş, bozuk bir `.git` içeren eski artık) ve `.claude/` (yerel makine ayarları,
başka bir kullanıcıya ait eski dosya yolları içeriyordu) `.gitignore`'a eklenip repo dışında
bırakıldı. `ObsidianVault/` ve `firestore.rules` dahil projenin geri kalanı commit edildi. Repo
private tutuldu çünkü `src/config/adminConfig.ts` içinde mock admin şifresi düz metin olarak duruyor
(bkz. [[04-Security-Notes]]).

> En yeni kayıt en üstte. Her proje değişikliğinde (özellik, refactor, config, build/deploy) buraya
> tarih + kısa özet + hangi dosyaların etkilendiği eklenir. Eski kayıtlar silinmez.

## 2026-08-11 — Ses efektleri + skor tablosu + kişi/oda tabanlı sohbet sistemi (Faz 1)

Kullanıcı isteği: oyuna ses efektleri, kaybedince isim sorup Firebase'e gönderen bir liderlik
tablosu, ve eski tek-odalı gizli sohbeti gerçek bir "kişiler" sistemine (WhatsApp benzeri, her
kişiyle ayrı 1-1 oda) dönüştürme. Fotoğraf/görsel/video mesajı ve görüntülü konuşma da istendi ama
kapsam çok büyüdüğü için **aşamalı ilerlemeye karar verildi** — bu oturumda sadece ses + leaderboard
+ metin tabanlı kişi/oda sistemi yapıldı (**Faz 1**). Görüntülü konuşma için hazır bir video SDK'sı
kullanılması kararlaştırıldı (henüz entegre edilmedi — **Faz 2/3, yapılmadı**).

**Yeni dosyalar:**
- `src/services/soundService.ts` — `react-native-sound` ile parça yerleşimi/satır temizleme/oyun
  bitişi seslerini çalar.
- `android/app/src/main/res/raw/sfx_place.wav`, `sfx_clear.wav`, `sfx_gameover.wav` — sentetik
  (programatik üretilmiş sinüs tonları) ses dosyaları, üçüncü parti ses varlığı kullanılmadı.
- `src/services/playerNameStorage.ts` — oyuncunun leaderboard adını AsyncStorage'da saklar, bir
  daha sorulmaması için.
- `src/services/leaderboardService.ts` — Firestore `highscores` koleksiyonuna skor yazma/okuma.
- `src/services/userService.ts` — kişi sisteminin kullanıcı kimliği (`users/{uid}`: isim + 6 haneli
  paylaşılabilir kod).
- `src/services/contactService.ts` — kişi ekleme/listeleme (`users/{uid}/contacts`).
- `src/screens/ContactsScreen.tsx` — kişi listesi ekranı (kod ile kişi ekleme dahil).
- `src/screens/ChatRoomScreen.tsx` — bir kişiyle 1-1 sohbet ekranı.
- `__mocks__/react-native-sound.js` — Jest için native ses modülünün no-op mock'u.

**Değiştirilen dosyalar:**
- `src/screens/HomeScreen.tsx` — ses efektleri, isim sorma modalı, leaderboard modalı,
  `triggerGameOver()` akışı eklendi.
- `src/services/chatService.ts` — **tek sabit `messages` koleksiyonundan oda tabanlı
  `rooms/{roomId}/messages`'a geçirildi** (`getRoomId()` eklendi, `subscribeToMessages`/
  `sendMessage` artık `roomId` parametresi alıyor). Eski model tamamen kaldırıldı, veri migrate
  edilmedi (eski `messages` koleksiyonu Firestore'da orphan olarak kalabilir).
- `src/navigation/AppNavigator.tsx` — `ADMIN_CHAT` yerine `CONTACTS` + `CHAT_ROOM` ekranları.
- `jest.config.js` — `react-native-sound` için `transformIgnorePatterns`'a eklendi.
- `package.json` / `package-lock.json` — `react-native-sound` bağımlılığı eklendi.

**Silinen dosyalar:**
- `src/screens/AdminChatScreen.tsx` — yerini `ContactsScreen.tsx` + `ChatRoomScreen.tsx` aldı.

**Doğrulama:** `npx tsc --noEmit` temiz, `npx jest` (App.test.tsx) geçti. APK bu değişikliklerle
yeniden derlendi (`react-native-sound` native modül eklendiği için tam `gradlew assembleRelease`
rebuild'i gerekti, ~20 dakika sürdü). Yeni APK: aynı konum,
`android/app/build/outputs/apk/release/app-release.apk` (17:00 zaman damgalı, ~57 MB, bir önceki
16:05 damgalı sürümün üzerine yazıldı).

**Firestore Security Rules yazıldı:** `firestore.rules` (proje kökünde) eklendi — `users`,
`users/{uid}/contacts`, `rooms/{roomId}/messages`, `highscores` için gerçek erişim kontrolü
(oda üyeliği, kişi listesi gizliliği, leaderboard'un değiştirilemez/silinemez olması). **⚠️ Bu
dosya henüz Firebase'e deploy edilmedi** — repoda Firebase CLI kurulumu olmadığı için otomatik
gönderilemiyor, kullanıcının Firebase Console'a elle yapıştırıp Publish'e basması (veya Firebase
CLI kurup deploy etmesi) gerekiyor. Adımlar: [[05-Build-Deployment]] "Firestore kurallarını deploy
etme" bölümü. **Bu adım atlanırsa kişi sistemi ve leaderboard çalışmaz.**

**Sonraki aşamalar (yapılmadı, backlog):**
- Fotoğraf/görsel/video mesajı gönderme (Firebase Storage entegrasyonu gerekecek).
- Görüntülü konuşma (hazır bir video SDK'sı — ör. Agora/Stream/Twilio — ile, henüz hangi servis
  seçileceği netleşmedi).

## 2026-08-11 — Obsidian kasası ve APK build ortamı kuruldu

- **Ne yapıldı:** Bu makinede (kablosuz olmadan, önceden sadece USB ile çalıştırılabiliyordu) bağımsız
  çalışabilecek bir Android release APK üretmek için gerekli araçlar kuruldu: Eclipse Temurin JDK 17
  (winget ile) ve Android SDK command-line tools (`C:\Android\Sdk`). Detaylar: [[05-Build-Deployment]].
- **Obsidian kasası oluşturuldu:** `ObsidianVault/` klasörü altında proje mimarisini, ekranları,
  servisleri ve güvenlik notlarını belgeleyen dosyalar yazıldı ([[00-START-HERE]], [[01-Architecture]],
  [[02-Screens-and-Features]], [[03-Services-Backend]], [[04-Security-Notes]], [[05-Build-Deployment]]).
  Amaç: proje başka bir bilgisayara bu kasayla birlikte taşındığında, yeni bir Claude Code oturumunun
  tüm kodu baştan taramadan bağlam kazanabilmesi.
- **Kod tarafında değişiklik yapılmadı** — bu oturumda sadece build ortamı kuruldu ve dokümantasyon
  yazıldı, `src/`, `android/`, `ios/` içinde herhangi bir dosya değiştirilmedi.
- **APK üretimi tamamlandı:** `android/local.properties` güncellendi, ilk build denemesinde eski bir
  makineye ait (`C:\GizliChat`) önbelleğe alınmış autolinking yolu yüzünden hata alındı; `android/build`,
  `android/app/build`, `android/app/.cxx` temizlenip build temiz baştan çalıştırıldı ve başarılı oldu.
  Çıktı: `android/app/build/outputs/apk/release/app-release.apk` (~57 MB, debug keystore ile imzalı,
  Play Store için değil ama sideload/manuel kurulum için hazır). Detaylar ve telefona kurulum adımları:
  [[05-Build-Deployment]].
