// Badges and the daily challenge. The rules are pure functions of a small
// stats record, so they're easy to test; this device's progress lives in
// localStorage through prefs, like the workout log.

import { prefs } from './dom.js';

export const RANKS = ['D', 'C', 'B', 'A', 'S'];
const atLeast = (rank, min) => RANKS.indexOf(rank) >= RANKS.indexOf(min);

export const BADGES = [
  { id: 'first', icon: '💃', name: 'First steps', desc: 'Finish your first battle', test: (s) => s.battles >= 1 },
  { id: 'five', icon: '🖐️', name: 'Getting into it', desc: 'Finish 5 battles', test: (s) => s.battles >= 5 },
  { id: 'regular', icon: '🏅', name: 'Regular', desc: 'Finish 25 battles', test: (s) => s.battles >= 25 },
  { id: 'sharp', icon: '⭐', name: 'Sharp', desc: 'Score rank A or better', test: (s) => atLeast(s.bestRank, 'A') },
  { id: 'flawless', icon: '👑', name: 'Flawless', desc: 'Score rank S', test: (s) => s.bestRank === 'S' },
  { id: 'combo', icon: '🔗', name: 'Combo 10', desc: 'Hit a 10 combo', test: (s) => s.bestCombo >= 10 },
  { id: 'perfects', icon: '✨', name: 'Five PERFECTs', desc: '5 PERFECTs in one run', test: (s) => s.mostPerfects >= 5 },
  { id: 'streak3', icon: '🔥', name: 'On fire', desc: 'A 3-day streak', test: (s) => s.streak >= 3 },
  { id: 'streak7', icon: '📅', name: 'Week of dance', desc: 'A 7-day streak', test: (s) => s.streak >= 7 },
  { id: 'kcal100', icon: '🥵', name: '100 kcal', desc: 'Dance off 100 kcal in total', test: (s) => s.kcal >= 100 },
  { id: 'explorer', icon: '🧭', name: 'Explorer', desc: 'Dance 3 different routines', test: (s) => s.routines >= 3 },
  { id: 'party', icon: '🎉', name: 'Party starter', desc: 'Finish a party round', test: (s) => s.parties >= 1 },
];

export const EMPTY_STATS = { battles: 0, bestRank: null, bestCombo: 0, mostPerfects: 0, streak: 0, kcal: 0, routines: 0, parties: 0, danced: [] };

/** Fold one finished run into the stats. Pure. */
export function addRun(stats, run) {
  const s = { ...EMPTY_STATS, ...stats };
  const danced = s.danced.includes(run.id) ? s.danced : [...s.danced, run.id].slice(-200);
  return {
    ...s,
    battles: s.battles + 1,
    bestRank: !s.bestRank || atLeast(run.rank, s.bestRank) ? run.rank : s.bestRank,
    bestCombo: Math.max(s.bestCombo, run.bestCombo || 0),
    mostPerfects: Math.max(s.mostPerfects, run.tally?.PERFECT || 0),
    streak: Math.max(s.streak, run.streak || 0),
    kcal: Math.max(s.kcal, run.totalKcal ?? 0),
    routines: danced.length,
    danced,
    parties: s.parties + (run.party ? 1 : 0),
  };
}

/** Badges earned by `stats` that aren't in `earned` yet. Pure. */
export const newBadges = (stats, earned = {}) => BADGES.filter((b) => !earned[b.id] && b.test({ ...EMPTY_STATS, ...stats }));

/** The routine for today's challenge: the same for everyone on a given day. Pure. */
export function dailyPick(routines, day = new Date()) {
  if (!routines.length) return null;
  const key = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const sorted = [...routines].sort((a, b) => (a.id < b.id ? -1 : 1));
  return sorted[h % sorted.length];
}

// ---- this device ----
export const readStats = () => ({ ...EMPTY_STATS, ...prefs.get('stats', {}) });
export const readEarned = () => prefs.get('badges', {});

/** Record a run on this device; returns the badges it just earned. */
export function recordRun(run) {
  const stats = addRun(readStats(), run);
  prefs.set('stats', stats);
  const earned = readEarned();
  const fresh = newBadges(stats, earned);
  const now = new Date().toISOString();
  for (const b of fresh) earned[b.id] = now;
  prefs.set('badges', earned);
  return fresh;
}
