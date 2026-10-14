// Dancing is cardio, so every battle also counts as a workout.
//
// How the estimate works: limb speed is measured in body-lengths per second
// (torso lengths, so camera distance doesn't matter), mapped onto a MET value
// between a gentle sway (~2.5) and all-out dancing (~7.5), and turned into
// calories with the standard formula kcal/min = MET × 3.5 × kg / 200.
// It is an estimate from motion alone, labelled as such in the app — good for
// "harder than yesterday" and streaks, not a calorimeter.

import { P } from './pose/skeleton.js';
import { prefs } from './dom.js';

const LIMBS = [P.lWrist, P.rWrist, P.lElbow, P.rElbow, P.lKnee, P.rKnee, P.lAnkle, P.rAnkle];
export const MET_REST = 2.5, MET_MAX = 7.5;
const FULL_EFFORT = 3; // body-lengths per second that counts as all-out

/** 0..1 effort from limb speed (body-lengths/s). Monotonic, bounded. */
export const intensityFor = (speed) => Math.min(1, Math.max(0, speed / FULL_EFFORT)) ** 0.8;
export const metFor = (intensity) => MET_REST + (MET_MAX - MET_REST) * intensity;
export const kcalPerMinute = (met, kg) => (met * 3.5 * kg) / 200;

export function intensityLabel(i) {
  return i >= 0.75 ? 'all-out' : i >= 0.5 ? 'vigorous' : i >= 0.25 ? 'moderate' : 'light';
}

/** Accumulates calories from a stream of live poses. */
export function createBurn({ weightKg = 65 } = {}) {
  let prev = null, prevT = 0, kcal = 0, active = 0, peak = 0, smooth = 0;
  return {
    push(lm, t) {
      if (!lm) { prev = null; return; }
      if (prev) {
        const dt = t - prevT;
        if (dt > 0 && dt < 0.5) {
          const sx = (lm[P.lShoulder][0] + lm[P.rShoulder][0]) / 2, sy = (lm[P.lShoulder][1] + lm[P.rShoulder][1]) / 2;
          const hx = (lm[P.lHip][0] + lm[P.rHip][0]) / 2, hy = (lm[P.lHip][1] + lm[P.rHip][1]) / 2;
          const torso = Math.hypot(sx - hx, sy - hy) || 0.25;
          let d = 0;
          for (const k of LIMBS) d += Math.hypot(lm[k][0] - prev[k][0], lm[k][1] - prev[k][1]);
          const speed = d / LIMBS.length / torso / dt;
          smooth = smooth * 0.9 + intensityFor(speed) * 0.1;
          kcal += kcalPerMinute(metFor(smooth), weightKg) * (dt / 60);
          if (smooth > 0.05) active += dt;
          peak = Math.max(peak, smooth);
        }
      }
      prev = lm; prevT = t;
    },
    get kcal() { return kcal; },
    get intensity() { return smooth; },
    summary: () => ({ kcal: Math.round(kcal * 10) / 10, activeSeconds: Math.round(active), peak: Math.round(peak * 100) / 100 }),
  };
}

// ---------- the log: lifetime totals and the daily streak ----------

export const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Consecutive days with a workout, counting back from today (or yesterday, if today is still empty). */
export function streakFrom(days, today = new Date()) {
  const set = new Set(days);
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function readLog() {
  return prefs.get('fitness', { days: [], kcal: 0, seconds: 0, sessions: 0 });
}

export function recordWorkout({ kcal, seconds }, today = new Date()) {
  const log = readLog();
  const before = streakFrom(log.days, today);
  const key = dayKey(today);
  if (!log.days.includes(key)) log.days = [...log.days, key].slice(-400);
  log.kcal = Math.round((log.kcal + kcal) * 10) / 10;
  log.seconds += seconds;
  log.sessions += 1;
  prefs.set('fitness', log);
  const streak = streakFrom(log.days, today);
  return { ...log, streak, streakGrew: streak > before };
}

export const weightKg = () => Number(prefs.get('weightKg', 65)) || 65;
