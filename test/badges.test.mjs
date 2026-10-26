// Badges and the daily challenge: earned once, from real runs, and the same
// challenge for everyone on a given day.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addRun, newBadges, dailyPick, EMPTY_STATS } from '../web/js/badges.js';

const run = (o) => ({ id: 'aaaaaaaaaa1', rank: 'B', bestCombo: 3, tally: { PERFECT: 1 }, streak: 1, totalKcal: 2, ...o });

test('a first run earns First steps, and only once', () => {
  const s = addRun(EMPTY_STATS, run());
  assert.deepEqual(newBadges(s).map((b) => b.id), ['first']);
  assert.deepEqual(newBadges(s, { first: 'x' }), []);
});

test('rank, combo, PERFECTs, streak, kcal and variety each unlock their badge', () => {
  let s = EMPTY_STATS;
  s = addRun(s, run({ id: 'r1', rank: 'S', bestCombo: 12, tally: { PERFECT: 6 }, streak: 3, totalKcal: 120 }));
  s = addRun(s, run({ id: 'r2', rank: 'C' }));
  s = addRun(s, run({ id: 'r3', rank: 'B', party: true }));
  const ids = newBadges(s).map((b) => b.id);
  for (const id of ['first', 'sharp', 'flawless', 'combo', 'perfects', 'streak3', 'kcal100', 'explorer', 'party']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('five') && !ids.includes('streak7'));
  assert.equal(s.bestRank, 'S', 'a worse later rank never lowers the best');
  assert.equal(s.routines, 3);
});

test('the same routine danced twice counts once for Explorer', () => {
  const s = addRun(addRun(EMPTY_STATS, run()), run());
  assert.equal(s.routines, 1);
  assert.equal(s.battles, 2);
});

test('the daily challenge is stable for a day and covers the library', () => {
  const lib = ['aaaaaaaaaa1', 'bbbbbbbbbb2', 'ccccccccc33'].map((id) => ({ id }));
  const d = new Date(2026, 9, 26, 9);
  assert.equal(dailyPick(lib, d).id, dailyPick([...lib].reverse(), new Date(2026, 9, 26, 22)).id);
  const seen = new Set(Array.from({ length: 30 }, (_, i) => dailyPick(lib, new Date(2026, 9, i + 1)).id));
  assert.equal(seen.size, 3);
  assert.equal(dailyPick([], d), null);
});
