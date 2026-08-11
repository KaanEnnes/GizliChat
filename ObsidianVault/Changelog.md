# Değişiklik Günlüğü

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
