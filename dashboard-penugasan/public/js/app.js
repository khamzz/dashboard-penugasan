(function () {
  'use strict';

  const KATEGORI = ['Audit', 'Telaah', 'Reviu', 'Evaluasi', 'Consulting', 'Koordinasi', 'Pendampingan', 'Diklat'];
  const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const STATUS = ['Belum Mulai', 'Progres', 'Selesai'];
  const KESIMPULAN = ['Tepat Waktu', 'Terlambat', 'Belum Selesai'];

  const state = {
    user: null,
    pegawaiList: [],
    currentView: 'dashboard',
    penugasanFilter: { bulan: '', kategori: '', status: '', pegawai_id: '', page: 1 },
  };

  // ---------------------------------------------------------
  // Helper: cookie & API
  // ---------------------------------------------------------
  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  async function api(path, options = {}) {
    const opts = {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin'
    };
    if (options.method && options.method !== 'GET') {
      opts.headers['X-CSRF-Token'] = getCookie('csrf_token') || '';
    }
    if (options.body) opts.body = JSON.stringify(options.body);

    const res = await fetch('/api' + path, opts);
    let json = null;
    try { json = await res.json(); } catch (e) { /* respons tanpa body */ }

    if (res.status === 401) {
      showLogin();
      throw new Error((json && json.error) || 'Sesi berakhir, silakan login kembali.');
    }
    if (!res.ok) {
      const err = new Error((json && json.error) || `Permintaan gagal (${res.status})`);
      err.details = json && json.details;
      throw err;
    }
    return json;
  }

  function toast(message, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = 'toast ' + type;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 3500);
  }

  function fmtDate(d) {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return d; }
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function slugCss(s) { return s.replace(/\s+/g, '-'); }

  // ---------------------------------------------------------
  // AUTH
  // ---------------------------------------------------------
  const loginForm = document.getElementById('form-login');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errBox = document.getElementById('login-error');
    errBox.hidden = true;

    try {
      const res = await api('/auth/login', { method: 'POST', body: { username, password } });
      state.user = res.user;
      await afterLogin();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
    }
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch (e) {}
    location.reload();
  });

  document.getElementById('btn-change-password').addEventListener('click', openChangePasswordModal);

  function showLogin() {
    document.getElementById('view-login').hidden = false;
    document.getElementById('view-app').hidden = true;
  }

  async function afterLogin() {
    document.getElementById('view-login').hidden = true;
    document.getElementById('view-app').hidden = false;
    document.getElementById('user-nama').textContent = state.user.nama;
    document.getElementById('user-role').textContent = state.user.role === 'admin' ? 'Admin' : 'Pegawai';

    document.querySelectorAll('[data-admin-only]').forEach((el) => {
      el.style.display = state.user.role === 'admin' ? '' : 'none';
    });

    if (state.user.must_change_password) {
      toast('Demi keamanan, silakan ganti password default Anda sekarang.', 'error');
      openChangePasswordModal(true);
    }

    await loadPegawaiList();
    navigate('dashboard');
  }

  async function tryResumeSession() {
    try {
      const res = await api('/auth/me');
      state.user = res.user;
      await afterLogin();
    } catch (err) {
      showLogin();
    }
  }

  async function loadPegawaiList() {
    const res = await api('/pegawai');
    state.pegawaiList = res.data;
  }

  function pegawaiOptions(selectedId) {
    return state.pegawaiList
      .map((p) => `<option value="${p.id}" ${String(p.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(p.nama)}</option>`)
      .join('');
  }

  // ---------------------------------------------------------
  // NAVIGATION
  // ---------------------------------------------------------
  document.querySelectorAll('.nav-link').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });

  const VIEW_TITLES = {
    dashboard: 'Dashboard',
    penugasan: 'Daftar Penugasan',
    pegawai: 'Data Pegawai',
    users: 'Akun Pengguna'
  };

  function navigate(view) {
    state.currentView = view;
    document.querySelectorAll('.view').forEach((v) => { v.hidden = true; });
    document.querySelectorAll('.nav-link').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
    document.getElementById('topbar-title').textContent = VIEW_TITLES[view] || '';
    document.getElementById('view-' + view).hidden = false;

    if (view === 'dashboard') renderDashboard();
    if (view === 'penugasan') renderPenugasan();
    if (view === 'pegawai') renderPegawai();
    if (view === 'users') renderUsers();
  }

  // ---------------------------------------------------------
  // MODAL HELPERS
  // ---------------------------------------------------------
  const overlay = document.getElementById('modal-overlay');
  const modalBox = document.getElementById('modal-box');

  function openModal(html) {
    modalBox.innerHTML = html;
    overlay.hidden = false;
  }
  function closeModal() {
    overlay.hidden = true;
    modalBox.innerHTML = '';
  }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  // ---------------------------------------------------------
  // DASHBOARD VIEW
  // ---------------------------------------------------------
  async function renderDashboard() {
    const root = document.getElementById('view-dashboard');
    root.innerHTML = '<p class="hint">Memuat ringkasan...</p>';
    let summary;
    try {
      const res = await api('/dashboard/summary');
      summary = res.data;
    } catch (err) {
      root.innerHTML = `<p class="hint">Gagal memuat dashboard: ${escapeHtml(err.message)}</p>`;
      return;
    }

    const maxBulan = Math.max(1, ...Object.values(summary.per_bulan));

    root.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Total Pegawai Aktif</div>
          <div class="stat-value">${summary.total_pegawai}</div>
        </div>
        <div class="stat-card st-belum">
          <div class="stat-label">Belum Mulai</div>
          <div class="stat-value">${summary.status['Belum Mulai']}</div>
        </div>
        <div class="stat-card st-progres">
          <div class="stat-label">Progres</div>
          <div class="stat-value">${summary.status['Progres']}</div>
        </div>
        <div class="stat-card st-selesai">
          <div class="stat-label">Selesai</div>
          <div class="stat-value">${summary.status['Selesai']}</div>
        </div>
      </div>

      <div class="two-col">
        <div class="panel">
          <h2>Penugasan per Bulan (${new Date().getFullYear()})</h2>
          <div class="bar-chart">
            ${BULAN.map((b) => {
              const v = summary.per_bulan[b] || 0;
              const h = Math.round((v / maxBulan) * 100);
              return `<div class="bar-chart-col">
                <div class="bar-chart-value">${v || ''}</div>
                <div class="bar-chart-bar" style="height:${Math.max(h, v > 0 ? 4 : 0)}%"></div>
                <div class="bar-chart-label">${b.slice(0,3)}</div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="panel">
          <h2>Rekap Berdasarkan Kategori</h2>
          <table>
            <thead><tr><th>Jenis</th><th class="num">Jumlah</th></tr></thead>
            <tbody>
              ${summary.kategori.map((k) => `<tr><td>${escapeHtml(k.kategori)}</td><td class="num">${k.jumlah}</td></tr>`).join('') || '<tr><td colspan="2" class="empty-state">Belum ada data</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <h2>Rekapitulasi per Individu</h2>
        <table>
          <thead><tr>
            <th class="num">No</th><th>Nama</th><th class="num">Jumlah</th>
            <th class="num">Belum Mulai</th><th class="num">Progres</th><th class="num">Selesai</th>
          </tr></thead>
          <tbody>
            ${summary.per_individu.map((p, i) => `
              <tr>
                <td class="num">${i + 1}</td>
                <td>${escapeHtml(p.nama)}</td>
                <td class="num">${p.jumlah_penugasan}</td>
                <td class="num">${p.belum_mulai}</td>
                <td class="num">${p.progres}</td>
                <td class="num">${p.selesai}</td>
              </tr>`).join('') || '<tr><td colspan="6" class="empty-state">Belum ada data</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  // ---------------------------------------------------------
  // PENUGASAN VIEW (CRUD utama)
  // ---------------------------------------------------------
  async function renderPenugasan() {
    const root = document.getElementById('view-penugasan');
    root.innerHTML = `
      <div class="toolbar">
        <select id="f-bulan"><option value="">Semua Bulan</option>${BULAN.map((b) => `<option value="${b}">${b}</option>`).join('')}</select>
        <select id="f-kategori"><option value="">Semua Kategori</option>${KATEGORI.map((k) => `<option value="${k}">${k}</option>`).join('')}</select>
        <select id="f-status"><option value="">Semua Status</option>${STATUS.map((s) => `<option value="${s}">${s}</option>`).join('')}</select>
        <select id="f-pegawai"><option value="">Semua Pegawai</option>${pegawaiOptions()}</select>
        <div class="spacer"></div>
        <button class="btn btn-gold" id="btn-tambah-penugasan">+ Tambah Penugasan</button>
      </div>
      <div class="panel" style="padding:0; overflow-x:auto;">
        <table>
          <thead><tr>
            <th class="num">No</th><th>Nama Penugasan</th><th>Pegawai</th><th>Kategori</th><th>Bulan</th>
            <th>Status</th><th>Progres</th><th>Kesimpulan</th><th></th>
          </tr></thead>
          <tbody id="penugasan-tbody"><tr><td colspan="9" class="empty-state">Memuat...</td></tr></tbody>
        </table>
      </div>
      <div class="pagination" id="penugasan-pagination"></div>
    `;

    ['f-bulan', 'f-kategori', 'f-status', 'f-pegawai'].forEach((id) => {
      document.getElementById(id).addEventListener('change', () => {
        state.penugasanFilter.bulan = document.getElementById('f-bulan').value;
        state.penugasanFilter.kategori = document.getElementById('f-kategori').value;
        state.penugasanFilter.status = document.getElementById('f-status').value;
        state.penugasanFilter.pegawai_id = document.getElementById('f-pegawai').value;
        state.penugasanFilter.page = 1;
        loadPenugasanTable();
      });
    });

    document.getElementById('btn-tambah-penugasan').addEventListener('click', () => openPenugasanForm());

    await loadPenugasanTable();
  }

  async function loadPenugasanTable() {
    const tbody = document.getElementById('penugasan-tbody');
    const f = state.penugasanFilter;
    const qs = new URLSearchParams();
    if (f.bulan) qs.set('bulan', f.bulan);
    if (f.kategori) qs.set('kategori', f.kategori);
    if (f.status) qs.set('status', f.status);
    if (f.pegawai_id) qs.set('pegawai_id', f.pegawai_id);
    qs.set('page', f.page);
    qs.set('limit', 15);

    let res;
    try {
      res = await api('/penugasan?' + qs.toString());
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state">${escapeHtml(err.message)}</td></tr>`;
      return;
    }

    if (!res.data.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Tidak ada penugasan yang cocok dengan filter ini.</td></tr>';
    } else {
      tbody.innerHTML = res.data.map((row, i) => {
        const canEdit = state.user.role === 'admin' || row.pegawai_id === state.user.pegawai_id;
        return `
        <tr>
          <td class="num">${(res.pagination.page - 1) * res.pagination.limit + i + 1}</td>
          <td>${escapeHtml(row.nama_penugasan)}</td>
          <td>${escapeHtml(row.nama_pegawai)}</td>
          <td>${escapeHtml(row.kategori)}</td>
          <td>${escapeHtml(row.bulan)}</td>
          <td><span class="status-pill st-${slugCss(row.status)}">${escapeHtml(row.status)}</span></td>
          <td class="num">${row.progres_persen}%</td>
          <td>${row.kesimpulan ? `<span class="kesimpulan-pill k-${slugCss(row.kesimpulan)}">${escapeHtml(row.kesimpulan)}</span>` : '—'}</td>
          <td>
            ${canEdit ? `
              <button class="btn btn-outline btn-sm" data-edit="${row.id}">Ubah</button>
              <button class="btn btn-danger btn-sm" data-delete="${row.id}" data-nama="${escapeHtml(row.nama_penugasan)}">Hapus</button>
            ` : ''}
          </td>
        </tr>`;
      }).join('');
    }

    tbody.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openPenugasanForm(btn.dataset.edit));
    });
    tbody.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => confirmDeletePenugasan(btn.dataset.delete, btn.dataset.nama));
    });

    renderPagination(res.pagination);
  }

  function renderPagination(p) {
    const el = document.getElementById('penugasan-pagination');
    if (p.total_pages <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <button class="btn btn-outline btn-sm" ${p.page <= 1 ? 'disabled' : ''} id="pg-prev">‹ Sebelumnya</button>
      <span>Halaman ${p.page} dari ${p.total_pages} (${p.total} data)</span>
      <button class="btn btn-outline btn-sm" ${p.page >= p.total_pages ? 'disabled' : ''} id="pg-next">Berikutnya ›</button>
    `;
    const prev = document.getElementById('pg-prev');
    const next = document.getElementById('pg-next');
    if (prev) prev.addEventListener('click', () => { state.penugasanFilter.page--; loadPenugasanTable(); });
    if (next) next.addEventListener('click', () => { state.penugasanFilter.page++; loadPenugasanTable(); });
  }

  async function openPenugasanForm(id) {
    let row = null;
    if (id) {
      const res = await api('/penugasan/' + id);
      row = res.data;
    }
    const isEdit = !!row;
    const defaultPegawai = state.user.role === 'pegawai' ? state.user.pegawai_id : (row ? row.pegawai_id : '');

    openModal(`
      <h2>${isEdit ? 'Ubah Penugasan' : 'Tambah Penugasan'}</h2>
      <form id="form-penugasan">
        <div class="form-grid">
          <div class="form-field full">
            <label>Nama Penugasan</label>
            <textarea name="nama_penugasan" required>${escapeHtml(row ? row.nama_penugasan : '')}</textarea>
          </div>
          <div class="form-field">
            <label>Pegawai</label>
            <select name="pegawai_id" required ${state.user.role !== 'admin' ? 'disabled' : ''}>
              ${pegawaiOptions(defaultPegawai)}
            </select>
          </div>
          <div class="form-field">
            <label>Kategori</label>
            <select name="kategori" required>
              ${KATEGORI.map((k) => `<option value="${k}" ${row && row.kategori === k ? 'selected' : ''}>${k}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label>Bulan</label>
            <select name="bulan" required>
              ${BULAN.map((b) => `<option value="${b}" ${row && row.bulan === b ? 'selected' : ''}>${b}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label>Status</label>
            <select name="status" required>
              ${STATUS.map((s) => `<option value="${s}" ${row && row.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label>Progres (%)</label>
            <input type="number" name="progres_persen" min="0" max="100" value="${row ? row.progres_persen : 0}" required />
          </div>
          <div class="form-field">
            <label>Kesimpulan (jika sudah selesai)</label>
            <select name="kesimpulan">
              <option value="">—</option>
              ${KESIMPULAN.map((k) => `<option value="${k}" ${row && row.kesimpulan === k ? 'selected' : ''}>${k}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label>Tanggal Mulai</label>
            <input type="date" name="tanggal_mulai" value="${row && row.tanggal_mulai ? row.tanggal_mulai.slice(0,10) : ''}" />
          </div>
          <div class="form-field">
            <label>Tanggal Selesai</label>
            <input type="date" name="tanggal_selesai" value="${row && row.tanggal_selesai ? row.tanggal_selesai.slice(0,10) : ''}" />
          </div>
          <div class="form-field full">
            <label>Catatan</label>
            <textarea name="catatan">${escapeHtml(row ? row.catatan : '')}</textarea>
          </div>
        </div>
        <div id="form-penugasan-error" class="form-error" hidden></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="btn-cancel-modal">Batal</button>
          <button type="submit" class="btn btn-primary" style="margin-top:0">${isEdit ? 'Simpan Perubahan' : 'Simpan'}</button>
        </div>
      </form>
    `);

    document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);

    document.getElementById('form-penugasan').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = Object.fromEntries(fd.entries());
      if (state.user.role !== 'admin') payload.pegawai_id = state.user.pegawai_id;
      payload.progres_persen = parseInt(payload.progres_persen, 10) || 0;
      if (!payload.kesimpulan) delete payload.kesimpulan;
      if (!payload.tanggal_mulai) delete payload.tanggal_mulai;
      if (!payload.tanggal_selesai) delete payload.tanggal_selesai;

      const errBox = document.getElementById('form-penugasan-error');
      try {
        if (isEdit) {
          await api('/penugasan/' + row.id, { method: 'PUT', body: payload });
          toast('Penugasan berhasil diperbarui.');
        } else {
          await api('/penugasan', { method: 'POST', body: payload });
          toast('Penugasan berhasil ditambahkan.');
        }
        closeModal();
        loadPenugasanTable();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
      }
    });
  }

  function confirmDeletePenugasan(id, nama) {
    openModal(`
      <h2>Hapus Penugasan</h2>
      <p>Yakin ingin menghapus penugasan <strong>"${escapeHtml(nama)}"</strong>? Tindakan ini tidak dapat dibatalkan.</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="btn-cancel-modal">Batal</button>
        <button type="button" class="btn btn-danger" id="btn-confirm-delete">Ya, Hapus</button>
      </div>
    `);
    document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
    document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
      try {
        await api('/penugasan/' + id, { method: 'DELETE' });
        toast('Penugasan berhasil dihapus.');
        closeModal();
        loadPenugasanTable();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // ---------------------------------------------------------
  // PEGAWAI VIEW (admin only, CRUD)
  // ---------------------------------------------------------
  async function renderPegawai() {
    const root = document.getElementById('view-pegawai');
    root.innerHTML = `
      <div class="toolbar">
        <div class="spacer"></div>
        <button class="btn btn-gold" id="btn-tambah-pegawai">+ Tambah Pegawai</button>
      </div>
      <div class="panel" style="padding:0;">
        <table>
          <thead><tr><th class="num">No</th><th>Nama</th><th>Satker</th><th>Status</th><th></th></tr></thead>
          <tbody id="pegawai-tbody"><tr><td colspan="5" class="empty-state">Memuat...</td></tr></tbody>
        </table>
      </div>
    `;
    document.getElementById('btn-tambah-pegawai').addEventListener('click', () => openPegawaiForm());
    await loadPegawaiTable();
  }

  async function loadPegawaiTable() {
    const res = await api('/pegawai');
    state.pegawaiList = res.data;
    const tbody = document.getElementById('pegawai-tbody');
    tbody.innerHTML = res.data.map((p, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(p.nama)}</td>
        <td>${escapeHtml(p.satker)}</td>
        <td>${p.aktif ? '<span class="status-pill st-Selesai">Aktif</span>' : '<span class="status-pill st-Belum-Mulai">Nonaktif</span>'}</td>
        <td>
          <button class="btn btn-outline btn-sm" data-edit="${p.id}">Ubah</button>
          <button class="btn btn-danger btn-sm" data-delete="${p.id}" data-nama="${escapeHtml(p.nama)}">Hapus</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="5" class="empty-state">Belum ada data pegawai.</td></tr>';

    tbody.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openPegawaiForm(btn.dataset.edit)));
    tbody.querySelectorAll('[data-delete]').forEach((btn) => btn.addEventListener('click', () => confirmDeletePegawai(btn.dataset.delete, btn.dataset.nama)));
  }

  function openPegawaiForm(id) {
    const row = id ? state.pegawaiList.find((p) => String(p.id) === String(id)) : null;
    openModal(`
      <h2>${row ? 'Ubah Pegawai' : 'Tambah Pegawai'}</h2>
      <form id="form-pegawai">
        <div class="form-grid">
          <div class="form-field full">
            <label>Nama</label>
            <input type="text" name="nama" required value="${escapeHtml(row ? row.nama : '')}" />
          </div>
          <div class="form-field full">
            <label>Satuan Kerja</label>
            <input type="text" name="satker" value="${escapeHtml(row ? row.satker : 'Itwil III')}" />
          </div>
          ${row ? `
          <div class="form-field full">
            <label><input type="checkbox" name="aktif" ${row.aktif ? 'checked' : ''} style="width:auto; margin-right:6px;" />Aktif</label>
          </div>` : ''}
        </div>
        <div id="form-pegawai-error" class="form-error" hidden></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="btn-cancel-modal">Batal</button>
          <button type="submit" class="btn btn-primary" style="margin-top:0">Simpan</button>
        </div>
      </form>
    `);
    document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
    document.getElementById('form-pegawai').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = { nama: fd.get('nama'), satker: fd.get('satker') };
      if (row) payload.aktif = fd.get('aktif') === 'on';

      const errBox = document.getElementById('form-pegawai-error');
      try {
        if (row) {
          await api('/pegawai/' + row.id, { method: 'PUT', body: payload });
        } else {
          await api('/pegawai', { method: 'POST', body: payload });
        }
        toast('Data pegawai berhasil disimpan.');
        closeModal();
        await loadPegawaiTable();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
      }
    });
  }

  function confirmDeletePegawai(id, nama) {
    openModal(`
      <h2>Hapus Pegawai</h2>
      <p>Yakin ingin menghapus pegawai <strong>"${escapeHtml(nama)}"</strong>? Semua penugasan miliknya akan ikut terhapus.</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="btn-cancel-modal">Batal</button>
        <button type="button" class="btn btn-danger" id="btn-confirm-delete">Ya, Hapus</button>
      </div>
    `);
    document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
    document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
      try {
        await api('/pegawai/' + id, { method: 'DELETE' });
        toast('Pegawai berhasil dihapus.');
        closeModal();
        await loadPegawaiTable();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // ---------------------------------------------------------
  // USERS VIEW (admin only)
  // ---------------------------------------------------------
  async function renderUsers() {
    const root = document.getElementById('view-users');
    root.innerHTML = `
      <div class="toolbar">
        <div class="spacer"></div>
        <button class="btn btn-gold" id="btn-tambah-user">+ Buat Akun</button>
      </div>
      <div class="panel" style="padding:0;">
        <table>
          <thead><tr><th class="num">No</th><th>Username</th><th>Nama</th><th>Role</th><th>Terhubung ke Pegawai</th><th>Login Terakhir</th><th></th></tr></thead>
          <tbody id="users-tbody"><tr><td colspan="7" class="empty-state">Memuat...</td></tr></tbody>
        </table>
      </div>
    `;
    document.getElementById('btn-tambah-user').addEventListener('click', openUserForm);
    await loadUsersTable();
  }

  async function loadUsersTable() {
    const res = await api('/users');
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = res.data.map((u, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.nama)}</td>
        <td>${u.role === 'admin' ? '<span class="badge-role">Admin</span>' : 'Pegawai'}</td>
        <td>${u.nama_pegawai ? escapeHtml(u.nama_pegawai) : '—'}</td>
        <td>${u.last_login_at ? fmtDate(u.last_login_at) : 'Belum pernah'}</td>
        <td>
          <button class="btn btn-outline btn-sm" data-reset="${u.id}">Reset Password</button>
          <button class="btn btn-danger btn-sm" data-delete="${u.id}" data-username="${escapeHtml(u.username)}">Hapus</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="7" class="empty-state">Belum ada akun.</td></tr>';

    tbody.querySelectorAll('[data-reset]').forEach((btn) => btn.addEventListener('click', () => resetUserPassword(btn.dataset.reset)));
    tbody.querySelectorAll('[data-delete]').forEach((btn) => btn.addEventListener('click', () => confirmDeleteUser(btn.dataset.delete, btn.dataset.username)));
  }

  function openUserForm() {
    openModal(`
      <h2>Buat Akun Baru</h2>
      <form id="form-user">
        <div class="form-grid">
          <div class="form-field">
            <label>Username</label>
            <input type="text" name="username" required />
          </div>
          <div class="form-field">
            <label>Nama Lengkap</label>
            <input type="text" name="nama" required />
          </div>
          <div class="form-field">
            <label>Role</label>
            <select name="role" required>
              <option value="pegawai">Pegawai</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div class="form-field">
            <label>Terhubung ke Data Pegawai</label>
            <select name="pegawai_id">
              <option value="">— Tidak ada —</option>
              ${pegawaiOptions()}
            </select>
            <div class="hint">Wajib diisi untuk role Pegawai agar bisa mengelola penugasan miliknya sendiri.</div>
          </div>
        </div>
        <div id="form-user-error" class="form-error" hidden></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="btn-cancel-modal">Batal</button>
          <button type="submit" class="btn btn-primary" style="margin-top:0">Buat Akun</button>
        </div>
      </form>
    `);
    document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
    document.getElementById('form-user').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = Object.fromEntries(fd.entries());
      if (!payload.pegawai_id) delete payload.pegawai_id;

      const errBox = document.getElementById('form-user-error');
      try {
        const res = await api('/users', { method: 'POST', body: payload });
        showTempPassword('Akun berhasil dibuat', res.data.username, res.temp_password, res.note);
        await loadUsersTable();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
      }
    });
  }

  function showTempPassword(title, username, tempPassword, note) {
    openModal(`
      <h2>${escapeHtml(title)}</h2>
      <p>Username: <strong>${escapeHtml(username)}</strong></p>
      <p>Password sementara:</p>
      <div class="temp-password-box">${escapeHtml(tempPassword)}</div>
      <p class="hint">${escapeHtml(note)}</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-primary" style="margin-top:0" id="btn-close-temp">Tutup</button>
      </div>
    `);
    document.getElementById('btn-close-temp').addEventListener('click', closeModal);
  }

  function resetUserPassword(id) {
    openModal(`
      <h2>Reset Password</h2>
      <p>Yakin ingin membuat password baru untuk akun ini? Password lama akan langsung tidak berlaku.</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="btn-cancel-modal">Batal</button>
        <button type="button" class="btn btn-gold" id="btn-confirm-reset">Ya, Reset</button>
      </div>
    `);
    document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
    document.getElementById('btn-confirm-reset').addEventListener('click', async () => {
      try {
        const res = await api('/users/' + id + '/reset-password', { method: 'POST' });
        showTempPassword('Password Direset', '', res.temp_password, res.note);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  function confirmDeleteUser(id, username) {
    openModal(`
      <h2>Hapus Akun</h2>
      <p>Yakin ingin menghapus akun <strong>"${escapeHtml(username)}"</strong>?</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="btn-cancel-modal">Batal</button>
        <button type="button" class="btn btn-danger" id="btn-confirm-delete">Ya, Hapus</button>
      </div>
    `);
    document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
    document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
      try {
        await api('/users/' + id, { method: 'DELETE' });
        toast('Akun berhasil dihapus.');
        closeModal();
        await loadUsersTable();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // ---------------------------------------------------------
  // GANTI PASSWORD (semua role)
  // ---------------------------------------------------------
  function openChangePasswordModal(forced) {
    openModal(`
      <h2>Ganti Password</h2>
      ${forced ? '<p class="hint">Anda wajib mengganti password sebelum melanjutkan.</p>' : ''}
      <form id="form-change-password">
        <div class="form-grid">
          <div class="form-field full">
            <label>Password Saat Ini</label>
            <input type="password" name="current_password" required />
          </div>
          <div class="form-field full">
            <label>Password Baru</label>
            <input type="password" name="new_password" required minlength="8" />
            <div class="hint">Minimal 8 karakter, mengandung huruf besar dan angka.</div>
          </div>
        </div>
        <div id="form-change-password-error" class="form-error" hidden></div>
        <div class="modal-actions">
          ${forced ? '' : '<button type="button" class="btn btn-outline" id="btn-cancel-modal">Batal</button>'}
          <button type="submit" class="btn btn-primary" style="margin-top:0">Simpan Password Baru</button>
        </div>
      </form>
    `);
    if (!forced) document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
    document.getElementById('form-change-password').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = Object.fromEntries(fd.entries());
      const errBox = document.getElementById('form-change-password-error');
      try {
        await api('/auth/change-password', { method: 'POST', body: payload });
        toast('Password berhasil diubah.');
        closeModal();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
      }
    });
  }

  // ---------------------------------------------------------
  // BOOTSTRAP
  // ---------------------------------------------------------
  tryResumeSession();
})();
