// Body geometry: mirroring, interpolation and framing. These are the parts
// where a bug is silent: the stickman still draws, just wrong.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mirror, P, LIMBS, BONES } from '../web/js/pose/skeleton.js';
import { poseAt, boxOf, routineBox, mirrorBox } from '../web/js/pose/timeline.js';

// A standing figure with distinct left/right so mistakes show.
export function figure(dx = 0) {
  const lm = Array.from({ length: 33 }, () => [0.5 + dx, 0.5, 0, 1]);
  const set = (i, x, y) => { lm[i] = [x + dx, y, 0, 1]; };
  set(P.nose, 0.5, 0.2);
  set(P.lShoulder, 0.56, 0.3); set(P.rShoulder, 0.44, 0.3);
  set(P.lElbow, 0.62, 0.4); set(P.rElbow, 0.38, 0.4);
  set(P.lWrist, 0.66, 0.5); set(P.rWrist, 0.34, 0.5);
  set(P.lHip, 0.54, 0.55); set(P.rHip, 0.46, 0.55);
  set(P.lKnee, 0.55, 0.7); set(P.rKnee, 0.45, 0.7);
  set(P.lAnkle, 0.55, 0.85); set(P.rAnkle, 0.45, 0.85);
  set(P.lToe, 0.58, 0.88); set(P.rToe, 0.42, 0.88);
  return lm;
}

test('mirroring reflects x and swaps the sides of the body', () => {
  const lm = figure();
  lm[P.lWrist] = [0.8, 0.1, 0, 1]; // left hand raised high on the right of frame
  const m = mirror(lm);
  // The raised hand is now the RIGHT wrist, on the left of frame.
  assert.deepEqual(m[P.rWrist], [1 - 0.8, 0.1, 0, 1]);
  assert.notDeepEqual(m[P.lWrist], [1 - 0.8, 0.1, 0, 1]);
});

test('mirroring twice gives back the original pose', () => {
  const lm = figure(0.03);
  const back = mirror(mirror(lm));
  lm.forEach((p, i) => p.forEach((v, k) => assert.ok(Math.abs(v - back[i][k]) < 1e-12, `landmark ${i}`)));
});

test('every drawn bone belongs to a named limb', () => {
  const names = new Set(LIMBS.map((l) => l.name));
  for (const b of BONES) assert.ok(names.has(b.limb), `${b.a}-${b.b}`);
});

test('poses are blended between frames and clamped at the ends', () => {
  const a = figure(0), b = figure(0.1);
  const frames = [{ t: 1, lm: a }, { t: 1.2, lm: b }];
  const mid = poseAt(frames, 1.1);
  assert.ok(Math.abs(mid[P.nose][0] - 0.55) < 1e-9);
  assert.equal(poseAt(frames, 0), a);
  assert.equal(poseAt(frames, 5), b);
  assert.equal(poseAt([], 1), null);
});

test('across a tracking gap the pose snaps instead of sliding', () => {
  const a = figure(0), b = figure(0.3);
  const frames = [{ t: 0, lm: a }, { t: 2, lm: b }];
  assert.equal(poseAt(frames, 0.5), a);
  assert.equal(poseAt(frames, 1.5), b);
});

test('the routine box ignores a single wild frame', () => {
  const frames = Array.from({ length: 100 }, (_, i) => ({ t: i / 10, lm: figure() }));
  const wild = figure(); wild[P.lWrist] = [0.99, 0.01, 0, 1];
  frames[50] = { t: 5, lm: wild };
  const box = routineBox(frames);
  assert.ok(box.x1 < 0.7 && box.y0 > 0.15, JSON.stringify(box));
});

test('a pose with almost nothing visible has no box', () => {
  const lm = figure().map((p) => [p[0], p[1], p[2], 0.1]);
  assert.equal(boxOf(lm), null);
});

test('mirroring a box matches mirroring the pose inside it', () => {
  const lm = figure(0.1);
  assert.deepEqual(boxOf(mirror(lm)), mirrorBox(boxOf(lm)));
});
