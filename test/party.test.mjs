// Party rooms: two (and three) WebSocket clients through a whole round.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const dir = mkdtempSync(path.join(tmpdir(), 'mimic-party-'));
process.env.MIMIC_DATA = dir;
const { start } = await import('../server/index.js');
let server, url;
before(async () => { server = await start(0); url = `ws://localhost:${server.address().port}/party`; });
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

// A tiny client that remembers the latest room and can wait for a condition.
function player(name) {
  const ws = new WebSocket(url);
  const p = { ws, room: null, you: null, starts: [], errors: [], scores: [] };
  const waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.type === 'welcome') p.you = m.you;
    if (m.type === 'room') p.room = m.room;
    if (m.type === 'start') p.starts.push(m);
    if (m.type === 'error') p.errors.push(m.message);
    if (m.type === 'score') p.scores.push(m);
    if (m.type === 'pong') p.pong = m;
    for (const w of [...waiters]) if (w.fn(p)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(); }
  });
  p.send = (msg) => ws.send(JSON.stringify(msg));
  p.until = (fn) => (fn(p) ? Promise.resolve() : new Promise((resolve, reject) => {
    waiters.push({ fn, resolve });
    setTimeout(() => reject(new Error(`${name}: timed out`)), 3000);
  }));
  p.open = new Promise((r) => ws.on('open', r)).then(() => p.send({ type: 'hello', name }));
  return p;
}

test('create, join, pick, ready, a synchronised start, live scores and results', async () => {
  const host = player('Asha'), guest = player('Ben');
  await Promise.all([host.open, guest.open]);
  host.send({ type: 'create' });
  await host.until((p) => p.room?.code);
  const code = host.room.code;
  assert.match(code, /^[A-HJ-NP-Z]{4}$/);

  guest.send({ type: 'join', code: code.toLowerCase() });
  await host.until((p) => p.room.players.length === 2);
  assert.deepEqual(host.room.players.map((x) => x.name).sort(), ['Asha', 'Ben']);

  host.send({ type: 'start' });
  await host.until((p) => p.errors.length === 1);
  assert.match(host.errors[0], /Pick a routine/);

  host.send({ type: 'pick', routineId: 'AAAAAAAAAAA', title: 'Neon Heart' });
  host.send({ type: 'start' });
  await host.until((p) => p.errors.length === 2);
  assert.match(host.errors[1], /everyone is ready/);

  guest.send({ type: 'ready', ready: true });
  await host.until((p) => p.room.players.find((x) => x.name === 'Ben').ready);
  const before = Date.now();
  host.send({ type: 'start' });
  await Promise.all([host.until((p) => p.starts.length), guest.until((p) => p.starts.length)]);
  assert.equal(host.starts[0].startAt, guest.starts[0].startAt, 'everyone gets the same start time');
  assert.ok(host.starts[0].startAt >= before + 5000);
  assert.equal(guest.starts[0].routineId, 'AAAAAAAAAAA');
  assert.equal(host.room.state, 'playing');

  // A late joiner can't barge into a dance in progress.
  const late = player('Cy');
  await late.open;
  late.send({ type: 'join', code });
  await late.until((p) => p.errors.length);
  assert.match(late.errors[0], /mid-dance/);

  guest.send({ type: 'score', score: 1200, combo: 5 });
  await host.until((p) => p.scores.some((s) => s.score === 1200));

  host.send({ type: 'done', score: 3000, accuracy: 88 });
  guest.send({ type: 'done', score: 1500, accuracy: 140 });
  await host.until((p) => p.room.state === 'results');
  const ben = host.room.players.find((x) => x.name === 'Ben');
  assert.equal(ben.accuracy, 100, 'accuracy is clamped');

  host.send({ type: 'again' });
  await guest.until((p) => p.room.state === 'lobby' && p.room.players.every((x) => !x.ready && x.score === 0));
  for (const p of [host, guest, late]) p.ws.close();
});

test('when the host leaves, someone else becomes host; an empty room disappears', async () => {
  const a = player('A'), b = player('B');
  await Promise.all([a.open, b.open]);
  a.send({ type: 'create' });
  await a.until((p) => p.room?.code);
  b.send({ type: 'join', code: a.room.code });
  await b.until((p) => p.room?.players.length === 2);
  a.ws.close();
  await b.until((p) => p.room.players.length === 1 && p.room.host === p.you);
  const code = b.room.code;
  b.ws.close();
  await new Promise((r) => setTimeout(r, 100));
  const c = player('C');
  await c.open;
  c.send({ type: 'join', code });
  await c.until((p) => p.errors.length);
  assert.match(c.errors[0], /No room/);
  c.ws.close();
});

test('the clock-sync ping answers with server time', async () => {
  const p = player('P');
  await p.open;
  p.send({ type: 'ping', t0: 123 });
  await p.until((x) => x.pong);
  assert.equal(p.pong.t0, 123);
  assert.ok(Math.abs(p.pong.now - Date.now()) < 1000);
  p.ws.close();
});
