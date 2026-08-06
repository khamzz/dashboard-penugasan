const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || './data/dashboard.db';
const absPath = path.resolve(DB_PATH);
fs.mkdirSync(path.dirname(absPath), { recursive: true });

const db = new Database(absPath);

// Keamanan & keandalan tingkat koneksi
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS pegawai (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  satker TEXT NOT NULL DEFAULT 'Itwil III',
  aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nama TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','pegawai')) DEFAULT 'pegawai',
  pegawai_id INTEGER REFERENCES pegawai(id) ON DELETE SET NULL,
  aktif INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS penugasan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pegawai_id INTEGER NOT NULL REFERENCES pegawai(id) ON DELETE CASCADE,
  nama_penugasan TEXT NOT NULL,
  kategori TEXT NOT NULL CHECK (kategori IN ('Audit','Telaah','Reviu','Evaluasi','Consulting','Koordinasi','Pendampingan','Diklat')),
  bulan TEXT NOT NULL CHECK (bulan IN ('Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember')),
  tanggal_mulai TEXT,
  tanggal_selesai TEXT,
  status TEXT NOT NULL CHECK (status IN ('Belum Mulai','Progres','Selesai')) DEFAULT 'Belum Mulai',
  progres_persen INTEGER NOT NULL DEFAULT 0 CHECK (progres_persen BETWEEN 0 AND 100),
  kesimpulan TEXT CHECK (kesimpulan IN ('Tepat Waktu','Terlambat','Belum Selesai') OR kesimpulan IS NULL),
  catatan TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username TEXT,
  aksi TEXT NOT NULL,
  entitas TEXT NOT NULL,
  entitas_id INTEGER,
  detail TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_penugasan_pegawai ON penugasan(pegawai_id);
CREATE INDEX IF NOT EXISTS idx_penugasan_bulan ON penugasan(bulan);
CREATE INDEX IF NOT EXISTS idx_penugasan_status ON penugasan(status);
CREATE INDEX IF NOT EXISTS idx_penugasan_kategori ON penugasan(kategori);
`);

module.exports = db;
