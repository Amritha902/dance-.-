// The pose model is fetched upstream once, then served locally.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'mimic-model-'));
let upstream, hits = 0, server, base;
before(async () => {
  const body = Buffer.alloc(200_000, 7);
  upstream = createServer((req, res) => { hits++; res.end(body); });
  await new Promise((r) => upstream.listen(0, r));
  process.env.MIMIC_DATA = dir;
  process.env.MIMIC_MODEL_URL = `http://localhost:${upstream.address().port}/model.task`;
  const { start } = await import('../server/index.js');
  server = await start(0);
  base = `http://localhost:${server.address().port}`;
});
after(() => { server.close(); upstream.close(); rmSync(dir, { recursive: true, force: true }); });

test('the model downloads once, even with several browsers asking at once', async () => {
  const url = `${base}/vendor/model/pose_landmarker_lite.task`;
  const all = await Promise.all([fetch(url), fetch(url), fetch(url)]);
  for (const r of all) {
    assert.equal(r.status, 200);
    assert.equal((await r.arrayBuffer()).byteLength, 200_000);
  }
  const again = await fetch(url);
  assert.equal(again.status, 200);
  assert.match(again.headers.get('cache-control'), /immutable/);
  assert.equal(hits, 1);
});
