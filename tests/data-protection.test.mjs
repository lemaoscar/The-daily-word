import backup from '../data-protection.js';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';

function createStorage(values = {}) {
  const entries = new Map(Object.entries(values));
  return {
    get length() { return entries.size; },
    getItem: key => entries.has(key) ? entries.get(key) : null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: key => entries.delete(key),
    key: index => [...entries.keys()][index] || null,
    snapshot: () => Object.fromEntries(entries)
  };
}

test('encrypts portable backups without exposing prayer text and restores them privately', async () => {
  const original = createStorage({
    'dw-prayers':JSON.stringify([{ text:'A private prayer I do not want online', date:'today', answered:false }]),
    'dw-study-notes-42':'Remember this passage',
    'dw-plan-complete':JSON.stringify({ 42:true }),
    'dw-quiz-best-WEB-verse-book':'8',
    'unrelated-app-data':'do not include'
  });
  const encrypted = await backup.encryptBackup(original, 'a-private-passphrase-for-daily-word', webcrypto, new Date('2026-10-28T00:00:00.000Z'));

  assert.equal(encrypted.includes('A private prayer I do not want online'), false);
  assert.equal(encrypted.includes('do not include'), false);
  const envelope = JSON.parse(encrypted);
  assert.equal(envelope.format, backup.FORMAT);
  assert.equal(envelope.iterations, backup.ITERATIONS);

  const restored = await backup.decryptBackup(encrypted, 'a-private-passphrase-for-daily-word', webcrypto);
  assert.equal(JSON.parse(restored['dw-prayers'])[0].text, 'A private prayer I do not want online');
  assert.equal(restored['dw-study-notes-42'], 'Remember this passage');
  assert.equal(restored['dw-quiz-best-WEB-verse-book'], '8');
  assert.equal(Object.hasOwn(restored, 'unrelated-app-data'), false);
});

test('rejects short passwords, wrong passwords, tampering, malformed scores, and unsafe records', async () => {
  const data = createStorage({ 'dw-notes':'Personal note' });
  await assert.rejects(backup.encryptBackup(data, 'short', webcrypto), /at least 12 characters/);
  const encrypted = await backup.encryptBackup(data, 'a-long-enough-passphrase', webcrypto);
  await assert.rejects(backup.decryptBackup(encrypted, 'a-different-long-passphrase', webcrypto), /could not be decrypted/);
  assert.throws(() => backup.validateData({ 'dw-quiz-best-WEB-verse-book':'99' }), /score is not valid/);
  assert.throws(() => backup.validateData(JSON.parse('{"__proto__":{"polluted":true}}')), /unsafe data field/);

  const envelope = JSON.parse(encrypted);
  envelope.version = 100;
  await assert.rejects(backup.decryptBackup(JSON.stringify(envelope), 'a-long-enough-passphrase', webcrypto), /unsupported Daily Word version/);
});

test('merges prayers and reading progress without overwriting existing notes', () => {
  const current = backup.validateData({
    'dw-notes':'My newer local notes',
    'dw-prayers':JSON.stringify([{ text:'Current prayer', date:'today', answered:false }]),
    'dw-plan-complete':JSON.stringify({ 4:true, 9:false })
  });
  const imported = backup.validateData({
    'dw-notes':'Notes from the backup',
    'dw-prayers':JSON.stringify([
      { text:'Current prayer', date:'today', answered:false },
      { text:'Prayer to restore', date:'yesterday', answered:false }
    ]),
    'dw-plan-complete':JSON.stringify({ 4:false, 6:true })
  });
  const merged = backup.mergeData(current, imported);

  assert.equal(merged['dw-notes'], 'My newer local notes');
  assert.deepEqual(JSON.parse(merged['dw-prayers']).map(entry => entry.text), ['Current prayer', 'Prayer to restore']);
  assert.deepEqual(JSON.parse(merged['dw-plan-complete']), { 4:true, 6:true, 9:false });
});

test('restores a valid backup to local storage while keeping existing notes', () => {
  const storage = createStorage({
    'dw-notes':'Keep these current notes',
    'dw-prayers':JSON.stringify([])
  });
  const restored = backup.mergeIntoStorage(storage, backup.validateData({
    'dw-notes':'Older backup notes',
    'dw-study-notes-5':'Recovered study note',
    'dw-prayers':JSON.stringify([{ text:'Recovered', date:'today', answered:false }])
  }));
  assert.equal(restored.importedKeys, 3);
  assert.equal(storage.getItem('dw-notes'), 'Keep these current notes');
  assert.equal(storage.getItem('dw-study-notes-5'), 'Recovered study note');
  assert.equal(JSON.parse(storage.getItem('dw-prayers')).length, 1);
});

test('rolls back a partially written backup when the browser runs out of storage', () => {
  const entries = new Map([
    ['dw-notes', 'Current notes'],
    ['dw-prayers', JSON.stringify([])]
  ]);
  let writeCount = 0;
  const storage = {
    get length() { return entries.size; },
    getItem: key => entries.has(key) ? entries.get(key) : null,
    key: index => [...entries.keys()][index] || null,
    setItem(key, value) {
      if (++writeCount === 2) throw new Error('QuotaExceededError');
      entries.set(key, String(value));
    },
    removeItem: key => entries.delete(key)
  };
  const initial = Object.fromEntries(entries);
  assert.throws(() => backup.mergeIntoStorage(storage, backup.validateData({
    'dw-notes':'Old backup notes',
    'dw-study-notes-8':'A restored study note',
    'dw-prayers':JSON.stringify([{ text:'Restored prayer', date:'today', answered:false }])
  })), /No changes were kept/);
  assert.deepEqual(Object.fromEntries(entries), initial);
});

test('clears only Daily Word data, including corrupt entries it cannot export', () => {
  const storage = createStorage({
    'dw-prayers':'not valid JSON',
    'dw-study-notes-12':'A private note',
    'dw-theme':'dark',
    'another-app-data':'leave this app alone'
  });
  assert.throws(() => backup.collectData(storage), /could not be verified/);
  assert.equal(backup.clearDailyWordData(storage), 3);
  assert.deepEqual(storage.snapshot(), { 'another-app-data':'leave this app alone' });
});
