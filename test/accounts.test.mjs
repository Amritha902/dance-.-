// Profiles and history, against both backends: JSON files always, and a
// real Postgres when TEST_DATABASE_URL points at one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { accountsRouter, cleanRun, summarise } from '../server/accounts.js';
import { fileBackend, pgBackend, normaliseCode, hashCode } from '../server/db.js';

const run = (o = {}) => ({ routineId: 'mimic-start', title: 'Mimic Warm-up', score: 1200, rank: 'B', accuracy: 64, bestCombo: 7, tally: { PERFECT: 2, GREAT: 3 }, kcal: 1.4, seconds: 16, day: '2026-10-26', ...o });

test('runs are cleaned: bad ones refused, numbers clamped, unknown fields dropped', () => {
  assert.equal(cleanRun({ ...run(), routineId: '../etc' }), null);
  assert.equal(cleanRun({ ...run(), rank: 'Z' }), null);
  const c = cleanRun({ ...run(), accuracy: 400, score: -5, hack: 1, mode: 'x', day: 'nope' }, new Date('2026-10-26T10:00:00Z'));
  assert.equal(c.accuracy, 100); assert.equal(c.score, 0); assert.equal(c.mode, 'solo');
  assert.equal(c.day, '2026-10-26'); assert.equal(c.hack, undefined);
  assert.deepEqual(Object.keys(c.tally), ['PERFECT', 'GREAT', 'GOOD', 'OFF', 'MISS']);
});

test('codes ignore case, spaces and dashes', () => {
  assert.equal(normaliseCode('abcd-efgh ijkl-mnop'), 'ABCDEFGHIJKLMNOP');
  assert.equal(hashCode('ABCD-EFGH-IJKL-MNOP'), hashCode('abcdefghijklmnop'));
});

test('the summary totals a history and keeps the best per routine', () => {
  const s = summarise([cleanRun(run()), cleanRun(run({ score: 2000, rank: 'S', day: '2026-10-27', mode: 'party' })), cleanRun(run({ routineId: 'up_12345678' }))]);
  assert.equal(s.battles, 3); assert.equal(s.bestRank, 'S'); assert.equal(s.routines, 2); assert.equal(s.parties, 1);
  assert.equal(s.best['mimic-start'].score, 2000);
  assert.deepEqual(s.days, ['2026-10-26', '2026-10-27']);
});

async function flow(backend) {
  await backend.init();
  const app = express().set('trust proxy', false).use(accountsRouter({ getDb: async () => backend }));
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const call = (method, url, body, code) => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(code ? { Authorization: `Bearer ${code}` } : {}) }, body: body && JSON.stringify(body) });
  try {
    assert.equal((await call('POST', '/api/profile', { name: '  ' })).status, 400);
    const made = await (await call('POST', '/api/profile', { name: 'Amritha' })).json();
    assert.match(made.code, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    assert.equal((await call('GET', '/api/me')).status, 401, 'no code, no history');
    assert.equal((await call('GET', '/api/me', null, 'AAAA-BBBB-CCCC-DDDD')).status, 401);
    // Sign in on "another device" with the code, typed loosely.
    const again = await (await call('POST', '/api/session', { code: made.code.toLowerCase().replace(/-/g, ' ') })).json();
    assert.equal(again.user.id, made.user.id);
    assert.equal((await call('POST', '/api/me/runs', { run: { rank: 'S' } }, made.code)).status, 400);
    await call('POST', '/api/me/runs', { run: run() }, made.code);
    await call('POST', '/api/me/runs', { run: run({ score: 2400, rank: 'S' }) }, made.code);
    const { runs } = await (await call('GET', '/api/me/runs?limit=10', null, made.code)).json();
    assert.equal(runs.length, 2);
    assert.equal(runs[0].score, 2400, 'newest first');
    const me = await (await call('GET', '/api/me', null, made.code)).json();
    assert.equal(me.user.name, 'Amritha'); assert.equal(me.summary.battles, 2); assert.equal(me.summary.bestRank, 'S');
    // Someone else's code never sees this history.
    const other = await (await call('POST', '/api/profile', { name: 'Ben' })).json();
    assert.equal((await (await call('GET', '/api/me/runs', null, other.code)).json()).runs.length, 0);
    await call('PATCH', '/api/me', { name: 'Amritha S' }, made.code);
    assert.equal((await (await call('GET', '/api/me', null, made.code)).json()).user.name, 'Amritha S');
    assert.equal((await call('DELETE', '/api/me', null, made.code)).status, 200);
    assert.equal((await call('GET', '/api/me', null, made.code)).status, 401, 'deleted means gone');
  } finally { server.close(); await backend.close(); }
}

test('profile → sign in elsewhere → history → rename → delete (files)', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mimic-users-'));
  try { await flow(fileBackend(dir)); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the same flow against Postgres', { skip: !process.env.TEST_DATABASE_URL && 'set TEST_DATABASE_URL to run' }, async () => {
  const b = await pgBackend(process.env.TEST_DATABASE_URL);
  await b.init();
  const { default: pg } = await import('pg');
  const c = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await c.connect();
  await c.query('truncate mimic_users cascade'); await c.end();
  await flow(b);
});
