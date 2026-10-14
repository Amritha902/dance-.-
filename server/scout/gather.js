// Where Trend Scout looks. Two sources:
//
//  1. The official YouTube Data API v3 (free key, free daily quota), used
//     whenever YOUTUBE_API_KEY is set. This is the approved way to read
//     YouTube: search for recent dance videos, then fetch their stats.
//  2. yt-dlp search, used only when there's no key and yt-dlp is allowed
//     (MIMIC_YTDLP isn't "off"). Keyless, but it reads YouTube's pages
//     directly, so it's off in compliance mode.

import { search as ytdlpSearch } from '../youtube.js';

export const QUERIES = [
  'dance challenge', 'kpop dance practice', 'choreography video', 'bollywood hook step dance', 'dance trend tutorial',
];
const WINDOW_DAYS = 21;

export const ytdlpAllowed = () => process.env.MIMIC_YTDLP !== 'off';
export const sourceName = () => (process.env.YOUTUBE_API_KEY ? 'youtube-api' : ytdlpAllowed() ? 'yt-dlp' : null);

// ISO 8601 duration (PT1M23S) → seconds.
export function isoSeconds(d) {
  const m = String(d || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : 0;
}
const ymd = (iso) => (iso ? iso.slice(0, 10).replace(/-/g, '') : null);

export async function viaYouTubeApi(key, { fetchImpl = fetch, now = Date.now() } = {}) {
  const api = 'https://www.googleapis.com/youtube/v3';
  const after = new Date(now - WINDOW_DAYS * 864e5).toISOString();
  const ids = new Set();
  for (const q of QUERIES) {
    const u = new URL(`${api}/search`);
    Object.entries({ part: 'snippet', type: 'video', q, order: 'viewCount', publishedAfter: after, maxResults: '12', key })
      .forEach(([k, v]) => u.searchParams.set(k, v));
    const res = await fetchImpl(u);
    if (!res.ok) throw new Error(`YouTube Data API search failed (${res.status}). Check YOUTUBE_API_KEY.`);
    for (const it of (await res.json()).items || []) if (it.id?.videoId) ids.add(it.id.videoId);
  }
  // A second, cheap call (1 quota unit per 50 ids) for views and duration.
  const out = [];
  const list = [...ids];
  for (let i = 0; i < list.length; i += 50) {
    const u = new URL(`${api}/videos`);
    Object.entries({ part: 'snippet,statistics,contentDetails', id: list.slice(i, i + 50).join(','), key })
      .forEach(([k, v]) => u.searchParams.set(k, v));
    const res = await fetchImpl(u);
    if (!res.ok) throw new Error(`YouTube Data API videos failed (${res.status}).`);
    for (const v of (await res.json()).items || []) {
      out.push({
        id: v.id, title: v.snippet?.title || '', channel: v.snippet?.channelTitle || '',
        uploaded: ymd(v.snippet?.publishedAt), views: Number(v.statistics?.viewCount) || null,
        duration: isoSeconds(v.contentDetails?.duration),
        thumbnail: v.snippet?.thumbnails?.high?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      });
    }
  }
  return out;
}

export async function viaYtdlp() {
  const out = [];
  for (const q of QUERIES) {
    for (const v of await ytdlpSearch(q, 10)) if (!out.some((x) => x.id === v.id)) out.push(v);
  }
  return out;
}

export async function gather(opts = {}) {
  const key = process.env.YOUTUBE_API_KEY;
  if (key) return { source: 'youtube-api', videos: await viaYouTubeApi(key, opts) };
  if (ytdlpAllowed()) return { source: 'yt-dlp', videos: await viaYtdlp() };
  throw Object.assign(new Error('Trend Scout needs a free YouTube Data API key (YOUTUBE_API_KEY) in compliance mode.'), { code: 'NO_SOURCE' });
}
