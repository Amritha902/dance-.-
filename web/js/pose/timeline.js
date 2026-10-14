// A tracked routine is a list of frames { t, lm } in time order. This module
// answers "what pose at time t?" and "what box does this dancer occupy?".
// Step cutting and hookstep detection join it in the next build step.

import { seen } from './skeleton.js';

// Binary-search the frames around t and blend between them. Across a gap
// (the dancer left the shot, or tracking dropped out) it snaps rather than
// sliding limbs through the air.
export function poseAt(frames, t) {
  if (!frames?.length) return null;
  if (t <= frames[0].t) return frames[0].lm;
  const last = frames.length - 1;
  if (t >= frames[last].t) return frames[last].lm;
  let lo = 0, hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = frames[lo], b = frames[hi];
  const span = b.t - a.t;
  if (span > 0.4) return t - a.t < span / 2 ? a.lm : b.lm;
  const k = span > 0 ? (t - a.t) / span : 0;
  return a.lm.map((p, i) => {
    const q = b.lm[i];
    return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k, Math.min(p[3], q[3])];
  });
}

// The box around one pose's visible landmarks, or null if too little is seen.
export function boxOf(lm) {
  if (!lm) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
  for (const p of lm) {
    if (!seen(p)) continue;
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    n++;
  }
  return n >= 5 ? { x0, y0, x1, y1 } : null;
}

// One fixed box for a whole routine, so the stickman stays planted instead of
// breathing in and out as limbs extend. Percentiles, not extremes: a single
// wild landmark guess must not shrink the dancer for the entire song.
export function routineBox(frames, trim = 0.02) {
  const cols = [[], [], [], []];
  for (const f of frames) {
    const b = boxOf(f.lm);
    if (!b) continue;
    cols[0].push(b.x0); cols[1].push(b.y0); cols[2].push(b.x1); cols[3].push(b.y1);
  }
  if (!cols[0].length) return null;
  const q = (arr, p) => {
    arr.sort((m, n) => m - n);
    return arr[Math.min(arr.length - 1, Math.max(0, Math.round((arr.length - 1) * p)))];
  };
  return { x0: q(cols[0], trim), y0: q(cols[1], trim), x1: q(cols[2], 1 - trim), y1: q(cols[3], 1 - trim) };
}

// Ease a live box toward a target so a webcam figure doesn't jitter.
export function easeBox(cur, target, k = 0.1) {
  if (!target) return cur;
  if (!cur) return { ...target };
  const m = (a, b) => a + (b - a) * k;
  return { x0: m(cur.x0, target.x0), y0: m(cur.y0, target.y0), x1: m(cur.x1, target.x1), y1: m(cur.y1, target.y1) };
}

// Mirror a box the same way skeleton.mirror reflects x.
export const mirrorBox = (b) => (b ? { x0: 1 - b.x1, y0: b.y0, x1: 1 - b.x0, y1: b.y1 } : b);
