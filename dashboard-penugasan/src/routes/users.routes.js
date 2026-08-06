const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { body, param } = require('express-validator');
const db = require('../db');
const { handleValidation } = require('../middleware/validate');
const { requireAuth, requireRole, requireCsrf } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

// GET /api/users - hanya admin, tidak pernah mengembalikan password_hash
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.nama, u.role, u.pegawai_id, u.aktif, u.last_login_at, u.must_change_password,
              pg.nama AS nama_pegawai
       FROM users u LEFT JOIN pegawai pg ON pg.id = u.pegawai_id
       ORDER BY u.username ASC`
    )
    .all();
  res.json({ data: rows });
});

function generateTempPassword() {
  // Password sementara acak & mudah dibaca (menghindari karakter ambigu 0/O, 1/l)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  let pass = '';
  for (let i = 0; i < 12; i++) pass += chars[crypto.randomInt(chars.length)];
  return pass;
}

// POST /api/users - membuat akun baru (admin atau pegawai)
router.post(
  '/',
  requireCsrf,
  [
    body('username').trim().isLength({ min: 3 }).withMessage('Username minimal 3 karakter.')
      .matches(/^[a-zA-Z0-9._-]+$/).withMessage('Username hanya boleh huruf, angka, titik, garis bawah, atau strip.'),
    body('nama').trim().isLength({ min: 2 }).withMessage('Nama minimal 2 karakter.'),
    body('role').isIn(['admin', 'pegawai']).withMessage('Role tidak valid.'),
    body('pegawai_id').optional({ nullable: true }).isInt().withMessage('Pegawai tidak valid.')
  ],
  handleValidation,
  (req, res) => {
    const { username, nama, role } = req.body;
    const pegawaiId = req.body.pegawai_id || null;

    const dupe = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (dupe) return res.status(409).json({ error: 'Username sudah digunakan.' });

    if (pegawaiId) {
      const pg = db.prepare('SELECT id FROM pegawai WHERE id = ?').get(pegawaiId);
      if (!pg) return res.status(400).json({ error: 'Pegawai tidak ditemukan.' });
    }

    const tempPassword = generateTempPassword();
    const hash = bcrypt.hashSync(tempPassword, 12);

    const info = db
      .prepare(
        `INSERT INTO users (username, password_hash, nama, role, pegawai_id, must_change_password)
         VALUES (?, ?, ?, ?, ?, 1)`
      )
      .run(username, hash, nama, role, pegawaiId);

    logActivity(req, 'CREATE', 'user', info.lastInsertRowid, { username, role });

    // Password sementara HANYA ditampilkan sekali di response ini, tidak pernah disimpan dalam bentuk plain text
    res.status(201).json({
      data: { id: info.lastInsertRowid, username, nama, role, pegawai_id: pegawaiId },
      temp_password: tempPassword,
      note: 'Simpan password sementara ini dan berikan ke pegawai secara aman. Pegawai wajib menggantinya saat login pertama.'
    });
  }
);

// PUT /api/users/:id - update profil/role/status (tidak mengubah password)
router.put(
  '/:id',
  requireCsrf,
  [
    param('id').isInt(),
    body('nama').trim().isLength({ min: 2 }).withMessage('Nama minimal 2 karakter.'),
    body('role').isIn(['admin', 'pegawai']).withMessage('Role tidak valid.'),
    body('pegawai_id').optional({ nullable: true }).isInt(),
    body('aktif').optional().isBoolean()
  ],
  handleValidation,
  (req, res) => {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'User tidak ditemukan.' });

    const nama = req.body.nama;
    const role = req.body.role;
    const pegawaiId = req.body.pegawai_id ?? existing.pegawai_id;
    const aktif = req.body.aktif === undefined ? existing.aktif : req.body.aktif ? 1 : 0;

    db.prepare(
      "UPDATE users SET nama = ?, role = ?, pegawai_id = ?, aktif = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(nama, role, pegawaiId, aktif, req.params.id);

    logActivity(req, 'UPDATE', 'user', req.params.id, { nama, role, aktif });
    const updated = db
      .prepare('SELECT id, username, nama, role, pegawai_id, aktif FROM users WHERE id = ?')
      .get(req.params.id);
    res.json({ data: updated });
  }
);

// POST /api/users/:id/reset-password - admin mereset password pegawai lain
router.post(
  '/:id/reset-password',
  requireCsrf,
  [param('id').isInt()],
  handleValidation,
  (req, res) => {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'User tidak ditemukan.' });

    const tempPassword = generateTempPassword();
    const hash = bcrypt.hashSync(tempPassword, 12);
    db.prepare(
      "UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?"
    ).run(hash, req.params.id);

    logActivity(req, 'RESET_PASSWORD', 'user', req.params.id);
    res.json({
      message: 'Password berhasil direset.',
      temp_password: tempPassword,
      note: 'Berikan password sementara ini ke pegawai secara aman. Wajib diganti saat login berikutnya.'
    });
  }
);

// DELETE /api/users/:id
router.delete(
  '/:id',
  requireCsrf,
  [param('id').isInt()],
  handleValidation,
  (req, res) => {
    if (parseInt(req.params.id, 10) === req.user.id) {
      return res.status(400).json({ error: 'Anda tidak dapat menghapus akun Anda sendiri.' });
    }
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'User tidak ditemukan.' });

    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    logActivity(req, 'DELETE', 'user', req.params.id, { username: existing.username });
    res.json({ message: 'User berhasil dihapus.' });
  }
);

module.exports = router;
