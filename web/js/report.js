// The per-step report: one battle's judgements, regrouped by the routine's own
// steps. "62% overall" becomes "Step 3 is the one you can't do yet, and it's
// your left arm" — which is what the coach, and you, can act on.

import { JOINTS } from './pose/skeleton.js';

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const JOINT_NAMES = Object.keys(JOINTS);

/**
 * @param steps    [{label,start,end}] for the whole routine
 * @param samples  judge samples [{t, score, worst, off:{limb:deg}, you:{joint:deg}, ref:{joint:deg}}]
 * @param region   {start,end} that was danced; steps outside it are dropped, edges trimmed
 */
export function buildReport(steps, samples, region) {
  // Labels stay the Studio's own ("Step 5" means the same bars everywhere,
  // and across runs, which is what lets the coach compare attempts).
  return steps
    .map((s) => ({ ...s, start: Math.max(s.start, region.start), end: Math.min(s.end, region.end) }))
    .filter((s) => s.end - s.start >= 0.3)
    .map((s) => {
      const inside = samples.filter((x) => x.t >= s.start && x.t < s.end);
      // Never seen during this step: say so. A zero would be a lie.
      if (!inside.length) return { ...s, accuracy: null, worst: null, judged: 0, limbs: {}, joints: {} };
      const counts = {};
      for (const x of inside) counts[x.worst] = (counts[x.worst] || 0) + 1;
      const worst = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      const limbs = {};
      for (const name of new Set(inside.flatMap((x) => Object.keys(x.off || {})))) {
        limbs[name] = Math.round(mean(inside.map((x) => x.off?.[name]).filter((v) => v != null)));
      }
      // Joint angles only from moments where both bodies were measured.
      const joints = {};
      for (const j of JOINT_NAMES) {
        const both = inside.filter((x) => x.you?.[j] != null && x.ref?.[j] != null);
        if (!both.length) continue;
        const you = Math.round(mean(both.map((x) => x.you[j])));
        const ref = Math.round(mean(both.map((x) => x.ref[j])));
        joints[j] = { you, ref };
      }
      return { ...s, accuracy: Math.round(mean(inside.map((x) => x.score))), worst, judged: inside.length, limbs, joints };
    });
}

/** The step to drill: the lowest-scoring step that was actually judged. */
export function weakestStep(report) {
  return report.filter((s) => s.accuracy != null).reduce((a, b) => (!a || b.accuracy < a.accuracy ? b : a), null);
}
