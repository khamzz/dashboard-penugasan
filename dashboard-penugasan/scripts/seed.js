require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/db');

const PEGAWAI_AWAL = [
  'Chinggih', 'Sigit', 'Husain', 'Busan', 'Silvia', 'Wiji', 'Aji', 'Ihsan',
  'Azis', 'Afif', 'Maya', 'Ela', 'Elok', 'Faiz', 'Monic', 'Denis', 'Iqbal',
  'Ninu', 'Salsa'
];

function seedPegawai() {
  const insert = db.prepare('INSERT INTO pegawai (nama, satker) VALUES (?, ?)');
  const existingCount = db.prepare('SELECT COUNT(*) AS n FROM pegawai').get().n;
  if (existingCount > 0) {
    console.log(`- Lewati seed pegawai (sudah ada ${existingCount} data).`);
    return;
  }
  const insertMany = db.transaction((names) => {
    names.forEach((nama) => insert.run(nama, 'Itwil III'));
  });
  insertMany(PEGAWAI_AWAL);
  console.log(`- ${PEGAWAI_AWAL.length} data pegawai awal berhasil dibuat.`);
}

function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  const nama = process.env.ADMIN_NAMA || 'Administrator';

  if (!password || password.length < 8) {
    console.error('[ERROR] ADMIN_PASSWORD di .env belum diatur atau kurang dari 8 karakter. Seed admin dibatalkan.');
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    console.log(`- Lewati seed admin (username "${username}" sudah ada).`);
    return;
  }

  const hash = bcrypt.hashSync(password, 12);
  db.prepare(
    'INSERT INTO users (username, password_hash, nama, role, must_change_password) VALUES (?, ?, ?, ?, 1)'
  ).run(username, hash, nama, 'admin');
  console.log(`- Akun admin "${username}" berhasil dibuat. WAJIB ganti password setelah login pertama.`);
}

console.log('Menjalankan seed data awal...');
seedPegawai();
seedAdmin();
console.log('Selesai.');
