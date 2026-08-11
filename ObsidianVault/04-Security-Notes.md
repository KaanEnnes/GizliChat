# Güvenlik Notları

Bağlam için önce [[00-START-HERE]] dosyasına bak.

Bu dosya, kodu inceleyen bir ajanın gözlemlerini içerir; bir güvenlik denetimi/onayı değildir.

## "Gizli" ne anlama geliyor (ve neye gelmiyor)

Uygulamanın adı ve konsepti "Gizli" olsa da, mesaj içeriği **şifrelenmiyor**. Mesajlar Firestore'a
düz metin olarak yazılıyor/okunuyor. "Gizlilik" tamamen şu üç katmandan oluşan bir
security-through-obscurity yaklaşımı:

1. Gerçek özellik (chat) bir oyunun arkasına gizlenmiş (`HomeScreen.tsx`).
2. Erişim, gizli bir jest ile tetikleniyor (dişli ikonuna 10 dokunuş / 3.5 sn).
3. Bir "şifre" ile korunuyor — ama bu şifre kontrolü tamamen client-side ve mock.

## Bilinen zayıflıklar (prototip olarak işaretli, production için değil)

- `src/config/adminConfig.ts` içinde admin kullanıcı adı/şifresi (`admin`/`admin123`) **düz metin
  olarak JS bundle'ında** yer alıyor. APK'yı decompile eden biri bunu doğrudan görebilir.
- Admin girişi client-side kontrol ediliyor (`authService.ts`), hiçbir sunucu tarafı doğrulama yok.
  Bu, bir saldırganın (teoride) bu kontrolü tamamen atlayıp `ContactsScreen`'e doğrudan
  erişebileceği anlamına gelir (RN/JS bundle patchleyerek).
- Firestore Security Rules bu repoda değil — gerçek erişim kontrolü tamamen Firebase konsolündeki
  ayarlara bağlı, buradan doğrulanamıyor. Eğer kurallar gevşekse (`allow read, write: if true` gibi),
  `rooms`/`users`/`highscores` koleksiyonları Firebase config'ini (public, gizli değil) bilen herkes
  tarafından okunabilir/yazılabilir olabilir.
- Mesajlarda uçtan uca şifreleme yok; Firestore verisine erişimi olan biri (konsol üzerinden veya
  kuralları zayıfsa istemciden) tüm sohbet geçmişini düz metin görebilir.
- **Kişi kodu (`users/{uid}.code`) kaba kuvvetle denenebilir.** Kod sadece 6 karakter ve
  `findUserByCode()` sorgusunda hız sınırlama (rate limiting) yok — Firestore kuralları izin
  veriyorsa biri art arda rastgele kod deneyerek gerçek kullanıcıları bulup kendi kişi listesine
  ekleyebilir (bu, karşı tarafın senin kişi listende olmasını sağlamaz ama senin adını/varlığını
  öğrenmesini sağlar). Kod alanına Firestore tarafında bir index/sorgu limiti veya kural bazlı
  yavaşlatma eklenmesi düşünülebilir.
- `users` koleksiyonuna herkes `where('code','==',...)` ile sorgu atabildiği için (kurallar izin
  veriyorsa), teorik olarak koleksiyon tamamen taranıp tüm kullanıcı isim+kodları toplu
  çıkarılabilir (enumeration). Firestore kuralları bunu sadece "giriş yapmış olma" şartına
  bağlıyorsa yeterli değildir; ideal olarak sorgu sadece tek bir `code` eşleşmesine izin vermeli.

## Bu notların amacı

Bu dosya kodu **eleştirmek için değil**, bir sonraki oturuma (bu bilgisayarda ya da başka birinde
çalışan bir Claude Code'a) "burada bilinçli bir prototip/tasarım kararı var, sürpriz değil" demek
için var. Production'a taşınmadan önce ele alınması gerekenler burada listelidir. Yeni bir güvenlik
kararı alınırsa (örn. gerçek admin auth'a geçildi, şifreleme eklendi) burayı ve [[Changelog]]'u
güncelle.
