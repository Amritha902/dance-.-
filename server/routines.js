// A "routine" is one dance: its video, the dancer's tracked poses, and later
// its scores and coach memory. It comes from an uploaded clip or a YouTube link.
//
// Tracking happens in the browser, so the server's job is small: get the video
// into data/routines/<id>/, report progress, and cache the poses it's sent back.

import express from 'express';
import { createWriteStream, existsSync } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { routineFile, readJson, writeJson, listRoutineIds, ROUTINE_ID } from './store.js';
import { parseYouTubeId, fetchMeta, download } from './youtube.js';
import { ytdlpAllowed } from './scout/gather.js';

const MAX_UPLOAD = 200 * 1024 * 1024;
const UPLOAD_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

// Downloads in flight. Disk is the real record; this only carries progress.
const jobs = new Map(); // id -> { progress, error }

export const metaFile = (id) => routineFile(id, 'meta.json');
export const poseFile = (id) => routineFile(id, 'pose.json');

export async function routineStatus(id) {
  const meta = await readJson(metaFile(id));
  if (!meta) return null;
  const job = jobs.get(id);
  const tracked = existsSync(poseFile(id));
  return {
    ...meta,
    state: job?.error ? 'failed' : meta.video ? (tracked ? 'ready' : 'video') : 'downloading',
    progress: job?.progress ?? (meta.video ? 1 : 0),
    error: job?.error || null,
    tracked,
  };
}

async function startDownload(id) {
  const job = { progress: 0, error: null };
  jobs.set(id, job);
  try {
    const meta = await fetchMeta(id);
    await writeJson(metaFile(id), { ...meta, source: 'youtube', video: null });
    await download(id, routineFile(id, 'video.mp4'), (p) => { job.progress = p; });
    await writeJson(metaFile(id), { ...meta, source: 'youtube', video: 'video.mp4' });
    jobs.delete(id);
  } catch (e) {
    job.error = e.message;
    // A failed first attempt leaves a stub so the status call can report why.
    if (!(await readJson(metaFile(id)))) {
      await writeJson(metaFile(id), { id, title: 'YouTube video', source: 'youtube', video: null });
    }
  }
}

export function routinesRouter() {
  const r = express.Router();

  // Paste a link. Idempotent: a routine already on disk is returned as-is.
  r.post('/api/routines', express.json(), async (req, res) => {
    // Compliance mode (MIMIC_YTDLP=off): no downloading from YouTube at all.
    if (!ytdlpAllowed()) return res.status(403).json({ error: 'Link downloads are switched off on this server. Upload a clip you have the rights to instead.' });
    const id = parseYouTubeId(req.body?.url);
    if (!id) return res.status(400).json({ error: "That doesn't look like a YouTube link." });
    const existing = await routineStatus(id);
    if (existing && existing.state !== 'failed') return res.json({ id });
    startDownload(id); // runs in the background; the client polls status
    res.status(202).json({ id });
  });

  // Upload a clip: the raw file is the request body, so nothing is buffered in memory.
  r.post('/api/routines/upload', async (req, res) => {
    const ext = UPLOAD_TYPES[(req.headers['content-type'] || '').split(';')[0].trim()];
    if (!ext) return res.status(415).json({ error: 'Upload an mp4, webm or mov video.' });
    const size = Number(req.headers['content-length'] || 0);
    if (size > MAX_UPLOAD) return res.status(413).json({ error: 'That clip is over 200 MB. Trim it to the part you want to learn.' });

    const id = `up_${randomBytes(4).toString('hex')}`;
    const file = routineFile(id, `video.${ext}`);
    let received = 0;
    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > MAX_UPLOAD) req.destroy(new Error('too large'));
    });
    try {
      await pipeline(req, createWriteStream(file));
    } catch {
      await unlink(file).catch(() => {});
      return res.status(413).json({ error: 'That clip is over 200 MB. Trim it to the part you want to learn.' });
    }
    if (!received) return res.status(400).json({ error: 'The upload was empty.' });
    const name = String(req.headers['x-filename'] || 'My clip').replace(/\.[^.]+$/, '').slice(0, 80);
    await writeJson(metaFile(id), {
      id, title: decodeURIComponent(name) || 'My clip', channel: 'Uploaded clip', duration: 0,
      thumbnail: null, source: 'upload', video: `video.${ext}`,
    });
    res.status(201).json({ id });
  });

  r.get('/api/routines/:id', async (req, res) => {
    if (!ROUTINE_ID.test(req.params.id)) return res.status(400).json({ error: 'bad id' });
    const s = await routineStatus(req.params.id);
    if (!s) return res.status(404).json({ error: 'No such routine.' });
    res.json(s);
  });

  r.get('/api/routines', async (_req, res) => {
    const all = [];
    for (const id of await listRoutineIds()) {
      const s = await routineStatus(id);
      if (s?.state === 'ready') all.push(s);
    }
    res.json(all);
  });

  // The video itself, with range support so the browser can seek.
  r.get('/media/:id', async (req, res) => {
    if (!ROUTINE_ID.test(req.params.id)) return res.status(400).end();
    const meta = await readJson(metaFile(req.params.id));
    if (!meta?.video) return res.status(404).end();
    res.sendFile(routineFile(req.params.id, meta.video));
  });

  r.get('/api/routines/:id/pose', async (req, res) => {
    if (!ROUTINE_ID.test(req.params.id)) return res.status(400).json({ error: 'bad id' });
    const f = poseFile(req.params.id);
    if (!existsSync(f)) return res.status(404).json({ error: 'Not tracked yet.' });
    res.sendFile(f);
  });

  // Leaderboard per routine: the top 50 runs, best first.
  r.get('/api/routines/:id/scores', async (req, res) => {
    if (!ROUTINE_ID.test(req.params.id)) return res.status(400).json({ error: 'bad id' });
    res.json((await readJson(routineFile(req.params.id, 'scores.json'), [])).slice(0, 20));
  });
  r.post('/api/routines/:id/scores', express.json(), async (req, res) => {
    const { id } = req.params;
    if (!ROUTINE_ID.test(id)) return res.status(400).json({ error: 'bad id' });
    if (!(await readJson(metaFile(id)))) return res.status(404).json({ error: 'No such routine.' });
    const { name, score, accuracy, mode } = req.body || {};
    if (!Number.isFinite(score) || score < 0) return res.status(400).json({ error: 'A score is required.' });
    const file = routineFile(id, 'scores.json');
    const list = await readJson(file, []);
    list.push({
      name: String(name || 'Dancer').trim().slice(0, 24) || 'Dancer',
      score: Math.round(Math.min(score, 1e7)),
      accuracy: Math.round(Math.min(100, Math.max(0, Number(accuracy) || 0))),
      mode: mode === 'party' ? 'party' : 'solo',
      at: new Date().toISOString(),
    });
    list.sort((a, b) => b.score - a.score);
    await writeJson(file, list.slice(0, 50));
    res.json(list.slice(0, 20));
  });

  // The browser tracked the dancer; keep the result so the next visit is instant.
  r.put('/api/routines/:id/pose', express.json({ limit: '60mb' }), async (req, res) => {
    const { id } = req.params;
    if (!ROUTINE_ID.test(id)) return res.status(400).json({ error: 'bad id' });
    const meta = await readJson(metaFile(id));
    if (!meta) return res.status(404).json({ error: 'No such routine.' });
    const p = req.body;
    const ok = p && Array.isArray(p.frames) && p.frames.length > 0 && Number.isFinite(p.duration)
      && p.frames.every((f) => Number.isFinite(f.t) && Array.isArray(f.lm) && f.lm.length === 33);
    if (!ok) return res.status(400).json({ error: 'Pose data is malformed.' });
    await writeJson(poseFile(id), { fps: p.fps, aspect: p.aspect, duration: p.duration, frames: p.frames });
    if (!meta.duration) await writeJson(metaFile(id), { ...meta, duration: Math.round(p.duration) });
    const { size } = await stat(poseFile(id));
    res.json({ ok: true, bytes: size });
  });

  return r;
}
