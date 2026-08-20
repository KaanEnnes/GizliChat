# Build ve Dağıtım (Android)

Bağlam için önce [[00-START-HERE]] dosyasına bak.

> **Önemli:** Bu notta artık **birden fazla makineye ait** kurulum bilgisi var (proje farklı
> bilgisayarlara taşınıp her seferinde araçlar sıfırdan kurulduğu için). Hangi bölümün hangi
> makineye ait olduğuna dikkat et — yollar (`C:\Android\Sdk` vs. `C:\Users\USER\AppData\Local\
> Android\Sdk` gibi) birbirinin yerine geçmez, çalıştığın makinede önce doğru `ANDROID_HOME`/
> `JAVA_HOME`'un hangisi olduğunu kontrol et (`echo $env:ANDROID_HOME` / klasörün var olup
> olmadığına bak).

## Makine 2 — 2026-08-14 kurulumu (`C:\Users\USER\...`)

- **JDK:** Microsoft Build of OpenJDK 17 — `C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot`
  (winget `Microsoft.OpenJDK.17` paketinden kuruldu).
- **Android SDK:** `C:\Users\USER\AppData\Local\Android\Sdk` (varsayılan `%LOCALAPPDATA%\Android\Sdk`
  konumu — Android Studio kurulmadı, sadece `cmdline-tools` (Google'ın resmi zip'i) indirilip
  `sdkmanager` ile `platform-tools`, `platforms;android-34/35/36`, `build-tools;34/35/36`,
  `ndk;27.1.12297006`, `cmake;3.22.1`, `emulator`, `system-images;android-34;google_apis;x86_64`
  kuruldu. Lisanslar `sdkmanager --licenses` ile toplu kabul edildi.
- **Emülatör (AVD):** `GizliChat_AVD` — Pixel 6, Android 14 (API 34), `google_apis/x86_64`.
  `avdmanager create avd -n GizliChat_AVD -k "system-images;android-34;google_apis;x86_64" -d
  pixel_6` ile oluşturuldu, `emulator -avd GizliChat_AVD` ile başlatıldı; bu makinede WHPX (Windows
  Hypervisor Platform) donanım hızlandırması otomatik devreye girdi (log: "Windows Hypervisor
  Platform accelerator is operational").
- **GitHub CLI:** `gh` winget ile kuruldu (`GitHub.cli`), `gh auth login --web` ile `KaanEnnes`
  hesabına device-code akışıyla giriş yapıldı. Repolar `gh repo clone` ile `C:\Users\USER\Projects\`
  altına indirildi.
- **Ağ hızı:** Bu makinede indirmeler zaman zaman çok yavaştı (~50-100 KB/sn'ye düşüyordu) — SDK/NDK
  kurulumu ve ilk build'ler bu yüzden beklenenden uzun sürdü (bkz. [[Changelog]] 2026-08-14 kaydı).
- **Bilinen çalışma-zamanı sorunu:** Metro, bir gradle build'i çalışırken oluşturulup silinen bir
  CMake geçici klasörünü izlemeye çalışırken `ENOENT` ile çökebiliyor (Node süreci tamamen kapanıyor).
  Çözüm kod değişikliği değil, sadece `npx react-native start --reset-cache` ile yeniden başlatmak —
  detay [[Changelog]] 2026-08-14 kaydında.

## Makine 1 kurulumu (önceki oturum, yol: `C:\Android\Sdk`)

- **JDK:** Eclipse Temurin 17 — `C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot`
  (winget ile `EclipseAdoptium.Temurin.17.JDK` paketinden kuruldu).
- **Android SDK:** `C:\Android\Sdk`
  - `cmdline-tools\latest`, `platform-tools`, `platforms;android-36`, `build-tools;36.0.0`,
    `ndk\27.1.12297006` (gradle build sırasında otomatik indirildi).
  - `android/local.properties` içindeki `sdk.dir` bu yola güncellendi (eski değer başka bir
    kullanıcıya/bilgisayara ait `C:\Users\mrkaa\...` yoluydu, geçersizdi).

> Not: Bu SDK/JDK kurulumu proje klasörünün dışında, makineye özel (`C:\Android\Sdk`,
> `C:\Program Files\...`). Proje başka bir bilgisayara taşındığında bu araçlar o makinede tekrar
> kurulmalı — kasadaki dosyalar taşınsa da SDK/JDK taşınmaz.

## Release APK nasıl üretildi

```
cd android
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot"
.\gradlew.bat assembleRelease --no-daemon
```

Çıktı: `android/app/build/outputs/apk/release/app-release.apk`

- İmzalama: `android/app/build.gradle` içindeki release build type, debug keystore ile imzalanıyor
  (`android/app/debug.keystore`, sabit `androiddebugkey`/`android` şifreleriyle). Bu, Play Store'a
  yayınlamak için **uygun değil** (gerçek bir release keystore ile yeniden imzalanmalı), ama
  kendi cihazına manuel kurulum (sideload) için tamamen yeterli.
- `minifyEnabled` (Proguard) kapalı (`enableProguardInReleaseBuilds = false` in `build.gradle`).

## Karşılaşılan sorun ve çözümü

İlk build denemesi şu hatayla başarısız oldu:
```
Configuring project ':react-native-safe-area-context' without an existing directory is not allowed.
The configured projectDirectory 'C:\GizliChat\node_modules\react-native-safe-area-context\android'
does not exist...
```
Sebep: `android/build/generated/autolinking/autolinking.json` içinde, projenin başka bir yolda
(`C:\GizliChat`, muhtemelen orijinal geliştirme makinesi) bulunduğu zamandan kalma **önbelleğe
alınmış mutlak yol** vardı. Çözüm: `android/build`, `android/app/build`, `android/app/.cxx`
klasörleri tamamen silinip build temiz baştan çalıştırıldı — autolinking mevcut proje yoluna göre
yeniden üretildi.

**Genel kural:** Proje farklı bir klasöre/bilgisayara taşınırsa ve build "path does not exist" gibi
bir hatayla başarısız olursa, önce `android/build`, `android/app/build`, `android/app/.cxx`
klasörlerini silip tekrar dene.

## Telefona kurulum (APK'yı sideload etme)

1. Telefonda **Ayarlar → Güvenlik (veya Uygulamalar) → Bilinmeyen kaynaklardan yükleme**
   (Install unknown apps) iznini, APK'yı açacağın uygulama için (Dosyalar, Chrome, vb.) aç.
2. `app-release.apk` dosyasını telefona aktar (USB kablo ile kopyala, veya Google Drive/e-posta/
   Bluetooth ile gönder — WiFi/kablo şart değil, tek seferlik dosya transferi yeterli).
3. Telefonda dosya yöneticisinden APK'ya dokun, "Yükle"yi onayla.
4. Kurulumdan sonra uygulama artık **bağımsız çalışır** — Metro/geliştirme sunucusuna veya USB
   bağlantısına ihtiyaç duymaz (release build, JS bundle'ı APK içine gömülü).

Alternatif (USB bağlıyken tek komutla kurulum): `adb install -r app-release.apk` (SDK
`platform-tools` klasöründeki `adb.exe` ile).

## Stream Video (arama) kurulumu — ÖNEMLİ, elle yapılmalı

Sesli/görüntülü arama, ayrı bir üçüncü parti hesap gerektirir (Firebase'in parçası değil):

1. https://dashboard.getstream.io → hesap oluştur (ücretsiz, kredi kartı istemiyor) → yeni bir
   **Video & Audio** app oluştur.
2. App ayarlarından **API Key** ve **API Secret**'ı kopyala, `src/config/streamConfig.ts` içindeki
   `STREAM_API_KEY_BURAYA` / `STREAM_API_SECRET_BURAYA` placeholder'larının yerine yapıştır.
3. Bu adım atlanırsa arama butonları (`ChatRoomScreen`'deki 📞/🎥) sessizce başarısız olur (Stream'e
   geçersiz bir key ile bağlanmaya çalışır, `callService.ts` içindeki `.catch()` sadece konsola
   `console.warn` basar, kullanıcıya bir hata göstermez).
4. Fiyatlandırma: her Stream hesabına aylık $100 ücretsiz kredi veriliyor — kişisel/arkadaş arası
   kullanım için pratikte tükenmesi neredeyse imkansız (sadece sesli ~166.000 dk/ay, HD görüntülü
   ~33.000 dk/ay karşılığı). Detay: [[03-Services-Backend]].

## Firebase Storage kurallarını deploy etme — ÖNEMLİ, elle yapılmalı

`storage.rules` (proje kökünde) fotoğraf/video/sesli mesaj erişimini kısıtlıyor, ama
`firestore.rules` gibi **sadece bir metin dosyası** — elle deploy edilmedikçe etkisi yok:

**A) Firebase Console üzerinden (en hızlı):**
1. https://console.firebase.google.com → `kaanchatmercan` projesi → **Storage** → **Rules** sekmesi.
2. `storage.rules` dosyasının içeriğini kopyala, konsoldaki editöre yapıştır, **Publish**.

**B) Firebase CLI ile:** `firebase deploy --only storage` (aynı `firebase login`/`firebase init`
kurulumu, bkz. aşağıdaki "Firestore kurallarını deploy etme" bölümü — `firebase init` sırasında
Storage'ı da seçmek gerekir).

Bu adım atlanırsa fotoğraf/video/sesli mesaj gönderme "permission denied" hatasıyla başarısız olur.

## Native bağımlılık eklendiğinde (örn. react-native-sound)

`react-native-sound` gibi native modüller eklendiğinde/güncellendiğinde **sadece JS değişir, native
tarafı da değişir** — bir önceki APK'nın üstüne "JS bundle güncellemesi" gibi davranmaz, tam bir
`assemblyRelease` (gradle) rebuild'i şart. Bu tür bir bağımlılık eklendiğinde:
1. `npm install <paket>`
2. Native ses dosyaları gibi statik varlıklar varsa ilgili native klasöre koy (bu projede:
   `android/app/src/main/res/raw/*.wav`, dosya adları küçük harf + alt çizgi, uzantı hariç nokta
   olmamalı — Android resource adlandırma kuralı).
3. Jest'te native modül çalışmayacağı için gerekirse `__mocks__/<paket-adı>.js` altında bir manuel
   mock eklenmeli (bkz. `__mocks__/react-native-sound.js` — testler native tarafı görmeden no-op
   bir sınıfla çalışır).
4. `android/build`, `android/app/build`, `android/app/.cxx` temizlenmese de olur (autolinking yeni
   paketi otomatik algılar), ama build başarısız olursa önce bunları temizleyip tekrar denemek ilk
   adım olmalı (bkz. yukarıdaki "Karşılaşılan sorun" notu).
5. `gradlew assembleRelease --no-daemon` ile yeniden derle.

## Firebase Console'da Email/Password girişini etkinleştirme — ÖNEMLİ, elle yapılmalı

Kullanıcı adı/şifre hesap sistemi (`src/services/userService.ts`), arka planda Firebase Auth'un
**Email/Password** sağlayıcısını kullanıyor. Bu sağlayıcı Firebase Console'da elle açılmadıysa,
kayıt/giriş denemeleri `auth/operation-not-allowed` gibi bir hatayla başarısız olur.

1. https://console.firebase.google.com → `kaanchatmercan` projesi → **Authentication** →
   **Sign-in method** sekmesi.
2. Sağlayıcılar listesinde **Email/Password**'ü bul, **Enable** ile aç, kaydet.
3. (Anonim giriş — leaderboard için kullanılıyor — muhtemelen zaten açıktı, chat sisteminin ilk
   hâli ona dayanıyordu; değilse onu da aç.)

Bu adım atlanırsa: Firestore kuralları doğru deploy edilmiş olsa bile, `AccountScreen`'deki
giriş/kayıt formu çalışmaz.

## Firestore kurallarını deploy etme

`firestore.rules` (proje kökünde) yazılı ama Firebase'e **elle gönderilmesi gerekiyor** — bu repoda
Firebase CLI kurulumu (`firebase.json`, `.firebaserc`) yok, otomatik deploy yapılamıyor. İki yol:

**A) Firebase Console üzerinden (en hızlı, CLI kurulumu gerekmez):**
1. https://console.firebase.google.com → `kaanchatmercan` projesi → **Firestore Database** →
   **Rules** sekmesi.
2. `firestore.rules` dosyasının tüm içeriğini kopyala, konsoldaki editöre yapıştır.
3. **Publish** butonuna bas.

**B) Firebase CLI ile (tekrarlanabilir, proje büyürse önerilir):**
```
npm install -g firebase-tools
firebase login
firebase init firestore   # proje kökünde, kaanchatmercan'ı seçerek
firebase deploy --only firestore:rules
```

Kurallar deploy edilmeden **kişi sistemi ve leaderboard çalışmaz** (eski, dar kapsamlı kurallar
hâlâ aktifse `users`/`rooms`/`highscores` path'lerine yazma/okuma reddedilir ve uygulamada "Kişiler
yüklenemedi" gibi hatalar görülür). Kuralların içeriği için [[03-Services-Backend]].

## Sürüm bilgisi

- Güncel değer için doğrudan `android/app/build.gradle`'a bak (sık değişir) — 2026-08-20 itibarıyla
  `versionCode 6`, `versionName "1.2.3"`. Yeni bir sürüm çıkarırken bu değerleri artırmayı unutma,
  aksi halde telefonda "eski sürüm" olarak görülüp güncellenmeyebilir.
- **Not:** Bu repoda artık bir `firebase.json` var (firestore/storage rules, `functions/`, ve
  `public/` klasörünü Hosting kaynağı olarak tanımlıyor) — yukarıdaki "Firebase CLI kurulumu yok"
  notları büyük ölçüde `firestore.rules`/`storage.rules`'ın **elle Console'dan** deploy edilmesiyle
  ilgiliydi; `firebase deploy --only hosting` (APK yayınlama) ve `firebase deploy --only functions`
  (push bildirimleri) artık bu `firebase.json` üzerinden çalışıyor — CLI kurulup `firebase login`
  yapıldıktan sonra proje kökünden doğrudan çalıştırılabilir, ayrıca bir `firebase init` gerekmez.

## Uygulama içi güncelleme (APK) yayınlama — her yeni sürümde elle yapılan son adım

Kod tarafı (`updateService.ts`, `UpdateBanner.tsx`, `ApkInstallerModule.kt`) tamamen otomatik, ama
Firestore `app_config/android` dokümanı **bilerek** sadece Firebase Console'dan elle güncellenebiliyor
(`firestore.rules`: `allow write: if false`). Sürüm çıkarma akışı:

1. `android/app/build.gradle`'da `versionCode`'u artır, `versionName`'i güncelle.
2. `cd android && ./gradlew assembleRelease --no-daemon` ile release APK'yı derle.
3. Çıkan `android/app/build/outputs/apk/release/app-release.apk` dosyasını proje kökündeki
   `public/` klasörüne `app-release-X.Y.Z.apk` adıyla kopyala (her sürüm için ayrı ad — eski dosyayı
   indirmiş biri yarım kalmış bir dosyayla karşılaşmasın). **Bu `.apk` dosyaları `.gitignore`'da
   (`/public/*.apk`), asla commit edilmez.**
4. `firebase deploy --only hosting` ile yayınla → `https://kaanchatmercan.web.app/app-release-X.Y.Z.apk`.
5. Firebase Console → Firestore Database → `app_config` → `android` dokümanını aç, `versionCode`/
   `versionName`/`apkUrl`/`notes` alanlarını elle güncelle, kaydet.

Adım 5 atlanmadan önce eski cihazlar ya banner'ı hiç görmez ya da yanlış sürüme/URL'e işaret eder —
bkz. `GUNCELLEME-ELLE-ADIM.txt` (bu deseni ilk kez karşılaşan bir oturum için örnek/hatırlatma
notu) ve `YAPILACAKLAR.txt` madde 6. Detay: [[03-Services-Backend]] → "app_config/{configId}".
