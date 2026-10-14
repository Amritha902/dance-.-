import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJudge, multiplier, rankFor, WINDOW } from '../web/js/judge.js';

const cmp = (score, worst = 'left arm') => ({
  score, worst: { name: worst, off: 60 }, limbs: [{ name: worst, off: 100 - score }, { name: 'torso', off: 5 }],
});

// Drive the judge at 30 fps for `seconds`, with a comparison from `at(t)`.
function run(judge, seconds, at, from = 0) {
  const made = [];
  for (let i = 0; i <= seconds * 30; i++) {
    const t = from + i / 30;
    const j = judge.push(t, at(t), { you: { 'left elbow': 120 } });
    if (j) made.push(j);
  }
  return made;
}

test('judgements arrive about twice a second', () => {
  const judge = createJudge();
  const made = run(judge, 4.5, () => cmp(90));
  assert.ok(Math.abs(made.length - 4.5 / WINDOW) <= 1, `${made.length} judgements`);
});

test('a clean run is all PERFECT, builds a combo, and earns rank S', () => {
  const judge = createJudge();
  run(judge, 9, () => cmp(95));
  const r = judge.result();
  assert.equal(r.tally.PERFECT, judge.state.samples.length);
  assert.equal(r.bestCombo, r.tally.PERFECT);
  assert.equal(r.rank, 'S');
  assert.ok(r.score > r.tally.PERFECT * 300, 'the multiplier kicked in');
});

test('a bad stretch breaks the combo; a single blurry frame does not', () => {
  const judge = createJudge();
  run(judge, 4, (t) => cmp(t > 1.2 && t < 2.4 ? 20 : 95));
  const { tally, combo, bestCombo } = judge.state;
  assert.ok(tally.MISS + tally.OFF >= 1);
  assert.ok(combo < tally.PERFECT, 'combo restarted after the bad stretch');
  assert.ok(bestCombo >= 2);

  const steady = createJudge();
  run(steady, 4, (t) => cmp(Math.abs(t - 2) < 0.02 ? 0 : 95));
  assert.equal(steady.state.tally.MISS + steady.state.tally.OFF, 0);
});

test('out of frame is a MISS but not a sample, and drags accuracy down', () => {
  const judge = createJudge();
  run(judge, 4, (t) => (t < 2 ? cmp(95) : null));
  const r = judge.result();
  assert.ok(r.samples.every((s) => s.t <= 2.5), 'no samples recorded while unseen');
  assert.ok(r.tally.MISS >= 3);
  assert.ok(r.accuracy < 70, `accuracy ${r.accuracy}`);
});

test('samples carry the worst limb, per-limb angles off, and the extras', () => {
  const judge = createJudge();
  run(judge, 1, () => cmp(60, 'right leg'));
  const s = judge.result().samples[0];
  assert.equal(s.worst, 'right leg');
  assert.equal(s.off['right leg'], 40);
  assert.deepEqual(s.you, { 'left elbow': 120 });
});

test('multiplier and rank boundaries', () => {
  assert.equal(multiplier(0), 1);
  assert.equal(multiplier(10), 1.5);
  assert.equal(multiplier(1000), 4);
  assert.deepEqual([90, 75, 60, 45, 10].map(rankFor), ['S', 'A', 'B', 'C', 'D']);
});
