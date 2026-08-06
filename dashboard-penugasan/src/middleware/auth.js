const jwt = require('jsonwebtoken');
const db = require('../db');

const COOKIE_NAME = 'session_token';

/**
 * Memverifikasi token JWT yang dikirim lewat httpOnly cookie.
 * Menolak akses jika token tidak ada / tidak valid / user sudah dinonaktifkan.
 */
function requireAuth(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (!token) {
    return res.status(401).json({ error: 'Anda belum login. Silakan login terlebih dahulu.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Sesi login tidak valid atau sudah kedaluwarsa. Silakan login kembali.' });
  }

  const user = db.prepare('SELECT id, username, nama, role, pegawai_id, aktif FROM users WHERE id = ?').get(payload.sub);
  if (!user || !user.aktif) {
    return res.status(401).json({ error: 'Akun tidak ditemukan atau telah dinonaktifkan.' });
  }

  req.user = user;
  next();
}

/**
 * Membatasi akses hanya untuk role tertentu, mis. requireRole('admin').
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Anda tidak memiliki izin untuk melakukan aksi ini.' });
    }
    next();
  };
}

/**
 * Proteksi CSRF sederhana (double-submit token) untuk request yang mengubah data.
 * Frontend mengirim header X-CSRF-Token yang harus sama dengan cookie csrf_token.
 */
function requireCsrf(req, res, next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'];
  if (safe.includes(req.method)) return next();

  const cookieToken = req.cookies ? req.cookies['csrf_token'] : null;
  const headerToken = req.get('X-CSRF-Token');

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'Permintaan ditolak (validasi CSRF gagal). Muat ulang halaman dan coba lagi.' });
  }
  next();
}

module.exports = { requireAuth, requireRole, requireCsrf, COOKIE_NAME };
