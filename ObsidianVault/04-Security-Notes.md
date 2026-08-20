# Güvenlik Notları

Bağlam için önce [[00-START-HERE]] dosyasına bak.

Bu dosya, kodu inceleyen bir ajanın gözlemlerini içerir; bir güvenlik denetimi/onayı değildir.

## "Gizli" ne anlama geliyor (ve neye gelmiyor)

Uygulamanın adı ve konsepti "Gizli" olsa da, mesaj içeriği **şifrelenmiyor**. Mesajlar Firestore'a
düz metin olarak yazılıyor/okunuyor. "Gizlilik" tamamen şu üç katmandan oluşan bir
security-through-obscurity yaklaşımı:

1. Gerçek özellik (chat) bir oyunun arkasına gizlenmiş (`HomeScreen.tsx`).
2. Erişim, gizli bir jest ile tetikleniyor (dişli ikonuna 10 dokunuş / 3.5 sn) ve doğrudan gerçek
   bir Firebase Auth girişine açılıyor — eskiden burada ayrıca sahte/mock bir "şifre" katmanı
   (`AdminLoginScreen`) vardı, tamamen kaldırıldı (bkz. [[Changelog]]), artık gizliliğin tek kaynağı
   jestin kendisi.

## Bilinen zayıflıklar (prototip olarak işaretli, production için değil)

- **Düzeltme:** `firestore.rules` artık gerçekten bu repoda var ve `firebase.json` üzerinden deploy
  edilebiliyor (bkz. [[03-Services-Backend]]) — bu notun eski hâli "Firestore Security Rules bu
  repoda değil" diyordu, artık doğru değil. Asıl kalan risk: kurallar deploy edilmemişse (elle bir
  adım, bkz. [[05-Build-Deployment]]) ya da yanlışlıkla gevşetilirse (`allow read, write: if true`
  gibi), `rooms`/`users`/`highscores`/`chessRooms`/`app_config` koleksiyonları Firebase config'ini
  (public, gizli değil) bilen herkes tarafından okunabilir/yazılabilir olabilir.
- **Oyun dokümanları client-trusted, sunucu tarafında hamle doğrulaması yok.** `rooms/{roomId}/game/
  {ticTacToe|chess}` ve `chessRooms/{code}` (2026-08-16/17'de eklendi) için `firestore.rules` sadece
  "oda üyesi misin / giriş yapmış mısın" kontrolü yapıyor, gönderilen hamlenin gerçekten legal olup
  olmadığını ya da sıranın gerçekten o oyuncuda olup olmadığını **doğrulamıyor** — bu, `chess.js`'in
  istemci tarafında yaptığı legality kontrolünü (ki sadece resmi mobil/PC istemcisi bunu çalıştırır)
  atlayan, Firestore'a doğrudan yazan özel bir istemcinin herhangi bir FEN/board durumunu dayatabileceği
  anlamına geliyor. Mesajlar/skor tablosuyla aynı "iki taraf zaten birbirine güveniyor" kabulü — bkz.
  [[03-Services-Backend]].
- **Oda kodlu satranç (`chessRooms/{code}`) kişi listesinden bağımsız, anonim erişime açık.** 5
  karakterlik kod alan uzayı (`33^5` ≈ 39 milyon) tahmin edilmesi zor ama **rate limiting yok** —
  Firestore kuralları izin verdiği sürece biri art arda rastgele kod deneyerek bekleyen (`status:
  'waiting'`) odaları bulabilir. Pratik etkisi düşük (kişi listesi/sohbet geçmişine erişim sağlamıyor,
  sadece o anki satranç oyununa katılabiliyor), ama proje genelindeki "her şey kişi listesine bağlı"
  varsayımının bilinçli bir istisnası.
- **Satranç bot API'sine pozisyon (FEN) gönderiliyor.** `chessBotService.ts`, orta/zor zorlukta
  `https://stockfish.online` (3. parti, ücretsiz) API'sine mevcut tahta pozisyonunu düz metin
  gönderiyor. FEN kimlik bilgisi taşımıyor (sadece taş dizilimi), ama yine de proje dışına giden bir
  ağ isteği — Stream arama token'ları gibi "backend yok, bir kısayol" kategorisinde, ama burada
  gönderilen veri hassas değil.
- **PC istemcisi (`pc-client/index.html`, 2026-08-16'da eklendi) mobil ile aynı risk yüzeyini
  masaüstüne taşıyor.** Aynı Firebase config'i (public), aynı kullanıcı adı→sahte e-posta auth
  şemasını dosyanın içinde düz metin olarak tutuyor — bu dosyayı okuyan biri de mobil `firebaseConfig.ts`
  kadarını görebiliyor (zaten "gizli değil, sadece rules'a bağlı" prensibiyle tutarlı, yeni bir açık
  değil ama ikinci bir kopya). Kimlik doğrulama işlemi tarayıcıda `file://` origin'inden yapılıyor;
  bu dosyayı elde eden herkes kendi tarayıcısında açıp aynı config ile bağlanabilir (zaten mobil
  APK'daki config de aynı şekilde herkese açık, bkz. aşağıda genel prensip).
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

## Stream arama token'ları (client-side secret)

`src/config/streamConfig.ts`'teki `apiSecret` de aynı kategoride bir açık: JS bundle'ında düz metin
duruyor ve `src/services/callService.ts`, arama token'larını
(HS256 JWT) bu secret ile **cihazda** imzalıyor. Normal bir Stream Video entegrasyonunda bu işlem
sunucu tarafında yapılmalı (secret hiçbir zaman client'a gönderilmemeli) — burada backend olmadığı
için bilinçli bir kısayol. Pratik sonucu: APK'yı decompile eden biri `apiSecret`'ı okuyup **kendi
adına herhangi bir `user_id` için geçerli bir Stream token'ı üretebilir** — yani projenin Stream
app'i içinde istediği kullanıcı kimliğiyle arama başlatabilir/dinleyebilir. Aynı "prototip,
production değil" kabulü burada da geçerli; gerçek bir yayına alma öncesi bu token üretimi bir
Cloud Function/küçük bir backend'e taşınmalı.

## Bu notların amacı

Bu dosya kodu **eleştirmek için değil**, bir sonraki oturuma (bu bilgisayarda ya da başka birinde
çalışan bir Claude Code'a) "burada bilinçli bir prototip/tasarım kararı var, sürpriz değil" demek
için var. Production'a taşınmadan önce ele alınması gerekenler burada listelidir. Yeni bir güvenlik
kararı alınırsa (örn. gerçek admin auth'a geçildi, şifreleme eklendi) burayı ve [[Changelog]]'u
güncelle.
