// Kullanım: node scripts/publishAndroidUpdate.js <versionCode> <versionName> <apkUrl> <notes>
//
// firestore.rules'ta app_config/android dokümanına "allow write: if false" var
// (bilerek — sadece elle/güvenilir bir yoldan değiştirilsin diye), bu yüzden
// istemciden asla yazılamaz. Bu script serviceAccountKey.json ile Admin SDK
// üzerinden bağlanıp o kuralı bypass eder (Console'dan elle yapmanın otomatik
// hali). APK dosyası hosting'e deploy edilip URL çalışır hâle gelmeden bu
// script çalıştırılmamalı — aksi hâlde eski cihazlardaki "güncelleme var"
// banner'ı henüz var olmayan bir dosyaya işaret eder.

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const [, , versionCodeArg, versionName, apkUrl, notes] = process.argv;

if (!versionCodeArg || !versionName || !apkUrl) {
  console.error('Kullanım: node scripts/publishAndroidUpdate.js <versionCode> <versionName> <apkUrl> [notes]');
  process.exit(1);
}

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));

const app = initializeApp({
  credential: cert(serviceAccount),
});

async function main() {
  const db = getFirestore(app);
  await db.collection('app_config').doc('android').set(
    {
      versionCode: Number(versionCodeArg),
      versionName,
      apkUrl,
      notes: notes || '',
    },
    { merge: true },
  );
  console.log(`app_config/android güncellendi: versionCode=${versionCodeArg}, versionName=${versionName}, apkUrl=${apkUrl}`);
  process.exit(0);
}

main().catch(error => {
  console.error('Güncelleme başarısız:', error.message);
  process.exit(1);
});
