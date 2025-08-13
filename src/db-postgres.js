// src/db-postgres.js
import { neon, neonConfig } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

neonConfig.fetchConnectionCache = true;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.warn('⚠️ DATABASE_URL tidak terpasang.');
}
const sql = neon(DATABASE_URL);

export async function ensureSchema() {
  await sql`CREATE TABLE IF NOT EXISTS students(
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    kelas TEXT,
    phone TEXT
  );`;
  await sql`CREATE TABLE IF NOT EXISTS users(
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','user')),
    student_id INTEGER REFERENCES students(id) ON DELETE SET NULL
  );`;
  await sql`CREATE TABLE IF NOT EXISTS transactions(
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('DEPOSIT','WITHDRAW')),
    note TEXT,
    admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );`;
}

async function ensureSeed() {
  // Jalankan ini HANYA manual bila diperlukan (jangan di startup produksi)
  await ensureSchema();
  const admin = await sql`SELECT 1 FROM users WHERE username='admin'`;
  if (admin.length === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await sql`INSERT INTO users (username,password_hash,role
