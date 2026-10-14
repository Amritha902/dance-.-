// The rule-based picker: which video in a song group is the original
// choreography? Used when Claude isn't available, and as the safety net when
// Claude's answer doesn't check out.

import { kindOf, officialSignals } from './labels.js';

export function pickByRules(group) {
  const vids = group.videos;
  const dates = vids.map((v) => v.uploaded).filter(Boolean).sort();
  const scored = vids.map((v) => {
    const kind = kindOf(v.title);
    const official = officialSignals(v);
    let score = 0;
    const why = [];
    if (kind === 'candidate') { score += 2; why.push('not a cover, tutorial or re-upload'); } else score -= 3;
    if (official.length) { score += 3; why.push(...official); }
    if (v.uploaded && v.uploaded === dates[0] && dates.length > 1) { score += 2; why.push('earliest upload in the group'); }
    if (Number.isFinite(v.views) && v.views > 0) score += Math.log10(v.views) / 10; // tie-break only
    return { v, kind, score, why };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  return {
    original: best.v.id,
    reason: best.why.length ? best.why.join('; ') : 'best remaining candidate',
    labels: scored.filter((s) => s.v.id !== best.v.id).map((s) => ({ id: s.v.id, label: s.kind === 'candidate' ? 'other upload' : s.kind })),
  };
}
