const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const databasePath = path.resolve(process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'attendance.sqlite'));
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    employee_number TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'employee')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    attendance_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
    clock_in TEXT,
    breakfast_start TEXT,
    breakfast_end TEXT,
    lunch_start TEXT,
    lunch_end TEXT,
    clock_out TEXT,
    absence_reason TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (employee_id, attendance_date)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS attendance_date_idx ON attendance(attendance_date);
  CREATE INDEX IF NOT EXISTS attendance_employee_date_idx ON attendance(employee_id, attendance_date);
`);

const employeeColumns = db.prepare('PRAGMA table_info(employees)').all();
if (!employeeColumns.some((column) => column.name === 'department_id')) {
  db.exec('ALTER TABLE employees ADD COLUMN department_id INTEGER REFERENCES departments(id)');
}
if (!employeeColumns.some((column) => column.name === 'position')) {
  db.exec("ALTER TABLE employees ADD COLUMN position TEXT NOT NULL DEFAULT 'Junior'");
}

const attendanceColumns = db.prepare('PRAGMA table_info(attendance)').all();
if (!attendanceColumns.some((column) => column.name === 'breakfast_start')) {
  db.exec('ALTER TABLE attendance ADD COLUMN breakfast_start TEXT');
}
if (!attendanceColumns.some((column) => column.name === 'breakfast_end')) {
  db.exec('ALTER TABLE attendance ADD COLUMN breakfast_end TEXT');
}

const now = new Date().toISOString();
const propertyDepartment = db.prepare('SELECT id FROM departments WHERE lower(name) = lower(?)').get('Property Branch');
if (!propertyDepartment) {
  db.prepare('INSERT INTO departments (name, created_at) VALUES (?, ?)').run('Property Branch', now);
}

if (process.env.NODE_ENV !== 'production' && !db.prepare("SELECT id FROM employees WHERE role = 'admin' LIMIT 1").get()) {
  db.prepare(`INSERT INTO employees
    (full_name, employee_number, email, password_hash, role, department_id, position, active, created_at)
    VALUES (?, ?, ?, ?, 'admin', ?, 'Director', 1, ?)`).run(
    'Administrator',
    'ADMIN-001',
    'Administrator@123',
    bcrypt.hashSync('coj@123', 12),
    db.prepare('SELECT id FROM departments WHERE lower(name) = lower(?)').get('Property Branch').id,
    now
  );
}

module.exports = db;