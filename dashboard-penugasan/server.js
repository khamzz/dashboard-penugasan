require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('ganti_dengan')) {
  console.error(
    '\n[FATAL] JWT_SECRET belum diatur dengan benar di file .env.\n' +
    'Buat secret acak, misalnya dengan menjalankan:\n' +
    '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n' +
    'lalu tempelkan hasilnya sebagai JWT_SECRET di file .env sebelum menjalankan server.\n'
  );
  process.exit(1);
}

const authRoutes = require('./src/routes/auth.routes');
const pegawaiRoutes = require('./src/routes/pegawai.routes');
const penugasanRoutes = require('./src/routes/penugasan.routes');
const dashboardRoutes = require('./src/routes/dashboard.routes');
const usersRoutes = require('./src/routes/users.routes');

const app = express();

// Di belakang reverse proxy (nginx dll) agar req.ip & secure cookie terdeteksi benar
app.set('trust proxy', 1);

// --- Keamanan dasar ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"]
    }
  }
}));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

// Batasi jumlah request untuk mencegah brute force / abuse, khusus endpoint auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan. Silakan coba lagi beberapa saat lagi.' }
});
app.use('/api/auth/login', authLimiter);

// Rate limit umum untuk seluruh API
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', apiLimiter);

// --- Routes API ---
app.use('/api/auth', authRoutes);
app.use('/api/pegawai', pegawaiRoutes);
app.use('/api/penugasan', penugasanRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', usersRoutes);

// --- Frontend statis ---
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Penanganan error terpusat ---
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server. Silakan coba lagi.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Dashboard Pemantauan Penugasan berjalan di http://localhost:${PORT}`);
});
