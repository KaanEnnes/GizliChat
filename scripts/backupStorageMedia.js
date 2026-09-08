// One-off: downloads every file under rooms/*/media/* in Firebase Storage to
// a local folder, preserving the room/kind/fileName path structure. Read-only
// — does not touch or delete anything in Storage. See scripts/publishAndroidUpdate.js
// for the same serviceAccountKey.json auth pattern.
//
// Kullanım: node scripts/backupStorageMedia.js [hedef-klasör]
// (hedef-klasör verilmezse ./storage-backup kullanılır)

const { initializeApp, cert } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');
const path = require('path');
const fs = require('fs');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
const BUCKET = 'kaanchatmercan.firebasestorage.app';
const destRoot = path.resolve(process.argv[2] || path.join(__dirname, '..', 'storage-backup'));

const app = initializeApp({
  credential: cert(serviceAccount),
  storageBucket: BUCKET,
});

async function main() {
  const bucket = getStorage(app).bucket();
  const [files] = await bucket.getFiles({ prefix: 'rooms/' });
  console.log(`${files.length} dosya bulundu, indiriliyor -> ${destRoot}`);

  let done = 0;
  let totalBytes = 0;
  for (const file of files) {
    const destPath = path.join(destRoot, file.name);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    await file.download({ destination: destPath });
    const stat = fs.statSync(destPath);
    totalBytes += stat.size;
    done += 1;
    console.log(`[${done}/${files.length}] ${file.name} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
  }

  console.log(`\nTamamlandı: ${done} dosya, toplam ${(totalBytes / 1024 / 1024).toFixed(1)} MB, klasör: ${destRoot}`);
}

main().catch(error => {
  console.error('Yedekleme başarısız:', error.message);
  process.exit(1);
});
