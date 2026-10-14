// The pose model, served from our own origin. On first request the server
// downloads it from Google's model storage once and keeps it in data/models/;
// after that every browser gets it locally (and the service worker caches it),
// so a demo never depends on a third-party download.

import express from 'express';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { dataDir } from './store.js';

export const MODEL_NAME = 'pose_landmarker_lite.task';
const upstream = () => process.env.MIMIC_MODEL_URL
  || 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

let inflight = null;
export async function ensureModel() {
  const dir = path.join(dataDir(), 'models');
  const file = path.join(dir, MODEL_NAME);
  if (existsSync(file)) return file;
  // One download at a time, however many browsers ask at once.
  inflight ||= (async () => {
    const res = await fetch(upstream());
    if (!res.ok) throw new Error(`Could not download the pose model (${res.status}).`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1e5) throw new Error('The pose model download looks truncated.');
    mkdirSync(dir, { recursive: true });
    await writeFile(`${file}.tmp`, buf);
    await rename(`${file}.tmp`, file);
    return file;
  })().finally(() => { inflight = null; });
  return inflight;
}

export function modelRouter() {
  const r = express.Router();
  r.get(`/vendor/model/${MODEL_NAME}`, async (_req, res) => {
    try {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.sendFile(await ensureModel());
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
  return r;
}
