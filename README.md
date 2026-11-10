# Rumah Kita

Aplikasi pribadi untuk satu akun rumah tangga. Next.js App Router, TypeScript,
Tailwind CSS, Supabase PostgreSQL/Auth, dan Zod. UI berbahasa Indonesia.
Tanggal kalender menggunakan `Asia/Jakarta`; minggu dimulai pada Senin.

## Pengembangan lokal

Gunakan Node.js 24 LTS dan npm, dari direktori repositori:

```sh
npm ci
# Salin hanya jika .env.local belum ada; jangan menimpa konfigurasi lokal.
cp -n .env.example .env.local
# Isi URL dan publishable key proyek pengembangan sebelum menjalankan server.
npm run dev
```

Pada cloud environment ini, aktifkan dukungan proxy bawaan Node.js 24:

```sh
NODE_USE_ENV_PROXY=1 npm run dev -- --hostname 0.0.0.0 --port 3001
```

Izinkan hostname proyek Supabase pada pengaturan jaringan cloud. Gunakan proxy
dan CA bawaan environment; jangan menonaktifkan verifikasi TLS.

Isi `.env.local` dengan `NEXT_PUBLIC_SUPABASE_URL` dan
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` dari proyek Supabase.
File ini diabaikan Git. Jangan gunakan service-role/secret key untuk aplikasi.
Semua operasi database menggunakan publishable key dan sesi pengguna.

```sh
npx eslint .
npx tsc --noEmit
npm test
npm run build
npm start
```

Tes database memakai PostgreSQL lokal dalam WASM (PGlite) dengan fixture minimal
`auth.users`, `auth.uid()`, dan role Supabase. Tes ini tidak menggantikan pengujian
JWT, cookie, PostgREST, atau konfigurasi Supabase yang sebenarnya.

## Menyiapkan Supabase Free

1. Buka proyek di **Supabase Dashboard → SQL Editor → New query**.
2. Jalankan seluruh isi `supabase/migrations/001_initial.sql` lebih dahulu
   jika tabel `public.households` belum dibuat. Jika editor menawarkan opsi RLS,
   pilih **Enable Row Level Security**. Migrasi kedua juga mengunci tabel ini.
3. Dalam query baru, jalankan seluruh isi
   `supabase/migrations/002_household_backend.sql` satu kali. File ini memakai
   transaksi. Jika sudah berhasil, jangan dijalankan ulang; perubahan berikutnya
   harus berupa migrasi baru. Sintaks `ON DELETE SET NULL (recipe_id)` membutuhkan
   PostgreSQL 15+ seperti proyek Supabase modern.
4. Di **Authentication → Sign In / Providers → User Signups**, matikan
   **Allow new users to sign up**. Matikan anonymous sign-ins juga. Pada bagian
   provider, aktifkan **Email** untuk login email/password. Tidak ada UI signup.
5. Buka **Authentication → Users → Add user → Create new user**. Buat satu akun
   pemilik dengan email/password; gunakan opsi auto-confirm email untuk akun yang
   Anda buat sendiri. Jangan bagikan password di chat atau commit ke Git.
6. Buka **Authentication → URL Configuration**, atur **Site URL** ke origin
   aplikasi (lokal: `http://localhost:3000`, produksi: URL HTTPS Vercel Anda).
   Login password saat ini tidak memakai callback/redirect OAuth. Tambahkan URL
   callback eksplisit kelak jika membuat alur pemulihan password atau OAuth.
7. Ambil **Project URL** di pengaturan proyek/Data API dan **Publishable key**
   di **Settings → API Keys**, lalu isi kedua variabel `.env.local`. Restart dev
   server setelah mengubah variabel. Di Vercel Hobby, atur variabel yang sama
   sebelum build/deploy ulang.

RLS membatasi pengguna terautentikasi ke `owner_id = auth.uid()`. Role `anon`
tidak memiliki izin tabel. Tabel scaffold `households` juga dikunci dan tidak
dipakai backend baru. Pengguna privileged di SQL Editor tetap dapat mengakses
semua data; jangan menguji isolasi dengan query SQL Editor biasa sebagai admin.

## Auth dan rute

`/login` menyediakan login email/password. Tidak ada pendaftaran publik.
Route group `(private)` melindungi `/`, `/essentials`, `/meal-plan`, dan `/recipes`
dengan `auth.getUser()` yang memverifikasi pengguna di Supabase Auth.
`src/proxy.ts` menyegarkan cookie sesi untuk request dan response; proxy bukan
satu-satunya pengaman. API memverifikasi pengguna lagi pada setiap request.
Tombol **Keluar** mengirim POST `/auth/logout` dan mengakhiri sesi browser ini.

`/` adalah dashboard pengguna yang sudah masuk: menu hari ini di Asia/Jakarta,
barang Habis, rencana belanja sebelum hari ini yang masih perlu dibeli, serta
belanja hari ini dan sesudahnya. Barang Tersedia tidak masuk daftar belanja.
Setiap daftar menampilkan maksimal enam barang, jumlah total, dan tautan ke
layar lengkap. Menu terhubung memakai nama resep terkini; slot tanpa resep
memakai nama cadangan tersimpan. Bagian yang gagal dimuat menampilkan Coba lagi,
bukan dianggap kosong.

Navigasi bersama berada di bawah pada ponsel dan pada sidebar mulai 768 px.
Halaman aktif ditandai dan terdapat tautan keyboard Lewati ke konten. Semua
formulir utama memakai label, outline fokus, dan kontrol sentuh minimal 44 px.
Badge development Next.js dimatikan agar tidak menutupi navigasi ponsel; overlay
kesalahan compile/runtime tetap aktif.

`/essentials` memuat barang milik pengguna di server dan menyediakan tambah,
ubah, hapus, filter, tanggal belanja, dan aksi Sudah Dibeli. Halaman `/recipes` dan `/meal-plan` juga terhubung ke backend. Filter Perlu Dibeli mencakup barang Habis; label
Terlambat menggunakan tanggal hari ini di Asia/Jakarta dan hanya untuk barang
yang belum tersedia. Sudah Dibeli menyimpan status Tersedia dan menghapus tanggal
rencana dalam satu request.

`/recipes` memuat koleksi milik pengguna di server, dengan tambah, lihat, ubah,
dan hapus resep. Editor memakai kolom multiline untuk bahan dan langkah; baris
baru dan pemisah baris kosong tetap tampil di detail. Penghapusan memerlukan
konfirmasi dan tidak menghapus jadwal makan atau snapshot nama resep yang sudah
disimpan pada slot makan. Isian edit tetap ada bila penyimpanan gagal.

`/meal-plan?week=YYYY-MM-DD` menyimpan Senin terpilih pada URL. Tanggal lain
pada parameter `week` dinormalisasi ke Senin; nilai tidak valid memakai minggu
hari ini di Asia/Jakarta. Query slot hanya mengambil `meal_date >= Senin` dan
`meal_date < Senin berikutnya`, selalu dibatasi pemilik sesi. Tanggal diproses
sebagai kalender YYYY-MM-DD, bukan jam lokal browser.

Ponsel menampilkan pemilih hari dan tiga kartu, tablet memakai dua panel, dan
desktop menampilkan tujuh kolom mingguan. Editor yang sama mendukung resep,
nama menu sendiri, penggantian melalui upsert, dan pengosongan slot dengan
konfirmasi. Nama resep terkini ditampilkan selama masih terhubung; setelah
resep dihapus, nama cadangan dari slot tetap ditampilkan.

Uji browser dashboard, kebutuhan rumah, resep, dan rencana makan memakai
Chromium. Jika Chromium belum tersedia, instal browser pengujian:

```sh
npx playwright install chromium
```

Runner memakai `/usr/bin/chromium` jika tersedia, atau browser Playwright yang
diinstal. Gunakan `CHROMIUM_PATH` untuk lokasi lain. Jalankan dari root repositori:

```sh
npm run test:browser
```

Tes menjalankan salinan aplikasi Next.js di direktori sementara dengan fixture
Auth/PostgREST lokal dan PostgreSQL PGlite, tanpa memakai akun atau data Supabase
live. Tes mencakup penyimpanan tanggal melewati reload, filter, edit gagal yang
mempertahankan isian, perubahan status, serta resep: simpan, reload dan buka
kembali, edit, hapus, pelestarian baris baru, dan nama cadangan jadwal makan. Alur rencana makan juga memeriksa navigasi lintas
bulan, batas query mingguan, penggantian slot tanpa duplikasi, serta tampilan
ponsel, tablet, dan desktop. Pengujian dashboard menelusuri navigasi, label
form, fokus keyboard, target sentuh, dan overflow pada 390, 768, dan 1280 px,
serta redirect tamu dan status 401 untuk write API tanpa sesi. Tes SQL memakai
dua akun fixture untuk memastikan semua tabel menolak baca/tulis lintas pemilik.
Semua record dan akun ini disposable di database pengembangan lokal; direktori
aplikasi sementara dihapus setelah pengujian. Proyek Supabase yang dikonfigurasi
di `.env.local` tidak diubah oleh tes otomatis.

### Verifikasi Supabase development yang masih diperlukan

Gunakan proyek Supabase **development** terpisah, terapkan kedua migrasi,
nonaktifkan signup publik, lalu buat akun pemilik dan akun uji kedua melalui
Dashboard → Authentication → Users. Isi URL/key development di `.env.local`.
Masuk sendiri lewat UI dengan akun pertama, buat record disposable bernama unik
(misalnya `UJI-HAPUS-...`), dan ulangi alur CRUD/reload pada tiga ukuran layar.
Dengan sesi akun kedua di browser/context terpisah, pastikan record akun pertama
tidak terlihat dan API edit/hapus atas UUID akun pertama mengembalikan 404,
tanpa perubahan data. Uji Data API langsung dengan JWT akun kedua juga: SELECT
harus kosong, UPDATE/DELETE tidak mengubah baris, dan INSERT/UPDATE dengan
owner_id akun pertama ditolak RLS. Hapus hanya record disposable dan akun uji
milik pengujian setelah selesai. Jangan menguji isolasi sebagai admin SQL Editor
karena role tersebut melewati RLS.

Kredensial akun development dan status proyek development tidak tersedia pada
sesi implementasi ini; verifikasi Auth/JWT dua akun dan refresh cookie terhadap
Supabase live belum dijalankan. Jangan menaruh password atau service-role key
pada chat, README, atau Git. Konfigurasi akun live harus diberikan melalui sarana
rahasia environment yang disetujui, atau diuji sendiri melalui UI.

## POST /api/household

Kirim JSON dari origin aplikasi yang sama dengan cookie sesi login. Sertakan
`Content-Type: application/json` dan `Origin` yang sama persis dengan origin
aplikasi (browser mengisinya otomatis). Tidak ada parameter `owner_id` dari klien;
kepemilikan selalu diambil dari pengguna yang sudah diverifikasi.

Format dasar: `{ "entity": "essential|recipe|meal_slot", "action": "save|delete", "data": {...} }`.

- `essential/save`: `name`, `status` (`in_stock`, `to_buy`, `out_of_stock`),
  `planned_purchase_date` (opsional/null, `YYYY-MM-DD`), dan `id` opsional untuk edit.
- `recipe/save`: `name`, `servings` (integer 1–1000), `ingredients` dan `steps`
  (masing-masing array 1–200 string tidak kosong), dan `id` opsional untuk edit.
- `essential/delete` dan `recipe/delete`: `id` UUID.
- `meal_slot/save`: `meal_date` (`YYYY-MM-DD`), `meal_type` (`breakfast`, `lunch`,
  `dinner`), serta salah satu dari `recipe_id` UUID atau `meal_name` untuk menu
  sendiri. Jangan kirim keduanya. Upsert berdasarkan owner/tanggal/jenis makan.
- `meal_slot/delete`: `meal_date` dan `meal_type`.

Contoh menu dari resep:

```json
{
  "entity": "meal_slot",
  "action": "save",
  "data": {
    "meal_date": "2026-11-09",
    "meal_type": "lunch",
    "recipe_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  }
}
```

Database menyimpan snapshot nama resep sebagai `meal_name`. Menghapus resep
hanya mengosongkan `recipe_id`; slot dan nama cadangannya tetap ada. Composite
foreign key `(owner_id, recipe_id)` mencegah referensi resep milik akun lain.

Respons sukses: `{ "ok": true, "data": {...} }`. Respons gagal hanya memuat
pesan umum berbahasa Indonesia, tanpa detail SQL/database. Status: 400 untuk data
atau mutasi ditolak, 401 belum login, 403 origin ditolak, 404 target edit/hapus
tidak ditemukan, 413 body lebih dari 1 MB, 415 bukan JSON, dan 503 layanan gagal.
`GET /api/household` mempertahankan respons `{ "ok": true }`, sekarang hanya
untuk pengguna login. Respons API tidak boleh di-cache.

## Pemeriksaan pada proyek live sebelum digunakan

- Login dengan akun yang dibuat, refresh halaman, buka langsung keempat rute
  privat, lalu logout. Pastikan cookie sesi diperbarui setelah token kedaluwarsa.
- Pastikan kredensial salah ditolak tanpa membuka detail Auth, signup publik
  ditolak oleh Supabase, dan request API tanpa sesi mendapat 401.
- Setelah login, coba keenam varian command melalui request same-origin;
  verifikasi hasil melalui Data API/tabel, termasuk edit/hapus dan upsert slot.
- Untuk uji isolasi, buat akun kedua sementara lewat dashboard. Dengan JWT
  masing-masing akun, uji baca/tulis/hapus baris akun lain serta referensi resep
  lintas akun. Semuanya harus tidak mengakses/mengubah baris akun lain. Hapus
  akun uji setelah selesai. Publishable key tanpa sesi harus ditolak untuk
  akses tabel langsung melalui Data API.
- Hapus resep yang dipakai slot; verifikasi slot, tanggal, jenis makan, dan nama
  cadangan bertahan, sementara `recipe_id` menjadi null.
- Ulangi pemeriksaan cookie/origin pada deployment HTTPS Vercel sebenarnya.

## Deploy ke Vercel Hobby dari GitHub pribadi

Bagian ini adalah langkah manual setelah persiapan. Tidak ada push, pembuatan
proyek Vercel, penerapan SQL ke Supabase, atau deployment yang dijalankan oleh
langkah persiapan lokal.

### 1. Siapkan commit dan push ke GitHub

Repositori saat ini memakai origin `andikadiicky/rumah-kita` di GitHub. Gunakan
repositori milik akun GitHub pribadi, lalu pilih scope **Personal / Hobby** di
Vercel. Jika perlu repositori baru: **GitHub → + → New repository**, pilih akun
pribadi sebagai Owner, beri nama `rumah-kita`, dan sebaiknya pilih **Private**.
Untuk repositori baru yang kosong, jangan tambahkan README, lisensi, atau
`.gitignore` otomatis. Jika memakai origin yang sudah ada, tidak perlu membuat
repositori baru atau mengubah origin.

Dari root checkout lokal, periksa branch dan file:

```sh
git branch --show-current
git status --short
git check-ignore -v .env.local
# Hapus dari index saja jika masih terlacak; file lokal tetap ada.
git rm --cached --ignore-unmatch .env.local
git ls-files -- .env.local
```

Perintah terakhir harus tidak mengeluarkan nama file. `.env.example` hanya
berisi dua nama variabel dengan nilai kosong. Pastikan file berikut masuk commit:
`package.json`, `package-lock.json`, seluruh `src/`, kedua migrasi SQL,
`.env.example`, `.gitignore`, konfigurasi Next.js/TypeScript/ESLint/PostCSS,
dan README. `.env.local`, file `.env` lain, `.vercel/`, private key, serta file
credential JSON lokal diabaikan. Jangan memakai `git add -f` untuk file rahasia.

```sh
git add .gitignore .env.example AGENTS.md README.md package.json package-lock.json tsconfig.json eslint.config.mjs next.config.ts postcss.config.mjs src supabase tests
git diff --cached --stat
git diff --cached --name-only
# Tinjau isi diff secara lokal; jangan membagikan nilai credential.
git diff --cached
git commit -m "Prepare Rumah Kita for Vercel Hobby"
```

Jika GitHub meminta autentikasi, gunakan GitHub CLI/login atau credential manager
lokal; jangan memasukkan token ke URL remote atau README. Jika memilih repo baru,
ubah origin ke URL HTTPS repo pribadi tersebut **sebelum** push:

```sh
# Hanya untuk repo tujuan baru; ganti YOUR_GITHUB_USER terlebih dahulu.
git remote set-url origin https://github.com/YOUR_GITHUB_USER/rumah-kita.git
```

Setelah origin benar (repo lama atau baru), jalankan:

```sh
git push -u origin HEAD
```

Branch checkout persiapan ini bernama `work`. Jika push berasal dari branch selain
`main`, buka repo di GitHub → **Pull requests → New pull request**, pilih base
`main` dan compare branch yang baru di-push (misalnya `work`), lalu **Create pull
request → Merge pull request** setelah meninjau perubahan. Untuk repo baru yang
belum mempunyai `main`, gunakan branch yang di-push sebagai default branch atau
buat `main` di GitHub dari branch tersebut. Pastikan branch produksi yang akan
diimpor Vercel benar-benar berisi `package.json`, lockfile, dan kode terbaru;
jangan mengimpor `main` lama yang hanya berisi scaffold.

### 2. Siapkan database Production

Di proyek Supabase **Production**, jalankan kedua migrasi melalui **SQL Editor**
sesuai urutan pada bagian Menyiapkan Supabase Free di atas, hanya jika belum
pernah berhasil diterapkan. Vercel tidak menjalankan migrasi SQL ini otomatis.
Aktifkan provider Email, nonaktifkan signup publik dan anonymous sign-ins,
dan buat satu akun pemilik melalui **Authentication → Users**.

Salin Project URL dan **Publishable key** proyek Production. Tidak diperlukan
password PostgreSQL, `DATABASE_URL`, service-role key, atau secret key Supabase
untuk aplikasi ini. RLS dan sesi pengguna tetap menjadi batas akses data.

### 3. Import dan deploy melalui dashboard Vercel

1. Masuk ke **vercel.com → Dashboard**, pilih scope akun **Personal / Hobby**.
2. Klik **Add New… → Project → Import Git Repository**. Hubungkan GitHub jika
   diminta. Pada **Configure GitHub App / Adjust GitHub App Permissions**, berikan
   akses ke repo pribadi `rumah-kita`, lalu klik **Import** pada repo tersebut.
3. Pada **Configure Project**, pilih **Framework Preset: Next.js**. Root Directory
   adalah root repo (`./`, tempat `package.json` berada), bukan `src/`.
4. Biarkan pengaturan Next.js otomatis, atau tetapkan override berikut jika perlu:

   | Pengaturan | Nilai |
   | --- | --- |
   | Install Command | `npm ci` |
   | Build Command | `npm run build` |
   | Output Directory | Default Next.js; jangan isi `out` atau override ke direktori statis |
   | Node.js Version | `24.x`, sesuai `package.json` |
   | Production Branch | Branch kode final, biasanya `main` setelah merge |

   Versi Node dan branch dapat diperiksa di **Project → Settings → Build and
   Deployment / Git**. Jangan menjalankan `npm run dev` sebagai build/start
   command Vercel. Tidak diperlukan custom server, Docker, atau `vercel.json`.
5. Buka **Environment Variables** di panel import. Tambahkan dua variabel ini
   dengan nilai proyek Supabase Production dan scope **Production**:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL HTTPS dari Supabase Production |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key dari proyek yang sama |

   Jangan mencentang **Preview** untuk nilai database Production. Jika panel
   import tidak menampilkan pilihan scope, jangan masukkan nilai Production
   ke input tanpa scope. Buat proyek tanpa variabel terlebih dahulu (login belum
   dapat dipakai), tambahkan kedua nilai dengan scope Production melalui
   **Project → Settings → Environment Variables**, lalu Redeploy Production.
   Jangan menambahkan `.env.local`, service-role key, atau `NODE_USE_ENV_PROXY`
   ke Vercel. Pengaturan proxy terakhir hanya untuk cloud development ini.
6. Klik **Deploy**. Tunggu status **Ready**, buka Build Logs jika gagal, lalu
   salin URL/domain **Production** dari deployment/proyek. Jangan memakai URL
   Preview sebagai alamat Production. Jika branch yang diimpor belum benar,
   atur Production Branch ke branch final dan buat deployment ulang.
7. Jika variabel diubah setelah build, buka **Deployments → deployment Production
   terbaru → … → Redeploy**. Variabel `NEXT_PUBLIC_*` harus tersedia saat build;
   perubahan variabel tidak memperbarui bundle deployment yang sudah ada.

Aplikasi membutuhkan backend Next.js: Server Components dinamis, Server Actions
untuk login, Route Handlers `/api/household` dan `/auth/logout`, serta `proxy.ts`
untuk cookie. Jangan memakai static export (`output: "export"`), `next export`,
GitHub Pages, atau preset static site. Next.js preset Vercel menangani fungsi
backend tersebut; aplikasi tidak menyimpan data pada filesystem fungsi Vercel.
Logout memakai origin browser yang sudah lolos pemeriksaan same-origin, sehingga
redirect tetap menuju domain publik HTTPS saat server berada di belakang proxy.

### 4. Atur Supabase Auth Site URL

Setelah mendapatkan URL Production, buka **Supabase Production → Authentication
→ URL Configuration → Site URL**. Isi origin HTTPS deployment yang benar,
misalnya `https://YOUR_PRODUCTION_DOMAIN.vercel.app`, tanpa `/login`, lalu **Save**.
Jika kelak memakai custom domain sebagai alamat utama, ubah Site URL ke origin
custom domain itu dan gunakan alamat yang sama di kedua perangkat.

Login email/password saat ini memakai `signInWithPassword`, bukan redirect OAuth;
tidak ada callback route yang perlu ditambahkan. Redirect URLs tambahan baru
perlu dikonfigurasi jika menambah OAuth, magic link, atau pemulihan password.

### 5. Database terpisah untuk Preview

Preview yang membutuhkan login dan data harus diarahkan ke proyek Supabase
**development/preview** terpisah, bukan database Production:

1. Buat proyek Supabase kedua. Terapkan kedua migrasi di proyek tersebut dan
   buat akun pengujian sendiri; akun dan UUID pengguna tidak otomatis disalin
   dari Production. Nonaktifkan signup publik juga.
2. Di **Vercel Project → Settings → Environment Variables**, tambahkan nama
   `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` yang sama,
   tetapi isi dengan URL/key proyek preview dan pilih scope **Preview saja**.
   Bila perlu, batasi nilai ke branch preview tertentu. Nilai **Production**
   tetap mengarah ke database Production.
3. Push branch atau buka pull request untuk memicu deployment Preview baru,
   atau Redeploy Preview setelah mengubah variabel. Periksa environment yang
   dipakai deployment sebelum membuat record uji.
4. Salin URL Preview yang dipakai penguji; atur **Site URL** pada proyek Supabase
   preview ke origin HTTPS tersebut. Untuk branch/domain preview stabil, gunakan
   URL stabil yang ditampilkan Vercel. Jika URL berubah dan memakai fitur Auth
   berbasis email/redirect kelak, perbarui pengaturan redirect proyek preview.
5. Jika Preview dilindungi Vercel Deployment Protection, penguji harus mendapat
   akses Vercel terlebih dahulu. Itu terpisah dari login akun Rumah Kita.

### 6. Live smoke test setelah deployment

Gunakan record bernama unik, misalnya `UJI-DEPLOY-...`, dan hapus hanya record uji
setelah selesai. Pemeriksaan ini harus dijalankan pada deployment yang sebenarnya;
production build lokal tidak membuktikan konfigurasi Supabase/Vercel live.

1. **Login ponsel (sekitar 390 px):** buka URL Production HTTPS, masuk dengan
   akun pemilik. Pastikan dashboard, navigasi bawah, dan empat layar privat
   dapat dibuka. Login salah harus menampilkan pesan umum, bukan detail Auth.
2. **Simpan di ponsel:** tambah essential uji berstatus Perlu Dibeli dengan
   tanggal rencana besok; reload dan pastikan nama/tanggal tetap ada. Tambah
   resep uji dengan bahan dan langkah multiline, lalu jadwalkan resep itu pada
   satu slot makan. Reload dan pastikan resep serta slot tersimpan.
3. **Buka di tablet (sekitar 768 px):** masuk ke **akun yang sama pada URL yang
   sama** di tablet/browser lain. Pastikan barang, tanggal, resep, dan slot
   buatan ponsel muncul dari database. Ubah nama barang atau gunakan Sudah Dibeli
   (status menjadi Tersedia dan tanggal kosong). Reload ponsel untuk memastikan
   perubahan tablet terlihat. Penyimpanan tidak boleh hanya bergantung pada
   localStorage atau sesi satu perangkat.
4. **Resep dan jadwal:** ubah nama resep; menu yang masih terhubung menampilkan
   nama terkini. Hapus resep melalui konfirmasi. Slot makan harus tetap ada
   dengan nama cadangan yang tersimpan saat dijadwalkan, tanpa tautan resep.
5. **Keluar:** klik Keluar pada salah satu perangkat. Pastikan kembali ke
   `/login`; membuka `/`, `/essentials`, `/recipes`, dan `/meal-plan` pada browser
   tersebut harus mengarahkan kembali ke `/login`.
6. **Tamu dan API:** pada jendela privat baru tanpa cookie aplikasi, ulangi
   pembukaan empat rute privat. Di DevTools Console halaman `/login` pada domain
   Production yang sama, jalankan:

   ```js
   const response = await fetch('/api/household', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       entity: 'essential',
       action: 'save',
       data: { name: 'UJI-TAMU-TIDAK-BOLEH-TERSIMPAN', status: 'to_buy' }
     })
   });
   console.log(response.status, await response.json());
   ```

   Hasil harus **401** dengan pesan JSON `Silakan masuk terlebih dahulu.` dan
   tidak membuat barang. Pastikan ini respons aplikasi, bukan halaman login
   Vercel Deployment Protection. Tidak ada cookie/token/password yang perlu
   disalin ke terminal atau chat.
7. **Bersihkan:** masuk kembali, hapus barang dan resep berawalan uji yang dibuat
   sendiri, dan kosongkan slot uji. Pastikan data rumah tangga lain tidak berubah.

### Status persiapan lokal

Lockfile npm sesuai manifest; `.env.example` hanya berisi placeholder kosong;
migrasi `001_initial.sql` dan `002_household_backend.sql` tersedia untuk commit.
`.env.local` diabaikan dan tidak ada dalam index Git; penghapusan versi lamanya
sudah disiapkan. Pemeriksaan pola credential pada file yang dapat di-commit tidak
menemukan private key atau token nyata. Tetap tinjau staged diff sebelum push.

Build lokal dan pemeriksaan backend lokal dijalankan pada tahap persiapan.
GitHub push, import Vercel, deployment, penerapan SQL Production, pengaturan Site
URL live, dan smoke test dua perangkat tetap merupakan langkah dashboard/manual
di atas, bukan hasil yang sudah diverifikasi live.
