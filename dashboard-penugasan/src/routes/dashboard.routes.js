const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

// GET /api/dashboard/summary - ringkasan menyeluruh untuk halaman dashboard
router.get('/summary', (req, res) => {
  const totalPegawai = db.prepare('SELECT COUNT(*) AS n FROM pegawai WHERE aktif = 1').get().n;
  const totalPenugasan = db.prepare('SELECT COUNT(*) AS n FROM penugasan').get().n;

  const statusRows = db
    .prepare('SELECT status, COUNT(*) AS jumlah FROM penugasan GROUP BY status')
    .all();
  const statusMap = { 'Belum Mulai': 0, 'Progres': 0, 'Selesai': 0 };
  statusRows.forEach((r) => { statusMap[r.status] = r.jumlah; });

  const kategoriRows = db
    .prepare('SELECT kategori, COUNT(*) AS jumlah FROM penugasan GROUP BY kategori ORDER BY jumlah DESC')
    .all();

  const kesimpulanRows = db
    .prepare("SELECT kesimpulan, COUNT(*) AS jumlah FROM penugasan WHERE kesimpulan IS NOT NULL GROUP BY kesimpulan")
    .all();

  const perBulanRaw = db
    .prepare('SELECT bulan, COUNT(*) AS jumlah FROM penugasan GROUP BY bulan')
    .all();
  const perBulanMap = Object.fromEntries(BULAN.map((b) => [b, 0]));
  perBulanRaw.forEach((r) => { perBulanMap[r.bulan] = r.jumlah; });

  const perIndividu = db
    .prepare(
      `SELECT pg.id AS pegawai_id, pg.nama,
        COUNT(p.id) AS jumlah_penugasan,
        SUM(CASE WHEN p.status = 'Belum Mulai' THEN 1 ELSE 0 END) AS belum_mulai,
        SUM(CASE WHEN p.status = 'Progres' THEN 1 ELSE 0 END) AS progres,
        SUM(CASE WHEN p.status = 'Selesai' THEN 1 ELSE 0 END) AS selesai
       FROM pegawai pg
       LEFT JOIN penugasan p ON p.pegawai_id = pg.id
       WHERE pg.aktif = 1
       GROUP BY pg.id, pg.nama
       ORDER BY pg.nama ASC`
    )
    .all();

  res.json({
    data: {
      total_pegawai: totalPegawai,
      total_penugasan: totalPenugasan,
      status: statusMap,
      kategori: kategoriRows,
      kesimpulan: kesimpulanRows,
      per_bulan: perBulanMap,
      per_individu: perIndividu
    }
  });
});

module.exports = router;
