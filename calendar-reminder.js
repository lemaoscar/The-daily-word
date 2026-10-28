(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DailyWordCalendar = api;
})(globalThis, function () {
  'use strict';

  function formatDate(date) {
    return date.getFullYear().toString().padStart(4, '0') +
      String(date.getMonth() + 1).padStart(2, '0') +
      String(date.getDate()).padStart(2, '0') +
      'T' +
      String(date.getHours()).padStart(2, '0') +
      String(date.getMinutes()).padStart(2, '0') +
      '00';
  }

  function formatUtcDate(date) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }

  function escapeText(value) {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  function createReminderFile(time, now = new Date(), createId = () => globalThis.crypto.randomUUID()) {
    const match = /^(?:([01]\d|2[0-3])):([0-5]\d)$/.exec(time);
    if (!match) throw new Error('Choose a valid daily reminder time first.');

    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(match[1]), Number(match[2]), 0, 0);
    if (start <= now) start.setDate(start.getDate() + 1);
    const end = new Date(start.getTime() + 20 * 60 * 1000);
    const uid = String(createId());
    if (!/^[\w.-]{1,120}$/.test(uid)) throw new Error('Could not create a safe calendar reminder.');
    const description = escapeText('A gentle reminder to read Scripture, reflect, and pray. Your personal journal stays on this device.');

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Daily Word//Daily Scripture Reminder//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:' + uid + '@daily-word.local',
      'DTSTAMP:' + formatUtcDate(now),
      'DTSTART:' + formatDate(start),
      'DTEND:' + formatDate(end),
      'RRULE:FREQ=DAILY',
      'SUMMARY:' + escapeText('Daily Word · Scripture and prayer'),
      'DESCRIPTION:' + description,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + escapeText('A quiet moment for your daily Scripture reading.'),
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
      ''
    ].join('\r\n');
  }

  function downloadReminder(time) {
    const content = createReminderFile(time);
    const url = URL.createObjectURL(new Blob([content], { type:'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'daily-word-reading-reminder.ics';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { createReminderFile, downloadReminder };
});
