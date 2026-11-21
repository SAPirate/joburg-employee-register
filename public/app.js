const root = document.querySelector('#app');
const toast = document.querySelector('#toast');
const state = { user: null, csrfToken: null, attendance: null, today: '', reportPeriod: 'week', reportOffset: 0, report: null, employees: [], departments: [], loginRole: 'employee' };
const icons = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 8v6M23 11h-6"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 17l5-5-5-5M15 12H3M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>',
  arrival: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/></svg>',
  lunch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M17 3v18M17 3c3 2 3 7 0 9"/></svg>',
  departure: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21V9m5 5-5-5-5 5M5 3h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg>'
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function initials(name = '') {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
}

function duration(minutes = 0) {
  const safe = Math.max(0, Math.floor(minutes));
  return `${Math.floor(safe / 60)}h ${String(safe % 60).padStart(2, '0')}m`;
}

function currentWorkedMinutes(record) {
  if (!record || record.status === 'absent' || !record.clock_in) return 0;
  const end = record.clock_out ? new Date(record.clock_out).getTime() : Date.now();
  const start = new Date(record.clock_in).getTime();
  const lunchEnd = record.lunch_end ? new Date(record.lunch_end).getTime() : record.lunch_start ? end : null;
  const lunch = lunchEnd === null ? 0 : Math.max(0, Math.floor((lunchEnd - new Date(record.lunch_start).getTime()) / 60000));
  const breakfastEnd = record.breakfast_end ? new Date(record.breakfast_end).getTime() : record.breakfast_start ? end : null;
  const breakfast = breakfastEnd === null ? 0 : Math.max(0, Math.floor((breakfastEnd - new Date(record.breakfast_start).getTime()) / 60000));
  return Math.max(0, Math.floor((end - start) / 60000) - lunch - breakfast);
}

function time(value) {
  if (!value) return '--:--:--';
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date(value));
}

function dateLabel(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-ZA', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`));
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('show'), 3800);
}

async function api(url, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.method && options.method !== 'GET' ? { 'X-CSRF-Token': state.csrfToken || '' } : {}), ...options.headers };
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

function brandMarkup() {
  return `<div class="brand"><div class="brand-mark">CoJ</div><div class="brand-copy"><strong>CITY OF JOHANNESBURG</strong><span>Employee attendance register</span></div></div>`;
}

function renderLogin() {
  root.innerHTML = `<main class="login-page">
    <section class="login-art">${brandMarkup()}<div class="login-message"><p class="eyebrow">People &amp; service</p><h1>Every workday, accounted for.</h1><p>A clear, reliable record of attendance for teams serving the City of Johannesburg.</p></div><footer>City of Johannesburg employee register</footer></section>
    <section class="login-side"><div class="login-card"><p class="eyebrow">Secure staff access</p><h2>Sign in</h2>
      <div class="login-tabs" role="tablist" aria-label="Choose account type">
        <button class="login-tab ${state.loginRole === 'employee' ? 'active' : ''}" type="button" role="tab" aria-selected="${state.loginRole === 'employee'}" data-login-role="employee"><span class="login-tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"/></svg></span><span><strong>Employee</strong><small>Staff sign in</small></span></button>
        <button class="login-tab ${state.loginRole === 'admin' ? 'active' : ''}" type="button" role="tab" aria-selected="${state.loginRole === 'admin'}" data-login-role="admin"><span class="login-tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z"/><path d="M9 12l2 2 4-5"/></svg></span><span><strong>Administrator</strong><small>Management sign in</small></span></button>
      </div>
      <p class="login-description" id="login-description">${state.loginRole === 'admin' ? 'Administrator sign in — manage accounts and review attendance.' : 'Employee sign in — use your account to record attendance.'}</p>
      <form class="form-grid" id="login-form"><div class="field"><label for="login-email">Email address</label><input id="login-email" name="email" type="email" autocomplete="username" required></div><div class="field"><label for="login-password">Password</label><div class="password-input"><input id="login-password" name="password" type="password" autocomplete="current-password" required><button class="password-toggle" type="button" id="toggle-login-password" aria-label="Show password">Show</button></div></div><button class="button" type="submit">Sign in</button></form>
      <p class="login-footnote">Accounts are created by your attendance administrator. Contact your department administrator if you need access.</p>
      <p class="login-footnote"><button class="forgot-password-link" type="button" id="forgot-password">Forgot password?</button></p>
    </div></section>
  </main>`;
  document.querySelector('#login-form').addEventListener('submit', login);
  const loginPassword = document.querySelector('#login-password');
  const loginPasswordToggle = document.querySelector('#toggle-login-password');
  if (loginPassword && loginPasswordToggle) loginPasswordToggle.addEventListener('click', () => {
    const isHidden = loginPassword.type === 'password';
    loginPassword.type = isHidden ? 'text' : 'password';
    loginPasswordToggle.textContent = isHidden ? 'Hide' : 'Show';
    loginPasswordToggle.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
  });
  document.querySelectorAll('[data-login-role]').forEach((button) => button.addEventListener('click', () => {
    state.loginRole = button.dataset.loginRole;
    renderLogin();
  }));
  document.querySelector('#forgot-password')?.addEventListener('click', openPasswordResetModal);
}

async function login(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  try {
    const form = new FormData(event.currentTarget);
    const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password'), role: state.loginRole }) });
    state.user = result.user;
    state.csrfToken = result.csrfToken;
    await renderApp();
  } catch (error) {
    showToast(error.message, true);
    button.disabled = false;
  }
}

function navigation() {
  const isAdmin = state.user.role === 'admin';
  const currentLabel = isAdmin ? 'Attendance' : 'Today';
  const currentIcon = isAdmin ? icons.grid : icons.grid;
  const secondary = isAdmin
    ? [['employees', icons.people, 'Employees']]
    : [['reports', icons.calendar, 'My register']];

  return `<nav class="side-nav" aria-label="Main navigation">
    <p class="side-label">Workspace</p>
    <div class="nav-current" aria-current="page">${currentIcon}<span>${currentLabel}</span></div>
    ${secondary.map(([id, icon, label]) => `<button class="nav-button" data-view="${id}">${icon}<span>${label}</span></button>`).join('')}
  </nav>`;
}

function shell(content) {
  root.innerHTML = `<div class="shell"><header class="topbar">${brandMarkup()}<div class="topbar-side"><div class="user-chip"><div class="avatar">${escapeHtml(initials(state.user.name))}</div><div class="user-copy"><strong>${escapeHtml(state.user.name)}</strong><span>${state.user.role === 'admin' ? 'Administrator' : escapeHtml(state.user.employeeNumber)}</span></div></div><button class="icon-button" id="logout" title="Sign out" aria-label="Sign out">${icons.logout}</button></div></header><div class="layout">${navigation()}<main class="main-content">${content}</main></div></div>`;
  document.querySelector('#logout').addEventListener('click', logout);
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => changeView(button.dataset.view)));
}

async function renderApp() {
  if (state.user.role === 'admin') {
    await loadEmployees();
    await loadReport();
    renderAdmin();
  } else {
    const result = await api('/api/attendance/today');
    state.today = result.date;
    state.attendance = result.attendance;
    await loadReport();
    renderEmployee();
  }
}

function actionButton(label, action, icon, disabled = false, secondary = false) {
  return `<button class="button ${secondary ? 'secondary' : ''}" data-action="${action}" ${disabled ? 'disabled' : ''}>${icon}${label}</button>`;
}

function timelineRow(label, value, complete, icon) {
  return `<div class="timeline-row ${complete ? 'complete' : ''}"><span class="timeline-dot">${complete ? icons.check : icon}</span><strong>${label}</strong><time>${value ? time(value) : 'Pending'}</time></div>`;
}

function attendanceActions(record, weekend) {
  const closed = weekend || record.status === 'absent' || Boolean(record.clock_out);
  const targetReached = currentWorkedMinutes(record) >= 480;
  if (record.status === 'absent') return '<p class="notice">Absence recorded for today. This register entry cannot be changed.</p>';
  if (record.clock_out) return '<p class="notice">Departure recorded. Today’s register is complete.</p>';
  if (!record.clock_in) return `<div class="action-area">${actionButton('Record arrival', 'clock_in', icons.arrival, closed)}<button class="button secondary" data-action="absence" ${closed ? 'disabled' : ''}>Record absence</button></div>`;
  if (record.lunch_start && !record.lunch_end) return `<div class="action-area">${actionButton('End lunch break', 'lunch_end', icons.lunch, closed)}${actionButton('Record departure', 'clock_out', icons.departure, true, true)}</div><p class="notice">End lunch first. Lunch may end at any time after it starts.</p>`;
  if (record.breakfast_start && !record.breakfast_end) return `<div class="action-area">${actionButton('End breakfast', 'breakfast_end', icons.lunch, closed)}${actionButton('Record departure', 'clock_out', icons.departure, true, true)}</div><p class="notice">End breakfast first before recording departure.</p>`;
  if (!record.breakfast_start && !record.lunch_start) return `<div class="action-area">${actionButton('Take breakfast', 'breakfast_start', icons.lunch, closed)}${actionButton('Take lunch break', 'lunch_start', icons.lunch, closed)}${actionButton('Record departure', 'clock_out', icons.departure, closed, true)}</div><p class="notice">Departure is available after any active breakfast or lunch interval is ended.</p>`;
  if (!record.lunch_start) return `<div class="action-area">${actionButton('Take lunch break', 'lunch_start', icons.lunch, closed)}${actionButton('Record departure', 'clock_out', icons.departure, closed, true)}</div><p class="notice">Departure is available now or after a lunch break is started and ended.</p>`;
  return `<div class="action-area">${actionButton('Record departure', 'clock_out', icons.departure, closed)}</div><p class="notice">Lunch and breakfast intervals are recorded separately from worked time.</p>`;
}

function renderEmployee() {
  const record = state.attendance;
  const weekend = ['Saturday', 'Sunday'].includes(new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'long' }).format(new Date(`${state.today}T12:00:00+02:00`)));
  const date = new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${state.today}T12:00:00+02:00`));
  const worked = currentWorkedMinutes(record);
  const percent = Math.min(100, Math.round(worked / 480 * 100));
  const status = record.status === 'absent' ? '<span class="pill absent">Absent</span>' : record.clock_out ? '<span class="pill">Complete</span>' : record.clock_in ? '<span class="pill live">On duty</span>' : '<span class="pill">Not started</span>';
  const banner = weekend ? '<div class="weekend-banner">Weekend register is view-only. Attendance actions are closed on Saturdays and Sundays.</div>' : '';
  const outstandingMinutes = Math.max(0, 480 - worked);
  const outstandingMarkup = !weekend && outstandingMinutes > 0
    ? `<div class="daily-shortfall"><strong>${duration(outstandingMinutes)}</strong> still outstanding today</div>`
    : '';
  const expectedDepartureValue = record.expectedDeparture || (record.clock_in
    ? new Date(new Date(record.clock_in).getTime() + (480 + 30 + 60) * 60000).toISOString()
    : null);
  const expectedDepartureMarkup = record.clock_in && !record.clock_out
    ? `<div class="estimated-departure"><span>Estimated departure</span><strong>${time(expectedDepartureValue)}</strong><small>Adjusted for 8 work hours and recorded breakfast/lunch time</small></div>`
    : '';
  shell(`${banner}<div class="page-heading"><div><p class="eyebrow">Daily register</p><h1>Good ${greeting()}, ${escapeHtml(state.user.name.split(' ')[0])}.</h1><p class="subheading">Your attendance for today, in Johannesburg time.</p></div><span class="date-stamp">${escapeHtml(date)}</span></div>
    <div class="dashboard-grid"><section class="panel shift-panel"><div class="shift-top"><h2>Today’s shift</h2>${status}</div><div class="shift-body"><div class="progress-heading"><span>Work completed</span><span>${duration(worked)} of 8h</span></div><div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
      <div class="metric-row"><div class="metric"><span>Arrival</span><strong>${record.clock_in ? time(record.clock_in) : '--:--:--'}</strong><small>Start of shift</small></div><div class="metric"><span>Work time</span><strong>${duration(worked)}</strong><small>${outstandingMinutes ? `${duration(outstandingMinutes)} remaining` : 'Daily target reached'}</small></div><div class="metric"><span>Departure</span><strong>${record.clock_out ? time(record.clock_out) : '--:--:--'}</strong><small>End of shift</small></div></div>${outstandingMarkup}${expectedDepartureMarkup}${attendanceActions(record, weekend)}</div></section>
      <div class="side-stack"><section class="panel break-panel"><div class="panel-title"><h2>Breaks</h2><span class="quiet">Recorded intervals</span></div><div class="break-readout"><strong>${duration(record.breakfastMinutes || 0)}</strong><span>breakfast today</span></div><div class="break-readout"><strong>${duration(record.lunchMinutes || 0)}</strong><span>lunch today</span></div><p class="break-note">Breakfast and lunch are excluded from worked time.</p></section><section class="panel timeline-panel"><div class="panel-title"><h2>Today’s timeline</h2><span class="quiet">Local time</span></div><div class="timeline">${timelineRow('Arrival', record.clock_in, Boolean(record.clock_in), icons.arrival)}${timelineRow('Breakfast started', record.breakfast_start, Boolean(record.breakfast_start), icons.lunch)}${timelineRow('Breakfast ended', record.breakfast_end, Boolean(record.breakfast_end), icons.lunch)}${timelineRow('Lunch started', record.lunch_start, Boolean(record.lunch_start), icons.lunch)}${timelineRow('Lunch ended', record.lunch_end, Boolean(record.lunch_end), icons.lunch)}${timelineRow('Departure', record.clock_out, Boolean(record.clock_out), icons.departure)}</div></section></div></div>
    ${reportMarkup(false)}`);
  bindReportControls();
  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => performAction(button.dataset.action, button)));
  clearInterval(renderEmployee.progressTimer);
  renderEmployee.progressTimer = setInterval(updateLiveProgress, 30000);
}

function updateLiveProgress() {
  if (!state.attendance || !document.querySelector('.shift-panel')) return;
  const worked = currentWorkedMinutes(state.attendance);
  const fill = document.querySelector('.progress-fill');
  const heading = document.querySelector('.progress-heading span:last-child');
  const metric = document.querySelector('.metric:nth-child(2) strong');
  const remaining = document.querySelector('.metric:nth-child(2) small');
  const departure = document.querySelector('[data-action="clock_out"]');
  if (fill) fill.style.width = `${Math.min(100, Math.round(worked / 480 * 100))}%`;
  if (heading) heading.textContent = `${duration(worked)} of 8h`;
  if (metric) metric.textContent = duration(worked);
  if (remaining) remaining.textContent = worked >= 480 ? 'Daily target reached' : `${duration(480 - worked)} remaining`;
  if (departure && !state.attendance.clock_out) {
    const activeBreak = (state.attendance.lunch_start && !state.attendance.lunch_end)
      || (state.attendance.breakfast_start && !state.attendance.breakfast_end);
    departure.disabled = Boolean(activeBreak);
  }
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}

function openAbsenceModal(triggerButton) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="absence-modal" role="dialog" aria-modal="true" aria-labelledby="absence-title"><div class="modal-heading"><div><p class="eyebrow">Attendance</p><h2 id="absence-title">Record absence</h2></div><button class="modal-close" type="button" aria-label="Close">&times;</button></div><p class="modal-copy">Choose absence instead of arrival for today.</p><form class="form-grid" id="absence-form"><div class="field"><label for="absence-reason">Reason for absence</label><textarea id="absence-reason" name="reason" rows="4" maxlength="500" required placeholder="Enter the reason for your absence"></textarea></div><div class="modal-actions"><button class="button secondary" type="button" id="cancel-absence">Cancel</button><button class="button" type="submit">Confirm absence</button></div></form></div>`;
  document.body.appendChild(overlay);
  const reasonInput = overlay.querySelector('#absence-reason');
  reasonInput.focus();
  const closeModal = () => { overlay.remove(); triggerButton?.focus(); };
  overlay.querySelector('.modal-close').addEventListener('click', closeModal);
  overlay.querySelector('#cancel-absence').addEventListener('click', closeModal);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeModal(); });
  overlay.querySelector('#absence-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const reason = reasonInput.value.trim();
    if (!reason) { showToast('Please enter a reason for the absence.', true); reasonInput.focus(); return; }
    const submitButton = event.currentTarget.querySelector('[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Recording...';
    try {
      await api('/api/attendance/absence', { method: 'POST', body: JSON.stringify({ reason }) });
      overlay.remove();
      await renderApp();
      showToast('Absence recorded for today.');
    } catch (error) {
      showToast(error.message, true);
      submitButton.disabled = false;
      submitButton.textContent = 'Confirm absence';
    }
  });
}

async function performAction(action, button) {
  if (action === 'absence') { openAbsenceModal(button); return; }
  button.disabled = true;
  try {
    await api('/api/attendance/action', { method: 'POST', body: JSON.stringify({ action }) });
    await renderApp();
    showToast(actionMessage(action));
  } catch (error) { showToast(error.message, true); button.disabled = false; }
}

function actionMessage(action) {
  return ({ clock_in: 'Arrival recorded.', breakfast_start: 'Breakfast started.', breakfast_end: 'Breakfast ended.', lunch_start: 'Lunch break started.', lunch_end: 'Lunch break ended.', clock_out: 'Departure recorded.' })[action];
}

async function loadReport() {
  const result = await api(`/api/attendance/report?period=${state.reportPeriod}&offset=${state.reportOffset}`);
  state.report = result;
}

function reportMarkup(isAdmin) {
  const rows = state.report?.records || [];
  const reportPeriodLabel = state.reportPeriod === 'week' ? 'weekly' : 'monthly';
  const headings = isAdmin
    ? '<th>Employee</th><th>Date</th><th>Status</th><th>Arrival</th><th>Lunch</th><th>Departure</th><th>Worked</th><th>Outstanding</th>'
    : '<th>Date</th><th>Status</th><th>Arrival</th><th>Lunch</th><th>Departure</th><th>Worked</th><th>Outstanding</th>';
  const body = rows.length ? rows.map((record) => {
    const outstanding = record.status === 'absent' ? 480 : Math.max(0, 480 - Number(record.workedMinutes || 0));
    return `<tr>${isAdmin ? `<td><strong>${escapeHtml(record.full_name)}</strong><br><span class="quiet">${escapeHtml(record.employee_number)}</span></td>` : ''}<td>${dateLabel(record.attendance_date)}</td><td><span class="status-tag ${record.status === 'absent' ? 'absent' : ''}">${record.status === 'absent' ? 'Absent' : 'Present'}</span></td><td>${record.clock_in ? time(record.clock_in) : '--:--:--'}</td><td>${duration(record.lunchMinutes)}</td><td>${record.clock_out ? time(record.clock_out) : '--:--:--'}</td><td><strong>${duration(record.workedMinutes)}</strong></td><td class="${outstanding > 0 ? 'outstanding-hours' : 'completed-hours'}"><strong>${duration(outstanding)}</strong></td></tr>`;
  }).join('') : `<tr><td colspan="${isAdmin ? 8 : 7}" class="empty-state">No attendance entries in this period.</td></tr>`;

  let summaryMarkup = '';
  if (rows.length && state.reportPeriod === 'week') {
    if (isAdmin) {
      const employeeTotals = {};
      rows.forEach((record) => {
        const key = record.employee_number || record.full_name;
        if (!employeeTotals[key]) employeeTotals[key] = { name: record.full_name, worked: 0 };
        employeeTotals[key].worked += record.status === 'absent' ? 0 : Number(record.workedMinutes || 0);
      });
      const weekdayTarget = weekdayCount(state.report.range.start, state.report.range.end) * 480;
      const summaries = Object.values(employeeTotals).map((item) => {
        const outstanding = Math.max(0, weekdayTarget - item.worked);
        return `<span><strong>${escapeHtml(item.name)}:</strong> <b class="outstanding-hours">${duration(outstanding)} outstanding</b></span>`;
      }).join('');
      summaryMarkup = `<div class="hours-summary"><strong>Weekly outstanding hours</strong><div>${summaries}</div></div>`;
    } else {
      const worked = rows.reduce((total, record) => total + (record.status === 'absent' ? 0 : Number(record.workedMinutes || 0)), 0);
      const weekdayTarget = weekdayCount(state.report.range.start, state.report.range.end) * 480;
      const outstanding = Math.max(0, weekdayTarget - worked);
      summaryMarkup = `<div class="hours-summary"><strong>Weekly outstanding hours</strong><div><b class="outstanding-hours">${duration(outstanding)} outstanding</b></div></div>`;
    }
  }
  return `<section class="panel report-panel" id="reports">${summaryMarkup}<div class="report-header"><h2>${isAdmin ? 'Team attendance' : 'Attendance register'}</h2><div class="report-controls"><div class="segmented"><button class="segment ${state.reportPeriod === 'week' ? 'active' : ''}" data-period="week">Week</button><button class="segment ${state.reportPeriod === 'month' ? 'active' : ''}" data-period="month">Month</button></div><div class="range-control"><button class="icon-button" data-offset="-1" aria-label="Previous period">${icons.left}</button><span class="range-label">${escapeHtml(state.report?.range.label || '')}</span><button class="icon-button" data-offset="1" aria-label="Next period" ${state.reportOffset >= 0 ? 'disabled' : ''}>${icons.right}</button></div></div></div><div class="table-wrap"><table><thead><tr>${headings}</tr></thead><tbody>${body}</tbody></table></div></section>`;
}

function bindReportControls() {
  document.querySelectorAll('[data-period]').forEach((button) => button.addEventListener('click', async () => {
    state.reportPeriod = button.dataset.period;
    state.reportOffset = 0;
    await refreshCurrentView();
  }));
  document.querySelectorAll('[data-offset]').forEach((button) => button.addEventListener('click', async () => {
    state.reportOffset = Math.min(0, state.reportOffset + Number(button.dataset.offset));
    await refreshCurrentView();
  }));
}

async function refreshCurrentView() {
  try { await loadReport(); state.user.role === 'admin' ? renderAdmin() : renderEmployee(); }
  catch (error) { showToast(error.message, true); }
}

async function loadEmployees() {
  const [employeeResult, departmentResult] = await Promise.all([
    api('/api/admin/employees'),
    api('/api/admin/departments')
  ]);
  state.employees = employeeResult.employees;
  state.departments = departmentResult.departments;
}

function renderAdmin() {
  const employeeRows = state.employees.length ? state.employees.map((employee) => {
    const isActive = Number(employee.active) === 1;
    return `<tr><td><strong>${escapeHtml(employee.name)}</strong></td><td>${escapeHtml(employee.employeeNumber)}</td><td>${escapeHtml(employee.department || 'Not assigned')}</td><td>${escapeHtml(employee.position || 'Junior')}</td><td>${escapeHtml(employee.email)}</td><td><span class="status-tag ${isActive ? '' : 'absent'}">${isActive ? 'Active' : 'Deactivated'}</span></td><td><button class="button ${isActive ? 'danger' : 'secondary'} small-button" type="button" data-toggle-employee="${employee.id}" data-active="${isActive ? '1' : '0'}">${isActive ? 'Deactivate' : 'Reactivate'}</button></td></tr>`;
  }).join('') : '<tr><td colspan="7" class="empty-state">No employees have been added yet.</td></tr>';
  const departmentOptions = state.departments.map((department) => `<option value="${department.id}">${escapeHtml(department.name)}</option>`).join('');
  const departmentRows = state.departments.length ? state.departments.map((department) => `<tr><td><div class="department-row"><strong>${escapeHtml(department.name)}</strong>${department.name.toLowerCase() === 'property branch' ? '<span class="quiet">Default branch</span>' : `<button class="button danger small-button" type="button" data-delete-department="${department.id}">Delete</button>`}</div></td></tr>`).join('') : '<tr><td class="empty-state">No departments have been added.</td></tr>';
  shell(`<div class="page-heading"><div><p class="eyebrow">Administrator workspace</p><h1>Organisation register</h1><p class="subheading">Manage departments and employee accounts.</p></div><span class="date-stamp">${state.employees.length} employee${state.employees.length === 1 ? '' : 's'}</span></div>
    <div class="admin-section">
      <section class="panel admin-panel"><div class="panel-title"><h2>Create department</h2><span class="quiet">Organisation category</span></div><form class="form-grid" id="department-form"><div class="field"><label for="department-name">Department name</label><input id="department-name" name="name" required maxlength="120" placeholder="e.g. Property Branch"></div><button class="button" type="submit">Create department</button></form><div class="table-wrap department-list"><table><thead><tr><th>Departments</th></tr></thead><tbody>${departmentRows}</tbody></table></div></section>
      <section class="panel admin-panel"><div class="panel-title"><h2>Register an employee</h2><span class="quiet">New account</span></div><form class="form-grid" id="employee-form"><div class="field"><label for="employee-name">Full name</label><input id="employee-name" name="name" autocomplete="name" required maxlength="120"></div><div class="field"><label for="employee-number">Employee number</label><input id="employee-number" name="employeeNumber" required maxlength="40"></div><div class="field"><label for="employee-email">Email address</label><input id="employee-email" name="email" type="email" autocomplete="email" required maxlength="254"></div><div class="field"><label for="employee-department">Department</label><select id="employee-department" name="departmentId" required ${departmentOptions ? '' : 'disabled'}>${departmentOptions}</select></div><div class="field"><label for="employee-position">Position</label><select id="employee-position" name="position" required><option value="Deputy Director">Deputy Director (DD)</option><option value="Assistant Director">Assistant Director</option><option value="Manager">Manager</option><option value="Senior">Senior</option><option value="Junior">Junior</option><option value="Intern">Intern</option></select></div><div class="field"><label for="employee-password">Temporary password</label><div class="password-input"><input id="employee-password" name="password" type="password" minlength="12" autocomplete="new-password" required><button class="password-toggle" type="button" id="toggle-password" aria-label="Show temporary password">Show</button></div><span class="quiet">At least 12 characters. Share it securely.</span></div><button class="button" type="submit">Create employee account</button></form></section>
    </div>
    <section class="panel admin-panel employees-panel"><div class="panel-title"><h2>Employees</h2><span class="quiet">Registered accounts</span></div><div class="table-wrap"><table><thead><tr><th>Name</th><th>Employee no.</th><th>Department</th><th>Position</th><th>Email</th><th>Status</th><th>Action</th></tr></thead><tbody>${employeeRows}</tbody></table></div></section>
    ${reportMarkup(true)}`);
  bindReportControls();
  document.querySelector('#department-form').addEventListener('submit', createDepartment);
  document.querySelector('#employee-form').addEventListener('submit', createEmployee);
  document.querySelectorAll('[data-delete-department]').forEach((button) => button.addEventListener('click', () => deleteDepartment(button.dataset.deleteDepartment, button)));
  document.querySelectorAll('[data-toggle-employee]').forEach((button) => button.addEventListener('click', () => toggleEmployeeStatus(button.dataset.toggleEmployee, button)));
  const passwordInput = document.querySelector('#employee-password');
  const passwordToggle = document.querySelector('#toggle-password');
  if (passwordInput && passwordToggle) passwordToggle.addEventListener('click', () => {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    passwordToggle.textContent = isHidden ? 'Hide' : 'Show';
    passwordToggle.setAttribute('aria-label', isHidden ? 'Hide temporary password' : 'Show temporary password');
  });
}

async function createDepartment(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  const values = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await api('/api/admin/departments', { method: 'POST', body: JSON.stringify(values) });
    await loadEmployees();
    renderAdmin();
    showToast('Department created.');
  } catch (error) { showToast(error.message, true); button.disabled = false; }
}

async function createEmployee(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  const values = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await api('/api/admin/employees', { method: 'POST', body: JSON.stringify(values) });
    await loadEmployees();
    renderAdmin();
    showToast('Employee account created. Share the temporary password securely.');
  } catch (error) { showToast(error.message, true); button.disabled = false; }
}

async function deleteDepartment(departmentId, button) {
  if (!window.confirm('Delete this department? Employees must not be assigned to it.')) return;
  button.disabled = true;
  try {
    await api(`/api/admin/departments/${departmentId}`, { method: 'DELETE' });
    await loadEmployees();
    renderAdmin();
    showToast('Department deleted.');
  } catch (error) { showToast(error.message, true); button.disabled = false; }
}

async function toggleEmployeeStatus(employeeId, button) {
  const isCurrentlyActive = button.dataset.active === '1';
  const action = isCurrentlyActive ? 'Deactivate' : 'Reactivate';
  if (!window.confirm(`${action} this employee account?${isCurrentlyActive ? ' Their sign-in and existing sessions will be blocked.' : ' They will be able to sign in again.'}`)) return;
  button.disabled = true;
  try {
    await api(`/api/admin/employees/${employeeId}/status`, { method: 'PATCH', body: JSON.stringify({ active: !isCurrentlyActive }) });
    await loadEmployees();
    renderAdmin();
    showToast(isCurrentlyActive ? 'Employee account deactivated. Their records were preserved.' : 'Employee account reactivated.');
  } catch (error) { showToast(error.message, true); button.disabled = false; }
}

async function logout() {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  state.user = null;
  state.csrfToken = null;
  renderLogin();
}

async function changeView(view) {
  if (view === 'reports') document.querySelector('#reports')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (view === 'attendance') await renderApp();
  if (view === 'employees') document.querySelector('.admin-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function initialize() {
  try {
    const session = await api('/api/session');
    state.user = session.user;
    state.csrfToken = session.csrfToken;
    if (state.user) await renderApp();
    else renderLogin();
  } catch { renderLogin(); }
}

initialize();

function weekdayCount(startKey, endKey) {
  const [startYear, startMonth, startDay] = startKey.split('-').map(Number);
  const [endYear, endMonth, endDay] = endKey.split('-').map(Number);
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  let count = 0;
  while (cursor < end) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function openPasswordResetModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="absence-modal" role="dialog" aria-modal="true" aria-labelledby="reset-title"><div class="modal-heading"><div><p class="eyebrow">Account recovery</p><h2 id="reset-title">Reset password</h2></div><button class="modal-close" type="button" aria-label="Close">&times;</button></div><p class="modal-copy">Enter an email address registered to an employee account.</p><form class="form-grid" id="reset-password-form"><div class="field"><label for="reset-email">Employee email</label><input id="reset-email" name="email" type="email" required></div><div class="field"><label for="reset-password">New password</label><div class="password-input"><input id="reset-password" name="password" type="password" minlength="12" required><button class="password-toggle" type="button" id="toggle-reset-password" aria-label="Show password">Show</button></div></div><div class="modal-actions"><button class="button secondary" type="button" id="cancel-reset">Cancel</button><button class="button" type="submit">Update password</button></div></form></div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.querySelector('#cancel-reset').addEventListener('click', close);
  const passwordInput = overlay.querySelector('#reset-password');
  const toggle = overlay.querySelector('#toggle-reset-password');
  toggle.addEventListener('click', () => { const hidden = passwordInput.type === 'password'; passwordInput.type = hidden ? 'text' : 'password'; toggle.textContent = hidden ? 'Hide' : 'Show'; });
  overlay.querySelector('#reset-password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const submit = event.currentTarget.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await api('/api/password/reset', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
      close(); showToast('Password updated. You can now sign in.');
    } catch (error) { showToast(error.message, true); submit.disabled = false; }
  });
}