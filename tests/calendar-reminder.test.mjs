import assert from 'node:assert/strict';
import calendar from '../calendar-reminder.js';
import { test } from 'node:test';

test('creates an importable daily calendar reminder at the selected local time', () => {
  const now = new Date(2026, 9, 28, 7, 45, 0);
  const reminder = calendar.createReminderFile('08:15', now, () => 'daily-word-test-id');

  assert.match(reminder, /BEGIN:VCALENDAR\r\n/);
  assert.match(reminder, /UID:daily-word-test-id@daily-word\.local\r\n/);
  assert.ok(reminder.includes('DTSTAMP:' + now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') + '\r\n'));
  assert.match(reminder, /DTSTART:20261028T081500\r\n/);
  assert.match(reminder, /DTEND:20261028T083500\r\n/);
  assert.match(reminder, /RRULE:FREQ=DAILY\r\n/);
  assert.match(reminder, /ACTION:DISPLAY\r\n/);
  assert.match(reminder, /END:VCALENDAR\r\n$/);
});

test('schedules tomorrow if the selected daily time has already passed', () => {
  const now = new Date(2026, 9, 28, 17, 15, 0);
  const reminder = calendar.createReminderFile('08:15', now, () => 'daily-word-next-day');
  assert.match(reminder, /DTSTART:20261029T081500\r\n/);
  assert.match(reminder, /DTEND:20261029T083500\r\n/);
});

test('rejects invalid times and calendar event identifiers', () => {
  assert.throws(() => calendar.createReminderFile('25:80', new Date(), () => 'safe'));
  assert.throws(() => calendar.createReminderFile('08:15', new Date(), () => 'unsafe,event'));
});
