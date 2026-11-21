const TIME_ZONE = 'Africa/Johannesburg';
const DAILY_TARGET_MINUTES = 8 * 60;
const REQUIRED_LUNCH_MINUTES = 60;
const REQUIRED_BREAKFAST_MINUTES = 30;

function dateKeyInJoburg(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isWeekendDate(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function dateRange(period, referenceDate, offset = 0) {
  const [year, month, day] = referenceDate.split('-').map(Number);
  const reference = new Date(Date.UTC(year, month - 1, day));

  if (period === 'month') {
    const start = new Date(Date.UTC(year, month - 1 + offset, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    return { start: toDateKey(start), end: toDateKey(end), label: start.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  }

  const mondayOffset = (reference.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, month - 1, day - mondayOffset + offset * 7));
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start: toDateKey(start), end: toDateKey(end), label: `${toDateKey(start)} to ${toDateKey(new Date(end.getTime() - 86400000))}` };
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function elapsedMinutes(start, end) {
  if (!start || !end) return 0;
  return Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function attendanceTotals(record, now = new Date()) {
  if (!record || record.status === 'absent' || !record.clock_in) {
    return { workedMinutes: 0, lunchMinutes: 0, breakfastMinutes: 0, remainingMinutes: DAILY_TARGET_MINUTES };
  }

  const finish = record.clock_out || now.toISOString();
  const lunchEnd = record.lunch_end || (record.lunch_start ? finish : null);
  const breakfastEnd = record.breakfast_end || (record.breakfast_start ? finish : null);
  const lunchMinutes = elapsedMinutes(record.lunch_start, lunchEnd);
  const breakfastMinutes = elapsedMinutes(record.breakfast_start, breakfastEnd);
  const spanMinutes = elapsedMinutes(record.clock_in, finish);
  const targetMinutes = requiredWorkedMinutes(record, now);
  const workedMinutes = Math.min(targetMinutes, Math.max(0, spanMinutes - lunchMinutes - breakfastMinutes));
  return {
    workedMinutes,
    lunchMinutes,
    breakfastMinutes,
    remainingMinutes: Math.max(0, targetMinutes - workedMinutes)
  };
}

function canClockOut(record, now = new Date()) {
  if (!record || record.status !== 'present' || !record.clock_in || record.clock_out) {
    return false;
  }
  if (record.lunch_start && !record.lunch_end) return false;
  if (record.breakfast_start && !record.breakfast_end) return false;
  return true;
}

function expectedDeparture(record) {
  if (!record || record.status !== 'present' || !record.clock_in) return null;
  const now = record.clock_out ? new Date(record.clock_out) : new Date();
  const breakfastTaken = elapsedMinutes(record.breakfast_start, record.breakfast_end || (record.breakfast_start ? now.toISOString() : null));
  const lunchTaken = elapsedMinutes(record.lunch_start, record.lunch_end || (record.lunch_start ? now.toISOString() : null));
  const missingBreakMinutes = Math.max(0, REQUIRED_BREAKFAST_MINUTES - breakfastTaken)
    + Math.max(0, REQUIRED_LUNCH_MINUTES - lunchTaken);
  const targetMinutes = Math.max(0, DAILY_TARGET_MINUTES - missingBreakMinutes);
  return new Date(new Date(record.clock_in).getTime() + (targetMinutes + breakfastTaken + lunchTaken) * 60000).toISOString();
}

function requiredWorkedMinutes(record, now = new Date()) {
  if (!record || record.status !== 'present' || !record.clock_in) return 0;
  const finish = record.clock_out || now.toISOString();
  const breakfastTaken = elapsedMinutes(record.breakfast_start, record.breakfast_end || (record.breakfast_start ? finish : null));
  const lunchTaken = elapsedMinutes(record.lunch_start, record.lunch_end || (record.lunch_start ? finish : null));
  const missingBreakMinutes = Math.max(0, REQUIRED_BREAKFAST_MINUTES - breakfastTaken)
    + Math.max(0, REQUIRED_LUNCH_MINUTES - lunchTaken);
  return Math.max(0, DAILY_TARGET_MINUTES - missingBreakMinutes);
}

module.exports = {
  DAILY_TARGET_MINUTES,
  REQUIRED_LUNCH_MINUTES,
  REQUIRED_BREAKFAST_MINUTES,
  TIME_ZONE,
  attendanceTotals,
  canClockOut,
  dateKeyInJoburg,
  dateRange,
  elapsedMinutes,
  expectedDeparture,
  isWeekendDate,
  requiredWorkedMinutes
};