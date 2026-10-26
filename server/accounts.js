// Profiles and history over HTTP.
//
//   POST   /api/profile      {name}  → {user, code}   (the code is shown once)
//   POST   /api/session      {code}  → {user}         (sign in on another device)
//   GET    /api/me                   → {user, summary}
//   PATCH  /api/me           {name}
//   POST   /api/me/runs      {run}   → {run}
//   GET    /api/me/runs?limit=50     → {runs}
//   DELETE /api/me                   → removes the profile and its history
//
// Signed-in requests carry the code: `Authorization: Bearer XXXX-XXXX-XXXX-XXXX`.

import express from 'express';
import { db, hashCode, newCode, normaliseCode } from './db.js';
import { ROUTINE_ID } from './store.js';

const RANKS = ['D', 'C', 'B', 'A', 'S'];
const JUDGES = ['PERFECT', 'GREAT', 'GOOD', 'OFF', 'MISS'];
const int = (v, lo, hi) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : null);
const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 24);

/** A run as the browser reports it → what we store, or null if it isn't one. */
export function cleanRun(r, now = new Date()) {
  if (!r || typeof r !== 'object' || !ROUTINE_ID.test(r.routineId || '') || !RANKS.includes(r.rank)) return null;
  const score = int(r.score, 0, 1e7);
  if (score == null) return null;
  return {
    routineId: r.routineId,
    title: String(r.title || 'Untitled').slice(0, 120),
    score, rank: r.rank,
    accuracy: int(r.accuracy, 0, 100) ?? 0,
    bestCombo: int(r.bestCombo, 0, 1e4) ?? 0,
    tally: Object.fromEntries(JUDGES.map((k) => [k, int(r.tally?.[k], 0, 1e4) ?? 0])),
    kcal: Math.round(Math.min(5000, Math.max(0, +r.kcal || 0)) * 10) / 10,
    seconds: int(r.seconds, 0, 36000) ?? 0,
    mode: r.mode === 'party' ? 'party' : 'solo',
    // The learner's own calendar day (for streaks), else the server's.
    day: /^\d{4}-\d{2}-\d{2}$/.test(r.day || '') ? r.day : now.toISOString().slice(0, 10),
    at: now.toISOString(),
  };
}

/** Totals across a history, oldest run first. Pure. */
export function summarise(runs) {
  const s = { battles: 0, kcal: 0, minutes: 0, days: [], bestRank: null, bestCombo: 0, mostPerfects: 0, routines: 0, parties: 0, best: {} };
  const days = new Set();
  for (const r of runs) {
    s.battles++;
    s.kcal += r.kcal || 0;
    s.minutes += (r.seconds || 0) / 60;
    days.add(r.day);
    if (!s.bestRank || RANKS.indexOf(r.rank) > RANKS.indexOf(s.bestRank)) s.bestRank = r.rank;
    s.bestCombo = Math.max(s.bestCombo, r.bestCombo || 0);
    s.mostPerfects = Math.max(s.mostPerfects, r.tally?.PERFECT || 0);
    if (r.mode === 'party') s.parties++;
    const b = s.best[r.routineId];
    if (!b || r.score > b.score) s.best[r.routineId] = { title: r.title, score: r.score, rank: r.rank, accuracy: r.accuracy, at: r.at };
  }
  s.routines = Object.keys(s.best).length;
  s.kcal = Math.round(s.kcal * 10) / 10;
  s.minutes = Math.round(s.minutes);
  s.days = [...days].sort();
  return s;
}

export function accountsRouter({ getDb = db } = {}) {
  const r = express.Router();
  const json = express.json({ limit: '32kb' });
  // A light brake on profile creation: 30 an hour per address.
  const made = new Map();
  const allowMake = (ip) => {
    const now = Date.now(), list = (made.get(ip) || []).filter((t) => now - t < 3600e3);
    if (list.length >= 30) return false;
    made.set(ip, [...list, now]);
    if (made.size > 5000) made.delete(made.keys().next().value);
    return true;
  };
  const fail = (res, e) => res.status(503).json({ error: `History is unavailable right now (${e.message}).` });

  async function me(req, res) {
    const code = normaliseCode((req.get('authorization') || '').replace(/^Bearer\s+/i, ''));
    if (code.length !== 16) { res.status(401).json({ error: 'Not signed in.' }); return null; }
    const user = await (await getDb()).userByCode(hashCode(code));
    if (!user) { res.status(401).json({ error: 'That sign-in code isn\'t recognised.' }); return null; }
    return user;
  }

  r.post('/api/profile', json, async (req, res) => {
    const name = cleanName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Pick a name to show on your profile.' });
    if (!allowMake(req.ip)) return res.status(429).json({ error: 'Too many new profiles from here. Try again later.' });
    try {
      const code = newCode();
      const user = await (await getDb()).createUser(name, hashCode(code));
      res.status(201).json({ user, code });
    } catch (e) { fail(res, e); }
  });

  r.post('/api/session', json, async (req, res) => {
    try {
      const user = await (await getDb()).userByCode(hashCode(req.body?.code));
      if (!user) return res.status(401).json({ error: 'That sign-in code isn\'t recognised. Check it and try again.' });
      res.json({ user });
    } catch (e) { fail(res, e); }
  });

  r.get('/api/me', async (req, res) => {
    try {
      const user = await me(req, res); if (!user) return;
      res.json({ user, summary: summarise(await (await getDb()).allRuns(user.id)) });
    } catch (e) { fail(res, e); }
  });

  r.patch('/api/me', json, async (req, res) => {
    try {
      const user = await me(req, res); if (!user) return;
      const name = cleanName(req.body?.name);
      if (!name) return res.status(400).json({ error: 'Pick a name.' });
      await (await getDb()).rename(user.id, name);
      res.json({ user: { ...user, name } });
    } catch (e) { fail(res, e); }
  });

  r.post('/api/me/runs', json, async (req, res) => {
    try {
      const user = await me(req, res); if (!user) return;
      const run = cleanRun(req.body?.run);
      if (!run) return res.status(400).json({ error: 'That run is missing its routine, rank or score.' });
      res.status(201).json({ run: await (await getDb()).addRun(user.id, run) });
    } catch (e) { fail(res, e); }
  });

  r.get('/api/me/runs', async (req, res) => {
    try {
      const user = await me(req, res); if (!user) return;
      res.json({ runs: await (await getDb()).runs(user.id, int(req.query.limit, 1, 500) ?? 100) });
    } catch (e) { fail(res, e); }
  });

  r.delete('/api/me', async (req, res) => {
    try {
      const user = await me(req, res); if (!user) return;
      await (await getDb()).deleteUser(user.id);
      res.json({ deleted: true });
    } catch (e) { fail(res, e); }
  });

  return r;
}
