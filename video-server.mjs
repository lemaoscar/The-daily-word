import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT must be a valid TCP port.');
const API = 'https://api.dev.runwayml.com/v1';
const API_VERSION = '2024-11-06';
const MODELS = new Set(['gen4_turbo', 'gen4.5']);
const tasks = new Map();
const generationStarts = [];
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.webmanifest':'application/manifest+json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml' };
const staticExtensions = new Set(Object.keys(mime));
const maxVideoBytes = 250 * 1024 * 1024;
const maxTasksPerHour = 10;

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://api.dev.runwayml.com https://*.cloudfront.net https://*.supabase.co; manifest-src 'self'; worker-src 'self'");
}

function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}
loadDotEnv();
const apiKey = process.env.RUNWAYML_API_SECRET || '';

function json(res, status, data) {
  securityHeaders(res);
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  res.end(JSON.stringify(data));
}
function apiHeaders() { return { 'Authorization':'Bearer ' + apiKey, 'X-Runway-Version':API_VERSION, 'Content-Type':'application/json' }; }
async function readJson(req, limit = 12000) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) throw Object.assign(new Error('Request too large.'), { status:413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('Invalid JSON request.'), { status:400 }); }
}
async function providerJson(url, options) {
  const response = await fetch(url, { ...options, signal:AbortSignal.timeout(35000) });
  const text = await response.text();
  let body = {};
  try { body = JSON.parse(text || '{}'); } catch { body = {}; }
  if (!response.ok) {
    const message = body.error || body.message || ('Runway returned HTTP ' + response.status);
    throw Object.assign(new Error(String(message).slice(0, 500)), { status:response.status >= 500 ? 502 : response.status });
  }
  return body;
}
function estimate(model, duration) {
  const rate = model === 'gen4.5' ? 12 : 5;
  const credits = rate * duration;
  return { credits, usd:(credits * 0.01).toFixed(2), rate };
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/config' && req.method === 'GET')
    return json(res, 200, { provider:'Runway', configured:Boolean(apiKey), localOnly:true });
  if (!apiKey) return json(res, 503, { error:'Runway is not configured. Add RUNWAYML_API_SECRET to the local .env file, then restart the studio.' });

  if (url.pathname === '/api/videos' && req.method === 'POST') {
    const now = Date.now();
    for (const [id, task] of tasks) {
      if (now - task.createdAt >= 60 * 60 * 1000) tasks.delete(id);
    }
    while (generationStarts.length && now - generationStarts[0] >= 60 * 60 * 1000) generationStarts.shift();
    if (generationStarts.length >= maxTasksPerHour)
      return json(res, 429, { error:'The local safety limit is 10 video generations per hour. Please try again later.' });
    if (generationStarts.length && now - generationStarts[generationStarts.length - 1] < 5000)
      return json(res, 429, { error:'Please wait a few seconds before starting another generation.' });
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json'))
      return json(res, 415, { error:'Video requests must use application/json.' });
    const body = await readJson(req);
    const prompt = String(body.prompt || '').trim();
    const model = String(body.model || 'gen4_turbo');
    const duration = Number(body.duration);
    const ratio = String(body.ratio || '1280:720');
    if (prompt.length < 12 || prompt.length > 1000) return json(res, 400, { error:'The visual prompt must be 12–1,000 characters.' });
    if (!MODELS.has(model)) return json(res, 400, { error:'Choose a supported video model.' });
    if (![5, 10].includes(duration)) return json(res, 400, { error:'Choose a 5- or 10-second clip.' });
    if (!['1280:720', '720:1280'].includes(ratio)) return json(res, 400, { error:'Choose landscape or portrait framing.' });
    const cost = estimate(model, duration);
    if (body.confirmCharge !== true || Number(body.expectedCredits) !== cost.credits)
      return json(res, 400, { error:'Review and confirm the current estimated charge before generating.' });
    generationStarts.push(now);
    const created = await providerJson(API + '/text_to_video', {
      method:'POST', headers:apiHeaders(),
      body:JSON.stringify({ model, promptText:prompt, ratio, duration, outputFormat:'mp4' })
    });
    if (!created.id) return json(res, 502, { error:'Runway accepted the request but did not return a task ID.' });
    tasks.set(created.id, { createdAt:now, model, duration, credits:cost.credits, title:String(body.title || 'Prince Oscar Bible video').slice(0, 100) });
    return json(res, 202, { id:created.id, status:created.status || 'PENDING', estimatedCost:cost });
  }

  const match = url.pathname.match(/^\/api\/videos\/([0-9a-f-]{36})(?:\/(file))?$/i);
  if (match) {
    const taskId = match[1];
    const meta = tasks.get(taskId);
    if (!meta) return json(res, 404, { error:'This generation is not in this local studio session. Start a new clip.' });
    const detail = await providerJson(API + '/tasks/' + taskId, { method:'GET', headers:{ 'Authorization':'Bearer ' + apiKey, 'X-Runway-Version':API_VERSION } });
    if (match[2] === 'file') {
      if (detail.status !== 'SUCCEEDED' || !Array.isArray(detail.output) || !detail.output[0])
        return json(res, 409, { error:'The video is not ready to download yet.' });
      const destDir = path.join(ROOT, 'generated-videos');
      fs.mkdirSync(destDir, { recursive:true });
      const dest = path.join(destDir, taskId + '.mp4');
      if (!fs.existsSync(dest)) {
        const outputUrl = new URL(detail.output[0]);
        if (outputUrl.protocol !== 'https:' || outputUrl.port || outputUrl.username || outputUrl.password || !outputUrl.hostname.endsWith('.cloudfront.net'))
          return json(res, 502, { error:'Runway returned an unexpected video file address.' });
        const fileResponse = await fetch(outputUrl, { signal:AbortSignal.timeout(120000) });
        if (!fileResponse.ok || !fileResponse.body) return json(res, 502, { error:'Could not retrieve the generated MP4.' });
        const contentLength = Number(fileResponse.headers.get('content-length'));
        if (Number.isFinite(contentLength) && contentLength > maxVideoBytes)
          return json(res, 413, { error:'The generated file exceeded the local 250 MB limit.' });
        const temporary = dest + '.tmp-' + randomUUID();
        let received = 0;
        try {
          await pipeline(
            Readable.fromWeb(fileResponse.body),
            new Transform({
              transform(chunk, encoding, callback) {
                received += chunk.length;
                callback(received > maxVideoBytes ? new Error('The generated file exceeded the local 250 MB limit.') : null, chunk);
              }
            }),
            fs.createWriteStream(temporary, { flags:'wx', mode:0o600 })
          );
          if (!received) throw new Error('Runway returned an empty video file.');
          fs.renameSync(temporary, dest);
        } catch (error) {
          fs.rmSync(temporary, { force:true });
          if (received > maxVideoBytes) return json(res, 413, { error:'The generated file exceeded the local 250 MB limit.' });
          throw error;
        }
      }
      const download = url.searchParams.get('download') === '1';
      securityHeaders(res);
      res.writeHead(200, {
        'Content-Type':'video/mp4', 'Content-Length':fs.statSync(dest).size,
        'Content-Disposition':(download ? 'attachment' : 'inline') + '; filename="prince-oscar-bible-' + taskId + '.mp4"',
        'Cache-Control':'private, no-store'
      });
      return fs.createReadStream(dest).pipe(res);
    }
    return json(res, 200, {
      id:detail.id, status:detail.status, createdAt:detail.createdAt,
      estimatedCost:detail.estimatedCost || { credits:meta.credits },
      failure:detail.failure || detail.error || null, title:meta.title,
      videoUrl:detail.status === 'SUCCEEDED' ? '/api/videos/' + taskId + '/file' : null
    });
  }
  return json(res, 404, { error:'API route not found.' });
}

function serveStatic(req, res, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { return json(res, 400, { error:'Invalid path.' }); }
  if (pathname.includes('\\') || pathname.split('/').some(part => part === '.' || part === '..' || part.startsWith('.')))
    return json(res, 404, { error:'File not found.' });
  if (pathname === '/') pathname = '/index.html';
  const target = path.resolve(ROOT, '.' + pathname);
  if (!path.relative(ROOT, target) || path.relative(ROOT, target).startsWith('..') || path.isAbsolute(path.relative(ROOT, target)))
    return json(res, 404, { error:'File not found.' });
  if (!staticExtensions.has(path.extname(target).toLowerCase()))
    return json(res, 404, { error:'File not found.' });
  fs.realpath(target, (realErr, realTarget) => {
    if (realErr || (path.relative(ROOT, realTarget).startsWith('..')) || path.isAbsolute(path.relative(ROOT, realTarget)))
      return json(res, 404, { error:'File not found.' });
    fs.stat(realTarget, (err, stat) => {
      if (err || !stat.isFile()) return json(res, 404, { error:'File not found.' });
      securityHeaders(res);
      res.writeHead(200, { 'Content-Type':mime[path.extname(realTarget).toLowerCase()], 'Cache-Control':'no-cache' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(realTarget).pipe(res);
    });
  });
}

const server = http.createServer(async (req, res) => {
  let hostUrl;
  try { hostUrl = new URL('http://' + String(req.headers.host || '')); }
  catch { return json(res, 400, { error:'Invalid host header.' }); }
  if (hostUrl.username || hostUrl.password || hostUrl.pathname !== '/' || hostUrl.search || hostUrl.hash || !['127.0.0.1', 'localhost'].includes(hostUrl.hostname) || (hostUrl.port || '80') !== String(PORT))
    return json(res, 403, { error:'Local access only.' });
  const expectedOrigin = hostUrl.origin;
  if (req.headers.origin) {
    let origin;
    let originUrl;
    try { originUrl = new URL(req.headers.origin); origin = originUrl.origin; }
    catch { return json(res, 403, { error:'Invalid request origin.' }); }
    if (origin !== expectedOrigin || originUrl.username || originUrl.password || originUrl.pathname !== '/' || originUrl.search || originUrl.hash)
      return json(res, 403, { error:'Cross-origin requests are not allowed.' });
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.headers.origin)
    return json(res, 403, { error:'An origin header is required for this request.' });
  if (req.url?.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')
    return json(res, 403, { error:'Cross-site requests are not allowed.' });
  let url;
  try { url = new URL(req.url, expectedOrigin); }
  catch { return json(res, 400, { error:'Invalid request URL.' }); }
  if (!url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method))
    return json(res, 405, { error:'Method not allowed.' });
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url);
  } catch (err) {
    console.error('[Prince Oscar video studio]', err.message);
    json(res, Number(err.status) || 502, { error:err.message || 'Video service request failed.' });
  }
});
server.listen(PORT, HOST, () => console.log('Daily Word: http://' + HOST + ':' + PORT + '/', apiKey ? '(local Runway video generation is configured)' : '(reading and study are ready; optional video generation needs a .env key)'));
