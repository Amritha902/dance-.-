// Steps, hookstep and tempo on synthetic routines whose answers we know:
// a dancer whose limbs follow a scripted phrase, repeated, with a motionless
// title card in front (the classic thing that fools a repeat-finder).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../web/js/pose/skeleton.js';
import { sampleRoutine, cutSteps, findHook, estimateTempo } from '../web/js/pose/timeline.js';

const FPS = 15;

// A figure whose arms and one leg point in the given directions (radians).
function posed({ lArm, rArm, lLeg }) {
  const lm = Array.from({ length: 33 }, () => [0.5, 0.5, 0, 1]);
  const at = (i, x, y) => { lm[i] = [x, y, 0, 1]; };
  at(P.nose, 0.5, 0.2);
  at(P.lShoulder, 0.55, 0.3); at(P.rShoulder, 0.45, 0.3);
  at(P.lHip, 0.54, 0.55); at(P.rHip, 0.46, 0.55);
  const limb = (from, mid, end, ang, len) => {
    const [x, y] = lm[from];
    at(mid, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    at(end, x + Math.cos(ang) * len * 2, y + Math.sin(ang) * len * 2);
  };
  limb(P.lShoulder, P.lElbow, P.lWrist, lArm, 0.1);
  limb(P.rShoulder, P.rElbow, P.rWrist, rArm, 0.1);
  limb(P.lHip, P.lKnee, P.lAnkle, lLeg, 0.15);
  limb(P.rHip, P.rKnee, P.rAnkle, Math.PI / 2, 0.15);
  return lm;
}

// One phrase of `len` seconds: arms sweep, leg kicks, with a pause at the end.
const phrase = (u, variant = 0) => ({
  lArm: Math.PI / 2 - 1.4 * Math.sin(Math.PI * Math.min(1, u * 1.25)),
  rArm: Math.PI / 2 + 1.2 * Math.sin(2 * Math.PI * Math.min(1, u * 1.25)) * (variant ? -1 : 1),
  lLeg: Math.PI / 2 - 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.25)),
});

function routine({ intro = 0, period = 3, repeats = 6, halfVariant = false }) {
  const frames = [];
  const duration = intro + period * repeats;
  for (let i = 0; i <= duration * FPS; i++) {
    const t = i / FPS;
    let lm;
    if (t < intro) lm = posed({ lArm: 0.3, rArm: 2.8, lLeg: Math.PI / 2 });
    else {
      const u = ((t - intro) % period) / period;
      // With halfVariant, the second half echoes the first with the right arm mirrored.
      lm = halfVariant
        ? posed(phrase((u * 2) % 1, u >= 0.5 ? 1 : 0))
        : posed(phrase(u));
    }
    frames.push({ t, lm });
  }
  return { frames, duration };
}

test('steps tile the whole routine with no gaps or overlaps', () => {
  const { frames, duration } = routine({ period: 3, repeats: 6 });
  const steps = cutSteps(sampleRoutine(frames, duration), duration);
  assert.equal(steps[0].start, 0);
  assert.equal(steps.at(-1).end, duration);
  for (let i = 1; i < steps.length; i++) assert.equal(steps[i].start, steps[i - 1].end);
  assert.ok(steps.length >= 3 && steps.length <= 12, `${steps.length} steps`);
  steps.forEach((s, i) => assert.equal(s.label, `Step ${i + 1}`));
});

test('steps are cut at the pauses between phrases', () => {
  const { frames, duration } = routine({ period: 3, repeats: 6 });
  const steps = cutSteps(sampleRoutine(frames, duration), duration);
  // Each phrase rests for its last 20%, so cuts land in [2.4, 3.0] mod 3.
  for (const s of steps.slice(1)) {
    const m = s.start % 3;
    assert.ok(m >= 2.3 || m <= 0.15, `cut at ${s.start}`);
  }
});

test('the repeating phrase is found as the hookstep', () => {
  const { frames, duration } = routine({ period: 3, repeats: 6 });
  const { hook } = findHook(sampleRoutine(frames, duration), duration);
  assert.ok(hook, 'a hook was found');
  assert.ok(Math.abs(hook.period - 3) <= 0.2, `period ${hook.period}`);
  assert.ok(hook.confidence > 0.9);
});

test('a motionless title card is never chosen as the hook', () => {
  const { frames, duration } = routine({ intro: 4, period: 3, repeats: 5 });
  const { hook } = findHook(sampleRoutine(frames, duration), duration);
  assert.ok(hook);
  assert.ok(hook.start >= 3.9, `hook starts at ${hook.start}`);
  assert.ok(Math.abs(hook.period - 3) <= 0.2, `period ${hook.period}`);
});

test('a phrase made of two near-identical halves is found whole, not halved', () => {
  const { frames, duration } = routine({ period: 4, repeats: 5, halfVariant: true });
  const { hook } = findHook(sampleRoutine(frames, duration), duration);
  assert.ok(hook);
  assert.ok(Math.abs(hook.period - 4) <= 0.25, `period ${hook.period}`);
});

test('a dancer standing still has no hook and no tempo to speak of', () => {
  const frames = Array.from({ length: 150 }, (_, i) => ({ t: i / FPS, lm: posed({ lArm: 1, rArm: 2, lLeg: 1.5 }) }));
  const samples = sampleRoutine(frames, 10);
  assert.equal(findHook(samples, 10).hook, null);
  assert.ok(samples.every((s) => !s.live));
});

test('tempo lands in a range people actually dance to', () => {
  const { frames, duration } = routine({ period: 2, repeats: 8 });
  const bpm = estimateTempo(sampleRoutine(frames, duration));
  assert.ok(bpm >= 70 && bpm <= 180, `${bpm} bpm`);
});

test('short routines still get one step covering everything', () => {
  const frames = [{ t: 0, lm: posed({ lArm: 1, rArm: 2, lLeg: 1.5 }) }];
  assert.deepEqual(cutSteps(sampleRoutine(frames, 1.5), 1.5), [{ label: 'Step 1', start: 0, end: 1.5 }]);
});
