import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

const secret = 'daily-word-test-secret-never-serve';
let root;
let origin;
let child;
let childOutput = '';

async function unusedPort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const { port } = socket.address();
  await new Promise(resolve => socket.close(resolve));
  return port;
}

async function rawRequest(pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname:'127.0.0.1',
      port:Number(new URL(origin).port),
      path:pathname,
      headers
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status:response.statusCode,
        headers:response.headers,
        body:Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.once('error', reject);
    request.end();
  });
}

before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'daily-word-security-'));
  await mkdir(path.join(root, 'assets'));
  await mkdir(path.join(root, 'generated-videos'));
  await writeFile(path.join(root, 'video-server.mjs'), await readFile(new URL('../video-server.mjs', import.meta.url)));
  await writeFile(path.join(root, '.env'), 'RUNWAYML_API_SECRET=' + secret);
  await writeFile(path.join(root, '.env.example'), 'RUNWAYML_API_SECRET=example');
  await writeFile(path.join(root, 'index.html'), '<!doctype html><title>Daily Word test</title>');
  await writeFile(path.join(root, 'assets', 'site.css'), 'body{color:#123}');
  await writeFile(path.join(root, 'generated-videos', 'private.mp4'), 'private video');
  for (const filename of ['manifest.webmanifest', 'service-worker.js', 'bible-interactions.js']) {
    await writeFile(path.join(root, filename), await readFile(new URL('../' + filename, import.meta.url)));
  }

  const port = await unusedPort();
  origin = 'http://127.0.0.1:' + port;
  child = spawn(process.execPath, ['video-server.mjs'], {
    cwd:root,
    env:{ ...process.env, PORT:String(port), RUNWAYML_API_SECRET:'daily-word-test-only' },
    stdio:['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => { childOutput += chunk.toString(); });
  child.stderr.on('data', chunk => { childOutput += chunk.toString(); });

  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('The local server did not start: ' + childOutput);
    try {
      const response = await fetch(origin + '/api/config');
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('The local server did not become ready: ' + childOutput);
});

after(async () => {
  if (child && child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill();
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))]);
  }
  if (root) await rm(root, { recursive:true, force:true });
});

test('serves the app with restrictive security headers', async () => {
  const response = await fetch(origin + '/index.html');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});

test('serves installable app files with the correct content types', async () => {
  const manifest = await fetch(origin + '/manifest.webmanifest');
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get('content-type'), /application\/manifest\+json/);
  assert.equal((await manifest.json()).short_name, 'Daily Word');

  const worker = await fetch(origin + '/service-worker.js');
  assert.equal(worker.status, 200);
  assert.match(worker.headers.get('content-type'), /text\/javascript/);

  const interactions = await fetch(origin + '/bible-interactions.js');
  assert.equal(interactions.status, 200);
  assert.match(interactions.headers.get('content-type'), /text\/javascript/);
});

test('video generation preview targets the result section in the page', async () => {
  const html = await readFile(new URL('../video-studio.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../video-studio.js', import.meta.url), 'utf8');
  assert.match(html, /id="result"/);
  assert.match(script, /byId\('result'\)/);
});

test('never serves environment files or generated videos as static files', async () => {
  for (const pathname of ['/.env', '/.env.example', '/generated-videos/private.mp4']) {
    const response = await fetch(origin + pathname);
    assert.equal(response.status, 404, pathname);
    assert.equal((await response.text()).includes(secret), false, pathname);
  }
});

test('keeps API credentials private and rejects cross-origin requests', async () => {
  const config = await fetch(origin + '/api/config');
  const configBody = await config.text();
  assert.equal(config.status, 200);
  assert.equal(configBody.includes(secret), false);
  assert.equal(configBody.includes('daily-word-test-only'), false);

  const noOrigin = await fetch(origin + '/api/videos', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ prompt:'A valid length, but an untrusted request.' })
  });
  assert.equal(noOrigin.status, 403);

  const crossOrigin = await fetch(origin + '/api/videos', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Origin:'https://example.invalid' },
    body:JSON.stringify({ prompt:'A valid length, but an untrusted request.' })
  });
  assert.equal(crossOrigin.status, 403);

  const pathOrigin = await fetch(origin + '/api/videos', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Origin:origin + '/unexpected' },
    body:JSON.stringify({ prompt:'A valid length, but an untrusted request.' })
  });
  assert.equal(pathOrigin.status, 403);

  const invalidHost = await rawRequest('/index.html', { Host:'example.invalid:' + new URL(origin).port });
  assert.equal(invalidHost.status, 403);
});

test('serves only safe static file types and allows same-origin application requests', async () => {
  const stylesheet = await fetch(origin + '/assets/site.css');
  assert.equal(stylesheet.status, 200);
  assert.equal(stylesheet.headers.get('content-type'), 'text/css; charset=utf-8');

  const privateFile = await fetch(origin + '/assets/private.mp4');
  assert.equal(privateFile.status, 404);

  const malformedJson = await fetch(origin + '/api/videos', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Origin:origin },
    body:'{"prompt":'
  });
  assert.equal(malformedJson.status, 400);

  const incorrectCharge = await fetch(origin + '/api/videos', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Origin:origin, 'Sec-Fetch-Site':'same-origin' },
    body:JSON.stringify({
      prompt:'A long enough prompt to reach the charge confirmation check.',
      model:'gen4_turbo',
      duration:5,
      ratio:'1280:720',
      confirmCharge:true,
      expectedCredits:1
    })
  });
  assert.equal(incorrectCharge.status, 400);
});
