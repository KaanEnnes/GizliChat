# Değişiklik Günlüğü

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
