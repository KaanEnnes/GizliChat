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
- **Gizli özellik:** Oyun ekranındaki dişli ikonuna 3.5 saniye içinde 10 kez dokununca gizli admin
  girişi açılır → mock şifre ile giriş → bir **kişi (contact) listesi** ekranı. Her kullanıcının
  paylaşılabilir 6 haneli bir kodu var; başkasının kodunu girerek onu kişi olarak ekleyip, o kişiyle
  ayrı, özel, 1-1 gerçek zamanlı bir Firestore sohbet odasına giriliyor (WhatsApp'a benzer temel bir
  kişi/oda modeli — henüz medya/fotoğraf/video/görüntülü konuşma yok, bunlar planlanan sonraki
  aşamalar, bkz. [[Changelog]]).
- **Backend:** Firebase (proje adı `kaanchatmercan`) — Auth (anonim) ve Firestore kullanılıyor.
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

- Uygulama kök klasörü: `GizliChat/GizliChat/` (proje adı ve klasör adı aynı, dikkat: iç içe).
- Paket adı (npm): `Mobile`. Android `applicationId`: `com.mobile`. iOS bundle id hâlâ RN CLI
  varsayılanı (`org.reactjs.native.example.$(PRODUCT_NAME...)`), özelleştirilmemiş.
- React Native `0.86.2`, React `19.2.3`, Node `>= 22.11.0` gerekiyor.
- Navigasyon kütüphanesi yok — el yapımı `useState` tabanlı ekran anahtarlama
  (`src/navigation/AppNavigator.tsx`).
- State yönetim kütüphanesi yok (Redux/Zustand vb. yok), her şey lokal `useState`.
- `Mobile/` adında proje kökünde başıboş, boş bir klasör var (eski bir scaffold artığı, kodun
  parçası değil, silinebilir ama dokunulmadı).
