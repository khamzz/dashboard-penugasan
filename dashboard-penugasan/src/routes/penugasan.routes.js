const express = require('express');
const { body, param, query } = require('express-validator');
const db = require('../db');
const { handleValidation } = require('../middleware/validate');
const { requireAuth, requireCsrf } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');

const router = express.Router();

const KATEGORI = ['Audit', 'Telaah', 'Reviu', 'Evaluasi', 'Consulting', 'Koordinasi', 'Pendampingan', 'Diklat'];
const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];
const STATUS = ['Belum Mulai', 'Progres', 'Selesai'];
const KESIMPULAN = ['Tepat Waktu', 'Terlambat', 'Belum Selesai'];

router.use(requireAuth);

function canModify(req, row) {
  if (req.user.role === 'admin') return true;
  return row.pegawai_id === req.user.pegawai_id;
}

// GET /api/penugasan?bulan=&kategori=&status=&pegawai_id=&page=&limit=
router.get(
  '/',
  [
    query('bulan').optional().isIn(BULAN),
    query('kategori').optional().isIn(KATEGORI),
    query('status').optional().isIn(STATUS),
    query('pegawai_id').optional().isInt(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 })
  ],
  handleValidation,
  (req, res) => {
    const { bulan, kategori, status, pegawai_id } = req.query;
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '50', 10);
    const offset = (page - 1) * limit;

    const where = [];
    const params = {};
    if (bulan) { where.push('p.bulan = @bulan'); params.bulan = bulan; }
    if (kategori) { where.push('p.kategori = @kategori'); params.kategori = kategori; }
    if (status) { where.push('p.status = @status'); params.status = status; }
    if (pegawai_id) { where.push('p.pegawai_id = @pegawai_id'); params.pegawai_id = pegawai_id; }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = db
      .prepare(
        `SELECT p.*, pg.nama AS nama_pegawai
         FROM penugasan p
         JOIN pegawai pg ON pg.id = p.pegawai_id
         ${whereSql}
         ORDER BY p.created_at DESC
         LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit, offset });

    const total = db
      .prepare(`SELECT COUNT(*) AS total FROM penugasan p ${whereSql}`)
      .get(params).total;

    res.json({ data: rows, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } });
  }
);

// GET /api/penugasan/:id
router.get(
  '/:id',
  [param('id').isInt().withMessage('ID tidak valid.')],
  handleValidation,
  (req, res) => {
    const row = db
      .prepare(
        `SELECT p.*, pg.nama AS nama_pegawai FROM penugasan p
         JOIN pegawai pg ON pg.id = p.pegawai_id WHERE p.id = ?`
      )
      .get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Penugasan tidak ditemukan.' });
    res.json({ data: row });
  }
);

const bodyRules = [
  body('nama_penugasan').trim().isLength({ min: 5 }).withMessage('Nama penugasan minimal 5 karakter.'),
  body('kategori').isIn(KATEGORI).withMessage('Kategori tidak valid.'),
  body('bulan').isIn(BULAN).withMessage('Bulan tidak valid.'),
  body('status').isIn(STATUS).withMessage('Status tidak valid.'),
  body('progres_persen').optional().isInt({ min: 0, max: 100 }).withMessage('Progres harus 0-100.'),
  body('kesimpulan').optional({ nullable: true }).isIn(KESIMPULAN).withMessage('Kesimpulan tidak valid.'),
  body('tanggal_mulai').optional({ nullable: true }).isISO8601().withMessage('Format tanggal mulai tidak valid.'),
  body('tanggal_selesai').optional({ nullable: true }).isISO8601().withMessage('Format tanggal selesai tidak valid.'),
  body('catatan').optional({ nullable: true }).trim().isLength({ max: 2000 }).withMessage('Catatan maksimal 2000 karakter.')
];

// POST /api/penugasan
router.post(
  '/',
  requireCsrf,
  [
    body('pegawai_id').isInt().withMessage('Pegawai wajib dipilih.'),
    ...bodyRules
  ],
  handleValidation,
  (req, res) => {
    const pegawaiId = parseInt(req.body.pegawai_id, 10);

    // pegawai role hanya boleh membuat penugasan untuk dirinya sendiri
    if (req.user.role !== 'admin' && pegawaiId !== req.user.pegawai_id) {
      return res.status(403).json({ error: 'Anda hanya dapat membuat penugasan untuk diri sendiri.' });
    }

    const pegawaiExists = db.prepare('SELECT id FROM pegawai WHERE id = ?').get(pegawaiId);
    if (!pegawaiExists) return res.status(400).json({ error: 'Pegawai tidak ditemukan.' });

    const {
      nama_penugasan, kategori, bulan, status,
      progres_persen = 0, kesimpulan = null,
      tanggal_mulai = null, tanggal_selesai = null, catatan = null
    } = req.body;

    const info = db
      .prepare(
        `INSERT INTO penugasan
         (pegawai_id, nama_penugasan, kategori, bulan, status, progres_persen, kesimpulan, tanggal_mulai, tanggal_selesai, catatan, created_by, updated_by)
         VALUES (@pegawai_id, @nama_penugasan, @kategori, @bulan, @status, @progres_persen, @kesimpulan, @tanggal_mulai, @tanggal_selesai, @catatan, @user_id, @user_id)`
      )
      .run({
        pegawai_id: pegawaiId, nama_penugasan, kategori, bulan, status,
        progres_persen, kesimpulan, tanggal_mulai, tanggal_selesai, catatan,
        user_id: req.user.id
      });

    logActivity(req, 'CREATE', 'penugasan', info.lastInsertRowid, { nama_penugasan, pegawai_id: pegawaiId });
    const created = db.prepare('SELECT * FROM penugasan WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ data: created });
  }
);

// PUT /api/penugasan/:id
router.put(
  '/:id',
  requireCsrf,
  [param('id').isInt().withMessage('ID tidak valid.'), ...bodyRules],
  handleValidation,
  (req, res) => {
    const existing = db.prepare('SELECT * FROM penugasan WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Penugasan tidak ditemukan.' });
    if (!canModify(req, existing)) {
      return res.status(403).json({ error: 'Anda tidak memiliki izin untuk mengubah penugasan milik pegawai lain.' });
    }

    const {
      nama_penugasan, kategori, bulan, status,
      progres_persen = existing.progres_persen,
      kesimpulan = existing.kesimpulan,
      tanggal_mulai = existing.tanggal_mulai,
      tanggal_selesai = existing.tanggal_selesai,
      catatan = existing.catatan
    } = req.body;

    db.prepare(
      `UPDATE penugasan SET
        nama_penugasan = @nama_penugasan, kategori = @kategori, bulan = @bulan, status = @status,
        progres_persen = @progres_persen, kesimpulan = @kesimpulan,
        tanggal_mulai = @tanggal_mulai, tanggal_selesai = @tanggal_selesai, catatan = @catatan,
        updated_by = @user_id, updated_at = datetime('now')
       WHERE id = @id`
    ).run({
      nama_penugasan, kategori, bulan, status, progres_persen, kesimpulan,
      tanggal_mulai, tanggal_selesai, catatan, user_id: req.user.id, id: req.params.id
    });

    logActivity(req, 'UPDATE', 'penugasan', req.params.id, { nama_penugasan, status });
    const updated = db.prepare('SELECT * FROM penugasan WHERE id = ?').get(req.params.id);
    res.json({ data: updated });
  }
);

// DELETE /api/penugasan/:id
router.delete(
  '/:id',
  requireCsrf,
  [param('id').isInt().withMessage('ID tidak valid.')],
  handleValidation,
  (req, res) => {
    const existing = db.prepare('SELECT * FROM penugasan WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Penugasan tidak ditemukan.' });
    if (!canModify(req, existing)) {
      return res.status(403).json({ error: 'Anda tidak memiliki izin untuk menghapus penugasan milik pegawai lain.' });
    }

    db.prepare('DELETE FROM penugasan WHERE id = ?').run(req.params.id);
    logActivity(req, 'DELETE', 'penugasan', req.params.id, { nama_penugasan: existing.nama_penugasan });
    res.json({ message: 'Penugasan berhasil dihapus.' });
  }
);

module.exports = router;
