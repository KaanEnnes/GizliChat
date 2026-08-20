# GizliChat — Proje Kasası (BURADAN BAŞLA)

> Bu klasör bir Obsidian kasasıdır ve proje ile birlikte taşınır. Bu dosya, projeye yeni başlayan
> herhangi bir Claude Code oturumu (bu bilgisayarda ya da başka bir bilgisayarda) için **ilk okunması
> gereken dosyadır**. Amaç: projeyi baştan tarayıp anlamaya çalışmak yerine, buradaki notlardan
> hızlıca bağlam kazanmak.

## Kural: Bu kasa nasıl kullanılır

1. Yeni bir oturumda projeye dokunmadan önce bu dosyayı ve aşağıdaki linkli notları oku.
2. **[[Changelog]]** dosyasını mutlaka oku — en son yapılan değişiklikler ve projenin "şu an
   nerede olduğu" orada, en yeni kayıt en üstte olacak şekilde tutulur.
3. Bu notlar projenin genel mimarisini anlatır; **kod hâlâ tek doğru kaynaktır**. Notlar bir özet/harita
   niteliğindedir, koddaki güncel detayı görmek için ilgili dosyayı aç. Notlarla kod çelişiyorsa kod
   kazanır ve not güncellenmelidir.
4. **Projede bir değişiklik yaptığında (özellik ekleme, dosya taşıma, mimari karar, build/config
   değişikliği vb.) [[Changelog]] dosyasına yeni bir madde ekle.** Eski kayıtları silme, üstüne ekle.
   Bu, notların "canlı" kalmasını sağlar ki başka bir Claude Code oturumu baştan taramaya gerek kalmadan
   doğru şekilde devam edebilsin.
5. Yeni bir mimari alan/özellik eklersen (örn. yeni bir servis, yeni bir ekran grubu) ilgili nota
   ekleme yap; büyük bir alan tamamen yeniyse yeni bir not dosyası oluşturup buradan link ver.

## Proje özeti

**GizliChat** ("Gizli" = Türkçe'de "gizli/saklı"), görünüşte basit bir blok bulmaca oyunu olan ama
içine gizlenmiş bir çok-kişili özel sohbet (chat) sistemi barındıran bir React Native (Android/iOS)
mobil uygulamasıdır. Uygulamanın native/proje ismi hâlâ "Mobile" (RN CLI varsayılanından
değiştirilmemiş), "GizliChat" sadece klasör adı ve üst seviye yorum/başlıklarda geçiyor.

- **Ana özellik (görünen yüz):** "BLOK ÇILGINLIĞI" adlı bir 8x8 blok yerleştirme oyunu (Block Blast
  tarzı). Artık ses efektleri var (parça yerleşimi, satır temizleme, oyun bitişi) ve kaybedince
  isim bir kere sorulup Firebase üzerinden herkese açık bir skor tablosuna gönderiliyor.
- **Gizli özellik:** Oyun ekranındaki dişli ikonuna 3.5 saniye içinde 10 kez dokununca doğrudan
  gerçek "Giriş Yap / Kayıt Ol" ekranı (kullanıcı adı/şifre, Firebase Auth) açılır — eskiden burada
  bir sahte/mock admin şifre katmanı vardı, tamamen kaldırıldı (bkz. [[Changelog]]). Giriş sonrası
  bir **kişi (contact) listesi** ekranına geçilir. Kullanıcı adıyla birini bulup kişi olarak ekleyip,
  o kişiyle ayrı, özel, 1-1 gerçek zamanlı bir Firestore sohbet odasına giriliyor (WhatsApp'a benzer
  bir kişi/oda modeli). Artık metnin yanında **fotoğraf** (Firestore/base64, Storage'sız), **video/
  sesli mesaj** (Firebase Storage) gönderilebiliyor ve **sesli/görüntülü arama** yapılabiliyor
  (Stream Video, ayrı bir üçüncü parti hesap gerektirir).
- **Backend:** Firebase (proje adı `kaanchatmercan`) — Auth (anonim + email/şifre), Firestore ve
  Storage kullanılıyor. Arama için ayrıca Stream Video (Firebase'in parçası değil, ayrı bir hesap).
- **Şifreleme yok:** "Gizli" olan şey mesaj içeriği değil, sohbete erişimin UI içinde saklanmış olması
  (security-through-obscurity). Detaylar için [[04-Security-Notes]].

## Kasadaki diğer notlar

- [[01-Architecture]] — Klasör yapısı, dosya dosya ne işe yarıyor, bağımlılıklar.
- [[02-Screens-and-Features]] — Ekranlar, navigasyon akışı, oyun ve sohbet mantığı.
- [[03-Services-Backend]] — Firebase kurulumu, Firestore veri modeli, servis katmanı.
- [[04-Security-Notes]] — Güvenlikle ilgili notlar, bilinen zayıflıklar, prototip uyarıları.
- [[05-Build-Deployment]] — Bu makinede APK nasıl üretildi, gerekli araçlar, komutlar.
- [[Changelog]] — Projeye yapılan her değişikliğin adım adım kaydı (en yeni en üstte).

## Hızlı gerçekler (sık kullanılan bilgiler)

- Uygulama kök klasörü: proje düz (flat) bir yapı, doğrudan `C:\Users\mrkaa\projects\GizliChat`
  altında (eski iç içe `GizliChat/GizliChat/` yapısı ve kökteki başıboş `Mobile/` klasörü artık yok).
- Paket adı (npm): `Mobile`. Android `applicationId`: `com.mobile`. iOS bundle id hâlâ RN CLI
  varsayılanı (`org.reactjs.native.example.$(PRODUCT_NAME...)`), özelleştirilmemiş.
- React Native `0.86.2`, React `19.2.3`, Node `>= 22.11.0` gerekiyor.
- Navigasyon kütüphanesi yok — el yapımı `useState` tabanlı ekran anahtarlama
  (`src/navigation/AppNavigator.tsx`).
- State yönetim kütüphanesi yok (Redux/Zustand vb. yok), her şey lokal `useState`.
