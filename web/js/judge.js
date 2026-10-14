// Turns a stream of live comparisons into a game: judgements about twice a
// second, a combo, a multiplier, and a rank at the end. Kept free of the DOM
// so it can be tested on its own.

export const JUDGEMENTS = [
  { min: 85, label: 'PERFECT', points: 300 },
  { min: 70, label: 'GREAT', points: 200 },
  { min: 50, label: 'GOOD', points: 100 },
  { min: 30, label: 'OFF', points: 20 },
  { min: -Infinity, label: 'MISS', points: 0 },
];
export const WINDOW = 0.45; // seconds per judgement: one blurry frame can't sink you

const judgementFor = (score) => JUDGEMENTS.find((j) => score >= j.min);
// Every 10 in a row adds 0.5×, up to 4×: a clean run feels special, but one
// streak can't outweigh the whole rest of the song.
export const multiplier = (combo) => Math.min(4, 1 + Math.floor(combo / 10) * 0.5);
export const rankFor = (acc) => (acc >= 85 ? 'S' : acc >= 72 ? 'A' : acc >= 58 ? 'B' : acc >= 40 ? 'C' : 'D');

export function createJudge() {
  let windowStart = null;
  let pending = [];
  const state = {
    score: 0, combo: 0, bestCombo: 0,
    tally: Object.fromEntries(JUDGEMENTS.map((j) => [j.label, 0])),
    // One entry per judgement in which the learner was actually seen: what the
    // step report and the coach read afterwards.
    samples: [],
  };

  /**
   * Feed one frame. `cmp` is a compare() result, or null when the learner
   * isn't visible. `extra` is stored with the judgement (joint angles etc).
   * Returns the judgement when one is made, else null.
   */
  function push(t, cmp, extra = {}) {
    if (windowStart == null) windowStart = t;
    if (cmp) pending.push({ cmp, extra });
    if (t - windowStart < WINDOW) return null;
    const made = decide(t);
    windowStart = t;
    pending = [];
    return made;
  }

  function decide(t) {
    if (!pending.length) {
      // Out of frame for a whole window: a miss, but not a sample — the
      // report will say "not seen" rather than pretend we watched you fail.
      state.tally.MISS++;
      state.combo = 0;
      return { t, label: 'MISS', points: 0, seen: false };
    }
    const avg = pending.reduce((s, p) => s + p.cmp.score, 0) / pending.length;
    const j = judgementFor(avg);
    state.tally[j.label]++;
    state.combo = j.points >= 100 ? state.combo + 1 : 0;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    const points = Math.round(j.points * multiplier(state.combo));
    state.score += points;
    // The limb that was furthest off most often in this window.
    const counts = {};
    for (const p of pending) counts[p.cmp.worst.name] = (counts[p.cmp.worst.name] || 0) + 1;
    const worst = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const limbs = {};
    for (const p of pending) for (const l of p.cmp.limbs) (limbs[l.name] ||= []).push(l.off);
    const last = pending.at(-1).extra;
    state.samples.push({
      t: Math.round(t * 100) / 100,
      score: Math.round(avg),
      worst,
      off: Object.fromEntries(Object.entries(limbs).map(([k, v]) => [k, Math.round(v.reduce((a, b) => a + b, 0) / v.length)])),
      ...last,
    });
    return { t, label: j.label, points, seen: true, worst, combo: state.combo };
  }

  function result() {
    const judged = Object.values(state.tally).reduce((a, b) => a + b, 0);
    const seenScores = state.samples.map((s) => s.score);
    // Accuracy counts unseen windows as zero: leaving the frame isn't free.
    const accuracy = judged ? Math.round(seenScores.reduce((a, b) => a + b, 0) / judged) : 0;
    return {
      score: state.score, accuracy, rank: rankFor(accuracy),
      bestCombo: state.bestCombo, tally: { ...state.tally }, samples: state.samples,
    };
  }

  return { push, result, state };
}
