const express = require('express');
const { body, param } = require('express-validator');
const db = require('../db');
const { handleValidation } = require('../middleware/validate');
const { requireAuth, requireRole, requireCsrf } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');

const router = express.Router();

router.use(requireAuth);

// GET /api/pegawai - semua user login boleh melihat daftar pegawai
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT id, nama, satker, aktif FROM pegawai ORDER BY nama ASC')
    .all();
  res.json({ data: rows });
});

// GET /api/pegawai/:id
router.get(
  '/:id',
  [param('id').isInt().withMessage('ID tidak valid.')],
  handleValidation,
  (req, res) => {
    const row = db.prepare('SELECT * FROM pegawai WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Pegawai tidak ditemukan.' });
    res.json({ data: row });
  }
);

// POST /api/pegawai - hanya admin
router.post(
  '/',
  requireRole('admin'),
  requireCsrf,
  [
    body('nama').trim().isLength({ min: 2 }).withMessage('Nama minimal 2 karakter.'),
    body('satker').optional().trim()
  ],
  handleValidation,
  (req, res) => {
    const { nama, satker } = req.body;
    const info = db
      .prepare('INSERT INTO pegawai (nama, satker) VALUES (?, ?)')
      .run(nama, satker || 'Itwil III');
    logActivity(req, 'CREATE', 'pegawai', info.lastInsertRowid, { nama, satker });
    const created = db.prepare('SELECT * FROM pegawai WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ data: created });
  }
);

// PUT /api/pegawai/:id - hanya admin
router.put(
  '/:id',
  requireRole('admin'),
  requireCsrf,
  [
    param('id').isInt().withMessage('ID tidak valid.'),
    body('nama').trim().isLength({ min: 2 }).withMessage('Nama minimal 2 karakter.'),
    body('satker').optional().trim(),
    body('aktif').optional().isBoolean().withMessage('Nilai aktif harus boolean.')
  ],
  handleValidation,
  (req, res) => {
    const existing = db.prepare('SELECT * FROM pegawai WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Pegawai tidak ditemukan.' });

    const nama = req.body.nama;
    const satker = req.body.satker ?? existing.satker;
    const aktif = req.body.aktif === undefined ? existing.aktif : req.body.aktif ? 1 : 0;

    db.prepare(
      "UPDATE pegawai SET nama = ?, satker = ?, aktif = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(nama, satker, aktif, req.params.id);

    logActivity(req, 'UPDATE', 'pegawai', req.params.id, { nama, satker, aktif });
    const updated = db.prepare('SELECT * FROM pegawai WHERE id = ?').get(req.params.id);
    res.json({ data: updated });
  }
);

// DELETE /api/pegawai/:id - hanya admin
router.delete(
  '/:id',
  requireRole('admin'),
  requireCsrf,
  [param('id').isInt().withMessage('ID tidak valid.')],
  handleValidation,
  (req, res) => {
    const existing = db.prepare('SELECT * FROM pegawai WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Pegawai tidak ditemukan.' });

    db.prepare('DELETE FROM pegawai WHERE id = ?').run(req.params.id);
    logActivity(req, 'DELETE', 'pegawai', req.params.id, { nama: existing.nama });
    res.json({ message: 'Pegawai berhasil dihapus.' });
  }
);

module.exports = router;
