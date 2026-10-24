// Song search: originals first, reactions out, "dance" added to plain song
// names, answers cached so repeat searches cost no API quota.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { searchRouter, rankSearch, searchQuery } from '../server/search.js';

const v = (id, title, views) => ({ id, title, channel: 'c', views, uploaded: '20261001', duration: 60, thumbnail: '' });

test('originals come first, then tutorials, then covers; reactions are dropped', () => {
  const r = rankSearch([
    v('aaaaaaaaaa1', 'Neon Heart dance cover', 9e6),
    v('aaaaaaaaaa2', 'Neon Heart dance tutorial', 5e5),
    v('aaaaaaaaaa3', 'NEON HEART Official Dance Practice', 1e6),
    v('aaaaaaaaaa4', 'I react to Neon Heart', 2e7),
  ]);
  assert.deepEqual(r.map((x) => x.id), ['aaaaaaaaaa3', 'aaaaaaaaaa2', 'aaaaaaaaaa1']);
});

test('queries are tidied, short ones refused, results cached per query', async () => {
  assert.equal(searchQuery('  neon   heart '), 'neon heart');
  const asked = [];
  const app = express().use(searchRouter({ search: async (q) => { asked.push(q); return { source: 'test', videos: [v('aaaaaaaaaa3', 'NEON HEART Dance Practice', 1)] }; } }));
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/search?q=a`)).status, 400);
    const a = await fetch(`${base}/api/search?q=Neon%20Heart`).then((r) => r.json());
    assert.equal(a.results[0].id, 'aaaaaaaaaa3');
    await fetch(`${base}/api/search?q=neon  heart`);
    assert.deepEqual(asked, ['Neon Heart dance'], 'the second search came from the cache');
    await fetch(`${base}/api/search?q=kurta wave dance`);
    assert.equal(asked[1], 'kurta wave dance', '"dance" is not added twice');
  } finally { server.close(); }
});
