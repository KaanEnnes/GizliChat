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
- **Kullanıcı adları tahmin edilebilir/numaralandırılabilir.** `findUserByUsername()` sorgusunda hız
  sınırlama (rate limiting) yok — Firestore kuralları izin verdiği sürece biri art arda yaygın
  kullanıcı adları deneyerek gerçek hesapların var olup olmadığını öğrenebilir (bu, karşı tarafın
  senin kişi listende olmasını sağlamaz ama hesabının varlığını doğrulamasını sağlar). Eski rastgele
  6 haneli kod sistemine göre bu daha kolay tahmin edilebilir bir yüzey — kullanıcı adı seçimi
  kullanıcıya bırakıldığı için "ahmet", "test" gibi yaygın adlar denenebilir.
- `users` koleksiyonuna herkes `where('usernameLower','==',...)` ile sorgu atabildiği için (kurallar
  izin veriyorsa), teorik olarak koleksiyon tamamen taranıp tüm kullanıcı adları toplu çıkarılabilir
  (enumeration). Firestore kuralları bunu sadece "giriş yapmış olma" şartına bağlıyorsa yeterli
  değildir; ideal olarak sorgu sadece tek bir `usernameLower` eşleşmesine izin vermeli.
- **Şifre kurtarma mekanizması yok.** Kullanıcı adı, Firebase Auth'a sahte bir e-posta
  (`kullaniciadi@gizlichat.local`) olarak veriliyor — bu adrese gerçekten e-posta gönderilemez.
  Firebase'in "şifremi unuttum" (`sendPasswordResetEmail`) akışı bu yüzden **kullanılamaz**: şifresini
  unutan bir kullanıcı o hesaba bir daha asla giremez, verisi (kişi listesi, sohbetleri) fiilen
  erişilemez hâle gelir. Bu, tasarım gereği kabul edilen bir sınırlama (gerçek e-posta/telefon
  toplamamak için) ama kullanıcıya net şekilde iletilmesi gereken bir risk.
- Şifreler client tarafında herhangi bir ek işleme tabi tutulmadan doğrudan Firebase Auth'a
  gönderiliyor (Firebase SDK'sı bunları kendi tarafında hashliyor/saklıyor, uygulama kodu şifreyi
  hiçbir yerde düz metin olarak saklamıyor) — bu kısım standart ve güvenli.

## Bu notların amacı

Bu dosya kodu **eleştirmek için değil**, bir sonraki oturuma (bu bilgisayarda ya da başka birinde
çalışan bir Claude Code'a) "burada bilinçli bir prototip/tasarım kararı var, sürpriz değil" demek
için var. Production'a taşınmadan önce ele alınması gerekenler burada listelidir. Yeni bir güvenlik
kararı alınırsa (örn. gerçek admin auth'a geçildi, şifreleme eklendi) burayı ve [[Changelog]]'u
güncelle.
