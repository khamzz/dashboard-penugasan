const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const db = require('../db');
const { handleValidation } = require('../middleware/validate');
const { requireAuth, requireCsrf, COOKIE_NAME } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');

const router = express.Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;
const PASSWORD_MIN_LENGTH = 8;

function isProd() {
  return process.env.NODE_ENV === 'production';
}

function issueSessionCookies(res, user) {
  const token = jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
  const csrfToken = crypto.randomBytes(24).toString('hex');

  const cookieOpts = {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000
  };

  res.cookie(COOKIE_NAME, token, cookieOpts);
  // csrf_token TIDAK httpOnly agar bisa dibaca JS dan dikirim balik lewat header
  res.cookie('csrf_token', csrfToken, { ...cookieOpts, httpOnly: false });
}

// POST /api/auth/login
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username wajib diisi.'),
    body('password').notEmpty().withMessage('Password wajib diisi.')
  ],
  handleValidation,
  (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    const genericError = 'Username atau password salah.';

    if (!user || !user.aktif) {
      logActivity(req, 'LOGIN_FAILED', 'auth', null, `username=${username} (tidak ditemukan/nonaktif)`);
      return res.status(401).json({ error: genericError });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutes = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      logActivity(req, 'LOGIN_BLOCKED', 'auth', user.id, `Akun terkunci, sisa ${minutes} menit`);
      return res.status(423).json({
        error: `Akun terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam ${minutes} menit.`
      });
    }

    const passwordOk = bcrypt.compareSync(password, user.password_hash);

    if (!passwordOk) {
      const attempts = user.failed_attempts + 1;
      let lockedUntil = null;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        lockedUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60000).toISOString();
      }
      db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(
        attempts,
        lockedUntil,
        user.id
      );
      logActivity(req, 'LOGIN_FAILED', 'auth', user.id, `Percobaan ke-${attempts}`);

      if (lockedUntil) {
        return res.status(423).json({
          error: `Terlalu banyak percobaan gagal. Akun dikunci selama ${LOCK_DURATION_MINUTES} menit.`
        });
      }
      return res.status(401).json({ error: genericError });
    }

    // Login berhasil: reset counter & catat waktu login
    db.prepare(
      'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = datetime(\'now\') WHERE id = ?'
    ).run(user.id);

    issueSessionCookies(res, user);
    logActivity(req, 'LOGIN', 'auth', user.id);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        nama: user.nama,
        role: user.role,
        pegawai_id: user.pegawai_id,
        must_change_password: !!user.must_change_password
      }
    });
  }
);

// POST /api/auth/logout
router.post('/logout', requireAuth, requireCsrf, (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.clearCookie('csrf_token');
  logActivity(req, 'LOGOUT', 'auth', req.user.id);
  res.json({ message: 'Berhasil logout.' });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db
    .prepare('SELECT id, username, nama, role, pegawai_id, must_change_password FROM users WHERE id = ?')
    .get(req.user.id);
  res.json({ user });
});

// POST /api/auth/change-password
router.post(
  '/change-password',
  requireAuth,
  requireCsrf,
  [
    body('current_password').notEmpty().withMessage('Password saat ini wajib diisi.'),
    body('new_password')
      .isLength({ min: PASSWORD_MIN_LENGTH })
      .withMessage(`Password baru minimal ${PASSWORD_MIN_LENGTH} karakter.`)
      .matches(/[A-Z]/)
      .withMessage('Password baru harus mengandung minimal satu huruf besar.')
      .matches(/[0-9]/)
      .withMessage('Password baru harus mengandung minimal satu angka.')
  ],
  handleValidation,
  (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const ok = bcrypt.compareSync(req.body.current_password, user.password_hash);
    if (!ok) {
      logActivity(req, 'CHANGE_PASSWORD_FAILED', 'user', user.id);
      return res.status(401).json({ error: 'Password saat ini tidak sesuai.' });
    }
    const newHash = bcrypt.hashSync(req.body.new_password, 12);
    db.prepare(
      "UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?"
    ).run(newHash, user.id);
    logActivity(req, 'CHANGE_PASSWORD', 'user', user.id);
    res.json({ message: 'Password berhasil diubah.' });
  }
);

module.exports = router;
