// Related routines: easier ways into the same dance. For a routine, search
// YouTube for tutorials, mirrored and slowed versions of the same song, and
// rank the ones that actually help a learner first. Same compliance rules
// as Trend Scout: the official API by default, yt-dlp search only if allowed.

import express from 'express';
import { routineFile, readJson, writeJson, ROUTINE_ID } from './store.js';
import { metaFile } from './routines.js';
import { searchVideos } from './scout/gather.js';
import { kindOf, songTokens } from './scout/labels.js';

const TTL = 24 * 3600e3;
// What helps a learner most, first.
const USEFUL = { tutorial: 0, mirrored: 1, slowed: 2, candidate: 3, cover: 4 };

/** Search words for a routine: the song part of its title, plus what we want. */
// Phone camera file names (IMG_2041, VID_20261014, PXL_…) aren't song names.
const CAMERA_WORDS = /^(img|vid|mov|pxl|dsc|dscn|mvi|gopr|screen|recording|clip|video|copy|trim|edit|final)$/i;

export function relatedQuery(title) {
  const song = songTokens(title || '').filter((w) => !/^\d+$/.test(w) && !CAMERA_WORDS.test(w)).slice(0, 6).join(' ');
  return song ? `${song} dance tutorial mirrored slow` : '';
}

/** Keep learning-friendly videos, best first; drop the routine itself and noise. */
export function rankRelated(videos, selfId) {
  return videos
    .filter((v) => v.id !== selfId)
    .map((v) => ({ ...v, kind: kindOf(v.title) }))
    .filter((v) => v.kind in USEFUL)
    .sort((a, b) => USEFUL[a.kind] - USEFUL[b.kind] || (b.views || 0) - (a.views || 0))
    .slice(0, 8)
    .map((v) => ({ ...v, label: v.kind === 'candidate' ? 'same dance' : v.kind }));
}

export function relatedRouter() {
  const r = express.Router();
  r.get('/api/routines/:id/related', async (req, res) => {
    const { id } = req.params;
    if (!ROUTINE_ID.test(id)) return res.status(400).json({ error: 'bad id' });
    const meta = await readJson(metaFile(id));
    if (!meta) return res.status(404).json({ error: 'No such routine.' });
    // An uploaded clip's title is just a file name, so the learner can say what song it is.
    const query = String(req.query.q || '').trim().slice(0, 120) || relatedQuery(meta.title);
    if (!query) return res.json({ query: '', videos: [], note: 'Type the song name to search.' });

    const file = routineFile(id, 'related.json');
    const cached = await readJson(file);
    if (cached && cached.query === query && Date.now() - Date.parse(cached.at) < TTL) return res.json(cached);
    try {
      const { source, videos } = await searchVideos(query);
      const out = { at: new Date().toISOString(), query, source, videos: rankRelated(videos, id) };
      await writeJson(file, out);
      res.json(out);
    } catch (e) {
      res.status(e.code === 'NO_SOURCE' ? 503 : 502).json({ error: e.message, query });
    }
  });
  return r;
}
