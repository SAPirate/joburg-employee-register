const test = require('node:test');
const assert = require('node:assert/strict');
const { DAILY_TARGET_MINUTES, attendanceTotals, canClockOut, expectedDeparture, dateKeyInJoburg, dateRange, isWeekendDate, requiredWorkedMinutes } = require('../lib/attendance');

test('Johannesburg date keys and weekend policy use the local calendar', () => {
  assert.equal(dateKeyInJoburg(new Date('2026-11-20T22:30:00.000Z')), '2026-11-21');
  assert.equal(isWeekendDate('2026-11-21'), true);
  assert.equal(isWeekendDate('2026-11-20'), false);
});

test('weekly and monthly ranges include the selected local date', () => {
  assert.deepEqual(dateRange('week', '2026-11-18'), { start: '2026-11-16', end: '2026-11-23', label: '2026-11-16 to 2026-11-22' });
  assert.deepEqual(dateRange('month', '2026-11-18'), { start: '2026-11-01', end: '2026-12-01', label: 'November 2026' });
});

test('work totals exclude full breakfast and lunch intervals', () => {
  const record = { status: 'present', clock_in: '2026-11-18T06:00:00.000Z', breakfast_start: '2026-11-18T08:00:00.000Z', breakfast_end: '2026-11-18T08:30:00.000Z', lunch_start: '2026-11-18T12:30:00.000Z', lunch_end: '2026-11-18T13:30:00.000Z', clock_out: '2026-11-18T17:30:00.000Z' };
  assert.deepEqual(attendanceTotals(record), { workedMinutes: DAILY_TARGET_MINUTES, lunchMinutes: 60, breakfastMinutes: 30, remainingMinutes: 0 });
});

test('absence records count zero work', () => {
  assert.equal(attendanceTotals({ status: 'absent' }).workedMinutes, 0);
});

test('departure is blocked while an active break is open', () => {
  const record = { status: 'present', clock_in: '2026-11-18T06:00:00.000Z', lunch_start: '2026-11-18T10:00:00.000Z', lunch_end: null };
  assert.equal(canClockOut(record, new Date('2026-11-18T14:30:00.000Z')), false);
});

test('missing breaks reduce the net work target without overtime', () => {
  const record = { status: 'present', clock_in: '2026-11-18T06:00:00.000Z' };
  assert.equal(requiredWorkedMinutes(record, new Date('2026-11-18T06:10:00.000Z')), 390);
  assert.equal(expectedDeparture(record), '2026-11-18T12:30:00.000Z');
});

test('short breaks reduce the target by the missing break remainder', () => {
  const record = { status: 'present', clock_in: '2026-11-18T06:00:00.000Z', breakfast_start: '2026-11-18T08:00:00.000Z', breakfast_end: '2026-11-18T08:15:00.000Z', lunch_start: '2026-11-18T12:00:00.000Z', lunch_end: '2026-11-18T12:30:00.000Z' };
  assert.equal(requiredWorkedMinutes(record, new Date('2026-11-18T14:00:00.000Z')), 435);
  assert.equal(expectedDeparture(record), '2026-11-18T14:00:00.000Z');
});
