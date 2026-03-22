const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── DATABASE SETUP ───
const db = new Database(process.env.DB_PATH || './data.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT DEFAULT '',
    pin TEXT NOT NULL,
    monthly_hours REAL DEFAULT 160,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    penalty_hours REAL DEFAULT 2,
    deadline TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS deductions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    task_id INTEGER,
    task_title TEXT NOT NULL,
    hours REAL NOT NULL,
    reason TEXT DEFAULT 'Aufgabe nicht erledigt',
    date TEXT DEFAULT (date('now')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY,
    password_hash TEXT NOT NULL
  );
`);

// Create default admin if not exists (password: admin123)
const adminExists = db.prepare('SELECT id FROM admin WHERE id = 1').get();
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO admin (id, password_hash) VALUES (1, ?)').run(hash);
  console.log('✅ Default admin created (password: admin123)');
}

// ─── MIDDLEWARE ───
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple session tokens (in-memory, resets on restart)
const sessions = new Map();
function generateToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function authMiddleware(requiredRole) {
  return (req, res, next) => {
    const token = req.headers['x-auth-token'];
    if (!token || !sessions.has(token)) {
      return res.status(401).json({ error: 'Nicht autorisiert' });
    }
    const session = sessions.get(token);
    if (requiredRole && session.role !== requiredRole) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    req.user = session;
    next();
  };
}

// ─── AUTH ROUTES ───
app.post('/api/login/admin', (req, res) => {
  const { password } = req.body;
  const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get();
  if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.status(401).json({ error: 'Falsches Passwort' });
  }
  const token = generateToken();
  sessions.set(token, { role: 'admin', name: 'Administrator' });
  res.json({ token, name: 'Administrator', role: 'admin' });
});

app.post('/api/login/employee', (req, res) => {
  const { pin } = req.body;
  const emp = db.prepare('SELECT * FROM employees WHERE pin = ? AND active = 1').get(pin);
  if (!emp) {
    return res.status(401).json({ error: 'PIN nicht gefunden' });
  }
  const token = generateToken();
  sessions.set(token, { role: 'employee', id: emp.id, name: emp.name });
  res.json({ token, name: emp.name, role: 'employee', id: emp.id });
});

app.post('/api/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

app.post('/api/admin/change-password', authMiddleware('admin'), (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Passwort muss mindestens 4 Zeichen haben' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admin SET password_hash = ? WHERE id = 1').run(hash);
  res.json({ ok: true });
});

// ─── EMPLOYEE ROUTES ───
app.get('/api/employees', authMiddleware('admin'), (req, res) => {
  const employees = db.prepare('SELECT * FROM employees WHERE active = 1 ORDER BY name').all();
  // Add deduction totals
  const deductionStmt = db.prepare('SELECT COALESCE(SUM(hours), 0) as total FROM deductions WHERE employee_id = ?');
  const taskStmt = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE employee_id = ? AND status = ?');
  employees.forEach(e => {
    e.total_deductions = deductionStmt.get(e.id).total;
    e.effective_hours = e.monthly_hours - e.total_deductions;
    e.open_tasks = taskStmt.get(e.id, 'open').count;
    e.overdue_tasks = taskStmt.get(e.id, 'overdue').count;
  });
  res.json(employees);
});

app.post('/api/employees', authMiddleware('admin'), (req, res) => {
  const { name, role, pin, monthly_hours } = req.body;
  if (!name || !pin) return res.status(400).json({ error: 'Name und PIN sind Pflichtfelder' });
  if (pin.length !== 4) return res.status(400).json({ error: 'PIN muss 4 Stellen haben' });
  
  const existing = db.prepare('SELECT id FROM employees WHERE pin = ? AND active = 1').get(pin);
  if (existing) return res.status(400).json({ error: 'PIN wird bereits verwendet' });
  
  const result = db.prepare('INSERT INTO employees (name, role, pin, monthly_hours) VALUES (?, ?, ?, ?)')
    .run(name, role || '', pin, monthly_hours || 160);
  res.json({ id: result.lastInsertRowid, ok: true });
});

app.put('/api/employees/:id', authMiddleware('admin'), (req, res) => {
  const { name, role, pin, monthly_hours } = req.body;
  if (!name || !pin) return res.status(400).json({ error: 'Name und PIN sind Pflichtfelder' });
  
  const existing = db.prepare('SELECT id FROM employees WHERE pin = ? AND active = 1 AND id != ?').get(pin, req.params.id);
  if (existing) return res.status(400).json({ error: 'PIN wird bereits verwendet' });
  
  db.prepare('UPDATE employees SET name = ?, role = ?, pin = ?, monthly_hours = ? WHERE id = ?')
    .run(name, role || '', pin, monthly_hours || 160, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/employees/:id', authMiddleware('admin'), (req, res) => {
  db.prepare('UPDATE employees SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── TASK ROUTES ───
app.get('/api/tasks', authMiddleware(), (req, res) => {
  let tasks;
  if (req.user.role === 'admin') {
    tasks = db.prepare(`
      SELECT t.*, e.name as employee_name 
      FROM tasks t 
      LEFT JOIN employees e ON t.employee_id = e.id 
      ORDER BY t.created_at DESC
    `).all();
  } else {
    tasks = db.prepare(`
      SELECT t.*, e.name as employee_name 
      FROM tasks t 
      LEFT JOIN employees e ON t.employee_id = e.id 
      WHERE t.employee_id = ?
      ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'overdue' THEN 1 ELSE 2 END, t.deadline
    `).all(req.user.id);
  }
  res.json(tasks);
});

app.post('/api/tasks', authMiddleware('admin'), (req, res) => {
  const { employee_id, title, description, penalty_hours, deadline } = req.body;
  if (!title || !employee_id || !deadline) {
    return res.status(400).json({ error: 'Titel, Mitarbeiter und Deadline sind Pflicht' });
  }
  const result = db.prepare(
    'INSERT INTO tasks (employee_id, title, description, penalty_hours, deadline) VALUES (?, ?, ?, ?, ?)'
  ).run(employee_id, title, description || '', penalty_hours || 2, deadline);
  res.json({ id: result.lastInsertRowid, ok: true });
});

app.put('/api/tasks/:id/status', authMiddleware(), (req, res) => {
  const { status } = req.body;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Aufgabe nicht gefunden' });

  // Employees can only mark as done
  if (req.user.role === 'employee') {
    if (status !== 'done') return res.status(403).json({ error: 'Nicht erlaubt' });
    if (task.employee_id !== req.user.id) return res.status(403).json({ error: 'Nicht deine Aufgabe' });
  }

  const completedAt = status === 'done' ? new Date().toISOString() : null;
  db.prepare('UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?')
    .run(status, completedAt, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/tasks/:id', authMiddleware('admin'), (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── DEDUCTION ROUTES ───
app.get('/api/deductions', authMiddleware(), (req, res) => {
  let deductions;
  if (req.user.role === 'admin') {
    deductions = db.prepare(`
      SELECT d.*, e.name as employee_name 
      FROM deductions d 
      LEFT JOIN employees e ON d.employee_id = e.id 
      ORDER BY d.created_at DESC
    `).all();
  } else {
    deductions = db.prepare(`
      SELECT d.*, e.name as employee_name 
      FROM deductions d 
      LEFT JOIN employees e ON d.employee_id = e.id 
      WHERE d.employee_id = ?
      ORDER BY d.created_at DESC
    `).all(req.user.id);
  }
  res.json(deductions);
});

app.post('/api/deductions', authMiddleware('admin'), (req, res) => {
  const { task_id } = req.body;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task_id);
  if (!task) return res.status(404).json({ error: 'Aufgabe nicht gefunden' });

  // Prevent duplicate deductions
  if (task.status === 'deducted') {
    return res.status(400).json({ error: 'Abzug wurde bereits gebucht' });
  }

  db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('deducted', task.id);
  const result = db.prepare(
    'INSERT INTO deductions (employee_id, task_id, task_title, hours, reason) VALUES (?, ?, ?, ?, ?)'
  ).run(task.employee_id, task.id, task.title, task.penalty_hours, 'Aufgabe nicht erledigt');

  res.json({ id: result.lastInsertRowid, ok: true });
});

// ─── STATS ───
app.get('/api/stats', authMiddleware('admin'), (req, res) => {
  const totalEmployees = db.prepare('SELECT COUNT(*) as c FROM employees WHERE active = 1').get().c;
  const openTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'open'").get().c;
  const overdueTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'overdue'").get().c;
  const totalDeductions = db.prepare('SELECT COALESCE(SUM(hours), 0) as c FROM deductions').get().c;
  const completedToday = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'done' AND date(completed_at) = date('now')").get().c;
  res.json({ totalEmployees, openTasks, overdueTasks, totalDeductions, completedToday });
});

// Employee self-stats
app.get('/api/my-stats', authMiddleware('employee'), (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.user.id);
  const totalDed = db.prepare('SELECT COALESCE(SUM(hours), 0) as c FROM deductions WHERE employee_id = ?').get(req.user.id).c;
  const openTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE employee_id = ? AND status = 'open'").get(req.user.id).c;
  const doneTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE employee_id = ? AND status = 'done'").get(req.user.id).c;
  const overdueTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE employee_id = ? AND status = 'overdue'").get(req.user.id).c;
  res.json({
    name: emp.name, role: emp.role,
    monthly_hours: emp.monthly_hours,
    total_deductions: totalDed,
    effective_hours: emp.monthly_hours - totalDed,
    openTasks, doneTasks, overdueTasks
  });
});

// ─── TERMINAL PAGE (read-only, no admin access) ───
app.get('/terminal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terminal.html'));
});

// ─── CATCH-ALL: serve frontend ───
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── START ───
app.listen(PORT, () => {
  console.log(`\n🚀 Task System läuft auf http://localhost:${PORT}`);
  console.log(`   Admin-Login: Passwort "admin123"\n`);
});
