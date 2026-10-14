// Related routines: easier versions of the same dance, ranked for learning.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { relatedQuery, rankRelated } from '../server/related.js';

const v = (id, title, views = 1000) => ({ id, title, channel: 'C', views, thumbnail: '' });
const RESULTS = [
  v('rrrrrrrrrr1', 'NEON HEART dance cover by Mia', 9e5),
  v('rrrrrrrrrr2', 'NEON HEART Dance Tutorial | step by step', 2e5),
  v('rrrrrrrrrr3', 'neon heart MIRRORED dance practice', 4e5),
  v('rrrrrrrrrr4', 'Neon Heart reaction!!', 8e6),
  v('rrrrrrrrrr5', 'NEON HEART dance (slowed 0.5x)', 1e5),
  v('rrrrrrrrrr6', 'NEON HEART easy tutorial for beginners', 6e5),
];

test('the query is the song, plus what a learner wants', () => {
  // Bracketed bits and hashtags are dropped, like in Trend Scout's grouping.
  assert.equal(relatedQuery('NEON HEART (네온) Official Dance Practice #kpop'), 'neon heart dance tutorial mirrored slow');
  assert.equal(relatedQuery('NEON HEART Official Dance Practice'), 'neon heart dance tutorial mirrored slow');
  assert.equal(relatedQuery('Dance Tutorial'), '', 'nothing song-like: ask the learner instead');
});

test('tutorials first, then mirrored, then slowed; reactions dropped; the routine itself excluded', () => {
  const ranked = rankRelated(RESULTS, 'rrrrrrrrrr1');
  assert.deepEqual(ranked.map((r) => r.label), ['tutorial', 'tutorial', 'mirrored', 'slowed']);
  assert.equal(ranked[0].id, 'rrrrrrrrrr6', 'more views wins within a kind');
  assert.ok(!ranked.some((r) => r.id === 'rrrrrrrrrr4'), 'reactions are no use for learning');
  assert.ok(!ranked.some((r) => r.id === 'rrrrrrrrrr1'));
});

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(path.join(tmpdir(), 'mimic-related-'));
let server, base;
before(async () => {
  process.env.MIMIC_DATA = dir;
  process.env.YTDLP_BIN = path.join(here, 'fixtures', 'fake-yt-dlp.mjs');
  process.env.FAKE_SEARCH = JSON.stringify(RESULTS.map((r) => ({ id: r.id, title: r.title, channel: r.channel, view_count: r.views })));
  delete process.env.YOUTUBE_API_KEY;
  const { start } = await import('../server/index.js');
  server = await start(0);
  base = `http://localhost:${server.address().port}`;
  // A routine to ask about.
  const up = await fetch(`${base}/api/routines/upload`, { method: 'POST', headers: { 'Content-Type': 'video/mp4', 'X-Filename': encodeURIComponent('IMG_2041.mov') }, body: 'x' }).then((r) => r.json());
  process.env.UPLOAD_ID = up.id;
});
after(() => { server?.close(); rmSync(dir, { recursive: true, force: true }); });

test('compliance mode (default) without a key says how to turn search on', async () => {
  delete process.env.MIMIC_YTDLP;
  const r = await fetch(`${base}/api/routines/${process.env.UPLOAD_ID}/related?q=neon%20heart`);
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /YOUTUBE_API_KEY/);
});

test('an uploaded clip named IMG_2041 asks for the song; a typed song name searches and caches', async () => {
  process.env.MIMIC_YTDLP = 'on';
  try {
    const blank = await fetch(`${base}/api/routines/${process.env.UPLOAD_ID}/related`).then((r) => r.json());
    assert.deepEqual(blank.videos, []);
    assert.match(blank.note, /song name/);
    const a = await fetch(`${base}/api/routines/${process.env.UPLOAD_ID}/related?q=neon%20heart%20dance%20tutorial`).then((r) => r.json());
    assert.equal(a.source, 'yt-dlp');
    assert.equal(a.videos[0].label, 'tutorial');
    const b = await fetch(`${base}/api/routines/${process.env.UPLOAD_ID}/related?q=neon%20heart%20dance%20tutorial`).then((r) => r.json());
    assert.equal(b.at, a.at, 'served from the cache');
  } finally { delete process.env.MIMIC_YTDLP; }
  assert.equal((await fetch(`${base}/api/routines/BBBBBBBBBBB/related`)).status, 404);
});
