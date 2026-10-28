(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DailyWordCloudSync = api;
})(globalThis, function () {
  'use strict';

  const DEFAULT_CONFIG = Object.freeze({
    url:'https://gwdiuztuamfpgjgoiuxg.supabase.co',
    anonKey:'sb_publishable_-WY29Fa5TeO70FFdUSqVkA_QR6x7V4u'
  });

  function isPublicKey(value) {
    if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/i.test(value)) return true;
    if (/^(?:sb_secret_|service_role)/i.test(value)) return false;
    const parts = value.split('.');
    if (parts.length !== 3) return false;
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.role === 'anon';
    } catch { return false; }
  }

  function validateConfig(url, key) {
    let parsed;
    try { parsed = new URL(url); }
    catch { throw new Error('Enter the HTTPS project URL shown in your Supabase project settings.'); }
    if (!['https:', 'http:'].includes(parsed.protocol) || !/^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname) ||
      parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash)
      throw new Error('Use your standard https://<project-ref>.supabase.co URL.');
    if (typeof key !== 'string' || key.trim().length < 20 || key.length > 4096 || !isPublicKey(key.trim()))
      throw new Error('Enter a Supabase publishable key or legacy anon key. Service-role and secret keys are blocked.');
    return { url:'https://' + parsed.hostname, anonKey:key.trim() };
  }

  return { DEFAULT_CONFIG, validateConfig };
});
