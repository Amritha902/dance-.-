// Song search: type a song, get its dance videos, originals first.
// Reads YouTube through the same allowed sources as Trend Scout (the official
// API by default). Each search costs API quota, so answers are kept for a day.

import express from 'express';
import { searchVideos } from './scout/gather.js';
import { kindOf } from './scout/labels.js';

const TTL = 24 * 3600e3;
const MAX_CACHE = 300;
const cache = new Map(); // normalised query -> { at, body }

// Originals and dance practices first (the real moves), then the learning
// aids, then covers. Reactions aren't dances, so they're dropped.
const ORDER = { candidate: 0, tutorial: 1, mirrored: 2, slowed: 3, cover: 4 };
export function rankSearch(videos) {
  return videos
    .map((v) => ({ ...v, kind: kindOf(v.title) }))
    .filter((v) => v.kind !== 'reaction')
    .sort((a, b) => (ORDER[a.kind] ?? 5) - (ORDER[b.kind] ?? 5) || (b.views || 0) - (a.views || 0));
}

export const searchQuery = (q) => String(q || '').replace(/\s+/g, ' ').trim().slice(0, 80);

export function searchRouter({ search = searchVideos } = {}) {
  const r = express.Router();
  r.get('/api/search', async (req, res) => {
    const q = searchQuery(req.query.q);
    if (q.length < 2) return res.status(400).json({ error: 'Type a song name.' });
    const key = q.toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return res.json(hit.body);
    try {
      // "dance" steers results to choreography rather than the music video.
      const { source, videos } = await search(/\bdanc/i.test(q) ? q : `${q} dance`, { n: 15 });
      const body = { query: q, source, results: rankSearch(videos) };
      cache.set(key, { at: Date.now(), body });
      if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
      res.json(body);
    } catch (e) {
      res.status(e.code === 'NO_SOURCE' ? 503 : 502).json({ error: e.message });
    }
  });
  return r;
}
