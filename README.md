# FreeBox Storage

Prototype website penyimpanan file gratis dengan fitur:

- Register akun
- Login
- Upload banyak file
- Drag & drop file
- Download file
- Rename file
- Hapus file
- Pencarian file
- Indikator kuota 1TB

## Cara deploy ke GitHub Pages

1. Buat repository baru di GitHub.
2. Upload semua file ini ke repository:
   - `index.html`
   - `style.css`
   - `script.js`
   - `README.md`
3. Buka **Settings** repository.
4. Masuk ke **Pages**.
5. Pada bagian **Build and deployment**, pilih:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
6. Klik **Save**.
7. Tunggu beberapa menit, lalu buka link GitHub Pages yang muncul.

## Catatan penting

Website ini bisa dideploy ke GitHub Pages karena hanya memakai HTML, CSS, dan JavaScript.

Namun, GitHub Pages adalah hosting statis. Artinya:
- Tidak ada server backend.
- Tidak ada database online.
- File user tidak tersimpan di server GitHub.
- File hanya tersimpan di browser/perangkat pengguna memakai IndexedDB.

Untuk sistem penyimpanan online asli sampai 1TB, perlu backend seperti:
- Node.js + Express
- Database pengguna
- Cloud storage / VPS storage
- Sistem autentikasi aman
