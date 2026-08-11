# Build ve Dağıtım (Android)

Bağlam için önce [[00-START-HERE]] dosyasına bak.

## Bu makinede kurulu araçlar (Windows)

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

- `versionCode 1`, `versionName "1.0"` (`android/app/build.gradle`). Yeni bir sürüm çıkarırken bu
  değerleri artırmayı unutma, aksi halde telefonda "eski sürüm" olarak görülüp güncellenmeyebilir.
