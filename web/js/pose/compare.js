// How close is the learner to the dancer, limb by limb?
//
// Positions are useless for this: they depend on where you stand and how far
// you are from the camera. Directions aren't: an arm pointing up-and-out is
// up-and-out at any distance. So every bone becomes a unit vector, and each
// limb is judged by how far its bones point away from the dancer's.

import { LIMBS, JOINTS, P, seen } from './skeleton.js';

// A limb more than this many degrees off is "wrong" — painted red live.
export const WRONG_DEG = 50;

// Feedback is a scale, not a switch: how far off a limb is decides its colour,
// so you can see yourself getting closer (red → orange → yellow → fine).
export const SEVERITY = [
  { from: WRONG_DEG, level: 'red', color: '#ff2d55' },
  { from: 37, level: 'orange', color: '#ff8a2b' },
  { from: 25, level: 'yellow', color: '#ffd23f' },
];
export const severity = (off) => SEVERITY.find((s) => off >= s.from) || null;

/** limb name → colour for every limb that's at least slightly off. */
export function limbColorsFor(cmp) {
  const out = {};
  for (const l of cmp?.limbs || []) {
    const s = severity(l.off);
    if (s) out[l.name] = s.color;
  }
  return out;
}

// For live cues: each limb's root (shoulder/hip), its middle joint, and its tip.
const CHAINS = {
  'left arm': { root: P.lShoulder, mid: P.lElbow, tip: P.lWrist, joint: 'elbow' },
  'right arm': { root: P.rShoulder, mid: P.rElbow, tip: P.rWrist, joint: 'elbow' },
  'left leg': { root: P.lHip, mid: P.lKnee, tip: P.lAnkle, joint: 'knee' },
  'right leg': { root: P.rHip, mid: P.rKnee, tip: P.rAnkle, joint: 'knee' },
};

const cap = (s) => s[0].toUpperCase() + s.slice(1);

// Where a limb's tip sits, measured from its root in torso lengths, plus how
// far it is from the body's middle (so "out" means away from you, whichever
// way the camera faces) and the bend at its middle joint.
function limbShape(lm, c, aspect) {
  const pts = [c.root, c.mid, c.tip, P.lShoulder, P.rShoulder, P.lHip, P.rHip];
  if (!pts.every((i) => seen(lm[i]))) return null;
  const X = (i) => lm[i][0] * aspect, Y = (i) => lm[i][1];
  const midX = (X(P.lShoulder) + X(P.rShoulder) + X(P.lHip) + X(P.rHip)) / 4;
  const torso = Math.hypot((X(P.lShoulder) + X(P.rShoulder) - X(P.lHip) - X(P.rHip)) / 2,
    (Y(P.lShoulder) + Y(P.rShoulder) - Y(P.lHip) - Y(P.rHip)) / 2) || 1;
  const p = dir(lm, c.mid, c.root, aspect), q = dir(lm, c.mid, c.tip, aspect);
  const bend = p && q ? Math.acos(Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1]))) * 180 / Math.PI : null;
  return { up: (Y(c.root) - Y(c.tip)) / torso, out: Math.abs(X(c.tip) - midX) / torso, bend };
}

/**
 * One thing to fix right now, in words: the furthest-off limb and the single
 * biggest difference in how it's placed (height, reach or bend).
 * `ref` must already be in the learner's handedness (as passed to compare).
 * @returns {null | {limb, level, color, text}}
 */
export function liveCue(ref, you, cmp, { refAspect = 1, youAspect = 1 } = {}) {
  if (!cmp?.limbs?.length) return null;
  const worst = cmp.limbs.reduce((a, b) => (b.off > a.off ? b : a));
  const s = severity(worst.off);
  if (!s) return null;
  const base = { limb: worst.name, level: s.level, color: s.color };
  const c = CHAINS[worst.name];
  if (!c) return { ...base, text: `${cap(worst.name)}: match the dancer's lean` };
  const r = limbShape(ref, c, refAspect), u = limbShape(you, c, youAspect);
  if (!r || !u) return { ...base, text: `${cap(worst.name)}: match the dancer's angle` };
  // Each difference scaled so 1 means "clearly off": a quarter torso of
  // height or reach, or 30° of bend. The largest one is what to say.
  const options = [
    { k: (r.up - u.up) / 0.25, more: 'raise it higher', less: 'bring it lower' },
    { k: (r.out - u.out) / 0.25, more: 'reach further out', less: 'keep it closer in' },
    r.bend != null && u.bend != null
      ? { k: (u.bend - r.bend) / 30, more: `bend the ${c.joint} more`, less: `straighten the ${c.joint}` }
      : null,
  ].filter(Boolean);
  const best = options.reduce((a, b) => (Math.abs(b.k) > Math.abs(a.k) ? b : a));
  const what = Math.abs(best.k) < 0.6 ? "match the dancer's angle" : best.k > 0 ? best.more : best.less;
  return { ...base, text: `${cap(worst.name)}: ${what}` };
}

function dir(lm, a, b, aspect) {
  const dx = (lm[b][0] - lm[a][0]) * aspect, dy = lm[b][1] - lm[a][1];
  const d = Math.hypot(dx, dy);
  return d ? [dx / d, dy / d] : null;
}

/**
 * Compare two poses that are already in the same handedness.
 * @returns {null | {score, limbs: [{name, off, score}], worst, wrong: string[]}}
 *   score 0..100 overall; per limb, `off` is the mean angle (degrees) between
 *   matching bones and `score` is 0..1; `wrong` lists limbs off by WRONG_DEG+.
 */
export function compare(ref, you, { refAspect = 1, youAspect = 1 } = {}) {
  if (!ref || !you) return null;
  const limbs = [];
  for (const limb of LIMBS) {
    let sumCos = 0, n = 0;
    for (const [a, b] of limb.bones) {
      if (!seen(ref[a]) || !seen(ref[b]) || !seen(you[a]) || !seen(you[b])) continue;
      const r = dir(ref, a, b, refAspect), u = dir(you, a, b, youAspect);
      if (!r || !u) continue;
      sumCos += r[0] * u[0] + r[1] * u[1];
      n++;
    }
    if (!n) continue;
    const cos = Math.max(-1, Math.min(1, sumCos / n));
    const off = Math.acos(cos) * 180 / Math.PI;
    limbs.push({ name: limb.name, off: Math.round(off), score: Math.round(((cos + 1) / 2) * 1000) / 1000 });
  }
  if (!limbs.length) return null;
  // 0° off everywhere is 100; a 90° average is 0. The curve is steeper near
  // the top, so "roughly right" can't coast into the PERFECT band.
  const meanOff = limbs.reduce((s, l) => s + l.off, 0) / limbs.length;
  const score = Math.round(100 * Math.max(0, 1 - meanOff / 90) ** 1.4);
  const worst = limbs.reduce((a, b) => (b.off > a.off ? b : a));
  return { score, limbs, worst, wrong: limbs.filter((l) => l.off >= WRONG_DEG).map((l) => l.name) };
}

/** Interior angle at each joint, in degrees (180 = straight). */
export function jointAngles(lm, aspect = 1) {
  if (!lm) return null;
  const out = {};
  for (const [name, [a, v, b]] of Object.entries(JOINTS)) {
    if (!seen(lm[a]) || !seen(lm[v]) || !seen(lm[b])) { out[name] = null; continue; }
    const p = dir(lm, v, a, aspect), q = dir(lm, v, b, aspect);
    out[name] = p && q
      ? Math.round(Math.acos(Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1]))) * 180 / Math.PI)
      : null;
  }
  return out;
}
