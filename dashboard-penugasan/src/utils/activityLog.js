const db = require('../db');

const insertLog = db.prepare(`
  INSERT INTO activity_log (user_id, username, aksi, entitas, entitas_id, detail, ip_address)
  VALUES (@user_id, @username, @aksi, @entitas, @entitas_id, @detail, @ip_address)
`);

/**
 * Mencatat aktivitas penting untuk keperluan audit trail.
 * @param {object} req - Express request (untuk mengambil user & IP)
 * @param {string} aksi - mis. 'LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'LOGIN_FAILED'
 * @param {string} entitas - mis. 'penugasan', 'pegawai', 'user', 'auth'
 * @param {number|null} entitasId
 * @param {string} [detail]
 */
function logActivity(req, aksi, entitas, entitasId = null, detail = '') {
  try {
    insertLog.run({
      user_id: req.user ? req.user.id : null,
      username: req.user ? req.user.username : (req.body && req.body.username) || null,
      aksi,
      entitas,
      entitas_id: entitasId,
      detail: typeof detail === 'string' ? detail : JSON.stringify(detail),
      ip_address: req.ip
    });
  } catch (err) {
    // Logging tidak boleh menggagalkan request utama
    console.error('Gagal menulis activity log:', err.message);
  }
}

module.exports = { logActivity };
