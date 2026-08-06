# Dashboard Pemantauan Penugasan — Inspektorat Wilayah III

Aplikasi web CRUD untuk memantau penugasan pengawasan pegawai, menggantikan
file Excel `Dashboard_Pemantauan_Penugasan_2025.xlsx`. Dibangun dengan
Node.js + Express + SQLite, sudah termasuk sistem login dengan keamanan
berlapis, dan siap di-hosting sendiri (VPS, cPanel Node, atau layanan
seperti Railway/Render).

## Fitur

- **Login aman**: password di-hash dengan bcrypt, sesi berbasis JWT di
  httpOnly cookie, proteksi CSRF, rate limiting, dan penguncian akun
  otomatis setelah 5 kali gagal login berturut-turut.
- **CRUD Penugasan**: tambah/ubah/hapus penugasan lengkap dengan kategori,
  bulan, status, progres (%), dan kesimpulan (tepat waktu/terlambat).
- **CRUD Data Pegawai** dan **Manajemen Akun Pengguna** (khusus admin).
- **Role-based access**: role `admin` mengelola semua data; role `pegawai`
  hanya bisa mengubah/menghapus penugasan miliknya sendiri, namun tetap
  bisa melihat rekap seluruh unit.
- **Dashboard ringkasan**: total status, rekap per kategori, per bulan, dan
  per individu — mengikuti struktur dashboard Excel aslinya.
- **Audit trail**: setiap login, perubahan, dan penghapusan data dicatat di
  tabel `activity_log`.

## Persyaratan

- Node.js 18 atau lebih baru
- npm

## Instalasi & Menjalankan Secara Lokal

```bash
cd dashboard-penugasan
npm install

# 1. Salin file environment lalu isi nilainya
cp .env.example .env
```

Buka file `.env` dan wajib ubah:

1. `JWT_SECRET` — buat string acak panjang, contoh:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
2. `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_NAMA` — kredensial admin awal.
   Gunakan password yang kuat (minimal 8 karakter, campur huruf besar/kecil/angka).

Setelah `.env` terisi, buat database beserta akun admin awal dan data
pegawai contoh (19 pegawai Itwil III dari dashboard lama):

```bash
npm run seed
```

Jalankan server:

```bash
npm start
```

Buka `http://localhost:3000` di browser, login menggunakan
`ADMIN_USERNAME` / `ADMIN_PASSWORD` yang sudah diatur. Anda akan diminta
mengganti password pada login pertama.

## Struktur Data

- **Pegawai** — nama, satuan kerja, status aktif.
- **Penugasan** — nama penugasan, kategori (Audit/Telaah/Reviu/Evaluasi/
  Consulting/Koordinasi/Pendampingan/Diklat), bulan, status (Belum Mulai/
  Progres/Selesai), progres (0–100%), kesimpulan (Tepat Waktu/Terlambat/
  Belum Selesai), tanggal mulai & selesai, catatan.
- **Users** — akun login (terpisah dari data pegawai, satu pegawai bisa
  memiliki satu akun login yang tertaut lewat `pegawai_id`).

## Keamanan yang Diterapkan

| Aspek | Implementasi |
|---|---|
| Password | Di-hash dengan bcrypt (cost factor 12), tidak pernah disimpan/​dikirim dalam bentuk plain text setelah pembuatan akun |
| Sesi login | JWT ditandatangani server, disimpan di cookie `httpOnly`, `sameSite=strict`, dan `secure` otomatis aktif saat `NODE_ENV=production` |
| CSRF | Token double-submit (`csrf_token` cookie + header `X-CSRF-Token`) wajib cocok untuk setiap request yang mengubah data |
| Brute force | Rate limit di endpoint login (20 percobaan/15 menit per IP) + penguncian akun otomatis 15 menit setelah 5 kali gagal |
| Injeksi SQL | Seluruh query database memakai prepared statement (`better-sqlite3`), tidak ada penggabungan string SQL |
| Validasi input | Semua endpoint memvalidasi & membersihkan input dengan `express-validator` sebelum diproses |
| Header keamanan | `helmet` mengaktifkan Content-Security-Policy, `X-Frame-Options`, dsb. |
| Kontrol akses | Middleware role (`admin` vs `pegawai`) di setiap route; pegawai hanya bisa mengubah/menghapus data miliknya |
| Audit trail | Setiap login, gagal login, perubahan, dan penghapusan tercatat di tabel `activity_log` beserta IP dan waktunya |

### Yang wajib Anda lakukan sebelum go-live

1. **Ganti `JWT_SECRET`** dengan nilai unik & rahasia — jangan gunakan contoh di `.env.example`.
2. **Jalankan di balik HTTPS** (mis. via reverse proxy Nginx + certbot, atau platform hosting yang otomatis menyediakan TLS). Set `NODE_ENV=production` agar cookie sesi hanya dikirim lewat HTTPS.
3. **Backup rutin** file database SQLite di `data/dashboard.db` (mis. cron job harian menyalin file ini ke penyimpanan terpisah).
4. **Ganti password admin default** segera setelah instalasi (aplikasi akan memaksa ini pada login pertama).
5. Batasi akses jaringan ke server (firewall) hanya dari jaringan kantor/VPN jika data bersifat internal.

## Deploy ke Server Sendiri (contoh dengan PM2 + Nginx)

```bash
npm install -g pm2
cd dashboard-penugasan
npm install --production
npm run seed
pm2 start server.js --name dashboard-penugasan
pm2 save
```

Contoh konfigurasi reverse proxy Nginx (`/etc/nginx/sites-available/dashboard-penugasan`):

```nginx
server {
    listen 80;
    server_name dashboard.contoh-instansi.go.id;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Lalu aktifkan HTTPS dengan Certbot:

```bash
sudo certbot --nginx -d dashboard.contoh-instansi.go.id
```

## Menambahkan Akun untuk Pegawai

1. Login sebagai admin → menu **Data Pegawai** → tambahkan nama pegawai (jika belum ada).
2. Menu **Akun Pengguna** → **+ Buat Akun** → isi username, nama, pilih role `Pegawai`, dan hubungkan ke data pegawai yang sesuai.
3. Sistem akan menampilkan **password sementara** satu kali — catat dan berikan ke pegawai yang bersangkutan secara aman (jangan lewat channel publik).
4. Pegawai wajib mengganti password tersebut saat login pertama.

## Struktur Folder

```
dashboard-penugasan/
├── server.js                 # Entry point Express + middleware keamanan
├── src/
│   ├── db.js                 # Skema & koneksi SQLite
│   ├── middleware/
│   │   ├── auth.js           # JWT auth, role guard, CSRF guard
│   │   └── validate.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── pegawai.routes.js
│   │   ├── penugasan.routes.js
│   │   ├── dashboard.routes.js
│   │   └── users.routes.js
│   └── utils/activityLog.js
├── public/                   # Frontend statis (HTML/CSS/JS vanilla)
├── scripts/seed.js           # Membuat admin awal & data pegawai contoh
├── data/                     # File database SQLite (dibuat otomatis)
├── .env.example
└── package.json
```

## Lisensi Data

Nama pegawai dan daftar kategori penugasan pada `scripts/seed.js` diambil
dari struktur file `Dashboard_Pemantauan_Penugasan_2025.xlsx` yang Anda
lampirkan, hanya sebagai data awal contoh — silakan sesuaikan atau hapus
lewat menu **Data Pegawai** setelah aplikasi berjalan.
