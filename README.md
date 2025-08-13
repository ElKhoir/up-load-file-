
# Tabungan Santri Alhidayah — Vercel + Neon

Siap deploy di **Vercel** (Serverless Functions) dan **Neon Postgres**.

## Jalankan Lokal
1. `cp .env.example .env` lalu isi `DATABASE_URL`, `SESSION_SECRET`.
2. `npm install`
3. `npm start`
4. Buka `http://localhost:3000` → login `admin/admin123` (admin), `fauzi/fauzi123` (user).

## Deploy ke Vercel
1. Buat database di **Neon**. Ambil **Connection String** (postgresql://...`?sslmode=require`).
2. Di Vercel Project → **Settings → Environment Variables**, isi:
   - `DATABASE_URL` = connection string Neon
   - `SESSION_SECRET` = string acak kuat
   - `APP_NAME` = Tabungan Santri Alhidayah (opsional)
3. Deploy. Semua request di-rewrite ke `/api` sesuai `vercel.json`. Static file juga dilayani via Express.

## Catatan Teknis
- **Sessions**: memakai `cookie-session` (disimpan di cookie terenkripsi, cocok untuk serverless).
- **Database**: driver **@neondatabase/serverless** (HTTP, efisien di lingkungan serverless).
- **Schema & Seed** dibuat otomatis pada cold start (`ensureSeed()`).

