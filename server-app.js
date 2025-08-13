
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import methodOverride from 'method-override';
import dayjs from 'dayjs';
import dotenv from 'dotenv';
import expressLayouts from 'express-ejs-layouts';
import bcrypt from 'bcrypt';
import cookieSession from 'cookie-session';
import db from './src/db-postgres.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// Parsers & method override
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

// Static (served through the same serverless function via rewrite)
app.use(express.static(path.join(__dirname, 'public')));

// Sessions via encrypted cookie (aman untuk serverless)
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret';
app.use(cookieSession({
  name: 'tsa_session',
  secret: SESSION_SECRET,
  maxAge: 1000*60*60*8, // 8 jam
  sameSite: 'lax',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production'
}));

// Expose globals to views
app.use((req,res,next) => {
  res.locals.appName = process.env.APP_NAME || 'Tabungan Santri Alhidayah';
  res.locals.user = req.session?.user || null;
  res.locals.dayjs = dayjs;
  next();
});

// Auth helpers
function requireAuth(req, res, next) {
  if (!req.session?.user) return res.redirect('/login');
  next();
}
function requireRole(role) {
  return (req,res,next) => {
    if (!req.session?.user) return res.redirect('/login');
    if (req.session.user.role !== role) return res.status(403).send('Forbidden');
    next();
  };
}

// Routes
app.get('/', (req,res) => {
  if (!req.session?.user) return res.redirect('/login');
  if (req.session.user.role === 'admin') return res.redirect('/admin');
  return res.redirect('/me');
});

app.get('/login', (req,res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req,res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.render('login', { error: 'Mohon isi username & password.' });
  const user = await db.getUserByUsername(username);
  if (!user) return res.render('login', { error: 'Username atau password salah.' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.render('login', { error: 'Username atau password salah.' });
  req.session.user = { id: user.id, username: user.username, role: user.role, student_id: user.student_id };
  res.redirect('/');
});

app.post('/logout', (req,res) => {
  req.session = null;
  res.redirect('/login');
});

// Admin
app.get('/admin', requireRole('admin'), async (req,res) => {
  const stats = await db.getAdminStats();
  res.render('admin/dashboard', { stats });
});

app.get('/admin/students', requireRole('admin'), async (req,res) => {
  const q = req.query.q || '';
  const students = await db.searchStudents(q);
  res.render('admin/students', { students, q });
});

app.post('/admin/students', requireRole('admin'), async (req,res) => {
  const { name, kelas, phone } = req.body;
  if (!name) return res.status(400).send('Nama wajib diisi');
  await db.createStudent({ name, kelas, phone });
  res.redirect('/admin/students');
});

app.post('/admin/students/:id/delete', requireRole('admin'), async (req,res) => {
  const id = Number(req.params.id);
  await db.deleteStudent(id);
  res.redirect('/admin/students');
});

app.post('/admin/students/:id/deposit', requireRole('admin'), async (req,res) => {
  const id = Number(req.params.id);
  const amount = Number(req.body.amount);
  const note = (req.body.note || '').slice(0,200);
  if (isNaN(amount) || amount <= 0) return res.status(400).send('Nominal tidak valid.');
  await db.addTransaction({ student_id: id, amount, type:'DEPOSIT', note, admin_id: req.session.user.id });
  res.redirect('/admin/students?q=' + encodeURIComponent(req.query.q || ''));
});

app.post('/admin/students/:id/withdraw', requireRole('admin'), async (req,res) => {
  const id = Number(req.params.id);
  const amount = Number(req.body.amount);
  const note = (req.body.note || '').slice(0,200);
  if (isNaN(amount) || amount <= 0) return res.status(400).send('Nominal tidak valid.');
  const bal = await db.getStudentBalance(id);
  if (bal < amount) return res.status(400).send('Saldo tidak mencukupi.');
  await db.addTransaction({ student_id: id, amount: -amount, type:'WITHDRAW', note, admin_id: req.session.user.id });
  res.redirect('/admin/students?q=' + encodeURIComponent(req.query.q || ''));
});

// Riwayat transaksi admin
app.get('/admin/transactions', requireRole('admin'), async (req,res) => {
  const { student_id, from, to } = req.query;
  const filter = {
    student_id: student_id ? Number(student_id) : null,
    from: from || null,
    to: to || null
  };
  const transactions = await db.listTransactions(filter);
  const students = await db.searchStudents('');
  res.render('admin/transactions', { transactions, filter, students });
});

app.get('/admin/transactions/print', requireRole('admin'), async (req,res) => {
  const { student_id, from, to } = req.query;
  const filter = {
    student_id: student_id ? Number(student_id) : null,
    from: from || null,
    to: to || null
  };
  const transactions = await db.listTransactions(filter);
  const student = filter.student_id ? await db.getStudentById(filter.student_id) : null;
  res.render('admin/print', { transactions, filter, student });
});

// User
app.get('/me', requireAuth, async (req,res) => {
  if (req.session.user.role === 'admin') return res.redirect('/admin');
  const studentId = req.session.user.student_id;
  const student = await db.getStudentById(studentId);
  const balance = await db.getStudentBalance(studentId);
  const transactions = await db.listTransactions({ student_id: studentId });
  res.render('user/dashboard', { student, balance, transactions });
});

// Offline PWA
app.get('/offline', (req,res) => {
  res.send('<h1>Anda offline</h1><p>Coba lagi saat tersambung internet.</p>');
});

// Ensure schema + seed on cold start
await db.ensureSeed();

export default app;
