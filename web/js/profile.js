// This device's profile: the sign-in code (the only key to the history) and
// the profile it unlocks. Kept in localStorage like the rest of Mimic's prefs.

import { prefs } from './dom.js';
import { dayKey } from './fitness.js';
import { account } from './api.js';

export const signedIn = () => prefs.get('profile', null);
export const setProfile = (p) => prefs.set('profile', p);
export const signOut = () => prefs.set('profile', null);

/** Save a finished run to the history, if signed in. Returns true when saved. */
export async function saveRunToHistory(r) {
  const p = signedIn();
  if (!p?.code) return false;
  await account.saveRun(p.code, {
    routineId: r.id, title: r.title, score: r.score, rank: r.rank, accuracy: r.accuracy,
    bestCombo: r.bestCombo, tally: r.tally, kcal: r.workout?.kcal || 0, seconds: r.workout?.activeSeconds || 0,
    mode: r.party ? 'party' : 'solo', day: dayKey(new Date()),
  });
  return true;
}
