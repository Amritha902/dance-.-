// Scoring. The failure that matters is the silent one: plausible numbers that
// mark correct dancing as wrong (or the reverse).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, jointAngles, WRONG_DEG, severity, limbColorsFor } from '../web/js/pose/compare.js';
import { mirror, P } from '../web/js/pose/skeleton.js';
import { figure } from './geometry.test.mjs';

const moveArm = (lm, side, angle, len = 0.1) => {
  const out = lm.map((p) => [...p]);
  const [s, e, w] = side === 'left' ? [P.lShoulder, P.lElbow, P.lWrist] : [P.rShoulder, P.rElbow, P.rWrist];
  const [x, y] = out[s];
  out[e] = [x + Math.cos(angle) * len, y + Math.sin(angle) * len, 0, 1];
  out[w] = [x + Math.cos(angle) * 2 * len, y + Math.sin(angle) * 2 * len, 0, 1];
  return out;
};

test('a pose matched against itself scores 100 with nothing wrong', () => {
  const r = compare(figure(), figure());
  assert.equal(r.score, 100);
  assert.deepEqual(r.wrong, []);
});

test('where you stand and how big you look do not change the score', () => {
  const ref = figure();
  const you = figure().map(([x, y, z, v]) => [0.2 + x * 0.5, 0.1 + y * 0.5, z, v]);
  assert.equal(compare(ref, you).score, 100);
});

test('copying face-to-face scores perfectly against the mirrored dancer', () => {
  // The dancer raises their LEFT arm; a learner facing them, copying as a
  // mirror would, raises their RIGHT arm. That is the mirror image of the pose.
  const dancer = moveArm(figure(), 'left', -Math.PI / 3);
  const learner = mirror(dancer);
  assert.equal(compare(mirror(dancer), learner).score, 100);
  // Scored against the un-mirrored dancer, the same correct copy looks wrong.
  assert.ok(compare(dancer, learner).score < 90);
});

test('an arm pointing the wrong way is the worst limb and is flagged wrong', () => {
  const ref = moveArm(figure(), 'right', Math.PI);       // right arm straight out
  const you = moveArm(figure(), 'right', Math.PI / 2);   // right arm hanging down
  const r = compare(ref, you);
  assert.equal(r.worst.name, 'right arm');
  assert.ok(r.worst.off >= WRONG_DEG);
  assert.deepEqual(r.wrong, ['right arm']);
  assert.ok(r.score < 100 && r.score > 50, `score ${r.score}`);
});

test('a limb slightly off is not painted red', () => {
  const ref = moveArm(figure(), 'left', 0);
  const you = moveArm(figure(), 'left', 0.5); // ~29 degrees
  const r = compare(ref, you);
  assert.deepEqual(r.wrong, []);
  assert.ok(r.score >= 80);
});

test('limbs the camera cannot see are skipped, not counted as wrong', () => {
  const you = figure();
  for (const i of [P.lHip, P.lKnee, P.lAnkle, P.rHip, P.rKnee, P.rAnkle]) you[i] = [you[i][0], you[i][1], 0, 0.05];
  const r = compare(figure(), you);
  // Legs drop out; the torso is still judged from the shoulder line.
  assert.deepEqual(r.limbs.map((l) => l.name).sort(), ['left arm', 'right arm', 'torso']);
  assert.equal(r.score, 100);
  assert.equal(compare(figure(), figure().map((p) => [p[0], p[1], 0, 0])), null);
});

test('joint angles: straight is 180, a right angle is 90, hidden is null', () => {
  const lm = figure();
  lm[P.lShoulder] = [0.3, 0.3, 0, 1]; lm[P.lElbow] = [0.4, 0.3, 0, 1]; lm[P.lWrist] = [0.5, 0.3, 0, 1];
  assert.equal(jointAngles(lm)['left elbow'], 180);
  lm[P.lWrist] = [0.4, 0.4, 0, 1];
  assert.equal(jointAngles(lm)['left elbow'], 90);
  lm[P.lWrist] = [0.4, 0.4, 0, 0.1];
  assert.equal(jointAngles(lm)['left elbow'], null);
});

test('joint angles account for the frame aspect ratio', () => {
  const lm = figure();
  lm[P.lShoulder] = [0.4, 0.3, 0, 1]; lm[P.lElbow] = [0.4, 0.4, 0, 1]; lm[P.lWrist] = [0.5, 0.5, 0, 1];
  assert.equal(jointAngles(lm, 1)['left elbow'], 135);
  // On a 2:1 frame the forearm's sideways run is twice as long: acos(-1/√5) ≈ 117°.
  assert.equal(jointAngles(lm, 2)['left elbow'], 117);
});

test('feedback is a scale: fine, yellow, orange, then red', () => {
  assert.deepEqual([10, 24, 25, 36, 37, 49, 50, 120].map((d) => severity(d)?.level ?? 'fine'),
    ['fine', 'fine', 'yellow', 'yellow', 'orange', 'orange', 'red', 'red']);
  const ref = moveArm(moveArm(figure(), 'left', 0), 'right', Math.PI);
  const you = moveArm(moveArm(figure(), 'left', 0.5), 'right', Math.PI / 2); // ~29° and 90° off
  const colors = limbColorsFor(compare(ref, you));
  assert.equal(colors['left arm'], severity(29).color);
  assert.equal(colors['right arm'], severity(90).color);
  assert.equal(colors['left leg'], undefined, 'limbs that match keep the body colour');
  assert.deepEqual(limbColorsFor(null), {});
});
