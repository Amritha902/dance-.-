// YouTube access goes through yt-dlp, a command-line tool on PATH. Mimic never
// talks to YouTube directly. Set YTDLP_BIN to point at a different binary
// (the tests use a stub).

import { spawn } from 'node:child_process';

const ID = /^[\w-]{11}$/;

// Accepts watch, youtu.be, shorts, embed, live and music links. Returns the
// 11-character video id, or null for anything else.
export function parseYouTubeId(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (ID.test(s)) return s;
  let u;
  try { u = new URL(s.startsWith('http') ? s : `https://${s}`); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
      if (m) id = m[2];
    }
  }
  return id && ID.test(id) ? id : null;
}

const bin = () => process.env.YTDLP_BIN || 'yt-dlp';

// Run yt-dlp; resolves with stdout, rejects with a readable message.
// onLine sees stderr/stdout lines as they arrive (for progress).
export function ytdlp(args, { onLine } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(bin(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      reject(new Error(`yt-dlp could not start: ${e.message}`));
      return;
    }
    let out = '', err = '';
    const feed = (buf, isErr) => {
      const text = buf.toString();
      if (isErr) err += text; else out += text;
      if (onLine) for (const line of text.split(/\r|\n/)) if (line.trim()) onLine(line);
    };
    child.stdout.on('data', (b) => feed(b, false));
    child.stderr.on('data', (b) => feed(b, true));
    child.on('error', (e) => reject(new Error(e.code === 'ENOENT'
      ? 'yt-dlp is not installed. Install it (brew install yt-dlp, or pipx install yt-dlp) and try again.'
      : `yt-dlp failed to start: ${e.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error((err.trim().split('\n').filter((l) => /ERROR/.test(l)).pop() || err.trim().split('\n').pop() || `yt-dlp exited with ${code}`).slice(0, 300)));
    });
  });
}

const url = (id) => `https://www.youtube.com/watch?v=${id}`;

export async function fetchMeta(id) {
  const info = JSON.parse(await ytdlp(['--dump-single-json', '--no-playlist', '--skip-download', url(id)]));
  return {
    id,
    title: info.title || id,
    channel: info.channel || info.uploader || '',
    duration: info.duration || 0,
    thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    uploaded: info.upload_date || null,
    views: info.view_count ?? null,
  };
}

// 720p mp4 at most: plenty for pose tracking, quick to download.
// onProgress gets 0..1 parsed from yt-dlp's "[download]  42.0%" lines.
export function download(id, file, onProgress) {
  return ytdlp([
    '-f', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[ext=mp4]/b',
    '--merge-output-format', 'mp4', '--no-playlist', '--newline',
    '-o', file, url(id),
  ], {
    onLine: (line) => {
      const m = line.match(/\[download\]\s+([\d.]+)%/);
      if (m) onProgress?.(Math.min(1, parseFloat(m[1]) / 100));
    },
  });
}

// Search results with the metadata Trend Scout needs, without downloading.
export async function search(query, n = 10) {
  const out = await ytdlp(['--dump-json', '--flat-playlist', '--no-warnings', `ytsearch${n}:${query}`]);
  return out.split('\n').filter(Boolean).map((line) => {
    const e = JSON.parse(line);
    return {
      id: e.id,
      title: e.title || '',
      channel: e.channel || e.uploader || '',
      duration: e.duration || 0,
      views: e.view_count ?? null,
      uploaded: e.upload_date || null,
      thumbnail: e.thumbnails?.at(-1)?.url || `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
    };
  }).filter((e) => ID.test(e.id));
}
