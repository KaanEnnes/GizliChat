// Kullanım: node scripts/createAdminAccount.js
//
// Tek seferlik betik: projenin AÇIK (gizli değil) yönetici hesabını canlı
// Firebase projesinde oluşturur — kullanıcı adı "admin", şifre proje
// sahibinin kendi seçimi. Bu hesabın var olması ve sohbetlere salt-okunur
// erişimi ObsidianVault/Changelog.md'de ve uygulama içinde (her sohbet
// ekranında görünen "🔒 Bu sohbet yönetici hesabı tarafından da
// görüntülenebilir" uyarısı) açıkça belirtilir — sessiz/gizli bir arka kapı
// DEĞİLDİR.
//
// userService.ts'teki usernameToEmail() ile birebir aynı sentetik e-posta
// kuralı kullanılır: "admin" -> "admin@gizlichat.local".
//
// serviceAccountKey.json proje kökünde olmalı (Firebase Console > Project
// Settings > Service accounts > Generate new private key). Bu dosya asla
// git'e commit edilmez (.gitignore'da).
//
// Tekrar çalıştırılırsa (hesap zaten varsa) hata vermez — mevcut hesabı
// bulur, Firestore'daki `role: 'admin'` alanını (yoksa) yazar ve uid'yi
// yine basar.

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'kaanadmin123';
const ADMIN_EMAIL = 'admin@gizlichat.local'; // usernameToEmail('admin') ile birebir aynı

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));

const app = initializeApp({
  credential: cert(serviceAccount),
});

async function main() {
  const auth = getAuth(app);
  const db = getFirestore(app);

  let uid;
  try {
    const created = await auth.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      emailVerified: true,
    });
    uid = created.uid;
    console.log(`Yönetici hesabı oluşturuldu (uid: ${uid}).`);
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      const existing = await auth.getUserByEmail(ADMIN_EMAIL);
      uid = existing.uid;
      console.log(`Yönetici hesabı zaten vardı, mevcut kayıt kullanılıyor (uid: ${uid}).`);
    } else {
      throw error;
    }
  }

  const userDocRef = db.collection('users').doc(uid);
  const snap = await userDocRef.get();
  await userDocRef.set(
    {
      username: ADMIN_USERNAME,
      usernameLower: ADMIN_USERNAME.toLowerCase(),
      createdAt: snap.exists && typeof snap.data().createdAt === 'number' ? snap.data().createdAt : Date.now(),
      role: 'admin',
    },
    { merge: true },
  );
  console.log(`Firestore users/${uid} dokümanı yazıldı (role: 'admin').`);

  console.log('\n--- ADMIN_UID (tüm istemcilerde birebir aynı olmalı) ---');
  console.log(uid);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Hata:', err.message);
    process.exit(1);
  });
