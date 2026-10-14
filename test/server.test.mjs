// The server API, end to end over HTTP, with yt-dlp replaced by a stub and
// data/ pointed at a temp folder.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(path.join(tmpdir(), 'mimic-'));
process.env.MIMIC_DATA = dir;
process.env.YTDLP_BIN = path.join(here, 'fixtures', 'fake-yt-dlp.mjs');
process.env.MIMIC_YTDLP = 'on'; // link downloads are opt-in

const { start } = await import('../server/index.js');
const { parseYouTubeId } = await import('../server/youtube.js');

let server, base;
before(async () => { server = await start(0); base = `http://localhost:${server.address().port}`; });
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

const json = async (res) => ({ status: res.status, body: await res.json() });
const post = (url, body) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json);
const waitFor = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
};

test('every common YouTube link shape is recognised, and nothing else', () => {
  const id = 'dQw4w9WgXcQ';
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`, `https://youtu.be/${id}?si=abc`, `youtube.com/shorts/${id}`,
    `https://m.youtube.com/watch?v=${id}&t=30s`, `https://www.youtube.com/embed/${id}`, id,
    `https://music.youtube.com/watch?v=${id}`,
  ]) assert.equal(parseYouTubeId(url), id, url);
  for (const bad of ['', 'hello', 'https://vimeo.com/123', `https://evil.com/watch?v=${id}`, 'https://youtube.com/watch?v=short', null]) {
    assert.equal(parseYouTubeId(bad), null, String(bad));
  }
});

test('a bad link is refused with a readable message', async () => {
  const r = await post('/api/routines', { url: 'https://vimeo.com/1' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /YouTube link/);
});

test('a link downloads in the background and becomes a video-ready routine', async () => {
  const r = await post('/api/routines', { url: 'https://youtu.be/AAAAAAAAAAA' });
  assert.equal(r.status, 202);
  assert.equal(r.body.id, 'AAAAAAAAAAA');
  const s = await waitFor(async () => {
    const x = await fetch(`${base}/api/routines/AAAAAAAAAAA`).then(json);
    return x.body.state === 'video' && x.body;
  });
  assert.equal(s.title, 'Dance AAAAAAAAAAA');
  assert.equal(s.source, 'youtube');
  const media = await fetch(`${base}/media/AAAAAAAAAAA`);
  assert.equal(media.status, 200);
  // Asking again doesn't start a second download.
  assert.equal((await post('/api/routines', { url: 'AAAAAAAAAAA' })).status, 200);
});

test('a failed download reports the reason', async () => {
  await post('/api/routines', { url: 'failfailfai' });
  const s = await waitFor(async () => {
    const x = await fetch(`${base}/api/routines/failfailfai`).then(json);
    return x.body.state === 'failed' && x.body;
  });
  assert.match(s.error, /Video unavailable/);
});

test('an uploaded clip becomes a routine; other file types are refused', async () => {
  const bad = await fetch(`${base}/api/routines/upload`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: 'x' }).then(json);
  assert.equal(bad.status, 415);
  const up = await fetch(`${base}/api/routines/upload`, {
    method: 'POST', headers: { 'Content-Type': 'video/webm', 'X-Filename': encodeURIComponent('My Dance.webm') }, body: 'webm bytes',
  }).then(json);
  assert.equal(up.status, 201);
  assert.match(up.body.id, /^up_[0-9a-f]{8}$/);
  const s = await fetch(`${base}/api/routines/${up.body.id}`).then(json);
  assert.equal(s.body.title, 'My Dance');
  assert.equal(s.body.source, 'upload');
  assert.equal(s.body.state, 'video');
  assert.equal(await fetch(`${base}/media/${up.body.id}`).then((r) => r.text()), 'webm bytes');
});

test('poses are validated, cached, and make the routine ready', async () => {
  const lm = Array.from({ length: 33 }, () => [0.5, 0.5, 0, 1]);
  const put = (body) => fetch(`${base}/api/routines/AAAAAAAAAAA/pose`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(json);
  assert.equal((await put({ duration: 1, frames: [{ t: 0, lm: lm.slice(5) }] })).status, 400);
  const ok = await put({ fps: 15, aspect: 1.78, duration: 12, frames: [{ t: 0, lm }, { t: 0.1, lm }] });
  assert.equal(ok.status, 200);
  const s = await fetch(`${base}/api/routines/AAAAAAAAAAA`).then(json);
  assert.equal(s.body.state, 'ready');
  const pose = await fetch(`${base}/api/routines/AAAAAAAAAAA/pose`).then(json);
  assert.equal(pose.body.frames.length, 2);
  const lib = await fetch(`${base}/api/routines`).then(json);
  assert.deepEqual(lib.body.map((r) => r.id), ['AAAAAAAAAAA']);
});

test('ids that are not routine ids never reach the filesystem', async () => {
  // Refused as malformed (400) — never looked up, never served.
  assert.equal((await fetch(`${base}/api/routines/..%2F..%2Fetc`)).status, 400);
  assert.equal((await fetch(`${base}/media/..%2Fsecret`)).status, 400);
  assert.equal((await fetch(`${base}/api/routines/short/pose`)).status, 400);
});

test('the leaderboard keeps the best runs first and cleans what it is sent', async () => {
  const send = (body) => fetch(`${base}/api/routines/AAAAAAAAAAA/scores`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(json);
  assert.equal((await send({ name: 'x' })).status, 400);
  await send({ name: 'Ann', score: 900, accuracy: 70 });
  await send({ name: '  ', score: 2400, accuracy: 140, mode: 'cheat' });
  const board = (await send({ name: 'A very long name that keeps going', score: 50 })).body;
  assert.deepEqual(board.map((b) => b.score), [2400, 900, 50]);
  assert.equal(board[0].name, 'Dancer');
  assert.equal(board[0].accuracy, 100);
  assert.equal(board[0].mode, 'solo');
  assert.equal(board[2].name.length, 24);
  assert.equal((await fetch(`${base}/api/routines/BBBBBBBBBBB/scores`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score: 1 }),
  })).status, 404);
});
