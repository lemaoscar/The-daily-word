import cloud from '../cloud-sync-core.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const publishableKey = 'sb_publishable_' + 'a'.repeat(32);
function legacyKey(role) {
  const payload = Buffer.from(JSON.stringify({ role })).toString('base64url');
  return 'header.' + payload + '.signature';
}

test('accepts Supabase project URLs and public client keys only', () => {
  assert.deepEqual(cloud.validateConfig(cloud.DEFAULT_CONFIG.url, cloud.DEFAULT_CONFIG.anonKey), cloud.DEFAULT_CONFIG);
  assert.equal(cloud.DEFAULT_CONFIG.url, 'https://gwdiuztuamfpgjgoiuxg.supabase.co');
  assert.deepEqual(cloud.validateConfig('https://daily-word.supabase.co/', publishableKey), {
    url:'https://daily-word.supabase.co',
    anonKey:publishableKey
  });
  assert.equal(cloud.validateConfig('http://dailyword.supabase.co', publishableKey).url, 'https://dailyword.supabase.co');
  assert.equal(cloud.validateConfig('https://daily-word.supabase.co', legacyKey('anon')).anonKey, legacyKey('anon'));
  assert.throws(() => cloud.validateConfig('https://example.com', publishableKey), /standard/);
  assert.throws(() => cloud.validateConfig('https://daily-word.supabase.co.evil.example', publishableKey), /standard/);
  assert.throws(() => cloud.validateConfig('https://daily-word.supabase.co', 'sb_secret_' + 'x'.repeat(32)), /Service-role and secret keys are blocked/);
  assert.throws(() => cloud.validateConfig('https://daily-word.supabase.co', legacyKey('service_role')), /Service-role and secret keys are blocked/);
});
