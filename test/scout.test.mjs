// Trend Scout: grouping by song, telling originals from covers, Claude's
// picks being checked, the official-API path, and the compliance switch.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kindOf, songTokens, groupBySong, officialSignals } from '../server/scout/labels.js';
import { pickByRules } from '../server/scout/rules.js';
import { pickWithClaude, PICK_TOOL } from '../server/scout/pick.js';
import { viaYouTubeApi, isoSeconds } from '../server/scout/gather.js';

const v = (id, title, channel, uploaded, views = 1000) => ({ id, title, channel, uploaded, views, duration: 60, thumbnail: '' });
// Ids are 11 characters, like YouTube's.
const FEED = [
  v('aaaaaaaaaa1', 'NEON HEART (네온) Dance Practice', 'STARLINE OFFICIAL', '20261001', 9e6),
  v('aaaaaaaaaa2', 'Neon Heart dance cover by Mia', 'Mia Dances', '20261004', 2e5),
  v('aaaaaaaaaa3', 'NEON HEART - Dance Tutorial (Mirrored + Slow)', 'Learn With Jo', '20261006', 8e5),
  v('aaaaaaaaaa4', 'neon heart MIRRORED dance', 'Mirror Dance Co', '20261005', 3e5),
  v('bbbbbbbbbb1', 'Kurta Wave hook step challenge #shorts', 'Ravi Choreo', '20260920', 1e6),
  v('bbbbbbbbbb2', 'Kurta Wave hook step tutorial | easy steps', 'Desi Moves', '20260925', 4e5),
  v('cccccccccc1', 'My morning vlog', 'Somebody', '20261002', 50),
];

test('titles are read for what kind of video they are', () => {
  assert.equal(kindOf('NEON HEART Dance Practice'), 'candidate');
  assert.equal(kindOf('Neon Heart dance cover by Mia'), 'cover');
  assert.equal(kindOf('NEON HEART - Dance Tutorial (Mirrored + Slow)'), 'tutorial');
  assert.equal(kindOf('neon heart MIRRORED dance'), 'mirrored');
  assert.equal(kindOf('Song X slowed down 0.5x'), 'slowed');
  assert.equal(kindOf('I react to Song X'), 'reaction');
  assert.deepEqual(officialSignals({ title: 'X Dance Practice', channel: 'STARLINE OFFICIAL' }).length, 2);
});

test('song words survive; video-type words, hashtags and brackets do not', () => {
  assert.deepEqual(songTokens('NEON HEART - Dance Tutorial (Mirrored + Slow) #kpop'), ['neon', 'heart']);
  assert.deepEqual(songTokens('Kurta Wave hook step challenge #shorts'), ['kurta', 'wave', 'hook']);
});

test('covers, tutorials and re-uploads of one song land in one group', () => {
  const groups = groupBySong(FEED);
  const byId = (id) => groups.find((g) => g.videos.some((x) => x.id === id));
  assert.equal(byId('aaaaaaaaaa1'), byId('aaaaaaaaaa4'));
  assert.equal(byId('aaaaaaaaaa1').videos.length, 4);
  assert.equal(byId('bbbbbbbbbb1'), byId('bbbbbbbbbb2'));
  assert.notEqual(byId('aaaaaaaaaa1'), byId('bbbbbbbbbb1'));
});

test('the rule picker prefers the official, earliest, non-derivative upload', () => {
  const neon = groupBySong(FEED).find((g) => g.videos.length === 4);
  const p = pickByRules(neon);
  assert.equal(p.original, 'aaaaaaaaaa1');
  assert.match(p.reason, /official/);
  assert.match(p.reason, /earliest/);
  assert.deepEqual(Object.fromEntries(p.labels.map((l) => [l.id, l.label])), {
    aaaaaaaaaa2: 'cover', aaaaaaaaaa3: 'tutorial', aaaaaaaaaa4: 'mirrored',
  });
});

const scripted = (input) => {
  const seen = [];
  return {
    seen,
    beta: { messages: { create: async (req) => { seen.push(req); return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'pick_originals', input }] }; } } },
  };
};

test("Claude's picks are used when they check out, replaced by rules when they don't", async () => {
  const groups = groupBySong(FEED).filter((g) => g.videos.length >= 2);
  const neon = groups.findIndex((g) => g.videos.length === 4), kurta = 1 - neon;
  const client = scripted({ picks: [
    { group: neon, original_id: 'aaaaaaaaaa1', reason: 'Official channel dance practice, earliest upload.', labels: [{ id: 'aaaaaaaaaa2', label: 'cover' }, { id: 'zzzzzzzzzzz', label: 'cover' }] },
    // Wrong: a tutorial can't be the original. Must fall back to rules.
    { group: kurta, original_id: 'bbbbbbbbbb2', reason: 'Most watched.', labels: [] },
  ] });
  const picks = await pickWithClaude(groups, { client });
  assert.equal(picks[neon].by, 'claude');
  assert.equal(picks[neon].original, 'aaaaaaaaaa1');
  assert.deepEqual(picks[neon].labels.map((l) => l.id), ['aaaaaaaaaa2'], 'ids outside the group are dropped');
  assert.equal(picks[kurta].by, 'rules');
  assert.equal(picks[kurta].original, 'bbbbbbbbbb1');
  const req = client.seen[0];
  assert.equal(req.fallbacks, 'default');
  assert.equal(req.tools[0], PICK_TOOL);
  assert.equal(PICK_TOOL.strict, true);
});

test('the official YouTube Data API responses are read correctly', async () => {
  const calls = [];
  const fetchImpl = async (u) => {
    calls.push(String(u));
    const url = new URL(u);
    if (url.pathname.endsWith('/search')) return { ok: true, json: async () => ({ items: [{ id: { videoId: 'aaaaaaaaaa1' } }, { id: { channelId: 'x' } }] }) };
    return { ok: true, json: async () => ({ items: [{ id: 'aaaaaaaaaa1', snippet: { title: 'NEON HEART Dance Practice', channelTitle: 'STARLINE', publishedAt: '2026-10-01T09:00:00Z', thumbnails: { high: { url: 'https://t/x.jpg' } } }, statistics: { viewCount: '9000000' }, contentDetails: { duration: 'PT3M21S' } }] }) };
  };
  const out = await viaYouTubeApi('KEY', { fetchImpl, now: Date.parse('2026-10-14T00:00:00Z') });
  assert.deepEqual(out, [{ id: 'aaaaaaaaaa1', title: 'NEON HEART Dance Practice', channel: 'STARLINE', uploaded: '20261001', views: 9000000, duration: 201, thumbnail: 'https://t/x.jpg' }]);
  assert.ok(calls.every((c) => c.startsWith('https://www.googleapis.com/youtube/v3/')));
  assert.ok(calls[0].includes('publishedAfter=2026-09-23'));
  assert.equal(isoSeconds('PT1H2M3S'), 3723);
  await assert.rejects(viaYouTubeApi('BAD', { fetchImpl: async () => ({ ok: false, status: 403 }) }), /YOUTUBE_API_KEY/);
});

// ---------- the route, with yt-dlp stubbed ----------
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(path.join(tmpdir(), 'mimic-scout-'));
let server, base;
before(async () => {
  process.env.MIMIC_DATA = dir;
  process.env.YTDLP_BIN = path.join(here, 'fixtures', 'fake-yt-dlp.mjs');
  process.env.FAKE_SEARCH = JSON.stringify(FEED.map((x) => ({ id: x.id, title: x.title, channel: x.channel, upload_date: x.uploaded, view_count: x.views })));
  process.env.MIMIC_COACH = 'offline'; // rules picker; Claude's path is tested above
  delete process.env.YOUTUBE_API_KEY;
  const { start } = await import('../server/index.js');
  server = await start(0);
  base = `http://localhost:${server.address().port}`;
});
after(() => { server?.close(); rmSync(dir, { recursive: true, force: true }); });

test('GET /api/scout returns trends with originals, reasons and labelled others; then caches', async () => {
  const a = await fetch(`${base}/api/scout`).then((r) => r.json());
  assert.equal(a.source, 'yt-dlp');
  assert.equal(a.picker, 'rules');
  const neon = a.groups.find((g) => g.original.id === 'aaaaaaaaaa1');
  assert.ok(neon, 'the official practice video is the original');
  assert.equal(neon.others.length, 3);
  assert.ok(!a.groups.some((g) => g.original.id === 'cccccccccc1'), 'a lone video is not a trend');
  const b = await fetch(`${base}/api/scout`).then((r) => r.json());
  assert.equal(b.at, a.at, 'served from the cache');
});

test('compliance mode: no link downloads, no scraping', async () => {
  process.env.MIMIC_YTDLP = 'off';
  try {
    const link = await fetch(`${base}/api/routines`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'dQw4w9WgXcQ' }) });
    assert.equal(link.status, 403);
    const cfg = await fetch(`${base}/api/config`).then((r) => r.json());
    assert.equal(cfg.links, false);
    assert.equal(cfg.scout.source, null);
  } finally {
    delete process.env.MIMIC_YTDLP;
  }
});
