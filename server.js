const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const db = require('./lib/database');
const { attendanceTotals, canClockOut, expectedDeparture, dateKeyInJoburg, dateRange, isWeekendDate } = require('./lib/attendance');

const app = express();
const port = Number(process.env.PORT || 3000);
const cookieName = 'joburg_session';
const sessionLifetimeMs = 12 * 60 * 60 * 1000;
const configuredOrigin = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : null;

if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { scriptSrc: ["'self'"], styleSrc: ["'self'", 'https://fonts.googleapis.com'], styleSrcAttr: ["'unsafe-inline'"], fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'https://images.unsplash.com', 'data:'] } } }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.use('/api', (request, response, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next();
  const origin = request.get('origin');
  if (configuredOrigin && origin && origin !== configuredOrigin) return response.status(403).json({ error: 'Request origin is not allowed.' });
  return next();
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });

function cookieValue(request, name) {
  const item = (request.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!item) return null;
  try { return decodeURIComponent(item.slice(name.length + 1)); } catch { return null; }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function requireAuth(request, response, next) {
  const token = cookieValue(request, cookieName);
  if (!token) return response.status(401).json({ error: 'Please sign in to continue.' });
  const session = db.prepare(`SELECT sessions.token_hash, sessions.csrf_token, sessions.expires_at,
    employees.id, employees.full_name, employees.employee_number, employees.email, employees.role, employees.active
    FROM sessions JOIN employees ON employees.id = sessions.employee_id
    WHERE sessions.token_hash = ?`).get(hashToken(token));
  if (!session || session.expires_at <= new Date().toISOString() || !session.active) {
    if (session) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(session.token_hash);
    return response.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
  request.user = session;
  return next();
}

function requireRole(role) {
  return (request, response, next) => {
    if (request.user.role !== role) return response.status(403).json({ error: 'You do not have permission to do that.' });
    return next();
  };
}

function requireCsrf(request, response, next) {
  const supplied = request.get('x-csrf-token') || '';
  const expected = request.user.csrf_token;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return response.status(403).json({ error: 'Session check failed. Refresh the page and try again.' });
  }
  return next();
}

function publicUser(user) {
  return { id: user.id, name: user.full_name, employeeNumber: user.employee_number, email: user.email, role: user.role };
}

function ensureWeekday(request, response) {
  if (isWeekendDate(dateKeyInJoburg())) {
    response.status(403).json({ error: 'Attendance actions are closed on Saturdays and Sundays. You can still view your reports.' });
    return false;
  }
  return true;
}

function getTodayRecord(employeeId, today = dateKeyInJoburg()) {
  return db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ?').get(employeeId, today) || null;
}

function attendanceView(record) {
  return record ? { ...record, ...attendanceTotals(record), expectedDeparture: expectedDeparture(record) } : {
    status: 'not_started', clock_in: null, breakfast_start: null, breakfast_end: null,
    lunch_start: null, lunch_end: null, clock_out: null, absence_reason: null,
    workedMinutes: 0, breakfastMinutes: 0, lunchMinutes: 0, remainingMinutes: 480,
    expectedDeparture: null
  };
}

function inputString(value, maximum = 120) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

app.get('/api/session', (request, response) => {
  const token = cookieValue(request, cookieName);
  if (!token) return response.json({ user: null, csrfToken: null });
  const session = db.prepare(`SELECT sessions.token_hash, sessions.csrf_token, sessions.expires_at,
    employees.id, employees.full_name, employees.employee_number, employees.email, employees.role, employees.active
    FROM sessions JOIN employees ON employees.id = sessions.employee_id
    WHERE sessions.token_hash = ?`).get(hashToken(token));
  if (!session || session.expires_at <= new Date().toISOString() || !session.active) {
    if (session) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(session.token_hash);
    response.clearCookie(cookieName, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' });
    return response.json({ user: null, csrfToken: null });
  }
  return response.json({ user: publicUser(session), csrfToken: session.csrf_token });
});

app.post('/api/login', loginLimiter, (request, response) => {
  const email = inputString(request.body?.email, 254).toLowerCase();
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  const requestedRole = request.body?.role === 'admin' ? 'admin' : 'employee';
  const user = db.prepare('SELECT * FROM employees WHERE lower(email) = ? AND active = 1').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return response.status(401).json({ error: 'Email or password is incorrect.' });
  }
  if (user.role !== requestedRole) {
    return response.status(403).json({ error: `This account is for ${user.role === 'admin' ? 'Administrator' : 'Employee'} sign in.` });
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionLifetimeMs).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, employee_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), user.id, csrfToken, expiresAt);
  response.cookie(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: sessionLifetimeMs
  });
  return response.json({ user: publicUser(user), csrfToken });
});

app.post('/api/logout', requireAuth, requireCsrf, (request, response) => {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(request.user.token_hash);
  response.clearCookie(cookieName, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' });
  return response.json({ ok: true });
});

app.post('/api/password/reset', loginLimiter, (request, response) => {
  if (process.env.NODE_ENV === 'production') {
    return response.status(503).json({ error: 'Self-service reset is unavailable until email verification is configured. Contact the administrator.' });
  }
  const email = inputString(request.body?.email, 254).toLowerCase();
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 12) {
    return response.status(400).json({ error: 'Enter a registered employee email and a new password of at least 12 characters.' });
  }
  const employee = db.prepare("SELECT id FROM employees WHERE lower(email) = ? AND role = 'employee' AND active = 1").get(email);
  if (!employee) return response.status(404).json({ error: 'No active employee account exists with that email.' });
  db.prepare('UPDATE employees SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 12), employee.id);
  db.prepare('DELETE FROM sessions WHERE employee_id = ?').run(employee.id);
  return response.json({ ok: true });
});

app.get('/api/attendance/today', requireAuth, requireRole('employee'), (request, response) => {
  const today = dateKeyInJoburg();
  return response.json({ date: today, isWeekend: isWeekendDate(today), attendance: attendanceView(getTodayRecord(request.user.id, today)) });
});

app.post('/api/attendance/action', requireAuth, requireRole('employee'), requireCsrf, (request, response) => {
  if (!ensureWeekday(request, response)) return;
  const action = request.body?.action;
  const now = new Date().toISOString();
  const today = dateKeyInJoburg();
  let record = getTodayRecord(request.user.id, today);
  if (record?.status === 'absent') return response.status(409).json({ error: 'Absence has already been recorded for today.' });

  if (action === 'clock_in') {
    if (record) return response.status(409).json({ error: 'Arrival has already been recorded for today.' });
    db.prepare(`INSERT INTO attendance (employee_id, attendance_date, status, clock_in, created_at)
      VALUES (?, ?, 'present', ?, ?)`).run(request.user.id, today, now, now);
  } else if (action === 'lunch_start') {
    if (!record?.clock_in || record.clock_out || record.lunch_start || record.lunch_end) {
      return response.status(409).json({ error: 'Lunch can be started once, after arrival and before departure.' });
    }
    db.prepare('UPDATE attendance SET lunch_start = ? WHERE id = ?').run(now, record.id);
  } else if (action === 'lunch_end') {
    if (!record?.lunch_start || record.lunch_end || record.clock_out) {
      return response.status(409).json({ error: 'There is no active lunch break to end.' });
    }
    db.prepare('UPDATE attendance SET lunch_end = ? WHERE id = ?').run(now, record.id);
  } else if (action === 'clock_out') {
    if (!record?.clock_in || record.clock_out || (record.lunch_start && !record.lunch_end)) {
      return response.status(409).json({ error: 'Finish any active lunch break before recording departure.' });
    }
    db.prepare('UPDATE attendance SET clock_out = ? WHERE id = ?').run(now, record.id);
  } else if (action === 'breakfast_start') {
    if (!record?.clock_in || record.clock_out || record.breakfast_start || record.breakfast_end) {
      return response.status(409).json({ error: 'Breakfast can be started once, after arrival and before departure.' });
    }
    db.prepare('UPDATE attendance SET breakfast_start = ? WHERE id = ?').run(now, record.id);
  } else if (action === 'breakfast_end') {
    if (!record?.breakfast_start || record.breakfast_end || record.clock_out) {
      return response.status(409).json({ error: 'There is no active breakfast interval to end.' });
    }
    db.prepare('UPDATE attendance SET breakfast_end = ? WHERE id = ?').run(now, record.id);
  } else {
    return response.status(400).json({ error: 'Choose a valid attendance action.' });
  }

  record = getTodayRecord(request.user.id, today);
  return response.json({ date: today, attendance: attendanceView(record) });
});

app.post('/api/attendance/absence', requireAuth, requireRole('employee'), requireCsrf, (request, response) => {
  if (!ensureWeekday(request, response)) return;
  const reason = inputString(request.body?.reason, 500);
  if (!reason) return response.status(400).json({ error: 'Please enter a reason for the absence.' });
  const today = dateKeyInJoburg();
  if (getTodayRecord(request.user.id, today)) return response.status(409).json({ error: 'An attendance record already exists for today.' });
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO attendance (employee_id, attendance_date, status, absence_reason, created_at)
    VALUES (?, ?, 'absent', ?, ?)`).run(request.user.id, today, reason, now);
  return response.json({ date: today, attendance: attendanceView(getTodayRecord(request.user.id, today)) });
});

app.get('/api/attendance/report', requireAuth, (request, response) => {
  const period = request.query.period === 'month' ? 'month' : 'week';
  const parsedOffset = Number.parseInt(request.query.offset || '0', 10);
  const offset = Number.isFinite(parsedOffset) ? Math.max(-12, Math.min(12, parsedOffset)) : 0;
  const range = dateRange(period, dateKeyInJoburg(), offset);
  const isAdmin = request.user.role === 'admin';
  const records = isAdmin
    ? db.prepare(`SELECT attendance.*, employees.full_name, employees.employee_number
        FROM attendance JOIN employees ON employees.id = attendance.employee_id
        WHERE attendance.attendance_date >= ? AND attendance.attendance_date < ?
        ORDER BY attendance.attendance_date DESC, employees.full_name`).all(range.start, range.end)
    : db.prepare(`SELECT attendance.* FROM attendance
        WHERE employee_id = ? AND attendance_date >= ? AND attendance_date < ?
        ORDER BY attendance_date DESC`).all(request.user.id, range.start, range.end);
  return response.json({ period, offset, range, records: records.map((record) => ({ ...record, ...attendanceTotals(record) })) });
});

app.get('/api/admin/departments', requireAuth, requireRole('admin'), (request, response) => {
  const departments = db.prepare('SELECT id, name, created_at AS createdAt FROM departments ORDER BY name').all();
  return response.json({ departments });
});

app.post('/api/admin/departments', requireAuth, requireRole('admin'), requireCsrf, (request, response) => {
  const name = inputString(request.body?.name, 120);
  if (!name) return response.status(400).json({ error: 'Enter a department name.' });
  try {
    const result = db.prepare('INSERT INTO departments (name, created_at) VALUES (?, ?)')
      .run(name, new Date().toISOString());
    return response.status(201).json({ department: { id: result.lastInsertRowid, name } });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return response.status(409).json({ error: 'That department already exists.' });
    throw error;
  }
});

app.delete('/api/admin/departments/:id', requireAuth, requireRole('admin'), requireCsrf, (request, response) => {
  const departmentId = Number(request.params.id);
  const department = db.prepare('SELECT id, name FROM departments WHERE id = ?').get(departmentId);
  if (!department) return response.status(404).json({ error: 'Department not found.' });
  if (department.name.toLowerCase() === 'property branch') {
    return response.status(409).json({ error: 'The default Property Branch cannot be deleted.' });
  }
  const assigned = db.prepare('SELECT id FROM employees WHERE department_id = ? LIMIT 1').get(departmentId);
  if (assigned) return response.status(409).json({ error: 'Move or remove employees from this department before deleting it.' });
  db.prepare('DELETE FROM departments WHERE id = ?').run(departmentId);
  return response.json({ ok: true });
});

app.get('/api/admin/employees', requireAuth, requireRole('admin'), (request, response) => {
  const employees = db.prepare(`SELECT employees.id, employees.full_name AS name,
    employees.employee_number AS employeeNumber, employees.email, employees.position,
    employees.active, employees.created_at AS createdAt, departments.name AS department
    FROM employees LEFT JOIN departments ON departments.id = employees.department_id
    WHERE employees.role = 'employee' ORDER BY employees.full_name`).all();
  return response.json({ employees });
});

app.post('/api/admin/employees', requireAuth, requireRole('admin'), requireCsrf, (request, response) => {
  const name = inputString(request.body?.name, 120);
  const employeeNumber = inputString(request.body?.employeeNumber, 40);
  const email = inputString(request.body?.email, 254).toLowerCase();
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  const position = inputString(request.body?.position, 60);
  const departmentId = Number(request.body?.departmentId);
  const positions = ['Deputy Director', 'Assistant Director', 'Manager', 'Senior', 'Junior', 'Intern'];
  const department = Number.isInteger(departmentId)
    ? db.prepare('SELECT id FROM departments WHERE id = ?').get(departmentId)
    : null;
  if (!name || !employeeNumber || !/^\S+@\S+\.\S+$/.test(email) || password.length < 12 || !positions.includes(position) || !department) {
    return response.status(400).json({ error: 'Enter all employee details, a valid email, a 12-character password, position, and department.' });
  }
  try {
    const result = db.prepare(`INSERT INTO employees
      (full_name, employee_number, email, password_hash, role, department_id, position, created_at)
      VALUES (?, ?, ?, ?, 'employee', ?, ?, ?)`).run(
      name, employeeNumber, email, bcrypt.hashSync(password, 12), departmentId, position, new Date().toISOString()
    );
    return response.status(201).json({ employee: { id: result.lastInsertRowid, name, employeeNumber, email, position, departmentId, active: 1 } });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return response.status(409).json({ error: 'That employee number or email is already registered.' });
    throw error;
  }
});

app.patch('/api/admin/employees/:id/status', requireAuth, requireRole('admin'), requireCsrf, (request, response) => {
  const employeeId = Number(request.params.id);
  const active = request.body?.active === true;
  const employee = db.prepare("SELECT id, full_name, active FROM employees WHERE id = ? AND role = 'employee'").get(employeeId);
  if (!employee) return response.status(404).json({ error: 'Employee account not found.' });

  db.prepare('UPDATE employees SET active = ? WHERE id = ?').run(active ? 1 : 0, employeeId);
  if (!active) db.prepare('DELETE FROM sessions WHERE employee_id = ?').run(employeeId);
  return response.json({ employee: { id: employeeId, name: employee.full_name, active: active ? 1 : 0 } });
});

app.get('/api/health', (request, response) => response.json({ status: 'ok' }));

app.use((request, response, next) => {
  if (request.method !== 'GET') return next();
  return response.sendFile(path.join(__dirname, 'public', 'index.html')); 
});

app.use((error, request, response, next) => {
  console.error(error);
  if (response.headersSent) return next(error);
  return response.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(port, '0.0.0.0', () => console.log(`Attendance register listening on port ${port}`));