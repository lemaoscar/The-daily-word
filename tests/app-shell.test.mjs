import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('every required offline shell asset exists before service worker installation', () => {
  const source = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  const match = source.match(/const CORE_FILES = \[([\s\S]*?)\];/);
  assert.ok(match, 'service worker should declare its offline shell');
  const files = [...match[1].matchAll(/'([^']+)'/g)].map(([, file]) => file);
  assert.ok(files.length > 0);
  const missing = files.filter(file => !fs.existsSync(path.join(root, file.replace(/^\/+/, ''))));
  assert.deepEqual(missing, [], 'all core files must exist or offline installation fails');
});
