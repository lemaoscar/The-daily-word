(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DailyWordBackup = api;
})(globalThis, function () {
  'use strict';

  const FORMAT = 'daily-word-encrypted-backup';
  const VERSION = 1;
  const ITERATIONS = 310000;
  const MIN_PASSPHRASE_LENGTH = 12;
  const MAX_PASSPHRASE_LENGTH = 1024;
  const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
  const MAX_ENVELOPE_BYTES = 12 * 1024 * 1024;
  const BASE_KEYS = [
    'dw-notes',
    'dw-day124-done',
    'dw-verse-marks',
    'dw-bible-version',
    'dw-bookmarks',
    'dw-sermons',
    'dw-sermon-tombstones',
    'dw-prayers',
    'dw-reminder-time',
    'dw-plan-complete',
    'dw-video-projects',
    'dw-prince-oscar-video-task',
    'dw-theme',
    'dw-reader-size',
    'dw-clock-format'
  ];
  const ARRAY_KEYS = new Set(['dw-bookmarks', 'dw-sermons', 'dw-sermon-tombstones', 'dw-prayers', 'dw-video-projects']);
  const OBJECT_KEYS = new Set(['dw-verse-marks', 'dw-plan-complete']);
  const SCALAR_KEYS = new Set([
    'dw-day124-done',
    'dw-bible-version',
    'dw-reminder-time',
    'dw-prince-oscar-video-task',
    'dw-theme',
    'dw-reader-size',
    'dw-clock-format'
  ]);
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder('utf-8', { fatal:true });

  function isPlainRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function assertSafeTree(value, depth = 0, budget = { nodes:0 }) {
    if (depth > 32 || ++budget.nodes > 100000) throw new Error('This backup contains data that is too complex.');
    if (Array.isArray(value)) {
      for (const entry of value) assertSafeTree(entry, depth + 1, budget);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (!isPlainRecord(value)) throw new Error('This backup contains an unsupported data structure.');
    for (const [key, entry] of Object.entries(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype')
        throw new Error('This backup contains an unsafe data field.');
      assertSafeTree(entry, depth + 1, budget);
    }
  }

  function isAllowedKey(key) {
    return BASE_KEYS.includes(key) || /^dw-study-notes-\d{1,3}$/.test(key) || /^dw-quiz-best-(?:WEB|KJV)-(?:verse-book|reference-verse)$/.test(key);
  }

  function getStorageKeys(storage) {
    const keys = new Set(BASE_KEYS);
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (isAllowedKey(key)) keys.add(key);
    }
    return [...keys].filter(key => isAllowedKey(key) && storage.getItem(key) !== null);
  }

  function validateStoredEntry(key, raw) {
    if (!isAllowedKey(key) || typeof raw !== 'string' || raw.length > MAX_BACKUP_BYTES)
      throw new Error('The backup contains unsupported or oversized app data.');

    if (key === 'dw-notes' || /^dw-study-notes-\d{1,3}$/.test(key)) return raw;
    if (/^dw-quiz-best-/.test(key)) {
      if (!/^(?:[0-9]|10)$/.test(raw)) throw new Error('A saved quiz score is not valid.');
      return raw;
    }
    if (SCALAR_KEYS.has(key)) {
      if (key === 'dw-day124-done' && !/^[01]$/.test(raw)) throw new Error('A saved reading entry is not valid.');
      if (key === 'dw-bible-version' && !/^(?:WEB|KJV)$/.test(raw)) throw new Error('A saved Bible edition is not valid.');
      if (key === 'dw-reminder-time' && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw)) throw new Error('A saved reminder time is not valid.');
      if (key === 'dw-theme' && !/^(?:light|dark|system)$/.test(raw)) throw new Error('A saved appearance setting is not valid.');
      if (key === 'dw-reader-size' && !/^(?:standard|large|extra-large)$/.test(raw)) throw new Error('A saved reading-size setting is not valid.');
      if (key === 'dw-clock-format' && !/^(?:12|24)$/.test(raw)) throw new Error('A saved clock setting is not valid.');
      if (key === 'dw-prince-oscar-video-task' && !/^[0-9a-f-]{36}$/i.test(raw)) throw new Error('A saved video task reference is not valid.');
      return raw;
    }

    let value;
    try { value = JSON.parse(raw); }
    catch { throw new Error('Saved Daily Word data could not be verified. No backup was created.'); }
    assertSafeTree(value);
    if (ARRAY_KEYS.has(key) && !Array.isArray(value)) throw new Error('A saved list is not valid.');
    if (key === 'dw-sermons') {
      if (value.length > 5000) throw new Error('The sermon notebook contains too many entries.');
      for (const entry of value) {
        if (!isPlainRecord(entry) || typeof entry.id !== 'string' || !/^[\w-]{1,80}$/.test(entry.id) ||
          typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > 160 ||
          typeof entry.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
          typeof entry.updatedAt !== 'string' || !Number.isFinite(Date.parse(entry.updatedAt)) ||
          ['speaker', 'reference', 'insight', 'notes', 'application'].some(field => typeof entry[field] !== 'string' ||
            entry[field].length > (['insight', 'notes', 'application'].includes(field) ? 20000 : 160)))
          throw new Error('A saved sermon note is not valid.');
      }
    }
    if (key === 'dw-sermon-tombstones') {
      if (value.length > 5000 || value.some(entry => !isPlainRecord(entry) ||
        typeof entry.id !== 'string' || !/^[\w-]{1,80}$/.test(entry.id) ||
        typeof entry.deletedAt !== 'string' || !Number.isFinite(Date.parse(entry.deletedAt))))
        throw new Error('A saved sermon deletion record is not valid.');
    }
    if (OBJECT_KEYS.has(key) && !isPlainRecord(value)) throw new Error('A saved reading record is not valid.');
    return JSON.stringify(value);
  }

  function validateData(data) {
    if (!isPlainRecord(data)) throw new Error('This is not a Daily Word backup.');
    assertSafeTree(data);
    const clean = Object.create(null);
    let byteCount = 0;
    for (const [key, raw] of Object.entries(data)) {
      clean[key] = validateStoredEntry(key, raw);
      byteCount += textEncoder.encode(key).byteLength + textEncoder.encode(clean[key]).byteLength;
      if (byteCount > MAX_BACKUP_BYTES) throw new Error('This backup is larger than Daily Word supports.');
    }
    return clean;
  }

  function collectData(storage) {
    const data = Object.create(null);
    for (const key of getStorageKeys(storage)) {
      const raw = storage.getItem(key);
      data[key] = validateStoredEntry(key, raw);
    }
    return validateData(data);
  }

  function bytesToBase64(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
    }
    return btoa(binary);
  }

  function base64ToBytes(value, maxLength) {
    if (typeof value !== 'string' || value.length > maxLength || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
      throw new Error('This backup file is damaged or unsupported.');
    let binary;
    try { binary = atob(value); }
    catch { throw new Error('This backup file is damaged or unsupported.'); }
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  function checkPassphrase(passphrase) {
    if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH)
      throw new Error('Use a backup passphrase with at least 12 characters.');
    if (passphrase.length > MAX_PASSPHRASE_LENGTH)
      throw new Error('That passphrase is too long.');
  }

  async function deriveKey(passphrase, salt, cryptoApi) {
    const imported = await cryptoApi.subtle.importKey('raw', textEncoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return cryptoApi.subtle.deriveKey(
      { name:'PBKDF2', salt, iterations:ITERATIONS, hash:'SHA-256' },
      imported,
      { name:'AES-GCM', length:256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptBackup(storage, passphrase, cryptoApi = globalThis.crypto, date = new Date()) {
    checkPassphrase(passphrase);
    if (!cryptoApi?.subtle || !cryptoApi.getRandomValues) throw new Error('Secure encryption is not available in this browser.');

    const payload = {
      format:FORMAT,
      version:VERSION,
      createdAt:date.toISOString(),
      data:collectData(storage)
    };
    const plaintext = textEncoder.encode(JSON.stringify(payload));
    if (plaintext.byteLength > MAX_BACKUP_BYTES) throw new Error('Your app data is larger than Daily Word supports in one backup.');

    const salt = cryptoApi.getRandomValues(new Uint8Array(16));
    const iv = cryptoApi.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt, cryptoApi);
    const ciphertext = new Uint8Array(await cryptoApi.subtle.encrypt({ name:'AES-GCM', iv }, key, plaintext));
    return JSON.stringify({
      format:FORMAT,
      version:VERSION,
      kdf:'PBKDF2-SHA-256',
      iterations:ITERATIONS,
      salt:bytesToBase64(salt),
      iv:bytesToBase64(iv),
      ciphertext:bytesToBase64(ciphertext)
    });
  }

  async function decryptBackup(serialized, passphrase, cryptoApi = globalThis.crypto) {
    checkPassphrase(passphrase);
    if (!cryptoApi?.subtle) throw new Error('Secure decryption is not available in this browser.');
    if (typeof serialized !== 'string' || textEncoder.encode(serialized).byteLength > MAX_ENVELOPE_BYTES)
      throw new Error('This backup file is too large.');

    let envelope;
    try { envelope = JSON.parse(serialized); }
    catch { throw new Error('This is not a valid Daily Word backup file.'); }
    if (!isPlainRecord(envelope) || envelope.format !== FORMAT || envelope.version !== VERSION ||
      envelope.kdf !== 'PBKDF2-SHA-256' || envelope.iterations !== ITERATIONS)
      throw new Error('This backup was made by an unsupported Daily Word version.');

    const salt = base64ToBytes(envelope.salt, 32);
    const iv = base64ToBytes(envelope.iv, 24);
    const ciphertext = base64ToBytes(envelope.ciphertext, MAX_ENVELOPE_BYTES);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17 || ciphertext.length > MAX_BACKUP_BYTES)
      throw new Error('This backup file is damaged or unsupported.');

    const key = await deriveKey(passphrase, salt, cryptoApi);
    let plaintext;
    try { plaintext = new Uint8Array(await cryptoApi.subtle.decrypt({ name:'AES-GCM', iv }, key, ciphertext)); }
    catch { throw new Error('The backup could not be decrypted. Check your passphrase and try again.'); }

    let payload;
    try { payload = JSON.parse(textDecoder.decode(plaintext)); }
    catch { throw new Error('The decrypted backup contains invalid data.'); }
    if (!isPlainRecord(payload) || payload.format !== FORMAT || payload.version !== VERSION ||
      typeof payload.createdAt !== 'string' || !Number.isFinite(Date.parse(payload.createdAt)))
      throw new Error('The decrypted file is not a valid Daily Word backup.');
    return validateData(payload.data);
  }

  function mergeData(currentData, importedData) {
    const current = validateData(currentData);
    const incoming = validateData(importedData);
    const merged = Object.assign(Object.create(null), incoming);
    for (const [key, currentValue] of Object.entries(current)) {
      if (key === 'dw-sermon-tombstones') {
        const latest = new Map();
        for (const item of [...JSON.parse(currentValue), ...JSON.parse(incoming[key] || '[]')]) {
          const previous = latest.get(item.id);
          if (!previous || Date.parse(item.deletedAt) > Date.parse(previous.deletedAt)) latest.set(item.id, item);
        }
        merged[key] = JSON.stringify([...latest.values()]);
      } else if (key === 'dw-sermons') {
        const latest = new Map();
        for (const item of [...JSON.parse(currentValue), ...JSON.parse(incoming[key] || '[]')]) {
          const previous = latest.get(item.id);
          if (!previous || Date.parse(item.updatedAt) > Date.parse(previous.updatedAt)) latest.set(item.id, item);
        }
        const deletions = new Map();
        for (const item of [...JSON.parse(current['dw-sermon-tombstones'] || '[]'), ...JSON.parse(incoming['dw-sermon-tombstones'] || '[]')]) {
          deletions.set(item.id, Math.max(deletions.get(item.id) || 0, Date.parse(item.deletedAt)));
        }
        merged[key] = JSON.stringify([...latest.values()].filter(item => (deletions.get(item.id) || 0) < Date.parse(item.updatedAt)));
      } else if (ARRAY_KEYS.has(key)) {
        const oldItems = JSON.parse(currentValue);
        const restoredItems = JSON.parse(incoming[key] || '[]');
        const seen = new Set(oldItems.map(item => JSON.stringify(item)));
        merged[key] = JSON.stringify(oldItems.concat(restoredItems.filter(item => {
          const signature = JSON.stringify(item);
          if (seen.has(signature)) return false;
          seen.add(signature);
          return true;
        })));
      } else if (OBJECT_KEYS.has(key)) {
        merged[key] = JSON.stringify(Object.assign(Object.create(null), JSON.parse(incoming[key] || '{}'), JSON.parse(currentValue)));
      } else {
        merged[key] = currentValue;
      }
    }
    return validateData(merged);
  }

  function mergeIntoStorage(storage, importedData) {
    const imported = validateData(importedData);
    const currentData = collectData(storage);
    const merged = mergeData(currentData, imported);
    const changes = Object.entries(merged).filter(([key, value]) => storage.getItem(key) !== value);
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
      if (!restored) throw new Error('Your browser ran out of storage while restoring the backup. Some data may not have been restored; free device storage and restore the backup again.');
      throw new Error('Your browser could not save the full backup. No changes were kept; check available storage and try again.');
    }
    return { importedKeys:Object.keys(imported).length, updatedKeys:changes.length };
  }

  function clearDailyWordData(storage) {
    const previous = getStorageKeys(storage).map(key => [key, storage.getItem(key)]);
    let removed = 0;
    try {
      for (const [key] of previous) {
        storage.removeItem(key);
        removed++;
      }
    } catch (error) {
      let restored = true;
      for (const [key, value] of previous.slice(0, removed)) {
        try { storage.setItem(key, value); }
        catch { restored = false; }
      }
      if (!restored) throw new Error('Some Daily Word data could not be cleared or restored. Export an encrypted backup and check browser storage.');
      throw new Error('Your browser did not allow all Daily Word data to be cleared. No changes were kept; try again.');
    }
    return removed;
  }

  function addSettingsPanel() {
    const header = document.querySelector('.header-right');
    if (!header || document.getElementById('dailyWordSettings')) return;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'dw-settings-trigger';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.innerHTML = '<span class="dw-gear" aria-hidden="true">⚙</span><span>Settings</span>';
    header.appendChild(trigger);

    const dialog = document.createElement('dialog');
    dialog.id = 'dailyWordSettings';
    dialog.className = 'dw-dialog';
    dialog.setAttribute('aria-labelledby', 'dwSettingsTitle');
    dialog.innerHTML = `
      <header class="dw-dialog-header">
        <div><p class="eyebrow">YOUR DAILY WORD</p><h2 id="dwSettingsTitle">Settings & privacy</h2></div>
        <button type="button" class="dw-dialog-close" aria-label="Close settings">×</button>
      </header>
      <div class="dw-dialog-content">
        <section class="dw-settings-section">
          <h3>A reading space that feels like yours</h3>
          <p>These preferences stay in your browser on this device.</p>
          <label class="dw-setting-row" for="dwThemeSelect"><span><strong>Appearance</strong><small>Choose a calm light or dark reading space.</small></span><select id="dwThemeSelect" class="dw-select"><option value="system">Device setting</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
          <label class="dw-setting-row" for="dwReaderSize"><span><strong>Bible text size</strong><small>Make long passages easier to read.</small></span><select id="dwReaderSize" class="dw-select"><option value="standard">Standard</option><option value="large">Large</option><option value="extra-large">Extra large</option></select></label>
          <label class="dw-setting-row" for="dwClockFormat"><span><strong>Clock format</strong><small>Choose how your local time is displayed.</small></span><select id="dwClockFormat" class="dw-select"><option value="12">12-hour</option><option value="24">24-hour</option></select></label>
        </section>
        <section class="dw-settings-section">
          <h3>Your personal data belongs to you</h3>
          <p>Prayer entries, reading notes, saved verses, progress, and preferences remain in this browser. You can make a password-protected backup to move them to another device.</p>
          <label class="visually-hidden" for="dwBackupPassphrase">Backup passphrase</label>
          <input id="dwBackupPassphrase" class="dw-password dw-backup-password" type="password" minlength="12" maxlength="1024" autocomplete="new-password" placeholder="Create a backup passphrase · at least 12 characters">
          <div class="dw-backup-actions">
            <button type="button" class="dw-action dw-action-primary" id="dwExportBackup">Download encrypted backup</button>
            <button type="button" class="dw-action" id="dwChooseBackup">Restore and merge backup</button>
            <input id="dwBackupFile" class="dw-import-input" type="file" accept=".dailyword,application/json" aria-label="Choose an encrypted Daily Word backup">
          </div>
          <p class="dw-note">Encrypted on this device with your passphrase. Daily Word never receives it. Keep the passphrase safe: it cannot be recovered if you forget it. Restore merges your backup without deleting notes already on this device.</p>
        </section>
        <section class="dw-settings-section">
          <h3>Clear this device</h3>
          <p>Remove Daily Word notes, prayer entries, marks, saved passages, and reading progress from this browser. This cannot be undone.</p>
          <div class="dw-backup-actions"><button type="button" class="dw-action dw-action-danger" id="dwClearData">Clear my Daily Word data</button></div>
        </section>
        <p id="dwSettingsStatus" class="dw-settings-status" role="status" aria-live="polite"></p>
      </div>
      <footer>Nothing here creates an account or uploads your journal. A backup is encrypted before it is downloaded to your device.</footer>
    `;
    document.body.appendChild(dialog);

    const byId = id => document.getElementById(id);
    const status = byId('dwSettingsStatus');
    const password = byId('dwBackupPassphrase');
    const file = byId('dwBackupFile');
    const setStatus = (message, isError = false) => {
      status.textContent = message;
      status.dataset.state = isError ? 'error' : 'success';
    };
    const themeSelect = byId('dwThemeSelect');
    const readerSelect = byId('dwReaderSize');
    const clockSelect = byId('dwClockFormat');
    const applyTheme = value => {
      const dark = value === 'dark' || (value === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };

    themeSelect.value = localStorage.getItem('dw-theme') || 'system';
    readerSelect.value = localStorage.getItem('dw-reader-size') || 'standard';
    clockSelect.value = localStorage.getItem('dw-clock-format') || '12';
    applyTheme(themeSelect.value);
    document.documentElement.dataset.readerSize = readerSelect.value;
    themeSelect.addEventListener('change', () => {
      localStorage.setItem('dw-theme', themeSelect.value);
      applyTheme(themeSelect.value);
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      if (themeSelect.value === 'system') applyTheme('system');
    });
    readerSelect.addEventListener('change', () => {
      localStorage.setItem('dw-reader-size', readerSelect.value);
      document.documentElement.dataset.readerSize = readerSelect.value;
    });
    clockSelect.addEventListener('change', () => {
      localStorage.setItem('dw-clock-format', clockSelect.value);
      document.dispatchEvent(new CustomEvent('dailyword:clock-format-changed'));
    });

    trigger.addEventListener('click', () => dialog.showModal());
    dialog.querySelector('.dw-dialog-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });

    byId('dwExportBackup').addEventListener('click', async () => {
      const passphrase = password.value;
      try {
        const contents = await api.encryptBackup(localStorage, passphrase);
        const link = document.createElement('a');
        const url = URL.createObjectURL(new Blob([contents], { type:'application/json' }));
        link.href = url;
        link.download = 'daily-word-backup-' + new Date().toISOString().slice(0, 10) + '.dailyword';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus('Your encrypted backup has been downloaded. Store both the file and passphrase safely.');
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    byId('dwChooseBackup').addEventListener('click', () => {
      if (!password.value || password.value.length < MIN_PASSPHRASE_LENGTH) {
        setStatus('Enter the passphrase for this backup first.', true);
        password.focus();
        return;
      }
      file.click();
    });
    file.addEventListener('change', async () => {
      const backupFile = file.files?.[0];
      file.value = '';
      if (!backupFile) return;
      if (backupFile.size > MAX_ENVELOPE_BYTES) {
        setStatus('That backup file is larger than Daily Word supports.', true);
        return;
      }
      try {
        const data = await api.decryptBackup(await backupFile.text(), password.value);
        const result = api.mergeIntoStorage(localStorage, data);
        setStatus('Backup restored safely. ' + result.importedKeys + ' data entries checked; your existing notes were kept. Reloading to refresh the app…');
        setTimeout(() => location.reload(), 1600);
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    byId('dwClearData').addEventListener('click', () => {
      if (!window.confirm('Delete Daily Word reading progress, notes, prayer entries, saved passages, and settings from this browser? This cannot be undone.')) return;
      try {
        api.clearDailyWordData(localStorage);
        setStatus('Daily Word data was cleared from this browser. Reloading…');
        setTimeout(() => location.reload(), 1100);
      } catch (error) {
        setStatus('Daily Word data could not be cleared: ' + error.message, true);
      }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addSettingsPanel, { once:true });
    else addSettingsPanel();
  }

  return {
    FORMAT,
    VERSION,
    ITERATIONS,
    MIN_PASSPHRASE_LENGTH,
    collectData,
    encryptBackup,
    decryptBackup,
    mergeData,
    mergeIntoStorage,
    clearDailyWordData,
    validateData
  };
});
