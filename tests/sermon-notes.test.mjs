import sermons from '../sermon-notes-core.js';
import backup from '../data-protection.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

function createStorage(values = {}) {
  const entries = new Map(Object.entries(values));
  return {
    get length() { return entries.size; },
    getItem: key => entries.has(key) ? entries.get(key) : null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: key => entries.delete(key),
    key: index => [...entries.keys()][index] || null
  };
}

const sermon = {
  id:'message-1', title:'A steady hope', speaker:'Guest speaker', date:'2026-10-28',
  reference:'Romans 5:1-5', insight:'Hope grows through endurance.',
  notes:'Notice the movement from suffering to hope.', application:'Practice patience this week.',
  updatedAt:'2026-10-28T12:00:00.000Z'
};

test('creates, updates, and removes sermon notebook entries', () => {
  const storage = createStorage();
  sermons.save(storage, sermon);
  sermons.save(storage, { ...sermon, title:'A patient hope' });
  assert.equal(sermons.read(storage).length, 1);
  assert.equal(sermons.read(storage)[0].title, 'A patient hope');
  assert.equal(sermons.remove(storage, sermon.id), 1);
  assert.deepEqual(sermons.read(storage), []);
  assert.equal(JSON.parse(storage.getItem('dw-sermon-tombstones'))[0].id, sermon.id);
});

test('rejects empty notes and makes sermon entries valid encrypted-backup data', () => {
  const storage = createStorage();
  assert.throws(() => sermons.save(storage, { ...sermon, insight:'', notes:'', application:'' }), /at least one note/);
  assert.throws(() => sermons.save(storage, { ...sermon, date:'2026-99-99' }), /at least one note/);
  sermons.save(storage, sermon);
  const backupData = backup.collectData(storage);
  assert.equal(JSON.parse(backupData['dw-sermons'])[0].reference, 'Romans 5:1-5');
  assert.throws(() => backup.validateData({ 'dw-sermons':JSON.stringify([{ ...sermon, title:'' }]) }), /sermon note is not valid/);
});

test('merges sermon entries from encrypted backups without duplicating matching entries', () => {
  const merged = backup.mergeData(
    backup.validateData({ 'dw-sermons':JSON.stringify([sermon]) }),
    backup.validateData({ 'dw-sermons':JSON.stringify([sermon, { ...sermon, id:'message-2', title:'Another message' }]) })
  );
  assert.deepEqual(JSON.parse(merged['dw-sermons']).map(entry => entry.id), ['message-1', 'message-2']);
});

test('rolls back a partial notebook save when browser storage fills up', () => {
  const entries = new Map();
  let writes = 0;
  const storage = {
    getItem: key => entries.has(key) ? entries.get(key) : null,
    setItem(key, value) {
      if (++writes === 2) throw new Error('QuotaExceededError');
      entries.set(key, String(value));
    },
    removeItem: key => entries.delete(key)
  };
  assert.throws(() => sermons.save(storage, sermon), /No changes were kept/);
  assert.deepEqual(Object.fromEntries(entries), {});
});

test('sync merges the newest sermon edit and carries deletions across devices', () => {
  const deleted = backup.mergeData(
    backup.validateData({
      'dw-sermons':JSON.stringify([sermon]),
      'dw-sermon-tombstones':JSON.stringify([{ id:sermon.id, deletedAt:'2026-10-28T13:00:00.000Z' }])
    }),
    backup.validateData({ 'dw-sermons':JSON.stringify([sermon]) })
  );
  assert.deepEqual(JSON.parse(deleted['dw-sermons']), []);
  assert.equal(JSON.parse(deleted['dw-sermon-tombstones']).length, 1);

  const edited = backup.mergeData(
    backup.validateData({ 'dw-sermons':JSON.stringify([sermon]) }),
    backup.validateData({ 'dw-sermons':JSON.stringify([{ ...sermon, title:'Updated message', updatedAt:'2026-10-28T14:00:00.000Z' }]) })
  );
  assert.equal(JSON.parse(edited['dw-sermons'])[0].title, 'Updated message');
});
