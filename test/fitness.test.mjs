import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intensityFor, metFor, kcalPerMinute, createBurn, streakFrom, dayKey, MET_REST, MET_MAX } from '../web/js/fitness.js';
import { figure } from './geometry.test.mjs';
import { P } from '../web/js/pose/skeleton.js';

test('intensity is 0 at rest, 1 flat out, and never goes down as speed goes up', () => {
  assert.equal(intensityFor(0), 0);
  assert.equal(intensityFor(100), 1);
  let last = -1;
  for (let s = 0; s <= 5; s += 0.1) {
    const i = intensityFor(s);
    assert.ok(i >= last && i >= 0 && i <= 1);
    last = i;
  }
  assert.equal(metFor(0), MET_REST);
  assert.equal(metFor(1), MET_MAX);
});

test('calories scale linearly with body weight', () => {
  assert.equal(kcalPerMinute(6, 100), 2 * kcalPerMinute(6, 50));
});

// Arms waving at `hz` for `seconds`, sampled at 30 fps.
function workout(weightKg, hz, seconds = 60) {
  const burn = createBurn({ weightKg });
  for (let i = 0; i <= seconds * 30; i++) {
    const t = i / 30;
    const lm = figure();
    const a = Math.sin(2 * Math.PI * hz * t) * 0.12;
    lm[P.lWrist] = [0.66, 0.5 + a, 0, 1]; lm[P.rWrist] = [0.34, 0.5 - a, 0, 1];
    lm[P.lAnkle] = [0.55 + a / 3, 0.85, 0, 1];
    burn.push(lm, t);
  }
  return burn.summary();
}

test('a minute of dancing lands in a human kcal-per-minute range', () => {
  const easy = workout(65, 0.5), hard = workout(65, 3);
  assert.ok(hard.kcal > easy.kcal, 'faster dancing burns more');
  // ~2.8 to ~8.5 kcal/min for a 65 kg person between a sway and all-out.
  for (const s of [easy, hard]) assert.ok(s.kcal >= 2.5 && s.kcal <= 9, `${s.kcal} kcal`);
  assert.ok(Math.abs(workout(130, 3).kcal - 2 * hard.kcal) < 0.3, 'double the weight, double the calories');
});

test('standing still is not activity, and a lost pose does not count as motion', () => {
  const burn = createBurn();
  for (let i = 0; i < 300; i++) burn.push(i % 50 === 0 ? null : figure(), i / 30);
  assert.equal(burn.summary().activeSeconds, 0);
});

test('streaks count consecutive days across month and leap-year boundaries', () => {
  const days = ['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01'];
  assert.equal(streakFrom(days, new Date(2028, 2, 1)), 4);
  // Today not danced yet: the streak from yesterday still stands.
  assert.equal(streakFrom(days, new Date(2028, 2, 2)), 4);
  // A missed day breaks it.
  assert.equal(streakFrom(days, new Date(2028, 2, 3)), 0);
  assert.equal(streakFrom(['2026-12-31', '2027-01-01'], new Date(2027, 0, 1)), 2);
  assert.equal(dayKey(new Date(2026, 9, 4)), '2026-10-04');
});
