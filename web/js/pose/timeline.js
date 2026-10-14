// A tracked routine is a list of frames { t, lm } in time order. This module
// answers "what pose at time t?" and "what box does this dancer occupy?".
// Step cutting and hookstep detection join it in the next build step.

import { seen, P as J } from './skeleton.js';

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

// ---------- motion, steps and the hookstep ----------
//
// Three questions about a whole routine, answered from the poses alone:
//   where does the dancer pause?          → step boundaries
//   which stretch of movement repeats?    → the hookstep everyone wants to learn
//   roughly how fast is the beat?         → a tempo for the studio header
// All of it is scale-free: distances are measured in torso lengths and shapes
// as bone directions, so a dancer far from the camera reads the same as one close up.


const MOVERS = [J.lWrist, J.rWrist, J.lElbow, J.rElbow, J.lKnee, J.rKnee, J.lAnkle, J.rAnkle];
const SHAPE_BONES = [
  [J.lShoulder, J.lElbow], [J.lElbow, J.lWrist], [J.rShoulder, J.rElbow], [J.rElbow, J.rWrist],
  [J.lHip, J.lKnee], [J.lKnee, J.lAnkle], [J.rHip, J.rKnee], [J.rKnee, J.rAnkle],
];
const RATE = 10; // resampling rate, Hz

function torso(lm) {
  const mx = (lm[J.lShoulder][0] + lm[J.rShoulder][0]) / 2, my = (lm[J.lShoulder][1] + lm[J.rShoulder][1]) / 2;
  const hx = (lm[J.lHip][0] + lm[J.rHip][0]) / 2, hy = (lm[J.lHip][1] + lm[J.rHip][1]) / 2;
  return Math.hypot(mx - hx, my - hy) || 0.25;
}

// Is there a tracked frame within `tol` seconds of t?
function hasFrameNear(frames, t, tol = 0.25) {
  let lo = 0, hi = frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= t) lo = mid; else hi = mid;
  }
  return Math.min(Math.abs(frames[lo].t - t), Math.abs(frames[hi].t - t)) <= tol;
}

/**
 * Resample the routine at a fixed rate. Each sample carries:
 *   energy — how fast the limbs move, in torso lengths per second
 *   shape  — unit direction of each limb bone (what the body looks like)
 *   live   — tracked, and actually moving (title cards and frozen frames are not)
 */
export function sampleRoutine(frames, duration) {
  const n = Math.max(0, Math.floor(duration * RATE));
  const out = [];
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const t = i / RATE;
    const present = frames.length > 0 && hasFrameNear(frames, t);
    const lm = present ? poseAt(frames, t) : null;
    let energy = 0;
    if (lm && prev) {
      const scale = torso(lm);
      for (const k of MOVERS) energy += Math.hypot(lm[k][0] - prev[k][0], lm[k][1] - prev[k][1]) / scale;
      energy *= RATE / MOVERS.length;
    }
    const shape = lm ? SHAPE_BONES.map(([a, b]) => {
      const dx = lm[b][0] - lm[a][0], dy = lm[b][1] - lm[a][1];
      const d = Math.hypot(dx, dy) || 1;
      return [dx / d, dy / d];
    }) : null;
    out.push({ t, energy, shape, present });
    prev = lm;
  }
  // Moving at all? Relative to this routine's own typical motion, so a slow
  // contemporary piece isn't judged by a hip-hop yardstick.
  const moving = out.filter((s) => s.present).map((s) => s.energy).sort((a, b) => a - b);
  const typical = moving.length ? moving[Math.floor(moving.length * 0.6)] : 0;
  const window = Math.round(RATE * 0.6);
  for (let i = 0; i < out.length; i++) {
    let sum = 0, cnt = 0;
    for (let j = Math.max(0, i - window); j <= Math.min(out.length - 1, i + window); j++) {
      if (out[j].present) { sum += out[j].energy; cnt++; }
    }
    out[i].live = out[i].present && cnt > 0 && sum / cnt > typical * 0.15 && typical > 0;
  }
  return out;
}

const smooth = (xs, radius) => xs.map((_, i) => {
  let s = 0, c = 0;
  for (let j = Math.max(0, i - radius); j <= Math.min(xs.length - 1, i + radius); j++) { s += xs[j]; c++; }
  return s / c;
});

/**
 * Cut the routine where the dancer pauses (dips in motion), so each step is a
 * phrase you can loop on its own. Steps tile the routine with no gaps.
 */
export function cutSteps(samples, duration, { minLen = 1.2, maxSteps = 12 } = {}) {
  if (samples.length < RATE * 2 || duration < minLen * 2) return [{ label: 'Step 1', start: 0, end: duration }];
  const e = smooth(samples.map((s) => (s.present ? s.energy : 0)), Math.round(RATE * 0.2));
  const active = e.filter((v) => v > 0).sort((a, b) => a - b);
  const median = active.length ? active[Math.floor(active.length / 2)] : 0;
  const cuts = [];
  for (let i = 1; i < e.length - 1; i++) {
    const t = samples[i].t;
    if (e[i] <= e[i - 1] && e[i] < e[i + 1] && e[i] < median * 0.6
      && t > minLen && t < duration - minLen
      && (!cuts.length || t - cuts.at(-1) >= minLen)) cuts.push(t);
  }
  const edges = [0, ...cuts, duration];
  let steps = edges.slice(1).map((end, i) => ({ start: edges[i], end }));
  // Too many: fold the shortest step into its shorter neighbour until it fits.
  while (steps.length > maxSteps) {
    let k = 0;
    for (let i = 1; i < steps.length; i++) if (steps[i].end - steps[i].start < steps[k].end - steps[k].start) k = i;
    const left = k > 0 ? steps[k - 1] : null, right = k < steps.length - 1 ? steps[k + 1] : null;
    if (left && (!right || left.end - left.start <= right.end - right.start)) left.end = steps[k].end;
    else right.start = steps[k].start;
    steps.splice(k, 1);
  }
  return steps.map((s, i) => ({ label: `Step ${i + 1}`, start: round2(s.start), end: round2(s.end) }));
}

const round2 = (x) => Math.round(x * 100) / 100;

// How alike two body shapes are, 0..1 (mean over limb bones of cosine, rescaled).
function alike(a, b) {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += a[k][0] * b[k][0] + a[k][1] * b[k][1];
  return (s / a.length + 1) / 2;
}

// Mean likeness between the routine and itself shifted by `lag` samples,
// counting only moments where both ends are live.
function selfSimilarity(samples, lag, from = 0, to = samples.length - lag) {
  let s = 0, n = 0;
  for (let i = Math.max(0, from); i < Math.min(to, samples.length - lag); i++) {
    const a = samples[i], b = samples[i + lag];
    if (!a.live || !b.live) continue;
    s += alike(a.shape, b.shape); n++;
  }
  return n ? { score: s / n, n } : { score: 0, n: 0 };
}

/**
 * Find the hookstep: the phrase the routine keeps coming back to.
 * Shift the dance against itself; a lag at which it lines up well — better
 * than the lags around it — is a repeat. Neighbouring lags are always similar
 * (bodies move smoothly), so we judge each lag against its local baseline and
 * keep the most prominent; among its near-equals, the shortest lag wins —
 * the phrase itself rather than its multiples.
 * @returns {{hook: {start,end,period,confidence}|null}}
 */
export function findHook(samples, duration, { minPeriod = 1.6, maxPeriod = 12 } = {}) {
  const live = samples.filter((s) => s.live).length;
  const maxLag = Math.min(Math.round(maxPeriod * RATE), Math.floor(samples.length / 2));
  const minLag = Math.round(minPeriod * RATE);
  if (live < RATE * minPeriod * 2 || maxLag <= minLag) return { hook: null };

  const sims = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    const { score, n } = selfSimilarity(samples, lag);
    sims.push({ lag, score: n >= minLag ? score : 0 });
  }
  // Each lag is judged against a fixed-width neighbourhood, so long lags
  // don't earn extra prominence just from having a wider baseline to dip into.
  const BAND = Math.round(RATE * 0.6);
  const peaks = [];
  for (let i = 0; i < sims.length; i++) {
    const { lag, score } = sims[i];
    const isPeak = (i === 0 || score >= sims[i - 1].score) && (i === sims.length - 1 || score >= sims[i + 1].score);
    if (!isPeak || score === 0) continue;
    const near = sims.filter((s) => Math.abs(s.lag - lag) <= BAND && s.lag !== lag && s.score > 0);
    const base = near.length ? Math.min(...near.map((s) => s.score)) : score;
    peaks.push({ lag, score, prominence: score - base });
  }
  if (!peaks.length) return { hook: null };
  // A phrase that repeats at L also lines up at 2L, 3L…; when those score about
  // the same, the shortest is the phrase itself. A half-phrase that only
  // *nearly* matches scores lower and loses here.
  const top = peaks.reduce((a, b) => (b.prominence > a.prominence ? b : a));
  const best = peaks
    .filter((p) => p.prominence >= top.prominence * 0.6 && p.score >= top.score - 0.01)
    .reduce((a, b) => (b.lag < a.lag ? b : a));
  if (!best || best.score < 0.8 || best.prominence < 0.01) return { hook: null };

  // Where in the routine does that phrase line up best with its own repeat?
  const L = best.lag;
  let start = -1, fit = 0;
  for (let i = 0; i + 2 * L <= samples.length; i++) {
    if (!samples[i].live || !samples[i + L - 1].live) continue;
    const { score, n } = selfSimilarity(samples, L, i, i + L);
    if (n >= L * 0.8 && score > fit + 1e-6) { fit = score; start = i; }
  }
  if (start < 0) return { hook: null };
  const s = samples[start].t;
  return {
    hook: {
      start: round2(s), end: round2(Math.min(duration, s + L / RATE)),
      period: round2(L / RATE), confidence: Math.round(fit * 100) / 100,
    },
  };
}

/** Beats per minute from the rhythm of limb motion, folded into 70–180. */
export function estimateTempo(samples) {
  const e = samples.map((s) => (s.present ? s.energy : 0));
  const mean = e.reduce((a, b) => a + b, 0) / (e.length || 1);
  const x = e.map((v) => v - mean);
  let bestLag = 0, best = 0;
  for (let lag = Math.round(RATE * 0.33); lag <= Math.round(RATE * 1.0); lag++) {
    let s = 0;
    for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  if (!bestLag) return null;
  let bpm = 60 * RATE / bestLag;
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm);
}
