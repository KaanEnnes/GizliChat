// Kullanım: node scripts/generateLoginToken.js <kullaniciAdi>
//
// Kullanıcının şifresine dokunmadan, o hesap için ~1 saat geçerli tek seferlik
// bir giriş kodu (Firebase custom token) üretir. Kod web-client'taki "Şifreni
// mi unuttun?" ekranına yapıştırılınca kullanıcı şifresiz giriş yapabilir;
// gerçek şifresi hiç değişmez/görünmez.
//
// serviceAccountKey.json proje kökünde olmalı (Firebase Console > Project
// Settings > Service accounts > Generate new private key). Bu dosya asla
// git'e commit edilmez.

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const [, , username] = process.argv;

if (!username) {
  console.error('Kullanım: node scripts/generateLoginToken.js <kullaniciAdi>');
  process.exit(1);
}

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));

const app = initializeApp({
  credential: cert(serviceAccount),
});

async function main() {
  const db = getFirestore(app);
  const usernameLower = username.trim().toLowerCase();

  const snapshot = await db
    .collection('users')
    .where('usernameLower', '==', usernameLower)
    .limit(1)
    .get();

  if (snapshot.empty) {
    console.error(`"${username}" adında bir kullanıcı bulunamadı.`);
    process.exit(1);
  }

  const uid = snapshot.docs[0].id;
  const token = await getAuth(app).createCustomToken(uid);

  console.log(`"${username}" (uid: ${uid}) için kurtarma kodu (~1 saat geçerli):\n`);
  console.log(token);
}

main().catch((err) => {
  console.error('Hata:', err.message);
  process.exit(1);
});
