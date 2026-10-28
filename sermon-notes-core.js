(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DailyWordSermons = api;
})(globalThis, function () {
  'use strict';

  const KEY = 'dw-sermons';
  const MAX_RECORDS = 5000;
  const MAX_TEXT_LENGTH = 20000;

  function cleanText(value, maxLength) {
    if (typeof value !== 'string') throw new Error('Sermon note fields must be text.');
    const text = value.trim();
    if (text.length > maxLength) throw new Error('A sermon note field is too long.');
    return text;
  }

  function writeAtomically(storage, changes) {
    const previous = changes.map(([key]) => [key, storage.getItem(key)]);
    try {
      for (const [key, value] of changes) storage.setItem(key, value);
    } catch (error) {
      let restored = true;
      for (const [key, value] of previous) {
        try {
          if (value === null) storage.removeItem(key);
          else storage.setItem(key, value);
        } catch { restored = false; }
      }
      if (!restored) throw new Error('Your browser could not roll back a partial notebook save. Export an encrypted backup and check available storage.');
      throw new Error('Your browser could not save the notebook. No changes were kept; check available storage and try again.');
    }
  }

  function validateEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('A sermon note is not valid.');
    const clean = {
      id:cleanText(entry.id, 80),
      title:cleanText(entry.title, 160),
      speaker:cleanText(entry.speaker || '', 120),
      date:cleanText(entry.date, 10),
      reference:cleanText(entry.reference || '', 160),
      insight:cleanText(entry.insight || '', MAX_TEXT_LENGTH),
      notes:cleanText(entry.notes || '', MAX_TEXT_LENGTH),
      application:cleanText(entry.application || '', MAX_TEXT_LENGTH),
      updatedAt:cleanText(entry.updatedAt, 40)
    };
    const parsedDate = new Date(clean.date + 'T12:00:00Z');
    if (!/^[\w-]{1,80}$/.test(clean.id) || !clean.title || !/^\d{4}-\d{2}-\d{2}$/.test(clean.date) ||
      !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== clean.date ||
      !Number.isFinite(Date.parse(clean.updatedAt)) || (!clean.insight && !clean.notes && !clean.application))
      throw new Error('Add a title, date, and at least one note before saving.');
    return clean;
  }

  function read(storage) {
    let value;
    try { value = JSON.parse(storage.getItem(KEY) || '[]'); }
    catch { throw new Error('Your sermon notebook could not be read. Export an encrypted backup before clearing browser data.'); }
    if (!Array.isArray(value) || value.length > MAX_RECORDS) throw new Error('Your sermon notebook is not valid.');
    const removed = new Map();
    try {
      const tombstones = JSON.parse(storage.getItem('dw-sermon-tombstones') || '[]');
      if (Array.isArray(tombstones)) tombstones.forEach(item => {
        if (item && typeof item.id === 'string' && Number.isFinite(Date.parse(item.deletedAt))) removed.set(item.id, Date.parse(item.deletedAt));
      });
    } catch { throw new Error('Your sermon deletion records could not be read.'); }
    return value.map(validateEntry).filter(item => (removed.get(item.id) || 0) < Date.parse(item.updatedAt));
  }

  function save(storage, entry) {
    const clean = validateEntry(entry);
    const current = read(storage);
    const index = current.findIndex(item => item.id === clean.id);
    if (index >= 0) current[index] = clean;
    else {
      if (current.length >= MAX_RECORDS) throw new Error('The sermon notebook is full.');
      current.unshift(clean);
    }
    try {
      const tombstones = JSON.parse(storage.getItem('dw-sermon-tombstones') || '[]');
      if (!Array.isArray(tombstones)) throw new Error();
      writeAtomically(storage, [
        ['dw-sermon-tombstones', JSON.stringify(tombstones.filter(item => item.id !== clean.id))],
        [KEY, JSON.stringify(current)]
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Your browser could not')) throw error;
      throw new Error('Your sermon deletion records could not be updated. No notebook changes were kept.');
    }
    return clean;
  }

  function remove(storage, id) {
    const current = read(storage);
    const next = current.filter(item => item.id !== id);
    if (next.length === current.length) return 0;
    let tombstones;
    try {
      tombstones = JSON.parse(storage.getItem('dw-sermon-tombstones') || '[]');
      if (!Array.isArray(tombstones)) throw new Error();
    } catch { throw new Error('Sermon notes were not deleted because their cloud deletion record could not be verified.'); }
    tombstones = tombstones.filter(item => item.id !== id);
    tombstones.push({ id, deletedAt:new Date().toISOString() });
    writeAtomically(storage, [
      [KEY, JSON.stringify(next)],
      ['dw-sermon-tombstones', JSON.stringify(tombstones)]
    ]);
    return current.length - next.length;
  }

  return { KEY, MAX_RECORDS, validateEntry, read, save, remove };
});
