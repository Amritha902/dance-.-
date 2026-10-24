// Where Trend Scout looks. Two sources:
//
//  1. The official YouTube Data API v3 (free key, free daily quota), used
//     whenever YOUTUBE_API_KEY is set. This is the approved way to read
//     YouTube: search for recent dance videos, then fetch their stats.
//  2. yt-dlp search, used only when there's no key AND yt-dlp has been
//     explicitly switched on (MIMIC_YTDLP=on). Keyless, but it reads
//     YouTube's pages directly, so it is off by default (compliance mode).

import { search as ytdlpSearch } from '../youtube.js';

export const QUERIES = [
  'dance challenge', 'kpop dance practice', 'choreography video', 'bollywood hook step dance', 'dance trend tutorial',
  'viral dance trend', 'reels dance trend',
];

// Countries Trend Scout can look in. YouTube's regionCode biases search to
// what's watched there; a couple of extra queries add each place's own scene.
export const REGIONS = {
  IN: { name: 'India', extra: ['bollywood dance trend', 'tamil song dance trend'] },
  US: { name: 'United States', extra: ['tiktok dance trend'] },
  GB: { name: 'United Kingdom', extra: ['tiktok dance trend'] },
  KR: { name: 'South Korea', extra: ['kpop dance challenge'] },
  JP: { name: 'Japan', extra: ['jpop dance challenge'] },
  PH: { name: 'Philippines', extra: ['tiktok dance trend'] },
  ID: { name: 'Indonesia', extra: ['tiktok dance trend'] },
  BR: { name: 'Brazil', extra: ['funk dance trend'] },
  MX: { name: 'Mexico', extra: ['baile tendencia'] },
  NG: { name: 'Nigeria', extra: ['afrobeats dance challenge'] },
  AE: { name: 'United Arab Emirates', extra: ['arabic dance trend'] },
  AU: { name: 'Australia', extra: ['tiktok dance trend'] },
  CA: { name: 'Canada', extra: ['tiktok dance trend'] },
};
export const normaliseRegion = (r) => (typeof r === 'string' && REGIONS[r.toUpperCase()] ? r.toUpperCase() : null);
const WINDOW_DAYS = 21;

// Compliance mode is the default: no YouTube downloads and no scraping unless
// the person running the server opts in with MIMIC_YTDLP=on.
export const ytdlpAllowed = () => process.env.MIMIC_YTDLP === 'on';
export const sourceName = () => (process.env.YOUTUBE_API_KEY ? 'youtube-api' : ytdlpAllowed() ? 'yt-dlp' : null);

// ISO 8601 duration (PT1M23S) → seconds.
export function isoSeconds(d) {
  const m = String(d || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : 0;
}
const ymd = (iso) => (iso ? iso.slice(0, 10).replace(/-/g, '') : null);

const API = 'https://www.googleapis.com/youtube/v3';

// Official API: search.list for ids (100 quota units per query), then one
// videos.list call per 50 ids (1 unit) for views and duration.
export async function apiSearch(queries, key, { fetchImpl = fetch, publishedAfter = null, max = 12, order = 'viewCount', region = null } = {}) {
  const ids = new Set();
  for (const q of queries) {
    const u = new URL(`${API}/search`);
    const params = { part: 'snippet', type: 'video', q, order, maxResults: String(max), key };
    if (publishedAfter) params.publishedAfter = publishedAfter;
    if (region) params.regionCode = region;
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    const res = await fetchImpl(u);
    if (!res.ok) throw new Error(`YouTube Data API search failed (${res.status}). Check YOUTUBE_API_KEY.`);
    for (const it of (await res.json()).items || []) if (it.id?.videoId) ids.add(it.id.videoId);
  }
  const out = [];
  const list = [...ids];
  for (let i = 0; i < list.length; i += 50) {
    const u = new URL(`${API}/videos`);
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

export function viaYouTubeApi(key, { fetchImpl = fetch, now = Date.now(), region = null } = {}) {
  const queries = region ? [...QUERIES.slice(0, 5), ...REGIONS[region].extra] : QUERIES;
  return apiSearch(queries, key, { fetchImpl, region, max: 15, publishedAfter: new Date(now - WINDOW_DAYS * 864e5).toISOString() });
}

/**
 * Search YouTube for one query through whichever source is allowed.
 * Used by Related routines; same compliance rules as Trend Scout.
 */
export async function searchVideos(query, { n = 12, fetchImpl = fetch } = {}) {
  const key = process.env.YOUTUBE_API_KEY;
  if (key) return { source: 'youtube-api', videos: await apiSearch([query], key, { fetchImpl, max: n, order: 'relevance' }) };
  if (ytdlpAllowed()) return { source: 'yt-dlp', videos: await ytdlpSearch(query, n) };
  throw Object.assign(new Error('Searching YouTube needs a free YouTube Data API key: set YOUTUBE_API_KEY on the server.'), { code: 'NO_SOURCE' });
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
  throw Object.assign(new Error('Trend Scout needs a free YouTube Data API key: set YOUTUBE_API_KEY on the server.'), { code: 'NO_SOURCE' });
}
