// Headless Chrome + OfflineAudioContext 로 BGM·SFX WAV 미리듣기를 artifacts/depot-audio/ 에 저장.
//   node scripts/render-depot-audio.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'artifacts/depot-audio');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };
let done = null;
const doneP = new Promise((res, rej) => { done = { res, rej }; });

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'POST' && u.pathname.startsWith('/__save/')) {
    const name = path.basename(u.pathname.slice('/__save/'.length));
    if (!name.endsWith('.wav') || name.includes('..')) { res.writeHead(400); res.end('bad'); return; }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      fs.writeFileSync(path.join(OUT, name), buf);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ bytes: buf.length }));
    });
    return;
  }
  if (req.method === 'POST' && u.pathname === '/__done') {
    const fail = u.searchParams.get('fail');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      res.writeHead(200); res.end('ok');
      if (fail) done.rej(new Error(Buffer.concat(chunks).toString() || 'render fail'));
      else done.res();
    });
    return;
  }
  let rel = u.pathname === '/' ? '/scripts/render-depot-audio.html' : u.pathname;
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/scripts/render-depot-audio.html`;
const chrome = process.env.CHROME || 'google-chrome';
const args = [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--use-gl=angle', '--use-angle=swiftshader-webgl',
  `--user-data-dir=${path.join(OUT, '.chrome')}`,
  url,
];
console.log('render-depot-audio: chrome', url);
const child = spawn(chrome, args, { stdio: 'inherit' });
const timeout = setTimeout(() => done.rej(new Error('timeout 60s')), 60_000);
try {
  await doneP;
  clearTimeout(timeout);
} finally {
  try { child.kill('SIGTERM'); } catch {}
  await new Promise((r) => server.close(r));
}
const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.wav')).sort();
if (!files.length) throw new Error('no wav files written');
const manifest = [];
for (const f of files) {
  const b = fs.readFileSync(path.join(OUT, f));
  const sha = createHash('sha256').update(b).digest('hex');
  manifest.push({ file: f, bytes: b.length, sha256: sha });
  console.log(`${f}\t${b.length}\t${sha}`);
}
fs.writeFileSync(path.join(OUT, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
console.log('render-depot-audio: ok', files.length, 'files →', OUT);
