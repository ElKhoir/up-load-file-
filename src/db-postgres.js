
import { neon, neonConfig } from '@neondatabase/serverless';
import bcrypt from 'bcrypt';

neonConfig.fetchConnectionCache = true;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.warn('⚠️ DATABASE_URL tidak terpasang. Set di .env (lokal) atau Vercel env.');
}
const sql = neon(DATABASE_URL);

// Init tables if not exist
async function ensureSchema() {
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
  await ensureSchema();
  // admin default
  const admin = await sql`SELECT * FROM users WHERE username = 'admin'`;
  if (admin.length === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await sql`INSERT INTO users (username,password_hash,role) VALUES ('admin', ${hash}, 'admin')`;
  }
  // siswa demo
  const cnt = await sql`SELECT COUNT(*)::int AS c FROM students`;
  if (cnt[0].c === 0) {
    const student = await sql`INSERT INTO students (name,kelas,phone) VALUES ('Ahmad Fauzi','9A','0812xxxxxxx') RETURNING id`;
    const sid = student[0].id;
    await sql`INSERT INTO transactions (student_id,amount,type,note,admin_id) VALUES (${sid}, 50000, 'DEPOSIT', 'Setoran awal', 1)`;
    const hash = await bcrypt.hash('fauzi123', 10);
    await sql`INSERT INTO users (username,password_hash,role,student_id) VALUES ('fauzi', ${hash}, 'user', ${sid})`;
  }
}

async function getUserByUsername(username) {
  const rows = await sql`SELECT * FROM users WHERE username = ${username}`;
  return rows[0] || null;
}
async function getStudentById(id) {
  const rows = await sql`SELECT * FROM students WHERE id = ${id}`;
  return rows[0] || null;
}
async function searchStudents(q) {
  const like = `%${q || ''}%`;
  const rows = await sql`
    SELECT s.*,
      COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.student_id = s.id),0)::int AS balance
    FROM students s
    WHERE s.name ILIKE ${like} OR COALESCE(s.kelas,'') ILIKE ${like} OR COALESCE(s.phone,'') ILIKE ${like}
    ORDER BY s.name ASC
  `;
  return rows;
}
async function createStudent({ name, kelas, phone }) {
  await sql`INSERT INTO students (name,kelas,phone) VALUES (${name}, ${kelas || null}, ${phone || null})`;
}
async function deleteStudent(id) {
  await sql`DELETE FROM students WHERE id = ${id}`;
}
async function getStudentBalance(student_id) {
  const rows = await sql`SELECT COALESCE(SUM(amount),0)::int AS balance FROM transactions WHERE student_id = ${student_id}`;
  return rows[0]?.balance || 0;
}
async function addTransaction({ student_id, amount, type, note, admin_id }) {
  await sql`INSERT INTO transactions (student_id, amount, type, note, admin_id)
            VALUES (${student_id}, ${amount}, ${type}, ${note || null}, ${admin_id || null})`;
}
async function listTransactions({ student_id=null, from=null, to=null }={}) {
  const conds = [];
  const params = [];
  if (student_id) { conds.push(sql`t.student_id = ${student_id}`); }
  if (from) { conds.push(sql`t.created_at::date >= ${from}`); }
  if (to) { conds.push(sql`t.created_at::date <= ${to}`); }
  let where = sql``;
  if (conds.length) {
    where = sql`WHERE ${sql.join(conds, sql` AND `)}`;
  }
  const rows = await sql`
    SELECT t.*, s.name as student_name, u.username as admin_username
    FROM transactions t
    JOIN students s ON s.id = t.student_id
    LEFT JOIN users u ON u.id = t.admin_id
    ${where}
    ORDER BY t.created_at DESC, t.id DESC
  `;
  return rows;
}

export default {
  ensureSeed,
  getUserByUsername,
  getStudentById,
  searchStudents,
  createStudent,
  deleteStudent,
  getStudentBalance,
  addTransaction,
  listTransactions
};
